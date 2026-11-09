import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { convertCurrency } from "@/lib/payments/currency";

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
    const serverSupabase = createSupabaseServerClient();

    // 1. Fetch user's invoices to establish authorization boundaries and customer mappings
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

    const invoicesList = userInvoices || [];
    const primaryCurrency = invoicesList[0]?.currency || "USD";
    const invoiceIds = invoicesList.map((inv) => inv.id);
    const invMap = new Map(invoicesList.map((inv) => [inv.id, inv]));

    // 2. Fetch payments: either linked to user's invoices OR directly owned by user
    let paymentsQuery = serverSupabase
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
        created_at,
        updated_at,
        paypal_capture_id,
        paypal_order_id
      `);

    if (invoiceIds.length > 0) {
      paymentsQuery = paymentsQuery.or(`user_id.eq.${user.id},invoice_id.in.(${invoiceIds.join(",")})`);
    } else {
      paymentsQuery = paymentsQuery.eq("user_id", user.id);
    }

    const { data: paymentsData, error: payError } = await paymentsQuery;

    if (payError) {
      return Response.json(
        { status: "error", message: "Failed to retrieve payment records." },
        { status: 500 }
      );
    }

    const allPayments = paymentsData || [];

    // 3. Compute Overview Aggregations (Unified in USD via live reference exchange rates)
    let totalReceivedAmt = 0;
    let totalReceivedCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;
    let failedAmt = 0;
    let failedCount = 0;
    let refundedAmt = 0;
    let refundedCount = 0;

    allPayments.forEach((p) => {
      const rawAmt = Number(p.total_amount || p.amount) || 0;
      const matchedInv = invMap.get(p.invoice_id);
      const curr = (p.currency || matchedInv?.currency || "USD").toUpperCase();

      // Convert all figures to USD for the unified overview
      const conversion = convertCurrency({
        amount: rawAmt,
        fromCurrency: curr,
        toCurrency: "USD",
      });
      const amtInUsd = conversion.convertedAmount;
      const st = (p.status || "").toLowerCase();

      if (st === "completed" || st === "paid" || st === "settled") {
        totalReceivedAmt += amtInUsd;
        totalReceivedCount += 1;
      } else if (["pending", "created", "order_created", "approved", "processing", "capturing", "initiated"].includes(st)) {
        pendingAmt += amtInUsd;
        pendingCount += 1;
      } else if (st === "failed" || st === "denied") {
        failedAmt += amtInUsd;
        failedCount += 1;
      } else if (st === "refunded" || st === "partially_refunded") {
        refundedAmt += amtInUsd;
        refundedCount += 1;
      }
    });

    const overview = {
      currency: "USD",
      isUnifiedUsd: true,
      totalReceived: {
        amount: Math.round(totalReceivedAmt * 100) / 100,
        formatted: formatCurrency(totalReceivedAmt, "USD"),
        count: totalReceivedCount,
      },
      pending: {
        amount: Math.round(pendingAmt * 100) / 100,
        formatted: formatCurrency(pendingAmt, "USD"),
        count: pendingCount,
      },
      failed: {
        amount: Math.round(failedAmt * 100) / 100,
        formatted: formatCurrency(failedAmt, "USD"),
        count: failedCount,
      },
      refunded: {
        amount: Math.round(refundedAmt * 100) / 100,
        formatted: formatCurrency(refundedAmt, "USD"),
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
        const inv = invMap.get(p.invoice_id);
        const matchId = p.id && p.id.toLowerCase().includes(searchParam);
        const matchInternal = p.internal_transaction_id && p.internal_transaction_id.toLowerCase().includes(searchParam);
        const matchOrder = p.paypal_order_id && p.paypal_order_id.toLowerCase().includes(searchParam);
        const matchCapture = p.paypal_capture_id && p.paypal_capture_id.toLowerCase().includes(searchParam);
        const matchCustomer = (inv?.customer_name && inv.customer_name.toLowerCase().includes(searchParam)) ||
          (p.recipient_name && p.recipient_name.toLowerCase().includes(searchParam)) ||
          (p.payer_name && p.payer_name.toLowerCase().includes(searchParam));
        const matchEmail = (inv?.customer_email && inv.customer_email.toLowerCase().includes(searchParam)) ||
          (p.recipient_email && p.recipient_email.toLowerCase().includes(searchParam)) ||
          (p.payer_email && p.payer_email.toLowerCase().includes(searchParam));

        return matchId || matchInternal || matchOrder || matchCapture || matchCustomer || matchEmail;
      });
    }

    // 5. Sort records
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sort === "amount") {
        comparison = (Number(a.total_amount || a.amount) || 0) - (Number(b.total_amount || b.amount) || 0);
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

    // 7. Format records (All converted to USD by live reference exchange rate)
    const payments = paginated.map((p) => {
      const matchedInv = invMap.get(p.invoice_id);
      const originalCurrency = (p.currency || matchedInv?.currency || "USD").toUpperCase();
      const rawStatus = (p.status || "pending").toLowerCase();
      const normalizedStatus =
        rawStatus === "paid" || rawStatus === "settled" ? "completed" : rawStatus;

      const rawAmount = Number(p.total_amount || p.amount) || 0;

      // Convert to USD by exchange rate
      const usdConversion = convertCurrency({
        amount: rawAmount,
        fromCurrency: originalCurrency,
        toCurrency: "USD",
      });

      const amountInUsd = usdConversion.convertedAmount;
      const formattedUsd = formatCurrency(amountInUsd, "USD");
      const formattedOriginal = formatCurrency(rawAmount, originalCurrency);

      return {
        id: p.id,
        internalReference: p.internal_transaction_id || null,
        transactionRef: p.internal_transaction_id
          ? p.internal_transaction_id
          : p.paypal_capture_id
          ? `#${p.paypal_capture_id.slice(-8)}`
          : p.id
          ? `#${p.id.slice(0, 8)}`
          : "—",
        invoiceId: p.invoice_id ? `#${p.invoice_id.slice(0, 8)}` : "—",
        rawInvoiceId: p.invoice_id,
        customer: p.recipient_name || matchedInv?.customer_name || p.payer_name || "Client",
        customerEmail: p.recipient_email || matchedInv?.customer_email || p.payer_email || "",
        amount: amountInUsd,
        currency: "USD",
        formattedAmount: formattedUsd,
        amountInUsd,
        formattedAmountInUsd: formattedUsd,
        originalAmount: rawAmount,
        originalCurrency,
        formattedOriginalAmount: formattedOriginal,
        isConverted: originalCurrency !== "USD",
        exchangeRate: usdConversion.exchangeRate,
        baseAmount: Number(p.amount) || 0,
        fee: Number(p.transaction_fee) || 0,
        date: p.created_at ? p.created_at.split("T")[0] : "",
        fullDate: p.created_at,
        status: normalizedStatus,
        provider: p.provider === "paypal" ? "PayPal Sandbox" : p.provider || "PayPal Sandbox",
        paymentMethod: p.payment_method || "PayPal Sandbox",
        paypalOrderId: p.paypal_order_id,
        paypalCaptureId: p.paypal_capture_id,
        category: p.category || "Payment",
        description: p.description || "",
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
