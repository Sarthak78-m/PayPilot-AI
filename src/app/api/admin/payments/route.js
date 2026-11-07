import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { isAdminUser } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrencyDisplay } from "@/lib/payments/currency";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/payments
 *
 * Administrator Payment Management & Inspection API.
 *
 * Requirements:
 * - Strict RBAC check (admin only).
 * - Full system payment aggregation (total transactions, volume, refunded, pending, failed).
 * - Search by transaction reference, order ID, capture ID, client, or payer email.
 * - Status filtering (COMPLETED, PENDING, FAILED, REFUNDED, etc.).
 * - Returns linked refunds and audit logs count.
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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const statusParam = (searchParams.get("status") || "").trim().toLowerCase();
    const searchParam = (searchParams.get("search") || "").trim().toLowerCase();

    // Query all payments across all users with refund relations
    const { data: allPayments, error: payError } = await supabase
      .from("payments")
      .select(`
        id,
        user_id,
        invoice_id,
        internal_transaction_id,
        amount,
        currency,
        transaction_fee,
        total_amount,
        status,
        provider,
        payment_method,
        payer_email,
        payer_name,
        recipient_email,
        recipient_name,
        category,
        description,
        paypal_order_id,
        paypal_capture_id,
        captured_at,
        created_at,
        updated_at,
        payment_refunds (
          id,
          paypal_refund_id,
          refund_amount,
          currency,
          refund_reason,
          refund_status,
          created_at
        )
      `)
      .order("created_at", { ascending: false });

    if (payError) {
      return Response.json(
        { status: "error", message: "Failed to retrieve payments." },
        { status: 500 }
      );
    }

    const paymentsList = allPayments || [];

    // System-wide Global Metrics Aggregation
    let totalVolume = 0;
    let completedCount = 0;
    let pendingVolume = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let totalRefunded = 0;
    let refundedCount = 0;

    paymentsList.forEach((p) => {
      const amt = Number(p.total_amount || p.amount) || 0;
      const st = (p.status || "").toLowerCase();

      if (st === "completed" || st === "paid" || st === "settled") {
        totalVolume += amt;
        completedCount += 1;
      } else if (["pending", "created", "order_created", "approved", "processing", "capturing", "initiated"].includes(st)) {
        pendingVolume += amt;
        pendingCount += 1;
      } else if (st === "failed" || st === "denied") {
        failedCount += 1;
      } else if (st === "refunded" || st === "partially_refunded") {
        refundedCount += 1;
      }

      // Sum all recorded refunds
      if (Array.isArray(p.payment_refunds)) {
        p.payment_refunds.forEach((r) => {
          totalRefunded += Number(r.refund_amount) || 0;
        });
      }
    });

    // In-memory filter for search and status
    let filtered = paymentsList;

    if (statusParam) {
      filtered = filtered.filter((p) => {
        const st = (p.status || "").toLowerCase();
        if (statusParam === "completed") {
          return st === "completed" || st === "paid" || st === "settled";
        }
        if (statusParam === "pending") {
          return ["pending", "created", "order_created", "approved", "processing", "capturing", "initiated"].includes(st);
        }
        if (statusParam === "failed") {
          return st === "failed" || st === "denied";
        }
        if (statusParam === "refunded") {
          return st === "refunded" || st === "partially_refunded";
        }
        return st === statusParam;
      });
    }

    if (searchParam) {
      filtered = filtered.filter((p) => {
        const idMatch = (p.id || "").toLowerCase().includes(searchParam);
        const refMatch = (p.internal_transaction_id || "").toLowerCase().includes(searchParam);
        const orderMatch = (p.paypal_order_id || "").toLowerCase().includes(searchParam);
        const captureMatch = (p.paypal_capture_id || "").toLowerCase().includes(searchParam);
        const payerMatch = (p.payer_email || "").toLowerCase().includes(searchParam) ||
          (p.payer_name || "").toLowerCase().includes(searchParam);
        const recipientMatch = (p.recipient_email || "").toLowerCase().includes(searchParam) ||
          (p.recipient_name || "").toLowerCase().includes(searchParam);
        const descMatch = (p.description || "").toLowerCase().includes(searchParam);

        return idMatch || refMatch || orderMatch || captureMatch || payerMatch || recipientMatch || descMatch;
      });
    }

    // Pagination
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / limit);
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return Response.json({
      status: "ok",
      data: {
        overview: {
          totalTransactions: paymentsList.length,
          successfulPayments: {
            count: completedCount,
            amount: totalVolume,
            formatted: formatCurrencyDisplay(totalVolume, "USD"),
          },
          pendingPayments: {
            count: pendingCount,
            amount: pendingVolume,
            formatted: formatCurrencyDisplay(pendingVolume, "USD"),
          },
          failedPayments: {
            count: failedCount,
          },
          refundedPayments: {
            count: refundedCount,
            amount: totalRefunded,
            formatted: formatCurrencyDisplay(totalRefunded, "USD"),
          },
        },
        payments: paginated.map((p) => ({
          id: p.id,
          internalReference: p.internal_transaction_id,
          orderId: p.paypal_order_id,
          captureId: p.paypal_capture_id,
          amount: p.amount,
          fee: p.transaction_fee,
          totalAmount: p.total_amount || p.amount,
          currency: p.currency,
          formattedAmount: formatCurrencyDisplay(p.total_amount || p.amount, p.currency),
          status: p.status,
          category: p.category,
          payerEmail: p.payer_email,
          payerName: p.payer_name,
          recipientEmail: p.recipient_email,
          recipientName: p.recipient_name,
          paymentMethod: p.payment_method || "PayPal Sandbox",
          date: p.captured_at || p.created_at,
          refunds: p.payment_refunds || [],
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
        },
      },
    });
  } catch {
    return Response.json(
      { status: "error", message: "Failed to load administrative payments." },
      { status: 500 }
    );
  }
}
