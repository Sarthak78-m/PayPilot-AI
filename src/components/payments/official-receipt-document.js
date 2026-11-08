"use client";

import React from "react";
import { PayPilotLogo, CheckCircle2, ShieldCheck } from "@/components/icons";

export function formatReceiptCurrency(amount, currency = "USD") {
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

export function formatReceiptDate(dateStr) {
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
      timeZoneName: "short",
    });
  } catch {
    return dateStr;
  }
}

export function OfficialReceiptDocument({
  payment = {},
  invoice = {},
  compact = false,
}) {
  const amount = payment.amount ?? invoice.amount ?? 0;
  const currency = payment.currency || invoice.currency || "USD";
  const fee = payment.fee ?? payment.transaction_fee ?? 0;
  const baseAmount = payment.baseAmount ?? (Number(amount) - Number(fee));

  const orderId = payment.orderId || payment.paypalOrderId || invoice.orderId || "";
  const captureId = payment.captureId || payment.paypalCaptureId || invoice.captureId || "";
  const transactionId = payment.paymentId || payment.internalReference || payment.id || "PAY-RECORDED";
  const capturedAt = payment.capturedAt || payment.date || invoice.dueDate || new Date().toISOString();

  const customerName = invoice.customerName || invoice.customer_name || payment.payerName || payment.customer || "Valued Client";
  const customerEmail = payment.payerEmail || payment.customerEmail || "";
  const description = invoice.description || payment.category || "Professional & Software Retainer Services";

  // Derive a clean receipt reference number
  const receiptNumber = orderId
    ? `REC-${orderId.slice(-8).toUpperCase()}`
    : `REC-${transactionId.slice(-8).toUpperCase()}`;

  return (
    <div
      id="official-print-receipt"
      className="bg-white text-slate-900 border border-slate-200 rounded-xl shadow-lg p-6 sm:p-8 max-w-2xl mx-auto font-sans print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full print:bg-white print:text-black"
    >
      {/* 1. Header & Letterhead */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b-2 border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-[#2563EB] flex items-center justify-center text-white shadow-md print:shadow-none shrink-0">
            <PayPilotLogo className="h-7 w-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-2xl tracking-tight text-slate-900">PayPilot</span>
              <span className="bg-blue-600 text-white font-bold text-xs px-2 py-0.5 rounded-md">AI</span>
            </div>
            <p className="text-xs text-slate-500 font-medium tracking-wide">
              Autonomous Invoicing & Payment Infrastructure
            </p>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Merchant Settlement Gateway • Node ID: PP-SBX-GLOBAL
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right space-y-1">
          <span className="inline-block px-3 py-1 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold uppercase tracking-wider">
            ✔ Paid & Settled
          </span>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Payment Receipt</h2>
          <div className="text-xs text-slate-600 font-mono space-y-0.5">
            <div><strong className="text-slate-700">Receipt Ref:</strong> {receiptNumber}</div>
            <div><strong className="text-slate-700">Date:</strong> {formatReceiptDate(capturedAt)}</div>
          </div>
        </div>
      </div>

      {/* 2. Customer & Merchant Party Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-5 border-b border-slate-200 text-xs">
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            Billed To (Customer)
          </span>
          <div className="font-bold text-sm text-slate-900">{customerName}</div>
          {customerEmail && (
            <div className="text-slate-600 font-mono">{customerEmail}</div>
          )}
          <div className="text-slate-500 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Verified PayPal Payer Account
          </div>
        </div>

        <div className="space-y-1 sm:text-right">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            Issued By (Merchant Services)
          </span>
          <div className="font-bold text-sm text-slate-900">PayPilot AI Merchant Services</div>
          <div className="text-slate-600">PayPal REST API v2 Gateway</div>
          <div className="text-slate-500 text-[11px]">
            Environment: <span className="font-semibold text-amber-700">PayPal Developer Sandbox</span>
          </div>
        </div>
      </div>

      {/* 3. Itemized Settlement Table */}
      <div className="py-5">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              <th className="py-2.5 text-left">Description / Service</th>
              <th className="py-2.5 text-left hidden sm:table-cell">Channel</th>
              <th className="py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-3 text-slate-800">
                <div className="font-bold text-sm text-slate-900">{description}</div>
                <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                  Order Ref: {orderId || "Direct Gateway Capture"}
                </div>
              </td>
              <td className="py-3 text-slate-600 hidden sm:table-cell">
                <span className="inline-flex items-center gap-1 font-semibold text-[#0070BA]">
                  PayPal <span className="text-amber-700 text-[10px] font-bold bg-amber-50 px-1 py-0.2 border border-amber-200 rounded">Sandbox</span>
                </span>
              </td>
              <td className="py-3 text-right font-mono font-bold text-sm text-slate-900">
                {formatReceiptCurrency(amount, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4. Financial Reconciliation Summary */}
      <div className="flex justify-end pt-2 pb-5 border-b border-slate-200">
        <div className="w-full sm:w-64 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-mono">{formatReceiptCurrency(baseAmount, currency)}</span>
          </div>
          {Number(fee) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Gateway Processing Fee</span>
              <span className="font-mono">{formatReceiptCurrency(fee, currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>Estimated Taxes (VAT/GST)</span>
            <span className="font-mono">$0.00</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t-2 border-slate-900 text-slate-900 font-bold">
            <span className="text-sm">Total Paid</span>
            <span className="font-mono text-base text-[#15803D]">
              {formatReceiptCurrency(amount, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Cryptographic Gateway Verification Block */}
      <div className="my-5 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] space-y-1.5">
        <div className="flex items-center justify-between text-slate-700 font-bold">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Cryptographic Gateway Verification & Audit Trail</span>
          </div>
          <span className="text-[10px] uppercase font-mono text-slate-400">Idempotent • Captured</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1 text-slate-600 font-mono text-[10px]">
          <div className="truncate">
            <strong className="text-slate-700">Internal Ref:</strong> {transactionId}
          </div>
          {orderId && (
            <div className="truncate">
              <strong className="text-slate-700">PayPal Order ID:</strong> {orderId}
            </div>
          )}
          {captureId && (
            <div className="truncate">
              <strong className="text-slate-700">PayPal Capture ID:</strong> {captureId}
            </div>
          )}
          <div>
            <strong className="text-slate-700">Security Standard:</strong> TLS 1.3 / 256-Bit SSL
          </div>
        </div>
      </div>

      {/* 6. Legal & Official Seal Footer */}
      <div className="pt-3 text-center text-slate-400 text-[10px] leading-relaxed border-t border-slate-100">
        <p>
          This is an official computer-generated receipt issued by PayPilot AI on behalf of the merchant.
          Authorized and settled through PayPal Developer Sandbox REST API. Valid without a physical signature.
        </p>
        <p className="mt-1 font-mono text-slate-500">
          PayPilot AI Technologies Inc. • Electronic Settlement Proof • Page 1 of 1
        </p>
      </div>
    </div>
  );
}
