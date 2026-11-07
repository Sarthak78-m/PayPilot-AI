"use client";

import React, { useState } from "react";
import { Modal, Button, Input, Divider } from "@/components/ui";
import { AlertCircle, CheckCircle2 } from "@/components/icons";
import { formatCurrencyDisplay } from "@/lib/payments/currency";

export function AdminRefundModal({
  isOpen,
  onClose,
  payment,
  onRefundSuccess = () => {},
}) {
  const [refundType, setRefundType] = useState("full"); // "full" | "partial"
  const [partialAmount, setPartialAmount] = useState("");
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  if (!payment) return null;

  const totalAmount = Number(payment.totalAmount || payment.amount) || 0;
  const currency = payment.currency || "USD";

  // Calculate already refunded amount from refunds array if present
  const alreadyRefunded = (payment.refunds || []).reduce(
    (sum, r) => sum + (Number(r.refund_amount) || 0),
    0
  );
  const remainingRefundable = Math.max(0, Math.round((totalAmount - alreadyRefunded) * 100) / 100);

  const handleExecuteRefund = async (e) => {
    e.preventDefault();
    setError(null);

    const refundAmountNum =
      refundType === "full" ? remainingRefundable : Number(partialAmount);

    if (!refundAmountNum || refundAmountNum <= 0) {
      setError("Please specify a valid refund amount.");
      return;
    }

    if (refundAmountNum > remainingRefundable) {
      setError(`Refund amount cannot exceed remaining balance of ${formatCurrencyDisplay(remainingRefundable, currency)}.`);
      return;
    }

    setProcessing(true);

    try {
      const res = await fetch("/api/paypal/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: payment.id,
          amount: refundAmountNum,
          reason: reason.trim() || "Administrator refund",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to process PayPal refund.");
        setProcessing(false);
        return;
      }

      setSuccessData(data);
      onRefundSuccess(data);
    } catch {
      setError("Network error while connecting to refund service.");
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setSuccessData(null);
    setError(null);
    setPartialAmount("");
    setReason("");
    setRefundType("full");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Initiate PayPal Sandbox Refund"
      description={`Transaction ${payment.internalReference || payment.transactionRef || payment.id}`}
      maxWidth="max-w-md"
    >
      {successData ? (
        <div className="space-y-4 pt-2 text-xs text-[#172033]">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2 shadow-inset-sm">
            <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-sm text-[#15803D]">Refund Processed Successfully</h3>
            <p className="text-[11px] text-[#64748B]">
              Settlement has been reversed via PayPal Payments API v2.
            </p>
            <div className="font-mono text-xl font-extrabold text-[#15803D] pt-1">
              -{formatCurrencyDisplay(successData.refundAmount, successData.currency)}
            </div>
          </div>

          <div className="space-y-2 p-3 rounded-xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm">
            <div className="flex justify-between items-center py-0.5 border-b border-[#CBD5E1]/40">
              <span className="text-[#64748B]">PayPal Refund ID:</span>
              <span className="font-mono font-bold select-all text-[#2563EB]">
                {successData.refundId}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5 border-b border-[#CBD5E1]/40">
              <span className="text-[#64748B]">New Payment Status:</span>
              <span className="font-bold text-[#172033]">{successData.newPaymentStatus}</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-[#64748B]">Remaining Balance:</span>
              <span className="font-mono text-[#64748B]">
                {formatCurrencyDisplay(successData.remainingRefundable, successData.currency)}
              </span>
            </div>
          </div>

          <Divider />

          <div className="flex justify-end pt-1">
            <Button variant="primary" size="sm" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleExecuteRefund} className="space-y-4 pt-2 text-xs text-[#172033]">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Balance card */}
          <div className="p-3 rounded-xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[#64748B]">Original Total:</span>
              <span className="font-mono font-semibold">{formatCurrencyDisplay(totalAmount, currency)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#64748B]">Previously Refunded:</span>
              <span className="font-mono text-[#64748B]">{formatCurrencyDisplay(alreadyRefunded, currency)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-[#CBD5E1]/40 font-bold">
              <span className="text-[#172033]">Available to Refund:</span>
              <span className="font-mono text-[#2563EB]">{formatCurrencyDisplay(remainingRefundable, currency)}</span>
            </div>
          </div>

          {/* Refund type selector */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider">
              Refund Option
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRefundType("full")}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  refundType === "full"
                    ? "bg-[#2563EB]/10 border-[#2563EB] text-[#2563EB] font-bold"
                    : "bg-[#E8EDF4] border-[#CBD5E1]/60 text-[#64748B] hover:text-[#172033]"
                }`}
              >
                Full Refund ({formatCurrencyDisplay(remainingRefundable, currency)})
              </button>

              <button
                type="button"
                onClick={() => setRefundType("partial")}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  refundType === "partial"
                    ? "bg-[#2563EB]/10 border-[#2563EB] text-[#2563EB] font-bold"
                    : "bg-[#E8EDF4] border-[#CBD5E1]/60 text-[#64748B] hover:text-[#172033]"
                }`}
              >
                Partial Refund
              </button>
            </div>
          </div>

          {refundType === "partial" && (
            <div>
              <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider mb-1">
                Partial Refund Amount ({currency})
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={remainingRefundable}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider mb-1">
              Refund Reason / Note to Payer
            </label>
            <Input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Service cancellation or overpayment adjustment"
            />
          </div>

          <Divider />

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={handleClose} disabled={processing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={processing || remainingRefundable <= 0}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {processing ? "Processing Refund..." : "Execute PayPal Refund"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
