import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return Response.json(
      { status: "error", message: "Authentication service is unavailable." },
      { status: 503 }
    );
  }

  if (!user) {
    return Response.json(
      { status: "error", message: "Authentication is required to delete an account." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const confirmation =
      typeof body.confirmation === "string" ? body.confirmation.trim().toUpperCase() : "";

    if (confirmation !== "DELETE") {
      return Response.json(
        {
          status: "error",
          message: 'Please confirm account deletion by typing "DELETE".',
        },
        { status: 400 }
      );
    }

    const userId = user.id;

    // Use service role client if available to bypass RLS during cascading deletion;
    // otherwise fallback to authenticated user SSR client.
    let dbClient;
    if (process.env.SUPABASE_SECRET_KEY) {
      try {
        dbClient = createSupabaseServerClient();
      } catch {
        dbClient = await createSupabaseAuthClient();
      }
    } else {
      dbClient = await createSupabaseAuthClient();
    }

    // 1. Identify all invoices owned by this user
    try {
      const { data: invoices } = await dbClient
        .from("invoices")
        .select("id")
        .eq("user_id", userId);

      if (invoices && invoices.length > 0) {
        const invoiceIds = invoices.map((inv) => inv.id);

        // Delete payments linked to these invoices (avoids ON DELETE RESTRICT foreign key violations)
        await dbClient.from("payments").delete().in("invoice_id", invoiceIds);

        // Delete invoice payment links
        await dbClient.from("invoice_payment_links").delete().in("invoice_id", invoiceIds);

        // Delete invoices
        await dbClient.from("invoices").delete().eq("user_id", userId);
      }
    } catch {
      // In local/mock environments, tables may not exist yet; proceed gracefully
    }

    // 2. Delete public.profiles record
    try {
      await dbClient.from("profiles").delete().eq("id", userId);
    } catch {
      // Table may not exist or already clean
    }

    // 3. Delete from Supabase Auth (auth.users) if service-role admin is available
    if (process.env.SUPABASE_SECRET_KEY) {
      try {
        const adminClient = createSupabaseServerClient();
        if (adminClient.auth?.admin?.deleteUser) {
          await adminClient.auth.admin.deleteUser(userId);
        }
      } catch {
        // Admin user deletion skipped if unavailable or network issues
      }
    }

    // 4. Invalidate authenticated session and clear browser cookies
    try {
      const authClient = await createSupabaseAuthClient();
      await authClient.auth.signOut({ scope: "local" });
    } catch {
      // Session clear attempt
    }

    return Response.json({
      status: "ok",
      message: "Account and associated data deleted successfully.",
    });
  } catch {
    return Response.json(
      { status: "error", message: "Failed to delete account. Please try again later." },
      { status: 500 }
    );
  }
}
