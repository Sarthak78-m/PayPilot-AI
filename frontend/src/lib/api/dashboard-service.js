/**
 * PayPilot AI — Dashboard API Service
 *
 * Provides service methods for dashboard analytics, recent invoices, and payments.
 * Strictly respects backend boundaries: attempts real API endpoints first,
 * and falls back to isolated development mock data with isMock=true if endpoints are unavailable.
 */

import {
  mockDashboardMetrics,
  mockRevenueTrends,
  mockRecentInvoices,
  mockRecentPayments,
  mockStatusDistribution,
} from "@/lib/mock/dashboard-data";

export async function fetchDashboardMetrics() {
  try {
    const res = await fetch("/api/dashboard/summary", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (res.ok) {
      const json = await res.json();
      return { data: json.data || json, isMock: false, error: null };
    }
  } catch {
    // Backend endpoint is not yet connected; fallback to isolated development mock
  }

  return {
    data: mockDashboardMetrics,
    isMock: true,
    error: null,
  };
}

export async function fetchRevenueOverview(period = "6M") {
  try {
    const res = await fetch(`/api/dashboard/revenue?period=${encodeURIComponent(period)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (res.ok) {
      const json = await res.json();
      return { data: json.data || json, isMock: false, error: null };
    }
  } catch {
    // Endpoint unavailable
  }

  const dataset = mockRevenueTrends[period] || mockRevenueTrends["6M"];
  return {
    data: dataset,
    isMock: true,
    error: null,
  };
}

export async function fetchRecentInvoices(limit = 5) {
  try {
    const res = await fetch(`/api/invoices/recent?limit=${limit}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (res.ok) {
      const json = await res.json();
      return { data: json.invoices || json.data || json, isMock: false, error: null };
    }
  } catch {
    // Endpoint unavailable
  }

  return {
    data: mockRecentInvoices.slice(0, limit),
    isMock: true,
    error: null,
  };
}

export async function fetchRecentPayments(limit = 5) {
  try {
    const res = await fetch(`/api/payments/recent?limit=${limit}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (res.ok) {
      const json = await res.json();
      return { data: json.payments || json.data || json, isMock: false, error: null };
    }
  } catch {
    // Endpoint unavailable
  }

  return {
    data: mockRecentPayments.slice(0, limit),
    isMock: true,
    error: null,
  };
}

export async function fetchInvoiceDistribution() {
  try {
    const res = await fetch("/api/dashboard/distribution", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (res.ok) {
      const json = await res.json();
      return { data: json.data || json, isMock: false, error: null };
    }
  } catch {
    // Endpoint unavailable
  }

  return {
    data: mockStatusDistribution,
    isMock: true,
    error: null,
  };
}

