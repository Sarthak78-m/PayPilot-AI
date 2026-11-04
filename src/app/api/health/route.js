import { createSupabasePublicServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createSupabasePublicServerClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      const isAuthorizationError = error.code === "42501";

      return Response.json(
        {
          status: "error",
          application: "PayPilot AI",
          database: isAuthorizationError ? "unauthorized" : "unavailable",
        },
        { status: isAuthorizationError ? 403 : 503 },
      );
    }

    return Response.json({
      status: "ok",
      application: "PayPilot AI",
      database: "connected",
    });
  } catch {
    return Response.json(
      {
        status: "error",
        application: "PayPilot AI",
        database: "unavailable",
      },
      { status: 503 },
    );
  }
}
