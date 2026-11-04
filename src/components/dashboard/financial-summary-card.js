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
}) {
  const variantConfig = {
    revenue: {
      icon: DollarSign,
      iconColor: "text-[#2563EB]",
      iconBg: "bg-blue-500/10",
      pillBg: "bg-blue-100 text-[#2563EB]",
    },
    paid: {
      icon: CheckCircle2,
      iconColor: "text-[#16A34A]",
      iconBg: "bg-emerald-500/10",
      pillBg: "bg-emerald-100 text-[#16A34A]",
    },
    pending: {
      icon: Clock,
      iconColor: "text-[#F59E0B]",
      iconBg: "bg-amber-500/10",
      pillBg: "bg-amber-100 text-[#B45309]",
    },
    overdue: {
      icon: AlertCircle,
      iconColor: "text-[#DC2626]",
      iconBg: "bg-red-500/10",
      pillBg: "bg-red-100 text-[#DC2626]",
    },
  };

  const config = variantConfig[variant] || variantConfig.revenue;
  const Icon = config.icon;

  return (
    <Card
      variant="raised-sm"
      className="flex flex-col justify-between hover:shadow-raised transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block truncate">
            {title}
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight mt-1 font-mono truncate">
            {amount}
          </div>
        </div>

        <div
          className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl ${config.iconBg} ${config.iconColor} shadow-inset-sm flex items-center justify-center shrink-0`}
        >
          <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
        </div>
      </div>

      <div className="pt-2.5 mt-2.5 border-t border-[#CBD5E1]/60 flex items-center justify-between text-xs text-[#64748B]">
        <div className="flex items-center gap-1.5 truncate">
          {trend && (
            <span
              className={`font-semibold px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] shrink-0 ${config.pillBg}`}
            >
              {trend}
            </span>
          )}
          <span className="truncate text-[11px]">{period || description}</span>
        </div>

        {count !== undefined && (
          <span className="font-mono font-semibold text-[#172033] shrink-0 ml-1.5 text-[11px]">
            {count} {count === 1 ? "inv" : "invs"}
          </span>
        )}
      </div>
    </Card>
  );
}

export function FinancialSummarySection({ metrics }) {
  if (!metrics) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 lg:gap-4">
      {/* Card 1: Paid Invoice Value (Honest semantic replacement for unverified revenue) */}
      <FinancialSummaryCard
        variant="revenue"
        title="Paid Invoice Value"
        amount={metrics.paidInvoiceValue?.formatted || metrics.totalRevenue?.formatted || "$0.00"}
        trend={metrics.paidInvoices?.count > 0 ? `${metrics.paidInvoices.count} settled` : undefined}
        trendDirection="neutral"
        period="Status = PAID"
        description="Total value of invoices marked PAID (settlement unverified)"
      />

      {/* Card 2: Outstanding Balance (Pending + Overdue) */}
      <FinancialSummaryCard
        variant="pending"
        title="Outstanding Balance"
        amount={metrics.outstanding?.formatted || "$0.00"}
        count={metrics.outstanding?.count}
        trend={metrics.outstanding?.count > 0 ? `${metrics.outstanding.count} unpaid` : undefined}
        period="Pending + Overdue"
        description="Receivables awaiting client settlement"
      />

      {/* Card 3: Pending Invoices */}
      <FinancialSummaryCard
        variant="pending"
        title="Pending Invoices"
        amount={metrics.pendingInvoices?.formatted || "$0.00"}
        count={metrics.pendingInvoices?.count}
        trend={metrics.pendingInvoices?.count > 0 ? `${metrics.pendingInvoices.count} active` : undefined}
        period="Awaiting payment"
        description="Pending client receivables"
      />

      {/* Card 4: Overdue Invoices */}
      <FinancialSummaryCard
        variant="overdue"
        title="Overdue Invoices"
        amount={metrics.overdueInvoices?.formatted || "$0.00"}
        count={metrics.overdueInvoices?.count}
        trend={metrics.overdueInvoices?.count > 0 ? `${metrics.overdueInvoices.count} past due` : undefined}
        period="Past due date"
        description="Requires payment follow-up"
      />
    </div>
  );
}
