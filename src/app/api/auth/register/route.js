import { validateRegistrationInput } from "@/lib/auth/validation";
import { createSupabaseAuthClient } from "@/lib/supabase/server";

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

  const validation = validateRegistrationInput(input);

  if (!validation.valid) {
    return Response.json(
      { status: "error", message: "Invalid registration details.", errors: validation.errors },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseAuthClient();
    const { data, error } = await supabase.auth.signUp({
      email: validation.data.email,
      password: validation.data.password,
      options: {
        data: { name: validation.data.name },
      },
    });

    if (error) {
      // Handle Supabase rate limiting
      if (error.status === 429 || error.code === "over_email_send_rate_limit") {
        return Response.json(
          { status: "error", message: "Email rate limit exceeded. Please try again later." },
          { status: 429 },
        );
      }

      // Fallback duplicate detection based on Supabase error codes/messages
      const isDuplicate =
        error.code === "user_already_exists" ||
        (error.message && error.message.toLowerCase().includes("already registered"));
      return Response.json(
        { status: "error", message: isDuplicate ? "Unable to create an account with these details." : "Unable to create an account." },
        { status: isDuplicate ? 409 : 400 },
      );
    }

    // Handle duplicate registration via enumeration protection (empty identities array)
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return Response.json(
        { status: "error", message: "Unable to create an account with these details." },
        { status: 409 },
      );
    }

    // Successful registration
    return Response.json(
      {
        status: "ok",
        message: data.session ? "Account created successfully." : "Account created. Check your email to confirm your account.",
        requiresEmailConfirmation: !data.session,
      },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { status: "error", message: "Authentication service is unavailable." },
      { status: 503 },
    );
  }
}
