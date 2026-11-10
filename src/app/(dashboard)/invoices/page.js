"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Input,
  Select,
  EmptyState,
  Skeleton,
  Modal,
  Divider,
} from "@/components/ui";
import {
  FileText,
  Plus,
  ArrowLeft,
  Sparkles,
  Search,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  Link2,
  Trash2,
} from "@/components/icons";
import { PaymentLinkModal } from "@/components/invoices/payment-link-modal";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING", label: "Pending" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
];

function formatCurrency(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    const num = Number(amount) || 0;
    return `${currency || "USD"} ${num.toFixed(2)}`;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getStatusBadge(status) {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "PAID":
      return (
        <Badge variant="success" size="sm" dot>
          Paid
        </Badge>
      );
    case "PENDING":
      return (
        <Badge variant="warning" size="sm" dot>
          Pending
        </Badge>
      );
    case "OVERDUE":
      return (
        <Badge variant="error" size="sm" dot>
          Overdue
        </Badge>
      );
    case "DRAFT":
      return (
        <Badge variant="neutral" size="sm" dot>
          Draft
        </Badge>
      );
    case "CANCELLED":
      return (
        <Badge variant="neutral" size="sm">
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="neutral" size="sm">{status || "Unknown"}</Badge>;
  }
}

export default function InvoicesPage() {
  const router = useRouter();

  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedInvoiceForLink, setSelectedInvoiceForLink] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedInvoiceForDelete, setSelectedInvoiceForDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchInvoices = useCallback(async (targetPage = page, targetStatus = statusFilter, targetSearch = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("limit", String(limit));
      params.set("sort", "created_at");
      params.set("order", "desc");

      if (targetStatus) {
        params.set("status", targetStatus);
      }
      if (targetSearch.trim()) {
        params.set("search", targetSearch.trim());
      }

      const res = await fetch(`/api/invoices?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError({
            is401: true,
            message: "Authentication is required to view invoices. Please sign in.",
          });
          return;
        }
        setError({
          is401: false,
          message: errorData.message || `Failed to load invoices (HTTP ${res.status}).`,
        });
        return;
      }

      const json = await res.json();
      if (json.status === "ok" && json.data) {
        setInvoices(json.data.invoices || []);
        setPagination(
          json.data.pagination || {
            page: targetPage,
            limit,
            total: (json.data.invoices || []).length,
          }
        );
        setError(null);
      } else {
        setError({
          is401: false,
          message: json.message || "Failed to process invoices response.",
        });
      }
    } catch (err) {
      setError({
        is401: false,
        message: "Unable to connect to invoice service. Please check your connection.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, statusFilter, search, limit]);

  useEffect(() => {
    let ignore = false;

    const timer = setTimeout(() => {
      if (!ignore) {
        fetchInvoices(page, statusFilter, search);
      }
    }, search ? 300 : 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [page, statusFilter, search, fetchInvoices]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInvoices(page, statusFilter, search);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1); // Reset to first page on filter
  };

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPage(1);
  };

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handleOpenDeleteModal = (inv) => {
    setSelectedInvoiceForDelete(inv);
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    if (!deleting) {
      setDeleteModalOpen(false);
      setSelectedInvoiceForDelete(null);
      setDeleteError(null);
    }
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!selectedInvoiceForDelete) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/invoices/${selectedInvoiceForDelete.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDeleteError(data.message || `Failed to delete invoice (HTTP ${res.status}).`);
        return;
      }

      setDeleteModalOpen(false);
      setSelectedInvoiceForDelete(null);
      setFeedback({
        type: "success",
        message: `Invoice #${selectedInvoiceForDelete.id.slice(0, 8)} deleted successfully.`,
      });

      await fetchInvoices(page, statusFilter, search);
    } catch {
      setDeleteError("Unable to connect to service. Please check your network connection.");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / limit));
  const startRange = pagination.total === 0 ? 0 : (page - 1) * limit + 1;
  const endRange = Math.min(page * limit, pagination.total || 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033] dark:text-[#F8FAFC] tracking-tight">
              Invoices & Billing
            </h1>
          </div>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Manage client receivables, filter payment states, and track balances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/dashboard">
            <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
              Dashboard
            </Button>
          </Link>
          <Link href="/invoices/generate">
            <Button
              variant="outline"
              size="sm"
              icon={Sparkles}
              iconPosition="left"
              className="border-[#2563EB]/30 text-[#2563EB] hover:bg-[#2563EB]/5"
            >
              Generate with AI
            </Button>
          </Link>
          <Link href="/invoices/new">
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              iconPosition="left"
              className="shadow-primary-glow"
            >
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Notification / Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center justify-between gap-3 shadow-raised-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <span className="font-semibold">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] font-bold opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss message"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar Card */}
      <Card variant="raised-sm" className="p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search input */}
          <div className="flex-1 max-w-md">
            <Input
              type="text"
              placeholder="Search by customer name or email..."
              value={search}
              onChange={handleSearchChange}
              leadingIcon={Search}
              className="w-full text-xs"
            />
          </div>

          {/* Status Select and Refresh */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-40">
              <Select
                value={statusFilter}
                onChange={handleStatusChange}
                options={STATUS_OPTIONS}
                className="text-xs"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="p-2.5 rounded-xl bg-[#E8EDF4] dark:bg-[#161F33] text-[#64748B] dark:text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm transition-all disabled:opacity-50"
              title="Refresh invoices"
              aria-label="Refresh invoices list"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Active Filter Indicators */}
        {(search || statusFilter) && (
          <div className="mt-3 pt-3 border-t border-[#CBD5E1]/40 dark:border-white/10 flex items-center justify-between text-xs text-[#64748B] dark:text-[#94A3B8]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[#172033] dark:text-[#F8FAFC]">Active Filters:</span>
              {search && (
                <Badge variant="neutral" size="sm">
                  Search: &ldquo;{search}&rdquo;
                </Badge>
              )}
              {statusFilter && (
                <Badge variant="primary" size="sm">
                  Status: {statusFilter}
                </Badge>
              )}
            </div>
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline"
            >
              Clear All
            </button>
          </div>
        )}
      </Card>

      {/* Main Table / State Container */}
      <Card variant="raised-lg" className="overflow-hidden">
        {/* Error Banner */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span className="font-medium">{error.message}</span>
            </div>
            {error.is401 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push("/login")}
                className="shrink-0"
              >
                Go to Sign In
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                className="shrink-0"
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="p-6 space-y-4">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-3 border-b border-[#CBD5E1]/30">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-48 rounded-md" />
                    <Skeleton className="h-3 w-32 rounded-md" />
                  </div>
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && invoices.length === 0 && (
          <div className="p-8 text-center">
            {search || statusFilter ? (
              <EmptyState
                title="No Matching Invoices"
                description="We couldn't find any invoices matching your search criteria or status filter."
                icon={FileText}
                actionLabel="Clear Filters"
                onAction={handleClearFilters}
              />
            ) : (
              <EmptyState
                title="No Invoices Recorded"
                description="You haven't created any invoices yet. Create your first invoice manually or generate one instantly with Gemini AI."
                icon={FileText}
                actionLabel="Create First Invoice"
                onAction={() => router.push("/invoices/new")}
              />
            )}
          </div>
        )}

        {/* Invoices List Table */}
        {!loading && !error && invoices.length > 0 && (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-[#172033] dark:text-[#F8FAFC]" aria-label="Invoices list">
                <thead>
                  <tr className="bg-[#E8EDF4]/60 dark:bg-[#111726]/60 border-b border-[#CBD5E1]/60 dark:border-white/10 text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider font-semibold text-[11px]">
                    <th className="py-3 px-4">Invoice ID</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1]/40 dark:divide-white/10">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-[#CBD5E1]/20 dark:hover:bg-white/5 transition-colors group"
                    >
                      {/* ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-[#2563EB] dark:text-[#60A5FA]">
                        #{inv.id ? inv.id.slice(0, 8) : "—"}
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-[#172033] dark:text-[#F8FAFC]">{inv.customer_name || "Untitled Customer"}</p>
                        {inv.customer_email && (
                          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate max-w-[180px]">
                            {inv.customer_email}
                          </p>
                        )}
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-4 text-[#64748B] dark:text-[#94A3B8] max-w-[220px]">
                        <p className="truncate" title={inv.description}>
                          {inv.description || "No description"}
                        </p>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 font-mono font-bold text-sm text-[#172033] dark:text-[#F8FAFC]">
                        {formatCurrency(inv.amount, inv.currency)}
                      </td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4 text-[#64748B] dark:text-[#94A3B8] font-mono">
                        {formatDate(inv.due_date)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {getStatusBadge(inv.status)}
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-4 text-[#64748B] dark:text-[#94A3B8] font-mono text-[11px]">
                        {formatDate(inv.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Link2}
                            iconPosition="left"
                            onClick={() => setSelectedInvoiceForLink(inv)}
                            className="text-xs"
                            title="Generate or view payment link"
                          >
                            Payment Link
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => handleOpenDeleteModal(inv)}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            title="Delete invoice"
                            aria-label={`Delete invoice #${inv.id ? inv.id.slice(0, 8) : ""}`}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-[#CBD5E1]/40 dark:divide-white/10">
              {invoices.map((inv) => (
                <div key={inv.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#2563EB] dark:text-[#60A5FA] text-xs">
                      #{inv.id ? inv.id.slice(0, 8) : "—"}
                    </span>
                    {getStatusBadge(inv.status)}
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#172033] dark:text-[#F8FAFC] text-sm">
                        {inv.customer_name || "Untitled Customer"}
                      </p>
                      {inv.customer_email && (
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">{inv.customer_email}</p>
                      )}
                      {inv.description && (
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] line-clamp-1 mt-0.5">
                          {inv.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-base text-[#172033] dark:text-[#F8FAFC]">
                        {formatCurrency(inv.amount, inv.currency)}
                      </p>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                        Due: {formatDate(inv.due_date)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <div className="flex items-center justify-end gap-2 w-full">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Link2}
                        iconPosition="left"
                        onClick={() => setSelectedInvoiceForLink(inv)}
                        className="flex-1 text-xs justify-center"
                      >
                        Payment Link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        onClick={() => handleOpenDeleteModal(inv)}
                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Delete invoice"
                        aria-label={`Delete invoice #${inv.id ? inv.id.slice(0, 8) : ""}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="p-4 bg-[#E8EDF4]/40 dark:bg-[#111726]/40 border-t border-[#CBD5E1]/50 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <div>
                Showing <span className="font-bold text-[#172033] dark:text-[#F8FAFC]">{startRange}</span> to{" "}
                <span className="font-bold text-[#172033] dark:text-[#F8FAFC]">{endRange}</span> of{" "}
                <span className="font-bold text-[#172033] dark:text-[#F8FAFC]">{pagination.total || 0}</span> invoices
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  icon={ChevronLeft}
                  iconPosition="left"
                >
                  Previous
                </Button>

                <div className="px-3 py-1 text-xs font-semibold text-[#172033] dark:text-[#F8FAFC]">
                  Page {page} of {totalPages}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  icon={ChevronRight}
                  iconPosition="right"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Payment Link Modal */}
      <PaymentLinkModal
        isOpen={Boolean(selectedInvoiceForLink)}
        onClose={() => setSelectedInvoiceForLink(null)}
        invoice={selectedInvoiceForLink}
        onInvoiceUpdated={() => fetchInvoices(page, statusFilter, search)}
      />

      {/* Delete Invoice Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={handleCloseDeleteModal}
        title="Delete Invoice"
        description="Confirm permanent removal of this invoice record."
      >
        {selectedInvoiceForDelete && (
          <div className="space-y-4 py-2">
            {/* Invoice Overview Card */}
            <div className="p-3.5 rounded-xl bg-[#E8EDF4] dark:bg-[#111726] shadow-inset-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-[#2563EB]">
                  #{selectedInvoiceForDelete.id ? selectedInvoiceForDelete.id.slice(0, 8) : "—"}
                </span>
                {getStatusBadge(selectedInvoiceForDelete.status)}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B] dark:text-[#94A3B8] font-medium">Customer:</span>
                <span className="font-bold text-[#172033] dark:text-[#F8FAFC]">
                  {selectedInvoiceForDelete.customer_name || "Untitled Customer"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B] dark:text-[#94A3B8] font-medium">Amount:</span>
                <span className="font-mono font-bold text-[#172033] dark:text-[#F8FAFC]">
                  {formatCurrency(selectedInvoiceForDelete.amount, selectedInvoiceForDelete.currency)}
                </span>
              </div>
              {selectedInvoiceForDelete.description && (
                <div className="text-xs text-[#64748B] dark:text-[#94A3B8] pt-1 border-t border-[#CBD5E1]/40 dark:border-white/10">
                  <span className="font-medium">Description: </span>
                  <span className="italic">{selectedInvoiceForDelete.description}</span>
                </div>
              )}
            </div>

            {/* Context-aware Warning Banner */}
            {selectedInvoiceForDelete.status === "PAID" ? (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Cannot Delete Settled Invoice</p>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    This invoice has been marked as PAID. To ensure strict accounting compliance and preserve captured payment ledgers, paid invoices cannot be permanently deleted.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400 flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Warning: Permanent Action</p>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    This will permanently delete invoice <span className="font-mono font-bold">#{selectedInvoiceForDelete.id ? selectedInvoiceForDelete.id.slice(0, 8) : ""}</span>. Any associated public payment links will be deactivated immediately.
                  </p>
                </div>
              </div>
            )}

            {/* Error feedback if deletion failed */}
            {deleteError && (
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/40 text-xs text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{deleteError}</span>
              </div>
            )}

            <Divider />

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseDeleteModal}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                icon={Trash2}
                iconPosition="left"
                onClick={handleConfirmDeleteInvoice}
                loading={deleting}
                disabled={deleting || selectedInvoiceForDelete.status === "PAID"}
              >
                Permanently Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
