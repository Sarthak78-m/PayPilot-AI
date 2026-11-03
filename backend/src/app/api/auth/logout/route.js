import { createSupabaseAuthClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createSupabaseAuthClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      return Response.json(
        { status: "error", message: "Unable to sign out." },
        { status: 503 },
      );
    }

    return Response.json({ status: "ok", message: "Signed out successfully." });
  } catch {
    return Response.json(
      { status: "error", message: "Authentication service is unavailable." },
      { status: 503 },
    );
  }
}
