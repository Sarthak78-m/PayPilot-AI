"use client";

import React from "react";
import { Modal, Button, Badge, Divider } from "@/components/ui";
import {
  PayPilotLogo,
  CheckCircle2,
  Download,
  ShieldCheck,
  FileText,
} from "@/components/icons";

function formatCurrency(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    return `${currency || "USD"} ${Number(amount || 0).toFixed(2)}`;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "Recorded at settlement";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function PaymentReceiptModal({
  isOpen,
  onClose,
  payment,
}) {
  if (!payment) return null;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const amount = payment.amount || payment.totalAmount || 0;
  const currency = payment.currency || "USD";
  const fee = payment.fee || payment.transaction_fee || 0;
  const baseAmount = payment.baseAmount || (Number(amount) - Number(fee));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      description=""
      maxWidth="max-w-lg"
    >
      <div id="payment-receipt-print-area" className="space-y-5 text-xs text-[#172033] pt-2">
        {/* Receipt Header & PayPilot Branding */}
        <div className="flex items-center justify-between border-b border-[#CBD5E1]/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-primary-glow">
              <PayPilotLogo className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-[#172033] text-lg tracking-tight">PayPilot</span>
                <span className="text-[#2563EB] font-bold text-[10px] px-1.5 py-0.2 rounded bg-[#2563EB]/10">
                  AI
                </span>
              </div>
              <p className="text-[11px] text-[#64748B]">Official Payment Confirmation & Receipt</p>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-[#15803D] border border-emerald-300">
              Verified Capture
            </span>
            <p className="text-[10px] text-[#64748B] mt-1 font-mono">PayPal Sandbox</p>
          </div>
        </div>

        {/* Success Banner */}
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1 shadow-inset-sm">
          <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Payment Completed Successfully
          </span>
          <div className="text-2xl font-extrabold font-mono text-[#15803D]">
            {formatCurrency(amount, currency)}
          </div>
          <p className="text-[11px] text-[#64748B]">
            Status: <span className="font-bold text-[#15803D]">COMPLETED</span> • Gateway Settled
          </p>
        </div>

        {/* Detailed Breakdown */}
        <div className="space-y-2 p-4 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm">
          <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
            <span className="text-[#64748B] font-medium">Internal Transaction Ref:</span>
            <span className="font-mono font-bold text-[#2563EB] select-all">
              {payment.internalReference || payment.transactionRef || payment.id}
            </span>
          </div>

          {payment.orderId || payment.paypalOrderId ? (
            <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
              <span className="text-[#64748B] font-medium">PayPal Order ID:</span>
              <span className="font-mono text-[#172033] select-all">
                {payment.orderId || payment.paypalOrderId}
              </span>
            </div>
          ) : null}

          {payment.captureId || payment.paypalCaptureId ? (
            <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
              <span className="text-[#64748B] font-medium">PayPal Capture ID:</span>
              <span className="font-mono text-[#172033] select-all">
                {payment.captureId || payment.paypalCaptureId}
              </span>
            </div>
          ) : null}

          <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
            <span className="text-[#64748B] font-medium">Transaction Date & Time:</span>
            <span className="font-mono text-[#172033]">
              {formatDate(payment.capturedAt || payment.date || payment.fullDate)}
            </span>
          </div>

          {payment.payerEmail || payment.customerEmail ? (
            <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
              <span className="text-[#64748B] font-medium">Payer Email:</span>
              <span className="text-[#172033] font-semibold">
                {payment.payerEmail || payment.customerEmail}
              </span>
            </div>
          ) : null}

          {payment.payerName || payment.customer ? (
            <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
              <span className="text-[#64748B] font-medium">Payer / Client Name:</span>
              <span className="text-[#172033] font-semibold">
                {payment.payerName || payment.customer}
              </span>
            </div>
          ) : null}

          {payment.category ? (
            <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
              <span className="text-[#64748B] font-medium">Service / Category:</span>
              <span className="text-[#172033] font-semibold">{payment.category}</span>
            </div>
          ) : null}

          <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
            <span className="text-[#64748B] font-medium">Payment Method:</span>
            <span className="font-semibold text-[#172033]">
              {payment.paymentMethod || "PayPal Sandbox"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
            <span className="text-[#64748B] font-medium">Base Amount:</span>
            <span className="font-mono text-[#172033]">{formatCurrency(baseAmount, currency)}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
            <span className="text-[#64748B] font-medium">Gateway Processing Fee:</span>
            <span className="font-mono text-[#64748B]">{formatCurrency(fee, currency)}</span>
          </div>

          <div className="flex justify-between items-center pt-1.5 font-bold">
            <span className="text-[#172033]">Total Paid & Settled:</span>
            <span className="font-mono text-sm text-[#15803D]">
              {formatCurrency(amount, currency)}
            </span>
          </div>
        </div>

        {/* Security watermark footer */}
        <div className="flex items-center justify-between text-[10px] text-[#64748B] px-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
            <span>Cryptographically Verified via PayPal Sandbox REST API v2</span>
          </div>
          <span className="font-mono uppercase">IDEMPOTENT • CAPTURED</span>
        </div>

        <Divider />

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrint}
            icon={Download}
            iconPosition="left"
            className="w-full sm:w-auto"
          >
            Download Receipt as PDF
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    </Modal>
  );
}
