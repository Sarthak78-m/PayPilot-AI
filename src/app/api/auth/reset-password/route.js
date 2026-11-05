import { createSupabaseAuthClient } from "@/lib/supabase/server";
import { validatePassword } from "@/lib/validation/auth";

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

  const password = typeof input?.password === "string" ? input.password : "";
  const passwordError = validatePassword(password, "New password");

  if (passwordError) {
    return Response.json(
      { status: "error", message: passwordError },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseAuthClient();

    // Verify caller has an active authenticated recovery session
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        {
          status: "error",
          message:
            "Your password reset link is invalid, expired, or has already been used. Please request a new recovery link.",
        },
        { status: 401 },
      );
    }

    // Update password using Supabase Auth
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      return Response.json(
        {
          status: "error",
          message: updateError.message || "Failed to update password.",
        },
        { status: 400 },
      );
    }

    // Deliberate security policy: clear the recovery session so the link cannot be reused
    await supabase.auth.signOut({ scope: "local" });

    return Response.json({
      status: "ok",
      message: "Password updated successfully. You may now sign in with your new password.",
    });
  } catch {
    return Response.json(
      { status: "error", message: "Password update service is unavailable." },
      { status: 503 },
    );
  }
}
