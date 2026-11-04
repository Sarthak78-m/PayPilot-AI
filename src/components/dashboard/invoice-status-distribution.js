import React from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui";

export function InvoiceStatusDistribution({ distribution }) {
  if (!distribution) return null;

  const { paid, pending, overdue, totalCount } = distribution;

  return (
    <Card variant="raised" className="space-y-4">
      <div>
        <CardTitle className="text-lg">Status Distribution</CardTitle>
        <CardDescription className="text-xs">
          Portfolio breakdown across {totalCount} total client invoices
        </CardDescription>
      </div>

      {/* Segmented Neumorphic Meter */}
      <div className="h-4 w-full rounded-full bg-[#E8EDF4] shadow-inset-sm p-0.5 flex overflow-hidden">
        <div
          style={{ width: `${paid.percent}%` }}
          className="h-full bg-[#16A34A] rounded-l-full transition-all duration-500"
          title={`Paid: ${paid.count} invoices (${paid.percent}%)`}
        />
        <div
          style={{ width: `${pending.percent}%` }}
          className="h-full bg-[#F59E0B] transition-all duration-500"
          title={`Pending: ${pending.count} invoices (${pending.percent}%)`}
        />
        <div
          style={{ width: `${overdue.percent}%` }}
          className="h-full bg-[#DC2626] rounded-r-full transition-all duration-500"
          title={`Overdue: ${overdue.count} invoices (${overdue.percent}%)`}
        />
      </div>

      {/* Detail Breakdown Cards */}
      <div className="grid grid-cols-3 gap-2.5 pt-1">
        {/* Paid */}
        <div className="p-2.5 rounded-xl bg-[#E8EDF4] shadow-raised-sm text-center space-y-0.5">
          <div className="flex items-center justify-center gap-1.5 text-[#16A34A]">
            <span className="h-2 w-2 rounded-full bg-[#16A34A]" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Paid</span>
          </div>
          <p className="text-base font-extrabold text-[#172033] font-mono">
            {paid.percent}%
          </p>
          <p className="text-[10px] text-[#64748B] font-mono">{paid.count} invs</p>
        </div>

        {/* Pending */}
        <div className="p-2.5 rounded-xl bg-[#E8EDF4] shadow-raised-sm text-center space-y-0.5">
          <div className="flex items-center justify-center gap-1.5 text-[#F59E0B]">
            <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending</span>
          </div>
          <p className="text-base font-extrabold text-[#172033] font-mono">
            {pending.percent}%
          </p>
          <p className="text-[10px] text-[#64748B] font-mono">{pending.count} invs</p>
        </div>

        {/* Overdue */}
        <div className="p-2.5 rounded-xl bg-[#E8EDF4] shadow-raised-sm text-center space-y-0.5">
          <div className="flex items-center justify-center gap-1.5 text-[#DC2626]">
            <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Overdue</span>
          </div>
          <p className="text-base font-extrabold text-[#172033] font-mono">
            {overdue.percent}%
          </p>
          <p className="text-[10px] text-[#64748B] font-mono">{overdue.count} invs</p>
        </div>
      </div>
    </Card>
  );
}
