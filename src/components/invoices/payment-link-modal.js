"use client";

import React, { useState, useEffect } from "react";
import { Modal, Button, Badge, Input, Select, Divider } from "@/components/ui";
import { Link2, Copy, Check, AlertCircle, ShieldCheck, Clock, ExternalLink } from "@/components/icons";

const EXPIRATION_OPTIONS = [
  { value: "1", label: "1 Day" },
  { value: "3", label: "3 Days" },
  { value: "7", label: "7 Days (Recommended)" },
  { value: "14", label: "14 Days" },
  { value: "30", label: "30 Days (Maximum)" },
];

export function PaymentLinkModal({
  isOpen,
  onClose,
  invoice,
  onInvoiceUpdated = () => {},
}) {
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [allowDraftTransition, setAllowDraftTransition] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Generated Link Result
  const [linkResult, setLinkResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const resetFormState = () => {
    setExpiresInDays(7);
    setAllowDraftTransition(false);
    setLoading(false);
    setError(null);
    setLinkResult(null);
    setCopied(false);
  };

  const handleModalClose = () => {
    resetFormState();
    onClose();
  };

  if (!invoice || !isOpen) return null;

  const isDraft = invoice.status === "DRAFT";
  const isPaid = invoice.status === "PAID";
  const isCancelled = invoice.status === "CANCELLED";

  const handleGenerateLink = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiresInDays: Number(expiresInDays),
          allowDraftTransition: Boolean(allowDraftTransition),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(data.error || `Failed to generate payment link (HTTP ${res.status}).`);
        return;
      }

      setLinkResult({
        paymentUrl: data.paymentUrl,
        expiresAt: data.expiresAt,
      });

      // If draft was transitioned, notify parent table to refresh invoice status
      if (isDraft && allowDraftTransition) {
        onInvoiceUpdated();
      }
    } catch (err) {
      setError("Network error. Unable to reach payment link service.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!linkResult?.paymentUrl) return;
    try {
      await navigator.clipboard.writeText(linkResult.paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title="Customer Payment Link"
      description="Create a secure, cryptographically random checkout link for your client."
      maxWidth="max-w-lg"
    >
      <div className="space-y-5 pt-1">
        {/* Invoice Summary Header */}
        <div className="p-4 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-[#2563EB]">
              Invoice #{invoice.id ? invoice.id.slice(0, 8) : "—"}
            </span>
            <Badge
              variant={
                invoice.status === "PAID"
                  ? "success"
                  : invoice.status === "DRAFT"
                  ? "neutral"
                  : invoice.status === "OVERDUE"
                  ? "error"
                  : "warning"
              }
              size="sm"
              dot
            >
              {invoice.status}
            </Badge>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[#64748B] font-medium truncate max-w-[200px]">
              {invoice.customer_name || "Client"}
            </span>
            <span className="font-mono font-extrabold text-base text-[#172033]">
              {invoice.currency} {Number(invoice.amount || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Pre-Generation Configuration Form */}
        {!linkResult ? (
          <div className="space-y-4">
            {/* Terminal States Guard */}
            {isPaid ? (
              <div className="p-4 rounded-2xl bg-[#DCFCE7] border border-[#86EFAC] text-xs text-[#15803D] space-y-1">
                <p className="font-bold">Invoice Already Paid</p>
                <p>This invoice has already been fully settled. Payment links cannot be generated for settled invoices.</p>
              </div>
            ) : isCancelled ? (
              <div className="p-4 rounded-2xl bg-[#E2E8F0] border border-[#CBD5E1] text-xs text-[#475569] space-y-1">
                <p className="font-bold">Invoice Cancelled</p>
                <p>This invoice is cancelled. Reactivate the invoice before creating payment links.</p>
              </div>
            ) : (
              <>
                {/* Expiration Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#172033] flex items-center justify-between">
                    <span>Link Expiration Window</span>
                    <span className="text-[11px] text-[#64748B]">1 to 30 Days</span>
                  </label>
                  <Select
                    value={String(expiresInDays)}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    options={EXPIRATION_OPTIONS}
                    className="text-xs w-full"
                  >
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                  <p className="text-[11px] text-[#64748B]">
                    After expiration, the link rejects checkout attempts automatically.
                  </p>
                </div>

                {/* Explicit DRAFT Issuance Guard */}
                {isDraft && (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-amber-900">Draft Invoice Requires Issuance</p>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                          This invoice is currently in DRAFT status. Payment links cannot be issued for draft invoices without explicitly transitioning the invoice to PENDING.
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 p-2 rounded-xl bg-white/70 border border-amber-300/80 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allowDraftTransition}
                        onChange={(e) => setAllowDraftTransition(e.target.checked)}
                        className="h-4 w-4 rounded text-[#2563EB] focus:ring-[#2563EB] border-[#CBD5E1]"
                      />
                      <span className="text-xs font-bold text-[#172033]">
                        Issue invoice now (transition DRAFT to PENDING)
                      </span>
                    </label>
                  </div>
                )}

                {/* Re-generation Invalidation Warning */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-[#E8EDF4] border border-[#CBD5E1]/50 text-[11px] text-[#64748B]">
                  <Clock className="h-4 w-4 shrink-0 text-[#2563EB] mt-0.5" />
                  <span>
                    Generating a new link automatically revokes and invalidates any previous payment link for this invoice.
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <Button variant="secondary" size="md" onClick={handleModalClose} disabled={loading}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleGenerateLink}
                    loading={loading}
                    disabled={isDraft && !allowDraftTransition}
                    icon={Link2}
                    iconPosition="left"
                    className="shadow-primary-glow"
                  >
                    {isDraft ? "Issue & Generate Link" : "Generate Payment Link"}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Post-Generation View: Display URL, Copy, & Expiry */
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#DCFCE7] border border-[#86EFAC] text-xs text-[#15803D] flex items-center gap-2.5">
              <Check className="h-4 w-4 shrink-0" />
              <span className="font-bold">Public payment link generated successfully!</span>
            </div>

            {/* Generated URL Box */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#172033]">Public Checkout URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={linkResult.paymentUrl}
                  className="flex-1 text-xs font-mono px-3.5 py-2.5 rounded-xl bg-white border border-[#CBD5E1] text-[#172033] shadow-inset-sm select-all focus:outline-none"
                  aria-label="Public payment URL"
                />
                <Button
                  variant={copied ? "primary" : "secondary"}
                  size="md"
                  onClick={handleCopyLink}
                  icon={copied ? Check : Copy}
                  iconPosition="left"
                  className="shrink-0"
                  aria-label={copied ? "Copied" : "Copy payment URL"}
                >
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[#64748B]">
                <span>Valid Until</span>
                <span className="font-bold text-[#172033]">
                  {new Date(linkResult.expiresAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-[11px] text-[#64748B]">
                Share this link with your client. They can review the invoice and complete payment with PayPal without needing an account.
              </p>
            </div>

            {/* Invalidation Notice */}
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
              Notice: If you generate another payment link in the future, this link will be automatically revoked.
            </p>

            <div className="pt-2 flex items-center justify-between">
              <a
                href={linkResult.paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1"
              >
                <span>Preview Checkout Page</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              <Button variant="secondary" size="md" onClick={handleModalClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
