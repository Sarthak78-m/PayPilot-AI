"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, CardDescription, Badge, EmptyState } from "@/components/ui";
import { ArrowRight, FileText, ChevronRight } from "@/components/icons";

export function RecentInvoices({ invoices = [], searchQuery = "" }) {
  const router = useRouter();

  const filtered = invoices.filter((inv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const id = inv.id ? inv.id.toLowerCase() : "";
    const customer = inv.customer ? inv.customer.toLowerCase() : "";
    const amount = inv.formattedAmount
      ? inv.formattedAmount.toLowerCase()
      : inv.amount
      ? String(inv.amount).toLowerCase()
      : "";
    const status = inv.status ? inv.status.toLowerCase() : "";

    return (
      id.includes(q) ||
      customer.includes(q) ||
      amount.includes(q) ||
      status.includes(q)
    );
  });

  const getStatusBadge = (status) => {
    const s = (status || "").toLowerCase();
    switch (s) {
      case "paid":
        return <Badge variant="success" size="sm" dot>Paid</Badge>;
      case "pending":
        return <Badge variant="warning" size="sm" dot>Pending</Badge>;
      case "overdue":
        return <Badge variant="error" size="sm" dot>Overdue</Badge>;
      case "draft":
        return <Badge variant="neutral" size="sm" dot>Draft</Badge>;
      case "cancelled":
        return <Badge variant="neutral" size="sm">Cancelled</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status || "Unknown"}</Badge>;
    }
  };

  return (
    <Card variant="raised" className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base sm:text-lg">Recent Invoices</CardTitle>
          <CardDescription className="text-xs">
            Latest accounts receivable billing and client payout statuses
          </CardDescription>
        </div>

        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:text-[#1D4ED8] hover:underline transition-colors shrink-0"
        >
          <span>View All</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No Invoices Found"
          description={
            searchQuery
              ? `No invoices match "${searchQuery}". Try clearing your search.`
              : "No recent invoices recorded in your account."
          }
          icon={FileText}
          actionLabel="Create Invoice"
          onAction={() => router.push("/invoices/new")}
        />
      ) : (
        <>
          {/* Desktop & Tablet Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs text-[#172033]" aria-label="Recent Invoices">
              <thead>
                <tr className="border-b border-[#CBD5E1]/60 text-[#64748B] uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-2.5 px-2">Invoice ID</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]/40">
                {filtered.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="hover:bg-[#CBD5E1]/20 transition-colors group"
                  >
                    <td className="py-2.5 px-2 font-mono font-bold text-[#2563EB]">
                      {invoice.id}
                    </td>
                    <td className="py-2.5 px-3">
                      <p className="font-semibold text-[#172033]">{invoice.customer}</p>
                      <p className="text-[11px] text-[#64748B] truncate max-w-[160px]">
                        {invoice.clientEmail}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#172033]">
                      {invoice.formattedAmount}
                    </td>
                    <td className="py-2.5 px-3 text-[#64748B] font-mono">
                      {invoice.dueDate}
                    </td>
                    <td className="py-2.5 px-3">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <Link
                        href={`/invoices`}
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-[#2563EB] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm transition-all inline-flex items-center gap-1 text-[11px] font-semibold"
                      >
                        <span>View</span>
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="sm:hidden space-y-2">
            {filtered.map((invoice) => (
              <div
                key={invoice.id}
                className="p-3 rounded-xl bg-[#E8EDF4] shadow-raised-sm space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-[#2563EB] text-xs">
                    {invoice.id}
                  </span>
                  {getStatusBadge(invoice.status)}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-[#172033]">{invoice.customer}</p>
                    <p className="text-[11px] text-[#64748B]">Due: {invoice.dueDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-sm text-[#172033]">
                      {invoice.formattedAmount}
                    </p>
                    <Link
                      href="/invoices"
                      className="text-[11px] font-semibold text-[#2563EB] hover:underline"
                    >
                      Inspect →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
