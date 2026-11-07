"use client";

import React, { useState, useEffect } from "react";
import { Modal, Button, Input, Select, Divider, Badge } from "@/components/ui";
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowLeft,
} from "@/components/icons";
import { PayPalCheckout } from "./paypal-checkout";
import { PaymentReceiptModal } from "./payment-receipt-modal";
import {
  SUPPORTED_CURRENCIES,
  calculateTransactionFee,
  convertCurrency,
  formatCurrencyDisplay,
} from "@/lib/payments/currency";

const CATEGORY_OPTIONS = [
  { value: "Consulting", label: "Consulting Services" },
  { value: "Software Development", label: "Software & Engineering" },
  { value: "Design & Creative", label: "Design & Creative Services" },
  { value: "Subscription", label: "Software Subscription / SaaS" },
  { value: "Professional Services", label: "Professional & Legal Services" },
  { value: "Payment", label: "General Payment / Settlement" },
];

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((c) => ({
  value: c,
  label: `${c} (${c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : c === "INR" ? "₹" : "$"})`,
}));

export function InitiatePaymentModal({
  isOpen,
  onClose,
  onPaymentSuccess = () => {},
}) {
  const [step, setStep] = useState(1); // 1 = Form, 2 = PayPal Sandbox Checkout, 3 = Receipt
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState("Consulting");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [description, setDescription] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [initiating, setInitiating] = useState(false);
  const [formError, setFormError] = useState(null);
  const [initiatedTxn, setInitiatedTxn] = useState(null);
  const [capturedReceipt, setCapturedReceipt] = useState(null);

  // Fee and conversion calculation
  const amountNum = Number(amount) || 0;
  const feeCalc = amountNum > 0 ? calculateTransactionFee(amountNum, currency) : null;
  const conversionPreview =
    amountNum > 0 && currency === "INR"
      ? convertCurrency({ amount: feeCalc?.totalAmount || amountNum, fromCurrency: "INR", toCurrency: "USD" })
      : null;

  useEffect(() => {
    if (!isOpen) {
      // Reset form on close
      setStep(1);
      setAmount("");
      setCurrency("USD");
      setCategory("Consulting");
      setRecipientEmail("");
      setRecipientName("");
      setDescription("");
      setTermsAccepted(false);
      setInitiating(false);
      setFormError(null);
      setInitiatedTxn(null);
      setCapturedReceipt(null);
    }
  }, [isOpen]);

  const handleInitiateTransaction = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!amountNum || amountNum <= 0) {
      setFormError("Please enter a valid, positive payment amount.");
      return;
    }

    if (!termsAccepted) {
      setFormError("Please agree to the PayPilot payment terms and conditions.");
      return;
    }

    setInitiating(true);

    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          currency,
          category,
          recipientEmail: recipientEmail.trim() || null,
          recipientName: recipientName.trim() || null,
          description: description.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.data) {
        setFormError(data.error || "Failed to initialize payment transaction.");
        setInitiating(false);
        return;
      }

      setInitiatedTxn(data.data);
      setStep(2); // Move to PayPal Checkout
    } catch {
      setFormError("Network error while connecting to payment service. Please try again.");
    } finally {
      setInitiating(false);
    }
  };

  const handleCaptureSuccess = (captureData) => {
    const fullReceipt = {
      ...initiatedTxn,
      ...captureData,
      internalReference: initiatedTxn?.internalReference || captureData.internalReference,
      amount: captureData.amount || initiatedTxn?.totalAmount || initiatedTxn?.amount,
      currency: captureData.currency || initiatedTxn?.currency,
      fee: initiatedTxn?.fee,
      capturedAt: captureData.capturedAt || new Date().toISOString(),
      status: "COMPLETED",
    };

    setCapturedReceipt(fullReceipt);
    setStep(3); // Receipt step
    onPaymentSuccess(fullReceipt);
  };

  return (
    <>
      <Modal
        isOpen={isOpen && step !== 3}
        onClose={onClose}
        title={step === 1 ? "Initiate New Payment" : "PayPal Sandbox Checkout"}
        description={
          step === 1
            ? "Enter payment details and review calculated fees before checkout"
            : `Authorizing transaction ${initiatedTxn?.internalReference || ""}`
        }
        maxWidth="max-w-lg"
      >
        {/* Step 1: Form & Fee Review */}
        {step === 1 && (
          <form onSubmit={handleInitiateTransaction} className="space-y-4 pt-1 text-xs">
            {formError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider mb-1">
                  Payment Category
                </label>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  options={CATEGORY_OPTIONS}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider mb-1">
                  Currency
                </label>
                <Select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  options={CURRENCY_OPTIONS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider mb-1">
                  Payment Amount
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider mb-1">
                  Recipient Name (Optional)
                </label>
                <Input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="e.g. Acme Corp / Jane Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider mb-1">
                Recipient Email (Optional)
              </label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#172033] uppercase tracking-wider mb-1">
                Description / Memo
              </label>
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Monthly cloud consulting retainer"
              />
            </div>

            {/* Transaction Fee & Payable Summary Breakdown */}
            {amountNum > 0 && feeCalc && (
              <div className="p-3.5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
                  Authoritative Backend Financial Breakdown
                </span>

                <div className="flex justify-between items-center py-0.5 border-b border-[#CBD5E1]/40">
                  <span className="text-[#64748B]">Requested Amount:</span>
                  <span className="font-mono font-semibold text-[#172033]">
                    {formatCurrencyDisplay(feeCalc.baseAmount, currency)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-0.5 border-b border-[#CBD5E1]/40">
                  <span className="text-[#64748B]">Applicable PayPal Fee (2.9% + fixed):</span>
                  <span className="font-mono text-[#64748B]">
                    +{formatCurrencyDisplay(feeCalc.fee, currency)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-1 font-bold">
                  <span className="text-[#172033]">Final Payable Amount:</span>
                  <span className="font-mono text-sm text-[#16A34A]">
                    {formatCurrencyDisplay(feeCalc.totalAmount, currency)}
                  </span>
                </div>

                {/* Currency Conversion Display (Part H requirement) */}
                {conversionPreview && conversionPreview.requiresConversion && (
                  <div className="mt-2 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] space-y-1">
                    <div className="flex justify-between text-amber-900 font-semibold">
                      <span>Original Displayed (INR):</span>
                      <span className="font-mono">₹{amountNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-amber-800">
                      <span>Server Reference Exchange Rate:</span>
                      <span className="font-mono">1 USD = {conversionPreview.exchangeRate} INR</span>
                    </div>
                    <div className="flex justify-between text-amber-900 font-bold border-t border-amber-200 pt-1">
                      <span>PayPal Sandbox Transaction:</span>
                      <span className="font-mono">${conversionPreview.convertedAmount.toFixed(2)} USD</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Terms and Conditions Acceptance */}
            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 rounded text-[#2563EB] focus:ring-[#2563EB]"
              />
              <label htmlFor="terms" className="text-[11px] text-[#64748B] leading-tight cursor-pointer">
                I review and accept the PayPilot AI payment terms, fee schedule, and authorize Sandbox payment processing via PayPal Developer Gateway.
              </label>
            </div>

            <Divider />

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={initiating || amountNum <= 0 || !termsAccepted}
              >
                {initiating ? "Creating Transaction..." : "Proceed to PayPal Checkout →"}
              </Button>
            </div>
          </form>
        )}

        {/* Step 2: PayPal Sandbox Checkout */}
        {step === 2 && initiatedTxn && (
          <div className="space-y-4 pt-1 text-xs">
            {/* Transaction Summary Card */}
            <div className="p-3.5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                  Transaction Summary
                </span>
                <span className="font-mono font-bold text-[#2563EB] text-[11px]">
                  {initiatedTxn.internalReference}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm font-extrabold text-[#172033]">
                <span>Payable Amount</span>
                <span className="font-mono text-[#16A34A]">
                  {formatCurrencyDisplay(initiatedTxn.totalAmount, initiatedTxn.currency)}
                </span>
              </div>

              {initiatedTxn.recipientName || initiatedTxn.recipientEmail ? (
                <div className="text-[11px] text-[#64748B]">
                  Payee: <span className="font-semibold text-[#172033]">{initiatedTxn.recipientName || initiatedTxn.recipientEmail}</span>
                </div>
              ) : null}
            </div>

            {/* Official PayPal Checkout Buttons */}
            <div className="pt-2">
              <PayPalCheckout
                transactionId={initiatedTxn.id}
                amount={initiatedTxn.totalAmount}
                currency={initiatedTxn.currency}
                onPaymentSuccess={handleCaptureSuccess}
                onPaymentFailed={(err) => setFormError(err.error || "Payment failed")}
              />
            </div>

            <div className="pt-2 flex justify-start">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                icon={ArrowLeft}
                iconPosition="left"
              >
                Back to Details
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Step 3: Verified Authentic Receipt Modal */}
      {step === 3 && capturedReceipt && (
        <PaymentReceiptModal
          isOpen={true}
          onClose={onClose}
          payment={capturedReceipt}
        />
      )}
    </>
  );
}
