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

export async function GET() {
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
        { status: 401 },
      );
    }

    const supabase = await createSupabaseAuthClient();

    // Query all invoices for the authenticated user
    const { data: invoices, error: invError } = await supabase
      .from("invoices")
      .select("id, customer_name, customer_email, description, amount, currency, due_date, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (invError) {
      return Response.json(
        { status: "error", message: "Failed to retrieve invoice metrics." },
        { status: 500 },
      );
    }

    const allInvoices = invoices || [];
    const totalCount = allInvoices.length;

    // Count status breakdown
    let draftCount = 0;
    let pendingCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let cancelledCount = 0;

    // Currency groupings
    const currencyTotals = {};

    allInvoices.forEach((inv) => {
      const status = (inv.status || "DRAFT").toUpperCase();
      const curr = (inv.currency || "USD").toUpperCase();
      const amt = Number(inv.amount) || 0;

      if (!currencyTotals[curr]) {
        currencyTotals[curr] = {
          currency: curr,
          paid: 0,
          pending: 0,
          overdue: 0,
          draft: 0,
          cancelled: 0,
          outstanding: 0,
          total: 0,
        };
      }

      currencyTotals[curr].total += amt;

      switch (status) {
        case "PAID":
          paidCount += 1;
          currencyTotals[curr].paid += amt;
          break;
        case "PENDING":
          pendingCount += 1;
          currencyTotals[curr].pending += amt;
          currencyTotals[curr].outstanding += amt;
          break;
        case "OVERDUE":
          overdueCount += 1;
          currencyTotals[curr].overdue += amt;
          currencyTotals[curr].outstanding += amt;
          break;
        case "DRAFT":
          draftCount += 1;
          currencyTotals[curr].draft += amt;
          break;
        case "CANCELLED":
          cancelledCount += 1;
          currencyTotals[curr].cancelled += amt;
          break;
        default:
          break;
      }
    });

    // Primary currency (most used currency, default USD)
    const currencies = Object.keys(currencyTotals);
    const primaryCurrency = currencies.length > 0 ? currencies[0] : "USD";
    const primaryTotals = currencyTotals[primaryCurrency] || {
      paid: 0,
      pending: 0,
      overdue: 0,
      draft: 0,
      cancelled: 0,
      outstanding: 0,
      total: 0,
    };

    // ISSUE 2 CORRECTION: Use total invoice count as the common denominator for all statuses
    // percentage = (statusCount / totalInvoiceCount) * 100
    // Rounds to 2 decimal places to avoid floating-point drift while summing to ~100%
    const calcPercent = (count) =>
      totalCount > 0 ? Math.round((count / totalCount) * 10000) / 100 : 0;

    const distribution = {
      totalCount,
      paid: {
        count: paidCount,
        percent: calcPercent(paidCount),
        color: "#16A34A",
        label: "Paid",
      },
      pending: {
        count: pendingCount,
        percent: calcPercent(pendingCount),
        color: "#F59E0B",
        label: "Pending",
      },
      overdue: {
        count: overdueCount,
        percent: calcPercent(overdueCount),
        color: "#DC2626",
        label: "Overdue",
      },
      draft: {
        count: draftCount,
        percent: calcPercent(draftCount),
        color: "#64748B",
        label: "Draft",
      },
      cancelled: {
        count: cancelledCount,
        percent: calcPercent(cancelledCount),
        color: "#94A3B8",
        label: "Cancelled",
      },
    };

    // Query verified payment records from payments table
    let recentPayments = [];
    let verifiedPaymentAmount = 0;

    if (allInvoices.length > 0) {
      const invoiceIds = allInvoices.map((i) => i.id);
      const { data: pData } = await supabase
        .from("payments")
        .select("id, invoice_id, amount, status, created_at")
        .in("invoice_id", invoiceIds)
        .order("created_at", { ascending: false });

      if (pData && pData.length > 0) {
        const invMap = new Map(allInvoices.map((i) => [i.id, i]));
        pData.forEach((p) => {
          if ((p.status || "").toLowerCase() === "completed") {
            verifiedPaymentAmount += Number(p.amount) || 0;
          }
        });

        recentPayments = pData.slice(0, 4).map((p) => {
          const matchedInv = invMap.get(p.invoice_id);
          return {
            id: p.id ? `#${p.id.slice(0, 8)}` : "—",
            customer: matchedInv?.customer_name || "Client",
            invoiceId: p.invoice_id ? `#${p.invoice_id.slice(0, 8)}` : "—",
            amount: Number(p.amount) || 0,
            formattedAmount: formatCurrency(p.amount, matchedInv?.currency || "USD"),
            date: p.created_at ? p.created_at.split("T")[0] : "",
            method: "PayPal Sandbox",
            status: p.status || "completed",
          };
        });
      }
    }

    // ISSUE 1 CORRECTION: Honest Financial Metrics
    // Stop labeling PAID invoice amounts as "Total Revenue" or "Collected Revenue".
    // Explicitly designate as "Paid Invoice Value" (settlement unverified without PayPal capture).
    const metrics = {
      // Corrected semantic metric: Paid Invoice Value
      paidInvoiceValue: {
        title: "Paid Invoice Value",
        amount: primaryTotals.paid,
        formatted: formatCurrency(primaryTotals.paid, primaryCurrency),
        count: paidCount,
        period: `${paidCount} marked paid`,
        description: "Total value of invoices marked PAID (settlement unverified)",
      },
      // Backward compatible alias pointing to honest label
      totalRevenue: {
        title: "Paid Invoice Value",
        amount: primaryTotals.paid,
        formatted: formatCurrency(primaryTotals.paid, primaryCurrency),
        period: `${paidCount} marked paid`,
        description: "Total value of invoices marked PAID (settlement unverified)",
      },
      // Verified cash collection metric (strictly 0 until PayPal capture exists)
      verifiedCollectedRevenue: {
        title: "Verified Payments",
        amount: verifiedPaymentAmount,
        formatted: formatCurrency(verifiedPaymentAmount, primaryCurrency),
        count: recentPayments.length,
        period: "Captured in PayPal",
        description: "Verified funds captured via PayPal gateway",
      },
      paidInvoices: {
        count: paidCount,
        amount: primaryTotals.paid,
        formatted: formatCurrency(primaryTotals.paid, primaryCurrency),
        period: "Status = PAID",
        description: "Invoices marked as paid",
      },
      pendingInvoices: {
        count: pendingCount,
        amount: primaryTotals.pending,
        formatted: formatCurrency(primaryTotals.pending, primaryCurrency),
        period: "Awaiting payment",
        description: "Pending client receivables",
      },
      overdueInvoices: {
        count: overdueCount,
        amount: primaryTotals.overdue,
        formatted: formatCurrency(primaryTotals.overdue, primaryCurrency),
        period: "Past due date",
        description: "Requires payment follow-up",
      },
      outstanding: {
        amount: primaryTotals.outstanding,
        formatted: formatCurrency(primaryTotals.outstanding, primaryCurrency),
        count: pendingCount + overdueCount,
        description: "Pending and overdue invoice balance",
      },
      totalCount,
      draftCount,
      cancelledCount,
      primaryCurrency,
      currencyBreakdown: currencyTotals,
    };

    // Top 5 recent invoices
    const recentInvoices = allInvoices.slice(0, 5).map((inv) => ({
      id: inv.id ? `#${inv.id.slice(0, 8)}` : "—",
      rawId: inv.id,
      customer: inv.customer_name || "Untitled Client",
      clientEmail: inv.customer_email || "",
      amount: Number(inv.amount) || 0,
      currency: inv.currency || "USD",
      formattedAmount: formatCurrency(inv.amount, inv.currency),
      issueDate: inv.created_at ? inv.created_at.split("T")[0] : "",
      dueDate: inv.due_date || "On receipt",
      status: (inv.status || "draft").toLowerCase(),
      description: inv.description || "",
    }));

    // Invoiced trends per month (past 6 months)
    const now = new Date();
    const months6 = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const monthLabel = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();

      let monthRevenue = 0;
      let monthInvoices = 0;

      allInvoices.forEach((inv) => {
        if ((inv.status || "").toUpperCase() === "PAID" && inv.created_at) {
          const invDate = new Date(inv.created_at);
          if (invDate.getUTCFullYear() === year && invDate.getUTCMonth() === month) {
            monthRevenue += Number(inv.amount) || 0;
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

    // Past 12 months
    const months12 = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const monthLabel = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();

      let monthRevenue = 0;
      let monthInvoices = 0;

      allInvoices.forEach((inv) => {
        if ((inv.status || "").toUpperCase() === "PAID" && inv.created_at) {
          const invDate = new Date(inv.created_at);
          if (invDate.getUTCFullYear() === year && invDate.getUTCMonth() === month) {
            monthRevenue += Number(inv.amount) || 0;
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
      },
    });
  } catch (err) {
    return Response.json(
      { status: "error", message: "Failed to generate dashboard summary." },
      { status: 500 },
    );
  }
}
