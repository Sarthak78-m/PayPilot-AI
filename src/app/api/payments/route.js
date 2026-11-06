import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatCurrency(amount, currency = "USD") {
  const num = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency || "USD"} ${num.toFixed(2)}`;
  }
}

export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
    const statusParam = (searchParams.get("status") || "").trim().toLowerCase();
    const searchParam = (searchParams.get("search") || "").trim().toLowerCase();
    const sort = searchParams.get("sort") === "amount" ? "amount" : "created_at";
    const order = searchParams.get("order") === "asc" ? "asc" : "desc";

    const supabase = await createSupabaseAuthClient();

    // 1. Fetch user's invoices to establish authorization boundaries
    const { data: userInvoices, error: invError } = await supabase
      .from("invoices")
      .select("id, customer_name, customer_email, currency")
      .eq("user_id", user.id);

    if (invError) {
      return Response.json(
        { status: "error", message: "Failed to retrieve invoices for payments." },
        { status: 500 }
      );
    }

    const primaryCurrency = userInvoices?.[0]?.currency || "USD";

    if (!userInvoices || userInvoices.length === 0) {
      return Response.json({
        status: "ok",
        data: {
          overview: {
            totalReceived: { amount: 0, formatted: formatCurrency(0, primaryCurrency), count: 0 },
            pending: { amount: 0, formatted: formatCurrency(0, primaryCurrency), count: 0 },
            failed: { amount: 0, formatted: formatCurrency(0, primaryCurrency), count: 0 },
            refunded: { amount: 0, formatted: formatCurrency(0, primaryCurrency), count: 0 },
          },
          payments: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        },
      });
    }

    const invoiceIds = userInvoices.map((inv) => inv.id);
    const invMap = new Map(userInvoices.map((inv) => [inv.id, inv]));

    // 2. Fetch payments for invoices owned by this authenticated user
    const { data: paymentsData, error: payError } = await supabase
      .from("payments")
      .select("id, invoice_id, amount, currency, status, provider, created_at, updated_at, paypal_capture_id, paypal_order_id")
      .in("invoice_id", invoiceIds);

    if (payError) {
      return Response.json(
        { status: "error", message: "Failed to retrieve payment records." },
        { status: 500 }
      );
    }

    const allPayments = paymentsData || [];

    // 3. Compute Overview Aggregations
    let totalReceivedAmt = 0;
    let totalReceivedCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;
    let failedAmt = 0;
    let failedCount = 0;
    let refundedAmt = 0;
    let refundedCount = 0;

    allPayments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      const st = (p.status || "").toLowerCase();

      if (st === "completed" || st === "paid" || st === "settled") {
        totalReceivedAmt += amt;
        totalReceivedCount += 1;
      } else if (["pending", "created", "order_created", "approved", "capturing"].includes(st)) {
        pendingAmt += amt;
        pendingCount += 1;
      } else if (st === "failed" || st === "denied") {
        failedAmt += amt;
        failedCount += 1;
      } else if (st === "refunded") {
        refundedAmt += amt;
        refundedCount += 1;
      }
    });

    const overview = {
      totalReceived: {
        amount: Math.round(totalReceivedAmt * 100) / 100,
        formatted: formatCurrency(totalReceivedAmt, primaryCurrency),
        count: totalReceivedCount,
      },
      pending: {
        amount: Math.round(pendingAmt * 100) / 100,
        formatted: formatCurrency(pendingAmt, primaryCurrency),
        count: pendingCount,
      },
      failed: {
        amount: Math.round(failedAmt * 100) / 100,
        formatted: formatCurrency(failedAmt, primaryCurrency),
        count: failedCount,
      },
      refunded: {
        amount: Math.round(refundedAmt * 100) / 100,
        formatted: formatCurrency(refundedAmt, primaryCurrency),
        count: refundedCount,
      },
    };

    // 4. Filter records
    let filtered = allPayments;

    if (statusParam) {
      filtered = filtered.filter((p) => {
        const st = (p.status || "").toLowerCase();
        if (statusParam === "completed") {
          return st === "completed" || st === "paid" || st === "settled";
        }
        if (statusParam === "pending") {
          return ["pending", "created", "order_created", "approved", "capturing"].includes(st);
        }
        if (statusParam === "failed") {
          return st === "failed" || st === "denied";
        }
        return st === statusParam;
      });
    }

    if (searchParam) {
      filtered = filtered.filter((p) => {
        const inv = invMap.get(p.invoice_id);
        const matchId = p.id && p.id.toLowerCase().includes(searchParam);
        const matchOrder = p.paypal_order_id && p.paypal_order_id.toLowerCase().includes(searchParam);
        const matchCapture = p.paypal_capture_id && p.paypal_capture_id.toLowerCase().includes(searchParam);
        const matchCustomer = inv?.customer_name && inv.customer_name.toLowerCase().includes(searchParam);
        const matchEmail = inv?.customer_email && inv.customer_email.toLowerCase().includes(searchParam);
        return matchId || matchOrder || matchCapture || matchCustomer || matchEmail;
      });
    }

    // 5. Sort records
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sort === "amount") {
        comparison = (Number(a.amount) || 0) - (Number(b.amount) || 0);
      } else {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        comparison = dateA - dateB;
      }
      return order === "asc" ? comparison : -comparison;
    });

    // 6. Paginate
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    // 7. Format records
    const payments = paginated.map((p) => {
      const matchedInv = invMap.get(p.invoice_id);
      const curr = p.currency || matchedInv?.currency || "USD";
      const rawStatus = (p.status || "pending").toLowerCase();
      const normalizedStatus =
        rawStatus === "paid" || rawStatus === "settled" ? "completed" : rawStatus;

      return {
        id: p.id,
        transactionRef: p.paypal_capture_id
          ? `#${p.paypal_capture_id.slice(-8)}`
          : p.id
          ? `#${p.id.slice(0, 8)}`
          : "—",
        invoiceId: p.invoice_id ? `#${p.invoice_id.slice(0, 8)}` : "—",
        rawInvoiceId: p.invoice_id,
        customer: matchedInv?.customer_name || "Client",
        customerEmail: matchedInv?.customer_email || "",
        amount: Number(p.amount) || 0,
        currency: curr,
        formattedAmount: formatCurrency(p.amount, curr),
        date: p.created_at ? p.created_at.split("T")[0] : "",
        status: normalizedStatus,
        provider: p.provider === "paypal" ? "PayPal Sandbox" : p.provider || "PayPal Sandbox",
      };
    });

    return Response.json({
      status: "ok",
      data: {
        overview,
        payments,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch {
    return Response.json(
      { status: "error", message: "An unexpected error occurred while fetching payments." },
      { status: 500 }
    );
  }
}
