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
    if (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        dbClient = createSupabaseServerClient();
      } catch {
        dbClient = await createSupabaseAuthClient();
      }
    } else {
      dbClient = await createSupabaseAuthClient();
    }

    // 1. Identify all invoices owned by this user
    const { data: invoices, error: invFetchError } = await dbClient
      .from("invoices")
      .select("id")
      .eq("user_id", userId);

    if (invFetchError) {
      return Response.json(
        { status: "error", message: "Failed to query account records for deletion." },
        { status: 500 }
      );
    }

    if (invoices && invoices.length > 0) {
      const invoiceIds = invoices.map((inv) => inv.id);

      // Delete payments linked to these invoices (avoids ON DELETE RESTRICT foreign key violations)
      const { error: payDeleteError } = await dbClient
        .from("payments")
        .delete()
        .in("invoice_id", invoiceIds);

      if (payDeleteError) {
        return Response.json(
          { status: "error", message: "Failed to clean up associated payment records." },
          { status: 500 }
        );
      }

      // Delete invoice payment links
      const { error: linkDeleteError } = await dbClient
        .from("invoice_payment_links")
        .delete()
        .in("invoice_id", invoiceIds);

      if (linkDeleteError) {
        return Response.json(
          { status: "error", message: "Failed to clean up payment links." },
          { status: 500 }
        );
      }

      // Delete invoices
      const { error: invDeleteError } = await dbClient
        .from("invoices")
        .delete()
        .eq("user_id", userId);

      if (invDeleteError) {
        return Response.json(
          { status: "error", message: "Failed to delete user invoices." },
          { status: 500 }
        );
      }
    }

    // 2. Delete public.profiles record
    const { error: profileError } = await dbClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError && profileError.code !== "PGRST116" && profileError.code !== "42P01") {
      // Return 500 if profile deletion failed for reasons other than missing table/record
      return Response.json(
        { status: "error", message: "Failed to clean up user profile." },
        { status: 500 }
      );
    }

    // 3. Delete from Supabase Auth (auth.users) ONLY after all DB records have been successfully cleared
    if (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const adminClient = createSupabaseServerClient();
      if (adminClient?.auth?.admin?.deleteUser) {
        const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
        if (authError) {
          return Response.json(
            { status: "error", message: "Failed to delete authentication user identity." },
            { status: 500 }
          );
        }
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
