"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  ShieldCheck,
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
  Download,
} from "@/components/icons";
import { AdminRefundModal } from "@/components/payments/admin-refund-modal";
import { PaymentReceiptModal } from "@/components/payments/payment-receipt-modal";
import { formatCurrencyDisplay } from "@/lib/payments/currency";

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

function getStatusBadge(status) {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "completed":
    case "paid":
    case "settled":
      return <Badge variant="success" size="sm" dot>Completed</Badge>;
    case "pending":
    case "created":
    case "order_created":
    case "approved":
    case "processing":
    case "initiated":
      return <Badge variant="warning" size="sm" dot>Pending</Badge>;
    case "failed":
    case "denied":
      return <Badge variant="error" size="sm" dot>Failed</Badge>;
    case "refunded":
    case "partially_refunded":
      return <Badge variant="neutral" size="sm" dot>{s === "partially_refunded" ? "Partially Refunded" : "Refunded"}</Badge>;
    default:
      return <Badge variant="neutral" size="sm">{status || "Unknown"}</Badge>;
  }
}

export default function AdminPaymentsPage() {
  const [activeTab, setActiveTab] = useState("transactions"); // "transactions" | "webhooks" | "audit"
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isForbidden, setIsForbidden] = useState(false);

  // Data states
  const [payments, setPayments] = useState([]);
  const [overview, setOverview] = useState({
    totalTransactions: 0,
    successfulPayments: { count: 0, formatted: "$0.00" },
    pendingPayments: { count: 0, formatted: "$0.00" },
    failedPayments: { count: 0 },
    refundedPayments: { count: 0, formatted: "$0.00" },
  });
  const [webhooks, setWebhooks] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [refundTargetPayment, setRefundTargetPayment] = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [inspectWebhook, setInspectWebhook] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    setIsForbidden(false);

    try {
      if (activeTab === "transactions") {
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`/api/admin/payments?${params.toString()}`);
        if (res.status === 403) {
          setIsForbidden(true);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const json = await res.json();
        if (res.ok && json.data) {
          setPayments(json.data.payments || []);
          if (json.data.overview) setOverview(json.data.overview);
        } else {
          setError(json.message || "Failed to load administrative records.");
        }
      } else if (activeTab === "webhooks") {
        const res = await fetch("/api/admin/webhooks");
        if (res.status === 403) {
          setIsForbidden(true);
          return;
        }
        const json = await res.json();
        if (res.ok && json.data) {
          setWebhooks(json.data || []);
        }
      } else if (activeTab === "audit") {
        const res = await fetch("/api/admin/audit-logs");
        if (res.status === 403) {
          setIsForbidden(true);
          return;
        }
        const json = await res.json();
        if (res.ok && json.data) {
          setAuditLogs(json.data || []);
        }
      }
    } catch {
      setError("Unable to connect to administrative payments service.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, statusFilter, search]);

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

  const handleRefundSuccess = async () => {
    await loadData();
  };

  if (isForbidden) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-amber-100 text-amber-700 border border-amber-300 flex items-center justify-center mx-auto shadow-raised-sm">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-[#172033]">Administrator Privileges Required</h2>
        <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed">
          The payment management console is restricted to authorized administrators. Contact your organization administrator or configure your email in <code className="px-1.5 py-0.5 bg-white/70 rounded font-mono">ADMIN_EMAILS</code>.
        </p>
        <div className="pt-2">
          <Link href="/payments">
            <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
              Return to Payments
            </Button>
          </Link>
        </div>
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
              Administrative Payment Management
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/30">
              Admin Portal
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            System-wide payment governance, refund authorization, webhook verification, and audit monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
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

          <Link href="/payments">
            <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
              Back to Payments
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Global Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Captured Volume */}
        <Card variant="raised-sm" className="p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
            System Settled Volume
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#15803D]">
            {overview.successfulPayments?.formatted || "$0.00"}
          </div>
          <p className="text-[11px] text-[#64748B]">
            {overview.successfulPayments?.count || 0} completed captures
          </p>
        </Card>

        {/* Pending Volume */}
        <Card variant="raised-sm" className="p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
            In-Flight / Pending
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#F59E0B]">
            {overview.pendingPayments?.formatted || "$0.00"}
          </div>
          <p className="text-[11px] text-[#64748B]">
            {overview.pendingPayments?.count || 0} active orders
          </p>
        </Card>

        {/* Refunded Amount */}
        <Card variant="raised-sm" className="p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
            Total Gateway Refunds
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#2563EB]">
            {overview.refundedPayments?.formatted || "$0.00"}
          </div>
          <p className="text-[11px] text-[#64748B]">
            {overview.refundedPayments?.count || 0} refund transactions
          </p>
        </Card>

        {/* Total Managed Transactions */}
        <Card variant="raised-sm" className="p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
            Total System Records
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#172033]">
            {overview.totalTransactions || 0}
          </div>
          <p className="text-[11px] text-[#64748B]">
            Across all tenants and checkout modes
          </p>
        </Card>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex border-b border-[#CBD5E1]/60 text-xs font-semibold text-[#64748B] gap-4">
        <button
          onClick={() => setActiveTab("transactions")}
          className={`pb-2.5 transition-all border-b-2 ${
            activeTab === "transactions"
              ? "border-[#2563EB] text-[#2563EB] font-bold"
              : "border-transparent hover:text-[#172033]"
          }`}
        >
          All System Transactions
        </button>

        <button
          onClick={() => setActiveTab("webhooks")}
          className={`pb-2.5 transition-all border-b-2 ${
            activeTab === "webhooks"
              ? "border-[#2563EB] text-[#2563EB] font-bold"
              : "border-transparent hover:text-[#172033]"
          }`}
        >
          PayPal Webhook History ({webhooks.length || 0})
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`pb-2.5 transition-all border-b-2 ${
            activeTab === "audit"
              ? "border-[#2563EB] text-[#2563EB] font-bold"
              : "border-transparent hover:text-[#172033]"
          }`}
        >
          Security Audit Trail ({auditLogs.length || 0})
        </button>
      </div>

      {/* TAB 1: ALL TRANSACTIONS */}
      {activeTab === "transactions" && (
        <Card variant="raised" className="space-y-4">
          {/* Filter Bar */}
          <div className="p-3 rounded-2xl bg-[#E8EDF4] shadow-inset-sm border border-[#CBD5E1]/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <form onSubmit={(e) => { e.preventDefault(); loadData(); }} className="flex-1 max-w-md flex items-center gap-2">
              <div className="relative w-full flex items-center">
                <Search className="h-4 w-4 absolute left-3.5 text-[#64748B]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search ref ID, order ID, or capture ID..."
                  className="w-full bg-[#E8EDF4] text-[#172033] placeholder-[#94A3B8] text-xs sm:text-sm rounded-xl py-2 pl-9 pr-8 shadow-inset-sm border border-[#D1D8E2] focus:border-[#2563EB] focus:outline-none"
                />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Filter
              </Button>
            </form>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#64748B]">Status:</span>
              <div className="w-40">
                <Select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); }}
                  options={STATUS_FILTER_OPTIONS}
                />
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          {payments.length === 0 ? (
            <EmptyState
              title="No Transactions Found"
              description="No payments match your current query."
              icon={CreditCard}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#172033]" aria-label="Admin Payments Ledger">
                <thead>
                  <tr className="border-b border-[#CBD5E1]/60 text-[#64748B] uppercase tracking-wider font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Transaction Ref</th>
                    <th className="py-2.5 px-3">Order / Capture ID</th>
                    <th className="py-2.5 px-3">Payer / Client</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1]/40">
                  {payments.map((p) => {
                    const isRefundable =
                      (p.status === "completed" || p.status === "COMPLETED" || p.status === "partially_refunded") &&
                      Boolean(p.captureId);

                    return (
                      <tr key={p.id} className="hover:bg-[#CBD5E1]/20 transition-colors">
                        <td className="py-3 px-3">
                          <span className="font-mono font-bold text-[#2563EB] block select-all">
                            {p.internalReference || p.id.slice(0, 12)}
                          </span>
                          <span className="text-[10px] text-[#64748B]">{p.category || "Payment"}</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          {p.orderId && <div className="text-[#172033] select-all">Ord: {p.orderId}</div>}
                          {p.captureId && <div className="text-[#15803D] select-all">Cap: {p.captureId}</div>}
                          {!p.orderId && !p.captureId && "—"}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold block">{p.payerName || p.recipientName || "Client"}</span>
                          <span className="text-[10px] text-[#64748B]">{p.payerEmail || p.recipientEmail || "—"}</span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-sm text-[#15803D]">
                          +{p.formattedAmount}
                        </td>
                        <td className="py-3 px-3 text-[#64748B] font-mono">
                          {p.date ? p.date.split("T")[0] : "—"}
                        </td>
                        <td className="py-3 px-3">
                          {getStatusBadge(p.status)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {p.status === "completed" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReceiptPayment(p)}
                                icon={Download}
                                className="text-[11px] py-1 px-2 min-h-[28px]"
                              >
                                Receipt
                              </Button>
                            )}
                            {isRefundable && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setRefundTargetPayment(p)}
                                className="text-[11px] py-1 px-2.5 min-h-[28px] text-red-600 hover:bg-red-50 border-red-200"
                              >
                                Refund
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: WEBHOOK EVENTS */}
      {activeTab === "webhooks" && (
        <Card variant="raised" className="space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">PayPal Webhook Event Log</CardTitle>
            <p className="text-xs text-[#64748B]">Showing verified incoming webhook notifications</p>
          </div>

          {webhooks.length === 0 ? (
            <EmptyState
              title="No Webhook Events Recorded"
              description="Incoming webhook events from PayPal Developer Sandbox will be logged here with signature verification status."
              icon={Clock}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#172033]" aria-label="Webhook Events Ledger">
                <thead>
                  <tr className="border-b border-[#CBD5E1]/60 text-[#64748B] uppercase tracking-wider font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Event ID</th>
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3">Verification</th>
                    <th className="py-2.5 px-3">Processing Status</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1]/40">
                  {webhooks.map((w) => (
                    <tr key={w.id} className="hover:bg-[#CBD5E1]/20">
                      <td className="py-3 px-3 font-mono font-bold text-[#2563EB] select-all">
                        {w.paypal_event_id}
                      </td>
                      <td className="py-3 px-3 font-semibold">{w.event_type}</td>
                      <td className="py-3 px-3">
                        <Badge
                          variant={w.verification_status === "SUCCESS" ? "success" : "error"}
                          size="sm"
                        >
                          {w.verification_status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-[11px] font-semibold">{w.processing_status}</span>
                      </td>
                      <td className="py-3 px-3 text-[#64748B] font-mono text-[11px]">
                        {w.received_at ? new Date(w.received_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setInspectWebhook(w)}
                          className="text-[11px] py-1 px-2"
                        >
                          View JSON
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: AUDIT TRAIL */}
      {activeTab === "audit" && (
        <Card variant="raised" className="space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Payment Security Audit Logs</CardTitle>
            <p className="text-xs text-[#64748B]">Cryptographic and state machine transition audit trail</p>
          </div>

          {auditLogs.length === 0 ? (
            <EmptyState
              title="No Audit Logs Recorded"
              description="System payment operations (order creation, capture, refunds, webhooks) will generate audit trail entries here."
              icon={ShieldCheck}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#172033]" aria-label="Audit Logs Ledger">
                <thead>
                  <tr className="border-b border-[#CBD5E1]/60 text-[#64748B] uppercase tracking-wider font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3">Payment ID</th>
                    <th className="py-2.5 px-3">IP Address</th>
                    <th className="py-2.5 px-3">Recorded At</th>
                    <th className="py-2.5 px-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1]/40">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#CBD5E1]/20">
                      <td className="py-3 px-3 font-semibold text-[#2563EB]">
                        {log.event_type}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] select-all">
                        {log.payment_id ? `#${log.payment_id.slice(0, 10)}` : "—"}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#64748B]">
                        {log.ip_address || "127.0.0.1"}
                      </td>
                      <td className="py-3 px-3 text-[#64748B] font-mono text-[11px]">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[10px] text-[#64748B] max-w-xs truncate">
                        {JSON.stringify(log.details || {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      <AdminRefundModal
        isOpen={Boolean(refundTargetPayment)}
        onClose={() => setRefundTargetPayment(null)}
        payment={refundTargetPayment}
        onRefundSuccess={handleRefundSuccess}
      />

      <PaymentReceiptModal
        isOpen={Boolean(receiptPayment)}
        onClose={() => setReceiptPayment(null)}
        payment={receiptPayment}
      />

      {/* Inspect Webhook Modal */}
      <Modal
        isOpen={Boolean(inspectWebhook)}
        onClose={() => setInspectWebhook(null)}
        title={`Webhook: ${inspectWebhook?.event_type || ""}`}
        description={`Event ID: ${inspectWebhook?.paypal_event_id || ""}`}
        maxWidth="max-w-2xl"
      >
        {inspectWebhook && (
          <div className="space-y-3 pt-2 text-xs">
            <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-96">
              {JSON.stringify(inspectWebhook.payload, null, 2)}
            </pre>
            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setInspectWebhook(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
