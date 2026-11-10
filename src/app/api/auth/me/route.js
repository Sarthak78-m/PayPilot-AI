import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { isAdminUser } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 },
      );
    }

    let isAdmin = isAdminUser(user);
    if (!isAdmin) {
      try {
        const serverSupabase = createSupabaseServerClient();
        const { data: profile } = await serverSupabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        isAdmin = isAdminUser(user, profile);
      } catch {
        isAdmin = false;
      }
    }

    const name =
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      (user.email ? user.email.split("@")[0] : null);

    return Response.json({
      status: "ok",
      user: {
        id: user.id,
        email: user.email,
        name,
        isAdmin: Boolean(isAdmin),
      },
    });
  } catch {
    return Response.json(
      { status: "error", message: "Authentication service is unavailable." },
      { status: 503 },
    );
  }
}
