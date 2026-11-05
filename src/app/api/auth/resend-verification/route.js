import { createSupabaseAuthClient } from "@/lib/supabase/server";
import { getSiteBaseUrl } from "@/lib/auth/url";
import { validateEmail } from "@/lib/validation/auth";

export async function POST(request) {
  let input;

  try {
    input = await request.json();
  } catch {
    return Response.json(
      { status: "error", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  const emailError = validateEmail(email);

  if (emailError) {
    return Response.json(
      { status: "error", message: emailError },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseAuthClient();
    const baseUrl = getSiteBaseUrl(request);
    const emailRedirectTo = `${baseUrl}/auth/callback`;

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      if (error.status === 429 || error.code === "over_email_send_rate_limit") {
        return Response.json(
          {
            status: "error",
            message: "Too many email requests. Please wait a few minutes before trying again.",
          },
          { status: 429 },
        );
      }
      // For security, do not disclose whether user exists or provider details
    }

    // Neutral response to avoid email enumeration
    return Response.json({
      status: "ok",
      message:
        "If an unconfirmed account exists for this email address, a new verification link has been sent. Please check your inbox and spam folder.",
    });
  } catch {
    return Response.json(
      { status: "error", message: "Verification service is unavailable." },
      { status: 503 },
    );
  }
}
