import React from "react";
import { Card } from "@/components/ui";
import {
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "@/components/icons";

export function FinancialSummaryCard({
  title,
  amount,
  count,
  trend,
  trendDirection = "up",
  period,
  description,
  variant = "revenue",
  empty = false,
  emptyMessage = "No revenue data available yet.",
}) {
  const variantConfig = {
    revenue: {
      icon: DollarSign,
      iconColor: "text-[#2563EB]",
      iconBg: "bg-blue-500/10",
      pillBg: "bg-blue-100 text-[#2563EB] dark:bg-blue-900/30 dark:text-[#60A5FA]",
    },
    paid: {
      icon: CheckCircle2,
      iconColor: "text-[#16A34A]",
      iconBg: "bg-emerald-500/10",
      pillBg: "bg-emerald-100 text-[#16A34A] dark:bg-emerald-900/30 dark:text-[#4ADE80]",
    },
    pending: {
      icon: Clock,
      iconColor: "text-[#F59E0B]",
      iconBg: "bg-amber-500/10",
      pillBg: "bg-amber-100 text-[#B45309] dark:bg-amber-900/30 dark:text-[#FBBF24]",
    },
    overdue: {
      icon: AlertCircle,
      iconColor: "text-[#DC2626]",
      iconBg: "bg-red-500/10",
      pillBg: "bg-red-100 text-[#DC2626] dark:bg-red-900/30 dark:text-[#F87171]",
    },
  };

  const config = variantConfig[variant] || variantConfig.revenue;
  const Icon = config.icon;

  const isStringEmptyNotice =
    typeof amount === "string" &&
    (amount.toLowerCase().includes("no revenue") ||
      amount.toLowerCase().includes("no data"));
  const isExplicitEmpty = empty || !amount || isStringEmptyNotice;
  const displayEmptyText = isStringEmptyNotice ? amount : emptyMessage;

  return (
    <Card
      variant="raised-sm"
      className="flex flex-col justify-between hover:shadow-raised transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] block truncate">
            {title}
          </span>
          {isExplicitEmpty ? (
            <div className="text-xs sm:text-sm font-medium text-[#64748B] dark:text-[#94A3B8] mt-1.5 leading-snug">
              {displayEmptyText}
            </div>
          ) : (
            <div className="text-xl sm:text-2xl font-extrabold text-[#172033] dark:text-[#F8FAFC] tracking-tight mt-1 font-mono truncate">
              {amount}
            </div>
          )}
        </div>

        <div
          className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl ${config.iconBg} ${config.iconColor} shadow-inset-sm flex items-center justify-center shrink-0`}
        >
          <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
        </div>
      </div>

      <div className="pt-2.5 mt-2.5 border-t border-[#CBD5E1]/60 dark:border-white/10 flex items-center justify-between text-xs text-[#64748B] dark:text-[#94A3B8]">
        <div className="flex items-center gap-1.5 truncate">
          {!isExplicitEmpty && trend && (
            <span
              className={`font-semibold px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] shrink-0 ${config.pillBg}`}
            >
              {trend}
            </span>
          )}
          <span className="truncate text-[11px]">{period || description}</span>
        </div>

        {!isExplicitEmpty && count !== undefined && (
          <span className="font-mono font-semibold text-[#172033] dark:text-[#F8FAFC] shrink-0 ml-1.5 text-[11px]">
            {count} {count === 1 ? "inv" : "invs"}
          </span>
        )}
      </div>
    </Card>
  );
}

export function FinancialSummarySection({ metrics }) {
  const hasRecords = Boolean(metrics?.totalCount && metrics.totalCount > 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 lg:gap-4">
      {/* Card 1: Paid Invoice Value (Honest semantic replacement for unverified revenue) */}
      <FinancialSummaryCard
        variant="revenue"
        title="Paid Invoice Value"
        amount={hasRecords ? (metrics?.paidInvoiceValue?.formatted || metrics?.totalRevenue?.formatted || "$0.00") : "$0.00"}
        empty={!hasRecords}
        emptyMessage="No revenue data available yet."
        trend={hasRecords && metrics?.paidInvoices?.count > 0 ? `${metrics.paidInvoices.count} settled` : undefined}
        trendDirection="neutral"
        period={hasRecords ? "Status = PAID" : "Awaiting first invoice"}
        description={hasRecords ? "Total value of invoices marked PAID (settlement unverified)" : "No invoices created yet"}
      />

      {/* Card 2: Outstanding Balance (Pending + Overdue) */}
      <FinancialSummaryCard
        variant="pending"
        title="Outstanding Balance"
        amount={hasRecords ? (metrics?.outstanding?.formatted || "$0.00") : "$0.00"}
        empty={!hasRecords}
        emptyMessage="No receivables recorded"
        count={hasRecords ? metrics?.outstanding?.count : 0}
        trend={hasRecords && metrics?.outstanding?.count > 0 ? `${metrics.outstanding.count} unpaid` : undefined}
        period={hasRecords ? "Pending + Overdue" : "No open balances"}
        description="Receivables awaiting client settlement"
      />

      {/* Card 3: Pending Invoices */}
      <FinancialSummaryCard
        variant="pending"
        title="Pending Invoices"
        amount={hasRecords ? (metrics?.pendingInvoices?.formatted || "$0.00") : "$0.00"}
        empty={!hasRecords}
        emptyMessage="No pending invoices"
        count={hasRecords ? metrics?.pendingInvoices?.count : 0}
        trend={hasRecords && metrics?.pendingInvoices?.count > 0 ? `${metrics.pendingInvoices.count} active` : undefined}
        period={hasRecords ? "Awaiting payment" : "All clear"}
        description="Pending client receivables"
      />

      {/* Card 4: Overdue Invoices */}
      <FinancialSummaryCard
        variant="overdue"
        title="Overdue Invoices"
        amount={hasRecords ? (metrics?.overdueInvoices?.formatted || "$0.00") : "$0.00"}
        empty={!hasRecords}
        emptyMessage="No overdue invoices"
        count={hasRecords ? metrics?.overdueInvoices?.count : 0}
        trend={hasRecords && metrics?.overdueInvoices?.count > 0 ? `${metrics.overdueInvoices.count} past due` : undefined}
        period={hasRecords ? "Past due date" : "No overdue accounts"}
        description="Requires payment follow-up"
      />
    </div>
  );
}
