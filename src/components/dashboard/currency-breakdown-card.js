"use client";

import React from "react";
import { Card, CardTitle, CardDescription, Badge } from "@/components/ui";
import {
  Clock,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  TrendingUp,
} from "@/components/icons";

export function CurrencyBreakdownCard({
  byCurrency = [],
  activeCurrency = "ALL",
  onSelectCurrency = () => {},
}) {
  if (!byCurrency || byCurrency.length === 0) {
    return null;
  }

  return (
    <Card variant="raised" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">
              Due & Settled Payments by Currency
            </CardTitle>
            <Badge variant="primary" size="sm">
              {byCurrency.length} {byCurrency.length === 1 ? "Currency" : "Currencies"}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Authoritative breakdown of outstanding receivables and verified collections for each currency
          </CardDescription>
        </div>

        {byCurrency.length > 1 && (
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              onClick={() => onSelectCurrency("ALL")}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${
                activeCurrency === "ALL"
                  ? "bg-[#2563EB] text-white shadow-primary-glow"
                  : "bg-[#E8EDF4] text-[#64748B] hover:text-[#172033]"
              }`}
            >
              All Currencies
            </button>
          </div>
        )}
      </div>

      {/* Grid of Currencies */}
      <div className={`grid grid-cols-1 ${byCurrency.length > 1 ? "md:grid-cols-2 lg:grid-cols-3" : ""} gap-3.5`}>
        {byCurrency.map((item) => {
          const isSelected = activeCurrency === item.currency;
          const hasDue = item.dueAmount > 0;
          const hasPaid = item.paidAmount > 0;

          return (
            <div
              key={item.currency}
              className={`p-4 rounded-2xl bg-[#E8EDF4] border transition-all flex flex-col justify-between space-y-3.5 ${
                isSelected
                  ? "border-[#2563EB] shadow-primary-glow/20 ring-1 ring-[#2563EB]/40"
                  : "border-[#CBD5E1]/60 shadow-raised-sm hover:shadow-raised"
              }`}
            >
              {/* Currency Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white font-extrabold text-sm flex items-center justify-center shadow-primary-glow shrink-0">
                    {item.symbol}
                  </div>
                  <div>
                    <span className="font-extrabold text-sm text-[#172033] block">
                      {item.currency} ({item.symbol})
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      {item.totalCount} {item.totalCount === 1 ? "invoice" : "invoices"} total
                    </span>
                  </div>
                </div>

                {isSelected ? (
                  <Badge variant="primary" size="sm">
                    Active Filter
                  </Badge>
                ) : (
                  <button
                    onClick={() => onSelectCurrency(item.currency)}
                    className="text-[11px] font-bold text-[#2563EB] hover:text-[#1D4ED8] transition-colors inline-flex items-center gap-1"
                  >
                    <span>Filter</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Financial Metrics Split */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#CBD5E1]/60">
                {/* Due / Outstanding */}
                <div className="p-2.5 rounded-xl bg-white/40 dark:bg-black/10 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#DC2626] flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due / Pending
                  </span>
                  <p className="font-mono font-extrabold text-[#DC2626] text-sm sm:text-base">
                    {item.formattedDue || `${item.symbol}0.00`}
                  </p>
                  <span className="text-[10px] text-[#64748B] block truncate">
                    {item.dueCount} {item.dueCount === 1 ? "invoice due" : "invoices due"}
                  </span>
                </div>

                {/* Paid / Settled */}
                <div className="p-2.5 rounded-xl bg-white/40 dark:bg-black/10 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#16A34A] flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Settled Value
                  </span>
                  <p className="font-mono font-extrabold text-[#16A34A] text-sm sm:text-base">
                    {item.formattedPaid || `${item.symbol}0.00`}
                  </p>
                  <span className="text-[10px] text-[#64748B] block truncate">
                    {item.paidCount} {item.paidCount === 1 ? "settled" : "settled"}
                  </span>
                </div>
              </div>

              {/* Bottom Total Bar */}
              <div className="pt-2 border-t border-[#CBD5E1]/40 flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Total Invoiced:</span>
                <span className="font-mono font-bold text-[#172033]">
                  {item.formattedTotal || `${item.symbol}0.00`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
