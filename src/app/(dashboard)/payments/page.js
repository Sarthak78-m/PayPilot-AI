"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Select,
  EmptyState,
  Skeleton,
  Modal,
  Divider,
} from "@/components/ui";
import {
  CreditCard,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Search,
  X,
  FileText,
  DollarSign,
  Plus,
  ShieldCheck,
  Download,
} from "@/components/icons";
import { fetchPayments } from "@/lib/api/payments-service";
import { InitiatePaymentModal } from "@/components/payments/initiate-payment-modal";
import { PaymentReceiptModal } from "@/components/payments/payment-receipt-modal";

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function getPaymentStatusBadge(status) {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "completed":
    case "paid":
    case "settled":
      return (
        <Badge variant="success" size="sm" dot>
          Completed
        </Badge>
      );
    case "pending":
    case "created":
    case "order_created":
    case "approved":
    case "processing":
    case "capturing":
    case "initiated":
      return (
        <Badge variant="warning" size="sm" dot>
          Pending
        </Badge>
      );
    case "failed":
    case "denied":
      return (
        <Badge variant="error" size="sm" dot>
          Failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="neutral" size="sm" dot>
          Cancelled
        </Badge>
      );
    case "refunded":
    case "partially_refunded":
      return (
        <Badge variant="neutral" size="sm" dot>
          {s === "partially_refunded" ? "Partially Refunded" : "Refunded"}
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral" size="sm">
          {status || "Unknown"}
        </Badge>
      );
  }
}

