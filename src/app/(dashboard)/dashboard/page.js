"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  fetchDashboardMetrics,
  fetchRevenueOverview,
  fetchRecentInvoices,
  fetchRecentPayments,
  fetchInvoiceDistribution,
} from "@/lib/api/dashboard-service";
import { FinancialSummarySection } from "@/components/dashboard/financial-summary-card";
import { RevenueOverview } from "@/components/dashboard/revenue-overview";
import { RecentInvoices } from "@/components/dashboard/recent-invoices";
import { RecentPayments } from "@/components/dashboard/recent-payments";
import { InvoiceStatusDistribution } from "@/components/dashboard/invoice-status-distribution";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { AIAssistantCard } from "@/components/dashboard/ai-assistant-card";
import { useDashboardSearch } from "@/lib/context/search-context";
import { Badge, Skeleton } from "@/components/ui";
import { RefreshCw, Sparkles } from "@/components/icons";

export default function DashboardPage() {
  const { searchQuery } = useDashboardSearch();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("6M");

  const [metrics, setMetrics] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [distribution, setDistribution] = useState(null);
  const [isMockMode, setIsMockMode] = useState(false);

  const loadData = useCallback(async (selectedPeriod) => {
    try {
      const [metricsRes, revenueRes, invoicesRes, paymentsRes, distRes] =
        await Promise.all([
          fetchDashboardMetrics(),
          fetchRevenueOverview(selectedPeriod),
          fetchRecentInvoices(5),
          fetchRecentPayments(4),
          fetchInvoiceDistribution(),
        ]);

      setMetrics(metricsRes.data);
      setRevenueData(revenueRes.data);
      setInvoices(invoicesRes.data);
      setPayments(paymentsRes.data);
      setDistribution(distRes.data);
      setIsMockMode(
        Boolean(
          metricsRes.isMock ||
            revenueRes.isMock ||
            invoicesRes.isMock ||
            paymentsRes.isMock
        )
      );
    } catch (err) {
      console.error("Dashboard data load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      await loadData(period);
    })();
    return () => {
      ignore = true;
    };
  }, [loadData, period]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(period);
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

  return (
    <div className="space-y-4">
      {/* Development Preview Mode Banner */}
      {isMockMode && (
        <div className="p-3.5 rounded-2xl bg-[#E8EDF4] border border-[#2563EB]/20 shadow-raised-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#172033]">
          <div className="flex items-center gap-2.5">
            <span className="h-7 w-7 rounded-lg bg-blue-500/10 text-[#2563EB] flex items-center justify-center shrink-0 shadow-inset-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold text-[#172033]">
                Development Preview Mode (Isolated Mock Data)
              </p>
              <p className="text-[11px] text-[#64748B]">
                Displaying structured test metrics while backend analytics and invoice endpoints are under active development.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Badge variant="primary" size="sm">
              Mock Data Active
            </Badge>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#2563EB] shadow-raised-sm active:shadow-inset-sm transition-all"
              title="Refresh dashboard data"
              aria-label="Refresh dashboard data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
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
          data={revenueData}
          period={period}
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
        {/* Left Column: Recent Invoices (8 cols on lg) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <RecentInvoices
            invoices={invoices}
            searchQuery={searchQuery}
          />
        </div>

        {/* Right Column: Status Distribution & Payments (5 cols on lg) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <InvoiceStatusDistribution distribution={distribution} />
          <RecentPayments payments={payments} />
        </div>
      </div>
    </div>
  );
}
