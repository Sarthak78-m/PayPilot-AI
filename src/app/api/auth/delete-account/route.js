import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

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

    // Always derive target solely from verified session, ignoring any payload user IDs
    const userId = user.id;

    // Use service role client exclusively on the server to bypass RLS during cascading deletion
    // and delete the Supabase Auth user identity.
    const hasServiceRole = Boolean(
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let adminClient;
    if (hasServiceRole) {
      try {
        adminClient = createSupabaseServerClient();
      } catch {
        adminClient = null;
      }
    }

    if (!adminClient || !adminClient.auth?.admin?.deleteUser) {
      return Response.json(
        {
          status: "error",
          message: "Account deletion service is unavailable. Administrative privileges are required.",
        },
        { status: 503 }
      );
    }

    const dbClient = adminClient;

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

    const invoiceIds = (invoices || []).map((inv) => inv.id);

    // 2. Identify all payments belonging to this user (direct or linked to user invoices)
    const paymentIdSet = new Set();

    // 2a. Standalone/direct payments owned by user (Phase 8 schema)
    try {
      const { data: directPayments, error: directPayError } = await dbClient
        .from("payments")
        .select("id")
        .eq("user_id", userId);

      if (directPayError && directPayError.code !== "42703") {
        return Response.json(
          { status: "error", message: "Failed to query account payment records." },
          { status: 500 }
        );
      }
      if (directPayments) {
        directPayments.forEach((p) => paymentIdSet.add(p.id));
      }
    } catch {
      // Column may not exist on pre-phase-8 schemas
    }

    // 2b. Payments linked to user's invoices
    if (invoiceIds.length > 0) {
      const { data: invPayments, error: invPayError } = await dbClient
        .from("payments")
        .select("id")
        .in("invoice_id", invoiceIds);

      if (invPayError) {
        return Response.json(
          { status: "error", message: "Failed to query invoice payment records." },
          { status: 500 }
        );
      }
      if (invPayments) {
        invPayments.forEach((p) => paymentIdSet.add(p.id));
      }
    }

    const allPaymentIds = Array.from(paymentIdSet);

    // 3. Staged Deletion: Delete payment refunds
    if (allPaymentIds.length > 0) {
      const { error: refundDeleteError } = await dbClient
        .from("payment_refunds")
        .delete()
        .in("payment_id", allPaymentIds);

      if (refundDeleteError && refundDeleteError.code !== "42P01") {
        return Response.json(
          { status: "error", message: "Failed to clean up refund records." },
          { status: 500 }
        );
      }
    }

    // Clean up refunds initiated by this user
    try {
      const { error: initRefundError } = await dbClient
        .from("payment_refunds")
        .delete()
        .eq("initiated_by", userId);

      if (initRefundError && initRefundError.code !== "42P01" && initRefundError.code !== "42703") {
        return Response.json(
          { status: "error", message: "Failed to clean up initiated refund records." },
          { status: 500 }
        );
      }
    } catch {
      // Ignore if table/column does not exist
    }

    // 4. Staged Deletion: Delete payment audit logs
    if (allPaymentIds.length > 0) {
      const { error: auditDeleteError } = await dbClient
        .from("payment_audit_logs")
        .delete()
        .in("payment_id", allPaymentIds);

      if (auditDeleteError && auditDeleteError.code !== "42P01") {
        return Response.json(
          { status: "error", message: "Failed to clean up payment audit logs." },
          { status: 500 }
        );
      }
    }

    try {
      const { error: userAuditError } = await dbClient
        .from("payment_audit_logs")
        .delete()
        .eq("user_id", userId);

      if (userAuditError && userAuditError.code !== "42P01" && userAuditError.code !== "42703") {
        return Response.json(
          { status: "error", message: "Failed to clean up user audit logs." },
          { status: 500 }
        );
      }
    } catch {
      // Ignore if table/column does not exist
    }

    // 5. Staged Deletion: Delete payments
    if (allPaymentIds.length > 0) {
      const { error: payDeleteError } = await dbClient
        .from("payments")
        .delete()
        .in("id", allPaymentIds);

      if (payDeleteError) {
        return Response.json(
          { status: "error", message: "Failed to clean up associated payment records." },
          { status: 500 }
        );
      }
    }

    // 6. Staged Deletion: Delete invoice payment links
    if (invoiceIds.length > 0) {
      const { error: linkDeleteError } = await dbClient
        .from("invoice_payment_links")
        .delete()
        .in("invoice_id", invoiceIds);

      if (linkDeleteError && linkDeleteError.code !== "42P01") {
        return Response.json(
          { status: "error", message: "Failed to clean up payment links." },
          { status: 500 }
        );
      }
    }

    // 7. Staged Deletion: Delete user invoices
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

    // 8. Staged Deletion: Delete public.profiles record
    const { error: profileError } = await dbClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError && profileError.code !== "PGRST116" && profileError.code !== "42P01") {
      return Response.json(
        { status: "error", message: "Failed to clean up user profile." },
        { status: 500 }
      );
    }

    // 9. Invalidate authenticated session and clear browser cookies BEFORE auth user deletion
    try {
      const authClient = await createSupabaseAuthClient();
      await authClient.auth.signOut({ scope: "global" });
    } catch {
      // Proceed to cookie store cleanup
    }

    try {
      const cookieStore = await cookies();
      const allCookies = cookieStore.getAll();
      for (const cookie of allCookies) {
        if (cookie.name.startsWith("sb-") || cookie.name.includes("auth-token")) {
          cookieStore.delete({
            name: cookie.name,
            path: "/",
          });
        }
      }
    } catch {
      // Non-fatal if cookies cannot be modified
    }

    // 10. Delete Supabase Auth user identity (auth.users)
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
    if (authError) {
      return Response.json(
        { status: "error", message: "Failed to delete authentication user identity." },
        { status: 500 }
      );
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
