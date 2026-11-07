import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { isAdminUser } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/webhooks
 *
 * Administrator Webhook History & Verification Inspection API.
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!isAdminUser(user, userProfile)) {
      return Response.json(
        { status: "error", message: "Administrator access is required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));

    const { data: events, error } = await supabase
      .from("paypal_webhook_events")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(limit);

    if (error) {
      return Response.json(
        { status: "error", message: "Failed to retrieve webhook events." },
        { status: 500 }
      );
    }

    return Response.json({
      status: "ok",
      data: events || [],
    });
  } catch {
    return Response.json(
      { status: "error", message: "Internal server error." },
      { status: 500 }
    );
  }
}