export default function PaymentsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [is401, setIs401] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  const [payments, setPayments] = useState([]);
  const [overview, setOverview] = useState({
    totalReceived: { amount: 0, formatted: "$0.00", count: 0 },
    pending: { amount: 0, formatted: "$0.00", count: 0 },
    failed: { amount: 0, formatted: "$0.00", count: 0 },
    refunded: { amount: 0, formatted: "$0.00", count: 0 },
  });

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [isInitiateOpen, setIsInitiateOpen] = useState(false);

  const loadData = useCallback(async (targetStatus = statusFilter, targetSearch = search) => {
    try {
      const res = await fetchPayments({
        status: targetStatus,
        search: targetSearch,
      });

      if (res.error) {
        if (res.is401) {
          setIs401(true);
          setError("Your session has expired. Please sign in to view payment settlements.");
        } else {
          setError(res.error);
        }
        return;
      }

      if (res.data) {
        setPayments(res.data.payments || []);
        if (res.data.overview) {
          setOverview(res.data.overview);
        }
        setIsFallback(Boolean(res.isFallback));
        setError(null);
        setIs401(false);
      }
    } catch {
      setError("Unable to connect to payments service. Please check your network connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search]);

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

  const handleStatusChange = (e) => {
    const val = e.target.value;
    setStatusFilter(val);
    loadData(val, search);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData(statusFilter, search);
  };

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("");
    loadData("", "");
  };

  const handleTransactionSuccess = async (receiptData) => {
    await loadData();
  };

  // Check if account has any payment activity
  const hasPaymentRecords = overview.totalReceived?.count > 0 || payments.length > 0;

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 rounded-xl" />
            <Skeleton className="h-4 w-72 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>

        {/* Overview Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>

        {/* Table Skeleton */}
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight">
              Payments & Settlements
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-amber-500/10 text-amber-800 border border-amber-500/30">
              PayPal Sandbox
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Process Sandbox payments, inspect financial settlements, and generate official payment receipts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* New Payment Button */}
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            iconPosition="left"
            onClick={() => setIsInitiateOpen(true)}
            className="shadow-primary-glow"
          >
            Initiate Payment
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            iconPosition="left"
            onClick={handleRefresh}
            disabled={refreshing}
            className={refreshing ? "opacity-75" : ""}
          >
            <span className={refreshing ? "animate-spin mr-1" : "hidden"}>↻</span>
            Refresh
          </Button>

          <Link href="/admin/payments">
            <Button variant="secondary" size="sm" icon={ShieldCheck} iconPosition="left">
              Admin Portal
            </Button>
          </Link>

          <Link href="/dashboard">
            <Button variant="ghost" size="sm" icon={ArrowLeft} iconPosition="left">
              Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Authentication & Error Banners */}
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

      {/* Settlement Notice */}
      {isFallback && !error && (
        <div className="p-3.5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-raised-sm flex items-center justify-between text-xs text-[#64748B]">
          <div className="flex items-center gap-2 truncate">
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
            <span className="truncate">
              <strong>Recent Settlements:</strong> Displaying recent payment settlements. Complete transaction history updates automatically with each cleared payment.
            </span>
          </div>
        </div>
      )}

      {/* 3. Payment Overview Cards (4 Metrics) */}
      <section aria-labelledby="payments-overview">
        <h2 id="payments-overview" className="sr-only">Payments Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 lg:gap-4">
          {/* Card 1: Total Received */}
          <Card
            variant="raised-sm"
            className="flex flex-col justify-between hover:shadow-raised transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block truncate">
                  Total Payments Received
                </span>
                {hasPaymentRecords && overview.totalReceived ? (
                  <div className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight mt-1 font-mono truncate">
                    {overview.totalReceived.formatted}
                  </div>
                ) : (
                  <div className="text-xs sm:text-sm font-medium text-[#64748B] mt-1.5 leading-snug">
                    No settlements yet
                  </div>
                )}
              </div>
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-emerald-500/10 text-[#16A34A] shadow-inset-sm flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
            </div>

            <div className="pt-2.5 mt-2.5 border-t border-[#CBD5E1]/60 flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-semibold px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] bg-emerald-100 text-[#16A34A] shrink-0">
                Captured
              </span>
              <span className="font-mono font-semibold text-[#172033] text-[11px]">
                {overview.totalReceived?.count || 0} {overview.totalReceived?.count === 1 ? "record" : "records"}
              </span>
            </div>
          </Card>

          {/* Card 2: Pending Settlements */}
          <Card
            variant="raised-sm"
            className="flex flex-col justify-between hover:shadow-raised transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block truncate">
                  Pending Settlements
                </span>
                {overview.pending && overview.pending.count > 0 ? (
                  <div className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight mt-1 font-mono truncate">
                    {overview.pending.formatted}
                  </div>
                ) : (
                  <div className="text-xs sm:text-sm font-medium text-[#64748B] mt-1.5 leading-snug">
                    No pending payouts
                  </div>
                )}
              </div>
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-amber-500/10 text-[#F59E0B] shadow-inset-sm flex items-center justify-center shrink-0">
                <Clock className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
            </div>

            <div className="pt-2.5 mt-2.5 border-t border-[#CBD5E1]/60 flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-semibold px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] bg-amber-100 text-[#B45309] shrink-0">
                Active
              </span>
              <span className="font-mono font-semibold text-[#172033] text-[11px]">
                {overview.pending?.count || 0} in-flight
              </span>
            </div>
          </Card>

          {/* Card 3: Failed Transactions */}
          <Card
            variant="raised-sm"
            className="flex flex-col justify-between hover:shadow-raised transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block truncate">
                  Failed Payments
                </span>
                {overview.failed && overview.failed.count > 0 ? (
                  <div className="text-xl sm:text-2xl font-extrabold text-[#DC2626] tracking-tight mt-1 font-mono truncate">
                    {overview.failed.formatted}
                  </div>
                ) : (
                  <div className="text-xs sm:text-sm font-medium text-[#64748B] mt-1.5 leading-snug">
                    No failed payments
                  </div>
                )}
              </div>
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-red-500/10 text-[#DC2626] shadow-inset-sm flex items-center justify-center shrink-0">
                <AlertCircle className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
            </div>

            <div className="pt-2.5 mt-2.5 border-t border-[#CBD5E1]/60 flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-semibold px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] bg-red-100 text-[#DC2626] shrink-0">
                Status
              </span>
              <span className="font-mono font-semibold text-[#172033] text-[11px]">
                {overview.failed?.count || 0} failed
              </span>
            </div>
          </Card>

          {/* Card 4: Refunded Payments */}
          <Card
            variant="raised-sm"
            className="flex flex-col justify-between hover:shadow-raised transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block truncate">
                  Refunded Payments
                </span>
                {overview.refunded && overview.refunded.count > 0 ? (
                  <div className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight mt-1 font-mono truncate">
                    {overview.refunded.formatted}
                  </div>
                ) : (
                  <div className="text-xs sm:text-sm font-medium text-[#64748B] mt-1.5 leading-snug">
                    No refunds recorded
                  </div>
                )}
              </div>
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-blue-500/10 text-[#2563EB] shadow-inset-sm flex items-center justify-center shrink-0">
                <CreditCard className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
            </div>

            <div className="pt-2.5 mt-2.5 border-t border-[#CBD5E1]/60 flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-semibold px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] bg-blue-100 text-[#2563EB] shrink-0">
                Reversed
              </span>
              <span className="font-mono font-semibold text-[#172033] text-[11px]">
                {overview.refunded?.count || 0} refunds
              </span>
            </div>
          </Card>
        </div>
      </section>

      {/* 4. Filter, Search & History Section */}
      <Card variant="raised" className="space-y-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg">
              Transaction History
            </CardTitle>
            <CardDescription className="text-xs">
              Verified PayPal Sandbox payment captures and financial settlements
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/invoices">
              <Button variant="outline" size="sm" icon={FileText} iconPosition="left">
                View Invoices
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3 rounded-2xl bg-[#E8EDF4] shadow-inset-sm border border-[#CBD5E1]/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md flex items-center gap-2">
            <div className="relative w-full flex items-center">
              <div className="absolute left-3.5 flex items-center pointer-events-none text-[#64748B]">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ref ID, order ID, or payee..."
                className="w-full bg-[#E8EDF4] text-[#172033] placeholder-[#94A3B8] text-xs sm:text-sm rounded-xl py-2 pl-9 pr-8 shadow-inset-sm border border-[#D1D8E2] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    loadData(statusFilter, "");
                  }}
                  className="absolute right-2.5 text-[#64748B] hover:text-[#172033] p-1 rounded-md"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Search
            </Button>
          </form>

          {/* Status Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider shrink-0 hidden sm:inline">
              Status:
            </span>
            <div className="w-full sm:w-44">
              <Select
                value={statusFilter}
                onChange={handleStatusChange}
                options={STATUS_FILTER_OPTIONS}
                className="mb-0"
              />
            </div>

            {(search || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-xs shrink-0"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* 5. Payments Table / List */}
        {payments.length === 0 ? (
          <EmptyState
            title={search || statusFilter ? "No Matching Settlements" : "No Payment Transactions Yet"}
            description={
              search || statusFilter
                ? "No transactions match your current filters. Try resetting search or changing status."
                : "Transactions initiated in PayPilot or paid via PayPal Sandbox will appear here automatically."
            }
            icon={CreditCard}
            actionLabel={search || statusFilter ? "Clear Filters" : "Initiate Payment"}
            onAction={search || statusFilter ? handleClearFilters : () => setIsInitiateOpen(true)}
          />
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs text-[#172033]" aria-label="Payments Ledger">
                <thead>
                  <tr className="border-b border-[#CBD5E1]/60 text-[#64748B] uppercase tracking-wider font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Transaction Ref</th>
                    <th className="py-2.5 px-3">Customer / Category</th>
                    <th className="py-2.5 px-3">PayPal Order ID</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1]/40">
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="hover:bg-[#CBD5E1]/20 transition-colors group"
                    >
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-[#2563EB] block">
                          {payment.internalReference || payment.transactionRef || payment.id.slice(0, 12)}
                        </span>
                        {payment.paypalCaptureId && (
                          <span className="text-[10px] font-mono text-[#64748B]">
                            Cap: {payment.paypalCaptureId}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-[#172033] block">
                          {payment.customer}
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          {payment.category || payment.invoiceId || "PayPal Sandbox"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[#64748B]">
                        {payment.paypalOrderId || payment.orderId || "—"}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-[#16A34A] text-sm">
                        +{payment.formattedAmount}
                      </td>
                      <td className="py-3 px-3 text-[#64748B] font-mono">
                        {payment.date || "—"}
                      </td>
                      <td className="py-3 px-3">
                        {getPaymentStatusBadge(payment.status)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {payment.status === "completed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReceiptPayment(payment)}
                              icon={Download}
                              iconPosition="left"
                              className="text-[11px] py-1 px-2 min-h-[30px]"
                            >
                              Receipt
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedPayment(payment)}
                            className="text-[11px] py-1 px-2.5 min-h-[30px]"
                          >
                            Details
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="sm:hidden space-y-2.5">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="p-3.5 rounded-2xl bg-[#E8EDF4] shadow-raised-sm border border-white/60 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#2563EB]">
                      {payment.internalReference || payment.transactionRef || payment.id.slice(0, 10)}
                    </span>
                    {getPaymentStatusBadge(payment.status)}
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#172033]">{payment.customer}</p>
                      <p className="text-[11px] text-[#64748B]">
                        {payment.category} • {payment.date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-extrabold text-sm text-[#16A34A]">
                        +{payment.formattedAmount}
                      </p>
                      <div className="flex items-center justify-end gap-2 mt-1">
                        {payment.status === "completed" && (
                          <button
                            onClick={() => setReceiptPayment(payment)}
                            className="text-[11px] font-semibold text-[#16A34A] hover:underline"
                          >
                            Receipt
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedPayment(payment)}
                          className="text-[11px] font-semibold text-[#2563EB] hover:underline"
                        >
                          Details →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* 6. Transaction Details Modal */}
      <Modal
        isOpen={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        title="Payment Settlement Details"
        description="Verified gateway transaction record and settlement metadata"
        maxWidth="max-w-md"
      >
        {selectedPayment && (
          <div className="space-y-4 pt-2 text-xs">
            {/* Amount Banner */}
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1 shadow-inset-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Captured Settlement Amount
              </span>
              <div className="text-2xl font-extrabold font-mono text-[#16A34A]">
                +{selectedPayment.formattedAmount}
              </div>
              <div className="flex items-center justify-center gap-1.5 pt-1">
                {getPaymentStatusBadge(selectedPayment.status)}
                <span className="text-[11px] text-[#64748B]">• {selectedPayment.paymentMethod || "PayPal Sandbox"}</span>
              </div>
            </div>

            {/* Details Grid */}
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm flex items-center justify-between">
                <span className="text-[#64748B] font-medium">Transaction Reference:</span>
                <span className="font-mono font-bold text-[#172033] select-all">
                  {selectedPayment.internalReference || selectedPayment.transactionRef || selectedPayment.id}
                </span>
              </div>

              {selectedPayment.paypalOrderId && (
                <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm flex items-center justify-between">
                  <span className="text-[#64748B] font-medium">PayPal Order ID:</span>
                  <span className="font-mono text-[#2563EB] select-all">{selectedPayment.paypalOrderId}</span>
                </div>
              )}

              {selectedPayment.paypalCaptureId && (
                <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm flex items-center justify-between">
                  <span className="text-[#64748B] font-medium">PayPal Capture ID:</span>
                  <span className="font-mono text-[#16A34A] select-all">{selectedPayment.paypalCaptureId}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm flex items-center justify-between">
                <span className="text-[#64748B] font-medium">Payer / Client:</span>
                <span className="font-bold text-[#172033]">{selectedPayment.customer}</span>
              </div>

              <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm flex items-center justify-between">
                <span className="text-[#64748B] font-medium">Settlement Date:</span>
                <span className="font-mono text-[#172033]">{selectedPayment.date || "Recorded at settlement"}</span>
              </div>

              <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm flex items-center justify-between">
                <span className="text-[#64748B] font-medium">Payment Protocol:</span>
                <span className="font-semibold text-[#172033]">PayPal Orders v2 (intent: CAPTURE)</span>
              </div>
            </div>

            <Divider />

            <div className="flex items-center justify-between gap-2 pt-1">
              {selectedPayment.status === "completed" && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  iconPosition="left"
                  onClick={() => {
                    const curr = selectedPayment;
                    setSelectedPayment(null);
                    setReceiptPayment(curr);
                  }}
                >
                  View Receipt
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => setSelectedPayment(null)}
                className="w-full sm:w-auto"
              >
                Close Details
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 7. New Payment Initiation Modal */}
      <InitiatePaymentModal
        isOpen={isInitiateOpen}
        onClose={() => setIsInitiateOpen(false)}
        onPaymentSuccess={handleTransactionSuccess}
      />

      {/* 8. Receipt Modal */}
      <PaymentReceiptModal
        isOpen={Boolean(receiptPayment)}
        onClose={() => setReceiptPayment(null)}
        payment={receiptPayment}
      />
    </div>
  );
}
