"use client";

import React, { useState, useEffect, useCallback } from "react";
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
    fetchInvoice();
  };

  // Handlers for payment events
  const handlePaymentSuccess = (captureResult) => {
    setPaymentSuccessData(captureResult);
    setPaymentPendingData(null);
  };

  const handlePaymentPending = (pendingResult) => {
    setPaymentPendingData(pendingResult);
    setPaymentSuccessData(null);
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

        {/* State 3: Payment Successfully Completed (State 14) */}
        {!loading && !errorState && paymentSuccessData && (
          <Card variant="raised-lg" className="p-6 sm:p-8 text-center space-y-6">
            <div className="h-16 w-16 rounded-2xl bg-[#DCFCE7] border border-[#86EFAC] text-[#15803D] flex items-center justify-center mx-auto shadow-raised-sm">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <div className="space-y-1.5">
              <Badge variant="success" size="md" dot>
                Payment Confirmed
              </Badge>
              <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight pt-1">
                Thank You for Your Payment!
              </h2>
              <p className="text-xs text-[#64748B]">
                Your transaction has been captured and settled with the merchant.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-3 text-left text-xs">
              <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B]">Amount Settled</span>
                <span className="font-mono font-bold text-base text-[#172033]">
                  {formatCurrency(paymentSuccessData.amount || invoice?.amount, paymentSuccessData.currency || invoice?.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                <span className="text-[#64748B]">Invoice Status</span>
                <span className="font-bold text-[#15803D]">PAID</span>
              </div>
              {paymentSuccessData.captureId && (
                <div className="flex justify-between items-center py-1 border-b border-[#CBD5E1]/40">
                  <span className="text-[#64748B]">PayPal Reference</span>
                  <span className="font-mono text-[#172033]">{paymentSuccessData.captureId}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1">
                <span className="text-[#64748B]">Payment Date</span>
                <span className="text-[#172033]">{formatDate(paymentSuccessData.capturedAt || new Date().toISOString())}</span>
              </div>
            </div>

            <p className="text-xs text-[#64748B]">
              A confirmation record has been registered with the merchant. You may save or print this page for your records.
            </p>
          </Card>
        )}

        {/* State 4: Payment Capture Pending Clearance (State 13 - eCheck) */}
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
                Your payment authorization was received by PayPal and is pending gateway clearance (such as an eCheck or standard bank transfer).
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

            <p className="text-xs text-[#64748B]">
              The merchant has been notified of your in-flight payment. Your invoice will update to PAID automatically once funds clear.
            </p>
          </Card>
        )}

        {/* State 5: Active Payable Invoice Checkout (State 2) */}
        {!loading && !errorState && !paymentSuccessData && !paymentPendingData && invoice && (
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
                  <span className="text-[11px] text-[#64748B]">Official PayPal Checkout</span>
                </div>

                <PayPalCheckout
                  token={token}
                  currency={invoice.currency}
                  amount={invoice.amount}
                  onPaymentSuccess={handlePaymentSuccess}
                  onPaymentPending={handlePaymentPending}
                  onPaymentFailed={(err) => {
                    // Optional local handling
                  }}
                  onPaymentCancelled={(data) => {
                    // Optional local handling
                  }}
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
