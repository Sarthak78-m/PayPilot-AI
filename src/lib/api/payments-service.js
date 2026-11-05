/**
 * PayPilot AI — Payments API Service
 *
 * Client-side integration layer for payment settlements and transaction history.
 * Designed to connect to the dedicated endpoint GET /api/payments.
 *
 * If the dedicated endpoint is not yet deployed (HTTP 404), gracefully retrieves
 * verified settlement records from GET /api/dashboard/summary to avoid breaking the UI,
 * while transparently flagging the endpoint readiness status.
 *
 * BACKEND API CONTRACT SPECIFICATION (GET /api/payments):
 * -----------------------------------------------------------------------------
 * Endpoint: GET /api/payments
 * Query Parameters:
 *   - page: number (default 1)
 *   - limit: number (default 10, max 50)
 *   - status: "completed" | "pending" | "failed" | "refunded" (optional)
 *   - search: string (optional — searches transaction ID, customer, invoice ID)
 *   - sort: "created_at" | "amount" (default "created_at")
 *   - order: "asc" | "desc" (default "desc")
 *
 * Headers:
 *   - Cookie: session auth token (managed via credentials: "include")
 *
 * Response Format (200 OK):
 * {
 *   "status": "ok",
 *   "data": {
 *     "overview": {
 *       "totalReceived": { "amount": 0, "formatted": "$0.00", "count": 0 },
 *       "pending": { "amount": 0, "formatted": "$0.00", "count": 0 },
 *       "failed": { "amount": 0, "formatted": "$0.00", "count": 0 },
 *       "refunded": { "amount": 0, "formatted": "$0.00", "count": 0 }
 *     },
 *     "payments": [
 *       {
 *         "id": "uuid",
 *         "transactionRef": "#c1f7a28e",
 *         "invoiceId": "#d54d9241",
 *         "customer": "Client Name",
 *         "amount": 1200.00,
 *         "currency": "USD",
 *         "formattedAmount": "$1,200.00",
 *         "date": "2026-11-04",
 *         "status": "completed",
 *         "provider": "PayPal Sandbox"
 *       }
 *     ],
 *     "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
 *   }
 * }
 * -----------------------------------------------------------------------------
 */

export async function fetchPayments({ page = 1, limit = 10, status = "", search = "" } = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (status) params.set("status", status);
  if (search.trim()) params.set("search", search.trim());

  try {
    // 1. Attempt primary dedicated endpoint
    const res = await fetch(`/api/payments?${params.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (res.ok) {
      const json = await res.json();
      return {
        data: json.data || json,
        error: null,
        is401: false,
        isFallback: false,
        status: 200,
      };
    }

    if (res.status === 401) {
      return {
        data: null,
        error: "Your session has expired. Please sign in to view payment records.",
        is401: true,
        isFallback: false,
        status: 401,
      };
    }

    // 2. If dedicated endpoint is 404 (not yet implemented), query verified settlements from summary
    if (res.status === 404) {
      const summaryRes = await fetch("/api/dashboard/summary", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!summaryRes.ok) {
        if (summaryRes.status === 401) {
          return {
            data: null,
            error: "Your session has expired. Please sign in to view payment records.",
            is401: true,
            isFallback: false,
            status: 401,
          };
        }
        return {
          data: null,
          error: "Payment settlement service is temporarily unavailable. Please try again later.",
          is401: false,
          isFallback: false,
          status: 404,
        };
      }

      const summaryJson = await summaryRes.json();
      const rawPayments = summaryJson.data?.recentPayments || [];
      const verifiedMetric = summaryJson.data?.metrics?.verifiedCollectedRevenue || {
        amount: 0,
        formatted: "$0.00",
        count: 0,
      };

      // Filter verified payments client-side for search and status
      const filtered = rawPayments.filter((p) => {
        const matchesStatus = !status || (p.status || "").toLowerCase() === status.toLowerCase();
        const matchesSearch =
          !search ||
          (p.customer || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.invoiceId || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.id || "").toLowerCase().includes(search.toLowerCase());
        return matchesStatus && matchesSearch;
      });

      return {
        data: {
          overview: {
            totalReceived: {
              amount: verifiedMetric.amount || 0,
              formatted: verifiedMetric.formatted || "$0.00",
              count: verifiedMetric.count || rawPayments.length,
            },
            pending: null,
            failed: null,
            refunded: null,
          },
          payments: filtered,
          pagination: {
            page: 1,
            limit: rawPayments.length || 10,
            total: filtered.length,
            totalPages: 1,
            isLimitedSummary: true,
          },
        },
        error: null,
        is401: false,
        isFallback: true,
        status: 200,
      };
    }

    const errBody = await res.json().catch(() => ({}));
    return {
      data: null,
      error: errBody.message || `Failed to load payment records (HTTP ${res.status}).`,
      is401: false,
      isFallback: false,
      status: res.status,
    };
  } catch {
    return {
      data: null,
      error: "Unable to connect to payments service. Please check your network connection.",
      is401: false,
      isFallback: false,
      status: 0,
    };
  }
}
