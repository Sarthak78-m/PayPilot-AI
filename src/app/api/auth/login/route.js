import { validateLoginInput } from "@/lib/auth/validation";
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

  const validation = validateLoginInput(input);

  if (!validation.valid) {
    return Response.json(
      { status: "error", message: "Invalid login details.", errors: validation.errors },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseAuthClient();
    const { error } = await supabase.auth.signInWithPassword(validation.data);

    if (error) {
      const requiresConfirmation = error.code === "email_not_confirmed";

      return Response.json(
        {
          status: "error",
          message: requiresConfirmation
            ? "Email confirmation is required before signing in."
            : "Invalid email or password.",
        },
        { status: requiresConfirmation ? 403 : 401 },
      );
    }

    return Response.json({ status: "ok", message: "Signed in successfully." });
  } catch {
    return Response.json(
      { status: "error", message: "Authentication service is unavailable." },
      { status: 503 },
    );
  }
}
