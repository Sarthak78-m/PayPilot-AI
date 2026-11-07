"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Skeleton,
  Divider,
  ThemeToggle,
} from "@/components/ui";
import {
  PayPilotLogo,
  ShieldCheck,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  FileText,
  Download,
  ArrowLeft,
  ExternalLink,
} from "@/components/icons";
import { PayPalCheckout } from "@/components/payments/paypal-checkout";

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
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function CustomerPaymentPage() {
  const params = useParams();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState(null);
  const [invoice, setInvoice] = useState(null);

  // Settlement completion states
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);
  const [paymentPendingData, setPaymentPendingData] = useState(null);
  const [paymentCancelledData, setPaymentCancelledData] = useState(null);
  const [paymentFailedData, setPaymentFailedData] = useState(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const fetchInvoice = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/public/invoices/${encodeURIComponent(token)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        const code = json.code || "UNKNOWN_ERROR";
        const message = json.error || `Unable to load invoice (HTTP ${res.status}).`;

        setErrorState({
          statusCode: res.status,
          code,
          message,
        });
        return;
      }

      setInvoice(json.data);
    } catch {
      setErrorState({
        statusCode: 0,
        code: "NETWORK_ERROR",
        message: "Unable to connect to the payment server. Please check your internet connection.",
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!ignore) {
        await fetchInvoice();
      }
    })();
    return () => {
      ignore = true;
    };
  }, [fetchInvoice]);

  const handleRetry = () => {
    setLoading(true);
    setErrorState(null);
    setPaymentCancelledData(null);
    setPaymentFailedData(null);
    fetchInvoice();
  };

  // Handlers for payment events
  const handlePaymentSuccess = (captureResult) => {
    setPaymentSuccessData(captureResult);
    setPaymentPendingData(null);
    setPaymentCancelledData(null);
    setPaymentFailedData(null);
  };

  const handlePaymentPending = (pendingResult) => {
    setPaymentPendingData(pendingResult);
    setPaymentSuccessData(null);
  };

  const handlePaymentCancelled = (data) => {
    setPaymentCancelledData(data || { cancelled: true });
    setPaymentFailedData(null);
  };

  const handlePaymentFailed = (err) => {
    setPaymentFailedData(err || { message: "Payment could not be completed." });
    setPaymentCancelledData(null);
  };

  const handlePrintReceipt = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 flex flex-col justify-between">
      {/* A. Header */}
      <header className="max-w-2xl mx-auto w-full mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-[#2563EB] flex items-center justify-center text-white shadow-primary-glow">
              <PayPilotLogo className="h-5 w-5" />
            </div>
            <div>
              <span className="font-extrabold text-[#172033] tracking-tight text-xl">PayPilot</span>
              <span className="text-[#2563EB] font-bold text-xs ml-1.5 px-1.5 py-0.5 rounded-md bg-[#2563EB]/10">
                AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle size="sm" />
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8EDF4] border border-white/80 shadow-raised-sm text-xs font-semibold text-[#172033]">
              <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
              <span>Secure Checkout</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto w-full flex-1">
        {/* State 1: Initial Loading Skeleton */}
        {loading && (
          <Card variant="raised-lg" className="p-6 sm:p-8 space-y-6" aria-busy="true">
            <div className="space-y-2">
              <Skeleton className="h-6 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-md" />
            </div>

            <Divider />

            <div className="space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-4 w-36 rounded-md" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-4 w-28 rounded-md" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-6 w-32 rounded-md" />
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
            </div>

            <Divider />

            <div className="space-y-3 pt-2">
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </Card>
        )}

        {/* State 2: Error States (Invalid Link, Expired, Revoked, Network Error) */}
        {!loading && errorState && (
          <Card variant="raised-lg" className="p-6 sm:p-8 text-center space-y-5">
            <div className="h-14 w-14 rounded-2xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center mx-auto shadow-raised-sm">
              <AlertCircle className="h-7 w-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-[#172033] tracking-tight">
                {errorState.code === "LINK_EXPIRED"
                  ? "Payment Link Has Expired"
                  : errorState.code === "LINK_REVOKED"
                  ? "Payment Link Revoked"
                  : errorState.code === "INVOICE_ALREADY_PAID"
                  ? "Invoice Already Paid"
                  : errorState.code === "INVOICE_CANCELLED"
                  ? "Invoice Cancelled"
                  : errorState.code === "NETWORK_ERROR"
                  ? "Connection Error"
                  : "Payment Link Unavailable"}
              </h2>

              <p className="text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
                {errorState.code === "LINK_EXPIRED"
                  ? "This checkout link has expired. Please contact the merchant to request a regenerated payment link."
                  : errorState.code === "LINK_REVOKED"
                  ? "This payment link is no longer valid. The merchant may have issued a newer link or closed this invoice."
                  : errorState.code === "INVOICE_ALREADY_PAID"
                  ? "This invoice has already been settled in full. No additional payment is required."
                  : errorState.code === "INVOICE_CANCELLED"
                  ? "This invoice has been marked as cancelled by the merchant."
                  : errorState.message}
              </p>
            </div>

            {errorState.code === "NETWORK_ERROR" && (
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleRetry}
                  icon={RefreshCw}
                  iconPosition="left"
                >
                  Retry Connection
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* State 3: Payment Successfully Completed (Phase 7 Requirements) */}
        {!loading && !errorState && paymentSuccessData && (
          <Card variant="raised-lg" className="p-6 sm:p-8 text-center space-y-6">
            {/* Success Animation & Icon */}
            <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#DCFCE7] animate-ping opacity-30" />
              <div className="h-18 w-18 rounded-2xl bg-[#DCFCE7] border border-[#86EFAC] text-[#15803D] flex items-center justify-center shadow-raised-sm relative z-10">
                <CheckCircle2 className="h-10 w-10" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Badge variant="success" size="md" dot>
                  Transaction Status: COMPLETED
                </Badge>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-800 border border-amber-500/30">
                  PayPal Sandbox Payment
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#172033] tracking-tight pt-1">
                Payment Successful
              </h1>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                Your payment has been officially captured and verified through PayPal Developer Sandbox.
              </p>
            </div>

            {/* Verified Transaction Details Breakdown */}
            <div className="p-5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-3 text-left text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B] font-medium">Amount Paid</span>
                <span className="font-mono font-extrabold text-base text-[#172033]">
                  {formatCurrency(
                    paymentSuccessData.amount || invoice?.amount,
                    paymentSuccessData.currency || invoice?.currency
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B]">Currency</span>
                <span className="font-mono font-bold text-[#172033]">
                  {paymentSuccessData.currency || invoice?.currency || "USD"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B]">Payment Method</span>
                <span className="font-semibold text-[#172033] flex items-center gap-1.5">
                  <span className="text-[#0070BA] font-extrabold italic">Pay<span className="text-[#00B2E3]">Pal</span></span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">Sandbox</span>
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B]">Transaction Status</span>
                <span className="font-bold text-[#15803D]">COMPLETED</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B]">Payment Date and Time</span>
                <span className="text-[#172033] font-mono text-[11px]">
                  {formatDate(paymentSuccessData.capturedAt || new Date().toISOString())}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B]">Transaction ID</span>
                <span className="font-mono text-[#172033] select-all">
                  {paymentSuccessData.paymentId || "PAY-RECORDED"}
                </span>
              </div>

              {paymentSuccessData.orderId && (
                <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                  <span className="text-[#64748B]">PayPal Order ID</span>
                  <span className="font-mono text-[#0070BA] font-semibold select-all">
                    {paymentSuccessData.orderId}
                  </span>
                </div>
              )}

              {paymentSuccessData.captureId && (
                <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                  <span className="text-[#64748B]">Capture ID</span>
                  <span className="font-mono text-[#15803D] font-semibold select-all">
                    {paymentSuccessData.captureId}
                  </span>
                </div>
              )}

              {invoice?.customerName && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-[#64748B]">Payer / Customer</span>
                  <span className="text-[#172033] font-semibold">{invoice.customerName}</span>
                </div>
              )}
            </div>

            {/* Technical Verification Details Dropdown */}
            <div>
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline flex items-center justify-center gap-1 mx-auto transition-colors"
              >
                <span>{showTechnicalDetails ? "Hide" : "View"} Gateway Verification Details</span>
                <ExternalLink className="h-3 w-3" />
              </button>

              {showTechnicalDetails && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono text-left overflow-x-auto shadow-inset-sm">
                  <pre>{JSON.stringify(paymentSuccessData, null, 2)}</pre>
                </div>
              )}
            </div>

            {/* Action Buttons: Download Receipt & Return to Dashboard */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={handlePrintReceipt}
                icon={Download}
                iconPosition="left"
                className="w-full sm:w-auto"
              >
                Download Receipt
              </Button>

              <Link href="/dashboard" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="md"
                  icon={ArrowLeft}
                  iconPosition="left"
                  className="w-full sm:w-auto"
                >
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* State 4: Payment Capture Pending Clearance (eCheck / Bank Clearance) */}
        {!loading && !errorState && !paymentSuccessData && paymentPendingData && (
          <Card variant="raised-lg" className="p-6 sm:p-8 text-center space-y-6">
            <div className="h-16 w-16 rounded-2xl bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309] flex items-center justify-center mx-auto shadow-raised-sm">
              <Clock className="h-9 w-9" />
            </div>

            <div className="space-y-1.5">
              <Badge variant="warning" size="md" dot>
                Payment Processing
              </Badge>
              <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight pt-1">
                Payment Awaiting Clearance
              </h2>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                Your payment authorization was received by PayPal and is pending gateway clearance (eCheck or bank clearance).
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-3 text-left text-xs">
              <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B]">Pending Amount</span>
                <span className="font-mono font-bold text-base text-[#172033]">
                  {formatCurrency(paymentPendingData.amount || invoice?.amount, paymentPendingData.currency || invoice?.currency)}
                </span>
              </div>
              {paymentPendingData.captureId && (
                <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                  <span className="text-[#64748B]">Gateway Reference</span>
                  <span className="font-mono text-[#172033]">{paymentPendingData.captureId}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1">
                <span className="text-[#64748B]">Status</span>
                <span className="font-semibold text-[#B45309]">Pending Gateway Clearance</span>
              </div>
            </div>

            <Link href="/dashboard">
              <Button variant="secondary" size="md">
                Return to Dashboard
              </Button>
            </Link>
          </Card>
        )}

        {/* State 5: Payment Cancelled State (Phase 8 Requirement) */}
        {!loading && !errorState && !paymentSuccessData && !paymentPendingData && paymentCancelledData && (
          <Card variant="raised-lg" className="p-6 sm:p-8 text-center space-y-6">
            <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-raised-sm">
              <AlertCircle className="h-9 w-9" />
            </div>

            <div className="space-y-1.5">
              <Badge variant="warning" size="md" dot>
                Transaction Status: CANCELLED
              </Badge>
              <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight pt-1">
                Payment Cancelled
              </h2>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                The PayPal checkout window was closed before completion. No funds were debited from your account and your invoice remains open.
              </p>
            </div>

            <div className="pt-2 flex justify-center gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => setPaymentCancelledData(null)}
                icon={RefreshCw}
                iconPosition="left"
              >
                Retry Payment
              </Button>
              <Link href="/dashboard">
                <Button variant="secondary" size="md">
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* State 6: Payment Failed State (Phase 8 Requirement) */}
        {!loading && !errorState && !paymentSuccessData && !paymentPendingData && !paymentCancelledData && paymentFailedData && (
          <Card variant="raised-lg" className="p-6 sm:p-8 text-center space-y-6">
            <div className="h-16 w-16 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto shadow-raised-sm">
              <AlertCircle className="h-9 w-9" />
            </div>

            <div className="space-y-1.5">
              <Badge variant="error" size="md" dot>
                Transaction Status: FAILED
              </Badge>
              <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight pt-1">
                Payment Failed
              </h2>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                {paymentFailedData.error || "PayPal was unable to process this payment. Please check your sandbox test credentials or balance and try again."}
              </p>
            </div>

            <div className="pt-2 flex justify-center gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => setPaymentFailedData(null)}
                icon={RefreshCw}
                iconPosition="left"
              >
                Retry Payment
              </Button>
              <Link href="/dashboard">
                <Button variant="secondary" size="md">
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* State 7: Active Payable Invoice Checkout */}
        {!loading && !errorState && !paymentSuccessData && !paymentPendingData && !paymentCancelledData && !paymentFailedData && invoice && (
          <div className="space-y-6">
            {/* Invoice Summary Card */}
            <Card variant="raised-lg" className="p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={invoice.status === "OVERDUE" ? "error" : "warning"} size="sm" dot>
                      {invoice.status === "OVERDUE" ? "Overdue Invoice" : "Payment Due"}
                    </Badge>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight">
                    {invoice.description || "Invoice Balance Due"}
                  </h1>
                  {invoice.customerName && (
                    <p className="text-xs text-[#64748B] mt-1">
                      Billed to: <span className="font-semibold text-[#172033]">{invoice.customerName}</span>
                    </p>
                  )}
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <p className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold">Total Amount</p>
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono text-[#172033] tracking-tight mt-0.5">
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </p>
                </div>
              </div>

              <Divider />

              {/* Invoice Detail Rows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-[#E8EDF4] border border-white/80 shadow-inset-sm">
                  <div className="flex items-center gap-2 text-[#64748B] mb-1">
                    <Calendar className="h-4 w-4" />
                    <span>Due Date</span>
                  </div>
                  <p className="font-bold text-[#172033] text-sm">
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#E8EDF4] border border-white/80 shadow-inset-sm">
                  <div className="flex items-center gap-2 text-[#64748B] mb-1">
                    <Clock className="h-4 w-4" />
                    <span>Link Validity</span>
                  </div>
                  <p className="font-bold text-[#172033] text-sm">
                    Expires {formatDate(invoice.expiresAt)}
                  </p>
                </div>
              </div>

              <Divider />

              {/* Payment Section */}
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#172033] tracking-tight">Select Payment Option</h3>
                  <span className="text-[11px] text-[#64748B]">Official PayPal Sandbox</span>
                </div>

                <PayPalCheckout
                  token={token}
                  currency={invoice.currency}
                  amount={invoice.amount}
                  onPaymentSuccess={handlePaymentSuccess}
                  onPaymentPending={handlePaymentPending}
                  onPaymentFailed={handlePaymentFailed}
                  onPaymentCancelled={handlePaymentCancelled}
                />
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* D. Footer */}
      <footer className="max-w-2xl mx-auto w-full mt-10 pt-6 border-t border-[#CBD5E1]/40 text-center text-xs text-[#64748B] space-y-2">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
            <span>256-Bit SSL Encryption</span>
          </div>
          <span>•</span>
          <span>Verified Merchant Authorization</span>
          <span>•</span>
          <span>PayPal Sandbox Environment</span>
        </div>
        <p className="text-[11px] text-[#94A3B8]">
          Powered by PayPilot AI • Freelancer Cashflow & Invoicing Intelligence
        </p>
      </footer>
    </div>
  );
}
