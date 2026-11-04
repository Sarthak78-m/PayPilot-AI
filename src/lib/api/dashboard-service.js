/**
 * PayPilot AI — Dashboard API Service
 *
 * Connects directly to authenticated backend endpoint GET /api/dashboard/summary.
 * Never silently falls back to mock data. Returns accurate server-calculated data.
 */

export async function fetchDashboardSummary() {
  try {
    const res = await fetch("/api/dashboard/summary", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      return {
        data: null,
        error: errorBody.message || `Failed to load dashboard data (HTTP ${res.status}).`,
        is401: res.status === 401,
        isMock: false,
      };
    }

    const json = await res.json();
    return {
      data: json.data || null,
      error: null,
      is401: false,
      isMock: false,
    };
  } catch (err) {
    return {
      data: null,
      error: "Unable to connect to dashboard service. Please check your connection.",
      is401: false,
      isMock: false,
    };
  }
}
