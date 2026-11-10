import React from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription } from "@/components/ui";
import { ArrowRight, CheckCircle2 } from "@/components/icons";

export function RecentPayments({ payments = [] }) {
  return (
    <Card variant="raised" className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base sm:text-lg">Recent Settlements</CardTitle>
          <CardDescription className="text-xs">
            Automated payment payouts and settlements
          </CardDescription>
        </div>

        <Link
          href="/payments"
          className="inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:text-[#1D4ED8] dark:text-[#60A5FA] dark:hover:text-[#93C5FD] hover:underline transition-colors shrink-0"
        >
          <span>All Payouts</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Payment List or Empty State */}
      {payments.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-xl bg-[#E8EDF4]/60 dark:bg-[#111726]/60 border border-[#CBD5E1]/40 dark:border-white/10 space-y-1">
          <p className="text-xs font-bold text-[#172033] dark:text-[#F8FAFC]">No Settled Payments Yet</p>
          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
            Client payments captured via PayPal will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="p-2.5 sm:p-3 rounded-xl bg-[#E8EDF4] dark:bg-[#161F33] shadow-raised-sm hover:shadow-raised transition-all flex items-center justify-between gap-2.5 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-[#16A34A] shadow-inset-sm flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </div>

                <div className="min-w-0">
                  <p className="font-bold text-[#172033] dark:text-[#F8FAFC] truncate">
                    {payment.customer}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                    <span className="font-mono">{payment.invoiceId}</span>
                    <span>•</span>
                    <span>{payment.method}</span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="font-mono font-extrabold text-[#16A34A] text-sm">
                  +{payment.formattedAmount}
                </p>
                <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-mono mt-0.5">
                  {payment.date}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
