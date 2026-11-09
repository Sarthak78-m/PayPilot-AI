import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient } from "@/lib/supabase/server";
import {
  formatCurrencyDisplay,
  SUPPORTED_CURRENCIES,
  convertCurrency,
  normalizeCurrency,
} from "@/lib/payments/currency";

export const dynamic = "force-dynamic";

function getCurrencySymbol(curr) {
  switch ((curr || "").toUpperCase()) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "CAD":
      return "CA$";
    case "AUD":
      return "A$";
    default:
      return "$";
  }
}

export async function GET(request) {
  try {
    let user = null;
    try {
      user = await getAuthenticatedUser();
    } catch {
      user = null;
    }

    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 }
      );
    }

    // Parse requested currency filter (optional: ?currency=USD or ?currency=INR or ?currency=ALL)
    let requestedCurrency = "";
    if (request && request.url) {
      try {
        const { searchParams } = new URL(request.url);
        requestedCurrency = (searchParams.get("currency") || "").trim().toUpperCase();
      } catch {
        requestedCurrency = "";
      }
    }

    const supabase = await createSupabaseAuthClient();

    // 1. Query all invoices for the authenticated user
    const { data: invoices, error: invError } = await supabase
      .from("invoices")
      .select("id, customer_name, customer_email, description, amount, currency, due_date, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (invError) {
      return Response.json(
        { status: "error", message: "Failed to retrieve invoice metrics." },
        { status: 500 }
      );
    }

    const allInvoices = invoices || [];

    // 2. Query payments for this user (both invoice-linked and direct dashboard transactions)
    let userPayments = [];
    try {
      const { data: pData } = await supabase
        .from("payments")
        .select("id, invoice_id, amount, currency, status, total_amount, internal_transaction_id, recipient_name, recipient_email, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      userPayments = pData || [];
    } catch {
      userPayments = [];
    }

    // 3. Build comprehensive Multi-Currency Breakdown (Due & Paid by Currency)
    const currencyTotals = {};

    function initCurrencyBucket(curr) {
      const normalized = (curr || "USD").toUpperCase();
      if (!currencyTotals[normalized]) {
        currencyTotals[normalized] = {
          currency: normalized,
          symbol: getCurrencySymbol(normalized),
          // Due Receivables (Pending + Overdue invoices)
          dueAmount: 0,
          dueCount: 0,
          pendingAmount: 0,
          pendingCount: 0,
          overdueAmount: 0,
          overdueCount: 0,
          // Settled Payments (Paid invoices)
          paidAmount: 0,
          paidCount: 0,
          // Additional invoice states
          draftAmount: 0,
          draftCount: 0,
          cancelledAmount: 0,
          cancelledCount: 0,
          // Total invoiced
          totalAmount: 0,
          totalCount: 0,
          // Verified gateway collections
          verifiedPaymentAmount: 0,
          verifiedPaymentCount: 0,
        };
      }
      return currencyTotals[normalized];
    }

    // Tally invoice metrics per currency
    allInvoices.forEach((inv) => {
      const curr = (inv.currency || "USD").toUpperCase();
      const status = (inv.status || "DRAFT").toUpperCase();
      const amt = Number(inv.amount) || 0;
      const bucket = initCurrencyBucket(curr);

      bucket.totalAmount += amt;
      bucket.totalCount += 1;

      switch (status) {
        case "PAID":
          bucket.paidAmount += amt;
          bucket.paidCount += 1;
          break;
        case "PENDING":
          bucket.pendingAmount += amt;
          bucket.pendingCount += 1;
          bucket.dueAmount += amt;
          bucket.dueCount += 1;
          break;
        case "OVERDUE":
          bucket.overdueAmount += amt;
          bucket.overdueCount += 1;
          bucket.dueAmount += amt;
          bucket.dueCount += 1;
          break;
        case "DRAFT":
          bucket.draftAmount += amt;
          bucket.draftCount += 1;
          break;
        case "CANCELLED":
          bucket.cancelledAmount += amt;
          bucket.cancelledCount += 1;
          break;
        default:
          break;
      }
    });

    // Tally verified payment records per currency
    userPayments.forEach((p) => {
      const pCurr = (p.currency || "USD").toUpperCase();
      const pStatus = (p.status || "").toLowerCase();
      const pAmt = Number(p.amount || p.total_amount) || 0;
      const bucket = initCurrencyBucket(pCurr);

      if (pStatus === "completed" || pStatus === "paid" || pStatus === "settled") {
        bucket.verifiedPaymentAmount += pAmt;
        bucket.verifiedPaymentCount += 1;
      }
    });

    // Determine available currencies
    const availableCurrencies = Object.keys(currencyTotals);
    if (availableCurrencies.length === 0) {
      availableCurrencies.push("USD");
      initCurrencyBucket("USD");
    }

    // Format all currency totals with their native symbols and unified USD conversions
    Object.values(currencyTotals).forEach((ct) => {
      ct.formattedDue = formatCurrencyDisplay(ct.dueAmount, ct.currency);
      ct.formattedPending = formatCurrencyDisplay(ct.pendingAmount, ct.currency);
      ct.formattedOverdue = formatCurrencyDisplay(ct.overdueAmount, ct.currency);
      ct.formattedPaid = formatCurrencyDisplay(ct.paidAmount, ct.currency);
      ct.formattedTotal = formatCurrencyDisplay(ct.totalAmount, ct.currency);
      ct.formattedVerified = formatCurrencyDisplay(ct.verifiedPaymentAmount, ct.currency);

      const convDue = convertCurrency({
        amount: ct.dueAmount,
        fromCurrency: ct.currency,
        toCurrency: "USD",
      });
      const convPaid = convertCurrency({
        amount: ct.paidAmount,
        fromCurrency: ct.currency,
        toCurrency: "USD",
      });
      const convTotal = convertCurrency({
        amount: ct.totalAmount,
        fromCurrency: ct.currency,
        toCurrency: "USD",
      });

      ct.convertedDueUSD = convDue.convertedAmount;
      ct.convertedPaidUSD = convPaid.convertedAmount;
      ct.convertedTotalUSD = convTotal.convertedAmount;
      ct.formattedConvertedDue = formatCurrencyDisplay(convDue.convertedAmount, "USD");
      ct.formattedConvertedPaid = formatCurrencyDisplay(convPaid.convertedAmount, "USD");
      ct.formattedConvertedTotal = formatCurrencyDisplay(convTotal.convertedAmount, "USD");
      ct.exchangeRateText = ct.currency === "USD" ? "Baseline Currency (1:1)" : `1 USD ≈ 83.50 ${ct.currency}`;
    });

    // Baseline unified platform currency is strictly USD
    const isUSDUnified =
      !requestedCurrency ||
      requestedCurrency === "ALL" ||
      requestedCurrency === "USD";

    const activeCurrency = isUSDUnified
      ? "USD"
      : availableCurrencies.includes(requestedCurrency)
      ? requestedCurrency
      : "USD";

    let displayCurrency = activeCurrency;
    let filteredInvoices = [];
    let filteredPayments = [];

    // Active metrics computation
    let activePaidAmount = 0;
    let activePaidCount = 0;
    let activeDueAmount = 0;
    let activeDueCount = 0;
    let activePendingAmount = 0;
    let activePendingCount = 0;
    let activeOverdueAmount = 0;
    let activeOverdueCount = 0;
    let activeDraftCount = 0;
    let activeCancelledCount = 0;
    let activeTotalCount = 0;
    let activeVerifiedAmount = 0;
    let activeVerifiedCount = 0;

    if (isUSDUnified) {
      displayCurrency = "USD";
      filteredInvoices = allInvoices;
      filteredPayments = userPayments;

      allInvoices.forEach((inv) => {
        const rawAmt = Number(inv.amount) || 0;
        const invCurr = (inv.currency || "USD").toUpperCase();
        const st = (inv.status || "DRAFT").toUpperCase();
        const isPastDue = inv.due_date && inv.due_date < nowStr;

        const conv = convertCurrency({
          amount: rawAmt,
          fromCurrency: invCurr,
          toCurrency: "USD",
        });
        const usdVal = conv.convertedAmount || 0;

        if (st === "PAID") {
          activePaidAmount += usdVal;
          activePaidCount += 1;
        } else if (st === "OVERDUE" || (st === "PENDING" && isPastDue)) {
          activeOverdueAmount += usdVal;
          activeOverdueCount += 1;
          activeDueAmount += usdVal;
          activeDueCount += 1;
        } else if (st === "PENDING") {
          activePendingAmount += usdVal;
          activePendingCount += 1;
          activeDueAmount += usdVal;
          activeDueCount += 1;
        } else if (st === "DRAFT") {
          activeDraftCount += 1;
        } else if (st === "CANCELLED") {
          activeCancelledCount += 1;
        }
      });

      userPayments.forEach((p) => {
        const pCurr = (p.currency || "USD").toUpperCase();
        const pStatus = (p.status || "").toLowerCase();
        const pAmt = Number(p.amount || p.total_amount) || 0;
        if (pStatus === "completed" || pStatus === "paid" || pStatus === "settled") {
          const conv = convertCurrency({
            amount: pAmt,
            fromCurrency: pCurr,
            toCurrency: "USD",
          });
          activeVerifiedAmount += conv.convertedAmount;
          activeVerifiedCount += 1;
        }
      });

      activePaidAmount = Math.round(activePaidAmount * 100) / 100;
      activeDueAmount = Math.round(activeDueAmount * 100) / 100;
      activePendingAmount = Math.round(activePendingAmount * 100) / 100;
      activeOverdueAmount = Math.round(activeOverdueAmount * 100) / 100;
      activeVerifiedAmount = Math.round(activeVerifiedAmount * 100) / 100;
      activeTotalCount = allInvoices.length;
    } else {
      // Non-USD single currency view (e.g. INR)
      displayCurrency = activeCurrency;
      filteredInvoices = allInvoices.filter(
        (inv) => (inv.currency || "USD").toUpperCase() === activeCurrency
      );
      filteredPayments = userPayments.filter(
        (p) => (p.currency || "USD").toUpperCase() === activeCurrency
      );

      const b = currencyTotals[activeCurrency] || initCurrencyBucket(activeCurrency);
      activePaidAmount = b.paidAmount;
      activePaidCount = b.paidCount;
      activeDueAmount = b.dueAmount;
      activeDueCount = b.dueCount;
      activePendingAmount = b.pendingAmount;
      activePendingCount = b.pendingCount;
      activeOverdueAmount = b.overdueAmount;
      activeOverdueCount = b.overdueCount;
      activeDraftCount = b.draftCount;
      activeCancelledCount = b.cancelledCount;
      activeVerifiedAmount = b.verifiedPaymentAmount;
      activeVerifiedCount = b.verifiedPaymentCount;
      activeTotalCount = filteredInvoices.length;
    }

    const calcPercent = (count) =>
      activeTotalCount > 0 ? Math.round((count / activeTotalCount) * 10000) / 100 : 0;

    const distribution = {
      totalCount: activeTotalCount,
      paid: {
        count: activePaidCount,
        percent: calcPercent(activePaidCount),
        color: "#16A34A",
        label: "Paid",
      },
      pending: {
        count: activePendingCount,
        percent: calcPercent(activePendingCount),
        color: "#F59E0B",
        label: "Pending",
      },
      overdue: {
        count: activeOverdueCount,
        percent: calcPercent(activeOverdueCount),
        color: "#DC2626",
        label: "Overdue",
      },
      draft: {
        count: activeDraftCount,
        percent: calcPercent(activeDraftCount),
        color: "#64748B",
        label: "Draft",
      },
      cancelled: {
        count: activeCancelledCount,
        percent: calcPercent(activeCancelledCount),
        color: "#94A3B8",
        label: "Cancelled",
      },
    };

    // Format top 5 recent invoices for display
    const recentInvoices = filteredInvoices.slice(0, 5).map((inv) => ({
      id: inv.id ? `#${inv.id.slice(0, 8)}` : "—",
      rawId: inv.id,
      customer: inv.customer_name || "Untitled Client",
      clientEmail: inv.customer_email || "",
      amount: Number(inv.amount) || 0,
      currency: inv.currency || "USD",
      formattedAmount: formatCurrencyDisplay(inv.amount, inv.currency || "USD"),
      issueDate: inv.created_at ? inv.created_at.split("T")[0] : "",
      dueDate: inv.due_date || "On receipt",
      status: (inv.status || "draft").toLowerCase(),
      description: inv.description || "",
    }));

    // Format recent settlements
    const invMap = new Map(allInvoices.map((i) => [i.id, i]));
    const recentPayments = filteredPayments.slice(0, 4).map((p) => {
      const matchedInv = p.invoice_id ? invMap.get(p.invoice_id) : null;
      const payeeName = p.recipient_name || p.recipient_email || matchedInv?.customer_name || "Client";
      const paymentCur = p.currency || matchedInv?.currency || "USD";
      const paymentAmt = Number(p.amount || p.total_amount) || 0;
      return {
        id: p.id ? `#${p.id.slice(0, 8)}` : (p.internal_transaction_id || "—"),
        customer: payeeName,
        invoiceId: p.invoice_id ? `#${p.invoice_id.slice(0, 8)}` : (p.internal_transaction_id || "Direct Payment"),
        amount: paymentAmt,
        currency: paymentCur,
        formattedAmount: formatCurrencyDisplay(paymentAmt, paymentCur),
        date: p.created_at ? p.created_at.split("T")[0] : "",
        method: "PayPal Sandbox",
        status: (p.status || "completed").toLowerCase(),
      };
    });

    // Invoiced trends per month for the selected/active currency
    const now = new Date();
    const months6 = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const monthLabel = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();

      let monthRevenue = 0;
      let monthInvoices = 0;

      filteredInvoices.forEach((inv) => {
        if ((inv.status || "").toUpperCase() === "PAID" && inv.created_at) {
          const invDate = new Date(inv.created_at);
          if (invDate.getUTCFullYear() === year && invDate.getUTCMonth() === month) {
            const rawAmt = Number(inv.amount) || 0;
            if (isUSDUnified) {
              const converted = convertCurrency({
                amount: rawAmt,
                fromCurrency: inv.currency || "USD",
                toCurrency: "USD",
              });
              monthRevenue += converted.convertedAmount;
            } else {
              monthRevenue += rawAmt;
            }
            monthInvoices += 1;
          }
        }
      });

      months6.push({
        label: monthLabel,
        month: d.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
        revenue: Math.round(monthRevenue * 100) / 100,
        invoices: monthInvoices,
      });
    }

    const months12 = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const monthLabel = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();

      let monthRevenue = 0;
      let monthInvoices = 0;

      filteredInvoices.forEach((inv) => {
        if ((inv.status || "").toUpperCase() === "PAID" && inv.created_at) {
          const invDate = new Date(inv.created_at);
          if (invDate.getUTCFullYear() === year && invDate.getUTCMonth() === month) {
            const rawAmt = Number(inv.amount) || 0;
            if (isUSDUnified) {
              const converted = convertCurrency({
                amount: rawAmt,
                fromCurrency: inv.currency || "USD",
                toCurrency: "USD",
              });
              monthRevenue += converted.convertedAmount;
            } else {
              monthRevenue += rawAmt;
            }
            monthInvoices += 1;
          }
        }
      });

      months12.push({
        label: monthLabel,
        month: d.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
        revenue: Math.round(monthRevenue * 100) / 100,
        invoices: monthInvoices,
      });
    }

    const metrics = {
      paidInvoiceValue: {
        title: "Paid Invoice Value",
        amount: activePaidAmount,
        formatted: formatCurrencyDisplay(activePaidAmount, displayCurrency),
        count: activePaidCount,
        period: `${activePaidCount} marked paid`,
        description: `Total value of invoices marked PAID (${displayCurrency})`,
      },
      totalRevenue: {
        title: "Paid Invoice Value",
        amount: activePaidAmount,
        formatted: formatCurrencyDisplay(activePaidAmount, displayCurrency),
        period: `${activePaidCount} marked paid`,
        description: `Total value of invoices marked PAID (${displayCurrency})`,
      },
      verifiedCollectedRevenue: {
        title: "Verified Payments",
        amount: activeVerifiedAmount,
        formatted: formatCurrencyDisplay(activeVerifiedAmount, displayCurrency),
        count: activeVerifiedCount,
        period: "Captured in PayPal",
        description: `Verified funds captured via PayPal gateway (${displayCurrency})`,
      },
      paidInvoices: {
        count: activePaidCount,
        amount: activePaidAmount,
        formatted: formatCurrencyDisplay(activePaidAmount, displayCurrency),
        period: "Status = PAID",
        description: "Invoices marked as paid",
      },
      pendingInvoices: {
        count: activePendingCount,
        amount: activePendingAmount,
        formatted: formatCurrencyDisplay(activePendingAmount, displayCurrency),
        period: "Awaiting payment",
        description: "Pending client receivables",
      },
      overdueInvoices: {
        count: activeOverdueCount,
        amount: activeOverdueAmount,
        formatted: formatCurrencyDisplay(activeOverdueAmount, displayCurrency),
        period: "Past due date",
        description: "Requires payment follow-up",
      },
      outstanding: {
        amount: activeDueAmount,
        formatted: formatCurrencyDisplay(activeDueAmount, displayCurrency),
        count: activeDueCount,
        description: `Pending and overdue receivable balance (${displayCurrency})`,
      },
      totalCount: activeTotalCount,
      draftCount: activeDraftCount,
      cancelledCount: activeCancelledCount,
      primaryCurrency: displayCurrency,
      currencyBreakdown: currencyTotals,
    };

    return Response.json({
      status: "ok",
      data: {
        metrics,
        distribution,
        recentInvoices,
        recentPayments,
        revenueTrends: {
          "6M": months6,
          "1Y": months12,
          ALL: months12,
        },
        availableCurrencies,
        activeCurrency,
        displayCurrency,
        byCurrency: Object.values(currencyTotals),
      },
    });
  } catch (err) {
    return Response.json(
      { status: "error", message: "Failed to generate dashboard summary." },
      { status: 500 }
    );
  }
}
