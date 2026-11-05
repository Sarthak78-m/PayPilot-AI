import React from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui";

export function InvoiceStatusDistribution({ distribution }) {
  if (!distribution) return null;

  const {
    paid = { count: 0, percent: 0 },
    pending = { count: 0, percent: 0 },
    overdue = { count: 0, percent: 0 },
    draft = { count: 0, percent: 0 },
    cancelled = { count: 0, percent: 0 },
    totalCount = 0,
  } = distribution;

  const statusCards = [
    { label: "Paid", count: paid.count, percent: paid.percent, color: "#16A34A", dotBg: "bg-[#16A34A]", textColor: "text-[#16A34A]" },
    { label: "Pending", count: pending.count, percent: pending.percent, color: "#F59E0B", dotBg: "bg-[#F59E0B]", textColor: "text-[#F59E0B]" },
    { label: "Overdue", count: overdue.count, percent: overdue.percent, color: "#DC2626", dotBg: "bg-[#DC2626]", textColor: "text-[#DC2626]" },
    { label: "Draft", count: draft.count, percent: draft.percent, color: "#64748B", dotBg: "bg-[#64748B]", textColor: "text-[#64748B]" },
    { label: "Cancelled", count: cancelled.count, percent: cancelled.percent, color: "#94A3B8", dotBg: "bg-[#94A3B8]", textColor: "text-[#94A3B8]" },
  ];

  return (
    <Card variant="raised" className="space-y-4">
      <div>
        <CardTitle className="text-lg">Status Distribution</CardTitle>
        <CardDescription className="text-xs">
          Portfolio breakdown across {totalCount} total client invoices
        </CardDescription>
      </div>

      {/* Segmented Neumorphic Meter (All 5 statuses using totalCount as common denominator) */}
      <div className="h-4 w-full rounded-full bg-[#E8EDF4] shadow-inset-sm p-0.5 flex overflow-hidden">
        {paid.percent > 0 && (
          <div
            style={{ width: `${paid.percent}%` }}
            className="h-full bg-[#16A34A] transition-all duration-500"
            title={`Paid: ${paid.count} invoices (${paid.percent}%)`}
          />
        )}
        {pending.percent > 0 && (
          <div
            style={{ width: `${pending.percent}%` }}
            className="h-full bg-[#F59E0B] transition-all duration-500"
            title={`Pending: ${pending.count} invoices (${pending.percent}%)`}
          />
        )}
        {overdue.percent > 0 && (
          <div
            style={{ width: `${overdue.percent}%` }}
            className="h-full bg-[#DC2626] transition-all duration-500"
            title={`Overdue: ${overdue.count} invoices (${overdue.percent}%)`}
          />
        )}
        {draft.percent > 0 && (
          <div
            style={{ width: `${draft.percent}%` }}
            className="h-full bg-[#64748B] transition-all duration-500"
            title={`Draft: ${draft.count} invoices (${draft.percent}%)`}
          />
        )}
        {cancelled.percent > 0 && (
          <div
            style={{ width: `${cancelled.percent}%` }}
            className="h-full bg-[#CBD5E1] transition-all duration-500"
            title={`Cancelled: ${cancelled.count} invoices (${cancelled.percent}%)`}
          />
        )}
      </div>

      {/* Detail Breakdown Cards: Responsive 5-item layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1">
        {statusCards.map((st) => (
          <div
            key={st.label}
            className="p-2 sm:p-2.5 rounded-xl bg-[#E8EDF4] shadow-raised-sm text-center space-y-0.5"
          >
            <div className={`flex items-center justify-center gap-1.5 ${st.textColor}`}>
              <span className={`h-2 w-2 rounded-full ${st.dotBg}`} />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
                {st.label}
              </span>
            </div>
            <p className="text-sm sm:text-base font-extrabold text-[#172033] font-mono">
              {st.percent}%
            </p>
            <p className="text-[10px] text-[#64748B] font-mono">
              {st.count} {st.count === 1 ? "inv" : "invs"}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
