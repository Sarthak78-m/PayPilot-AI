"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchDashboardSummary } from "@/lib/api/dashboard-service";
import { FinancialSummarySection } from "@/components/dashboard/financial-summary-card";
import { RevenueOverview } from "@/components/dashboard/revenue-overview";
import { RecentInvoices } from "@/components/dashboard/recent-invoices";
import { RecentPayments } from "@/components/dashboard/recent-payments";
import { InvoiceStatusDistribution } from "@/components/dashboard/invoice-status-distribution";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { AIAssistantCard } from "@/components/dashboard/ai-assistant-card";
import { useDashboardSearch } from "@/lib/context/search-context";
import { Badge, Button, Skeleton } from "@/components/ui";
import { RefreshCw, AlertCircle, Plus, Sparkles, DollarSign } from "@/components/icons";

export default function DashboardPage() {
  const router = useRouter();
  const { searchQuery } = useDashboardSearch();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [is401, setIs401] = useState(false);

  const [period, setPeriod] = useState("6M");

  const [metrics, setMetrics] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [revenueTrends, setRevenueTrends] = useState({ "6M": [], "1Y": [], ALL: [] });

  const loadData = useCallback(async () => {
    try {
      const res = await fetchDashboardSummary("USD");

      if (res.error) {
        if (res.is401) {
          setIs401(true);
          setError("Your session has expired. Please sign in to view dashboard metrics.");
        } else {
          setError(res.error);
        }
        return;
      }

      if (res.data) {
        setMetrics(res.data.metrics);
        setDistribution(res.data.distribution);
        setInvoices(res.data.recentInvoices || []);
        setPayments(res.data.recentPayments || []);
        setRevenueTrends(res.data.revenueTrends || { "6M": [], "1Y": [], ALL: [] });
        setError(null);
        setIs401(false);
      }
    } catch {
      setError("Unable to connect to dashboard service. Please check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!ignore) {
        await loadData();
      }
    })();
    return () => {
      ignore = true;
    };
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <Skeleton className="h-80 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="h-96 rounded-2xl lg:col-span-8" />
          <Skeleton className="h-96 rounded-2xl lg:col-span-4" />
        </div>
      </div>
    );
  }

  const currentRevenueData = revenueTrends[period] || revenueTrends["6M"] || [];
  const isEmptyAccount = metrics?.totalCount === 0;

  return (
    <div className="space-y-4">
      {/* Session Expired (401) Error Banner */}
      {is401 && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-raised-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <span className="font-semibold">{error}</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push("/login")}
            className="shrink-0"
          >
            Go to Sign In
          </Button>
        </div>
      )}

      {/* General API Error Banner */}
      {!is401 && error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-3 shadow-raised-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Unified Currency & Due Receivables Quick Bar */}
      <div className="p-3 sm:p-3.5 rounded-2xl bg-[#E8EDF4] dark:bg-[#111726] border border-[#CBD5E1]/60 dark:border-white/10 shadow-raised-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/25 text-[#2563EB] dark:text-[#60A5FA] text-xs font-semibold shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#2563EB] animate-pulse" />
            <span>Unified Currency: <strong className="font-bold">USD ($)</strong></span>
          </div>

          <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] hidden md:inline">
            All amounts unified in USD (1 USD = 94 INR, 0.891 EUR, 0.744 GBP, 1.4 CAD, 1.446 AUD)
          </span>
        </div>

        {/* Right side: Dynamic Due Payments status & Refresh */}
        <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-[#CBD5E1]/60 dark:border-white/10">
          {metrics?.outstanding && (
            <div className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5">
              <span>Due Receivables (USD):</span>
              <strong className="text-[#DC2626] font-mono font-bold text-sm">
                {metrics.outstanding.formatted}
              </strong>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 sm:p-2 rounded-xl bg-white/80 dark:bg-black/20 text-[#64748B] dark:text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm border border-white/80 dark:border-white/10 transition-all disabled:opacity-50 flex items-center gap-1.5 text-xs font-semibold shrink-0"
            title="Refresh dashboard metrics"
            aria-label="Refresh dashboard metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Empty Account Welcome CTA Banner */}
      {isEmptyAccount && (
        <div className="p-5 rounded-2xl bg-[#E8EDF4] dark:bg-[#111726] border border-[#CBD5E1]/60 dark:border-white/10 shadow-raised-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-blue-500/10 text-[#2563EB] flex items-center justify-center font-bold text-xs">
                ✦
              </span>
              <p className="font-bold text-[#172033] dark:text-[#F8FAFC] text-sm">
                Welcome to PayPilot AI!
              </p>
            </div>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              You haven&apos;t created any invoices yet. Create your first invoice or generate one with AI to view live financial performance.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link href="/invoices/generate">
              <Button variant="outline" size="sm" icon={Sparkles} iconPosition="left">
                Generate with AI
              </Button>
            </Link>
            <Link href="/invoices/new">
              <Button variant="primary" size="sm" icon={Plus} iconPosition="left">
                New Invoice
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 1. Four Financial Summary Cards */}
      <section aria-labelledby="section-metrics">
        <h2 id="section-metrics" className="sr-only">Financial Performance Summary</h2>
        <FinancialSummarySection metrics={metrics} />
      </section>

      {/* 2. Quick Actions */}
      <section aria-labelledby="section-actions">
        <h2 id="section-actions" className="sr-only">Quick Actions</h2>
        <QuickActions />
      </section>

      {/* 3. Revenue Overview Chart */}
      <section aria-labelledby="section-revenue">
        <h2 id="section-revenue" className="sr-only">Revenue Overview Chart</h2>
        <RevenueOverview
          data={currentRevenueData}
          period={period}
          currency="USD"
          onPeriodChange={(p) => setPeriod(p)}
          loading={refreshing}
        />
      </section>

      {/* 4. AI Assistant Entry Point */}
      <section aria-labelledby="section-ai">
        <h2 id="section-ai" className="sr-only">AI Assistant Copilot</h2>
        <AIAssistantCard />
      </section>

      {/* 5. Invoices, Payments & Distribution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Recent Invoices (7-8 cols on lg) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <RecentInvoices
            invoices={invoices}
            searchQuery={searchQuery}
          />
        </div>

        {/* Right Column: Status Distribution & Payments (4-5 cols on lg) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <InvoiceStatusDistribution distribution={distribution} />
          <RecentPayments payments={payments} />
        </div>
      </div>
    </div>
  );
}
