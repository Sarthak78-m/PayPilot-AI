"use client";

import React, { useState, useId } from "react";
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
  Textarea,
  Select,
} from "@/components/ui";
import {
  FileText,
  Plus,
  ArrowLeft,
  Calendar,
  AlertCircle,
  CheckCircle2,
  User,
  Mail,
  RefreshCw,
} from "@/components/icons";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUPPORTED_CURRENCIES = [
  { value: "USD", label: "USD ($) - US Dollar" },
  { value: "EUR", label: "EUR (€) - Euro" },
  { value: "GBP", label: "GBP (£) - British Pound" },
  { value: "CAD", label: "CAD ($) - Canadian Dollar" },
  { value: "AUD", label: "AUD ($) - Australian Dollar" },
  { value: "INR", label: "INR (₹) - Indian Rupee" },
];

const CURRENCY_SYMBOLS = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  INR: "₹",
};

export default function NewInvoicePage() {
  const router = useRouter();

  // Form State
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_email: "",
    description: "",
    amount: "",
    currency: "USD",
    due_date: "",
  });

  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const [is401, setIs401] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Field change handler
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear field-specific error as user types
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }

    if (generalError) {
      setGeneralError(null);
    }
  };

  // Client-side validation consistent with src/lib/invoices/validation.js
  const validateForm = () => {
    const newErrors = {};

    // customer_name (required: 1-200 chars)
    const trimmedName = formData.customer_name.trim();
    if (!trimmedName) {
      newErrors.customer_name = "Customer name is required.";
    } else if (trimmedName.length > 200) {
      newErrors.customer_name = "Customer name must not exceed 200 characters.";
    }

    // customer_email (optional: valid email format if provided)
    const trimmedEmail = formData.customer_email.trim();
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail.toLowerCase())) {
      newErrors.customer_email = "Enter a valid email address (e.g. billing@client.com).";
    }

    // description (required: 1-1000 chars)
    const trimmedDesc = formData.description.trim();
    if (!trimmedDesc) {
      newErrors.description = "Invoice description is required.";
    } else if (trimmedDesc.length > 1000) {
      newErrors.description = "Description must not exceed 1000 characters.";
    }

    // amount (required: positive finite number, max 2 decimals, max 9999999999.99)
    const rawAmount = formData.amount.trim();
    const numAmount = Number(rawAmount);
    if (!rawAmount || isNaN(numAmount)) {
      newErrors.amount = "Enter a valid numeric amount.";
    } else if (numAmount <= 0) {
      newErrors.amount = "Amount must be greater than zero.";
    } else if (Math.round(numAmount * 100) !== numAmount * 100) {
      newErrors.amount = "Amount can have at most two decimal places.";
    } else if (numAmount > 9999999999.99) {
      newErrors.amount = "Amount exceeds the maximum allowable limit.";
    }

    // currency (required: supported currency)
    const validCurrencies = new Set(SUPPORTED_CURRENCIES.map((c) => c.value));
    if (!formData.currency || !validCurrencies.has(formData.currency.toUpperCase())) {
      newErrors.currency = "Please select a supported currency.";
    }

    // due_date (optional: valid YYYY-MM-DD if provided)
    const trimmedDueDate = formData.due_date.trim();
    if (trimmedDueDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDueDate)) {
        newErrors.due_date = "Due date must follow the YYYY-MM-DD format.";
      } else {
        const d = new Date(trimmedDueDate + "T00:00:00Z");
        if (isNaN(d.getTime())) {
          newErrors.due_date = "Invalid calendar date provided.";
        }
      }
    }

    return newErrors;
  };

  // Form submission handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (submitting) return;

    // Run client validation
    const clientValidationErrors = validateForm();
    if (Object.keys(clientValidationErrors).length > 0) {
      setErrors(clientValidationErrors);
      setGeneralError("Please review and resolve the highlighted errors below.");
      return;
    }

    setSubmitting(true);
    setGeneralError(null);
    setIs401(false);

    try {
      // Build strictly allowed payload — never send user_id, id, or status
      const payload = {
        customer_name: formData.customer_name.trim(),
        description: formData.description.trim(),
        amount: Number(formData.amount.trim()),
        currency: formData.currency.toUpperCase(),
      };

      if (formData.customer_email.trim()) {
        payload.customer_email = formData.customer_email.trim().toLowerCase();
      }

      if (formData.due_date.trim()) {
        payload.due_date = formData.due_date.trim();
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setIs401(true);
          setGeneralError("Your session has expired or you are unauthenticated. Please sign in.");
          return;
        }

        if (res.status === 400 && data.errors) {
          setErrors(data.errors);
          setGeneralError(data.message || "Invoice validation failed on server.");
          return;
        }

        setGeneralError(data.message || `Failed to create invoice (HTTP ${res.status}).`);
        return;
      }

      // Success
      setSuccess(true);
      // Navigate to invoice listing page
      setTimeout(() => {
        router.push("/invoices");
      }, 800);
    } catch (err) {
      setGeneralError("Network connection error. Unable to reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formattedAmountPreview = () => {
    const val = Number(formData.amount);
    const sym = CURRENCY_SYMBOLS[formData.currency] || formData.currency;
    if (!formData.amount || isNaN(val)) return `${sym} 0.00`;
    return `${sym} ${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
              Create New Invoice
            </h1>
            <Badge variant="primary" size="sm">
              Manual Form
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Set up an invoice draft with client information, billing amount, and due date.
          </p>
        </div>

        <Link href="/invoices">
          <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
            Back to Invoices
          </Button>
        </Link>
      </div>

      {/* Session Expired (401) Alert */}
      {is401 && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-raised-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <span className="font-semibold">{generalError}</span>
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

      {/* General Error Banner */}
      {!is401 && generalError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 shadow-raised-sm">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span className="font-medium">{generalError}</span>
        </div>
      )}

      {/* Success Notification */}
      {success && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 shadow-raised-sm animate-pulse">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-bold">Invoice created successfully!</p>
            <p className="text-emerald-700">Redirecting to your invoice listing...</p>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Section 1: Customer Information */}
        <Card variant="raised-md" className="p-6 space-y-4">
          <div className="border-b border-[#CBD5E1]/40 pb-3">
            <h2 className="text-sm font-bold text-[#172033] uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-[#2563EB]" />
              1. Customer Information
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Specify the recipient individual or corporate entity for this invoice.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Customer Name"
              id="customer_name"
              name="customer_name"
              value={formData.customer_name}
              onChange={handleChange}
              placeholder="e.g. Acme Corporation or Jane Smith"
              required
              error={errors.customer_name}
              disabled={submitting || success}
              leadingIcon={User}
              maxLength={200}
            />

            <Input
              label="Customer Email"
              id="customer_email"
              name="customer_email"
              type="email"
              value={formData.customer_email}
              onChange={handleChange}
              placeholder="e.g. billing@acme.com (optional)"
              error={errors.customer_email}
              disabled={submitting || success}
              leadingIcon={Mail}
              helperText="Optional. Used for direct delivery notifications."
            />
          </div>
        </Card>

        {/* Section 2: Invoice Details */}
        <Card variant="raised-md" className="p-6 space-y-4">
          <div className="border-b border-[#CBD5E1]/40 pb-3">
            <h2 className="text-sm font-bold text-[#172033] uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#2563EB]" />
              2. Invoice Details
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Clearly summarize the work completed, services rendered, or items billed.
            </p>
          </div>

          <Textarea
            label="Invoice Description"
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="e.g. Full-stack web application development for Q4 milestones, including API integration and database migration."
            required
            rows={4}
            maxLength={1000}
            error={errors.description}
            disabled={submitting || success}
            helperText="Clear line item descriptions accelerate client approval and payment."
          />
        </Card>

        {/* Section 3: Amount and Currency */}
        <Card variant="raised-md" className="p-6 space-y-4">
          <div className="border-b border-[#CBD5E1]/40 pb-3">
            <h2 className="text-sm font-bold text-[#172033] uppercase tracking-wider flex items-center gap-2">
              <span className="font-bold text-[#2563EB]">$</span>
              3. Amount & Currency
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Enter the total receivable balance and select the settlement currency.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Amount"
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max="9999999999.99"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              required
              isCurrency={true}
              error={errors.amount}
              disabled={submitting || success}
              helperText="Positive value with up to 2 decimal places."
            />

            <Select
              label="Settlement Currency"
              id="currency"
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              options={SUPPORTED_CURRENCIES}
              required
              error={errors.currency}
              disabled={submitting || success}
              helperText="Supported ISO 4217 financial currencies."
            />
          </div>
        </Card>

        {/* Section 4: Payment Due Date */}
        <Card variant="raised-md" className="p-6 space-y-4">
          <div className="border-b border-[#CBD5E1]/40 pb-3">
            <h2 className="text-sm font-bold text-[#172033] uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#2563EB]" />
              4. Payment Due Date
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Set an agreed deadline for client payment (optional).
            </p>
          </div>

          <div className="max-w-md">
            <Input
              label="Due Date"
              id="due_date"
              name="due_date"
              type="date"
              value={formData.due_date}
              onChange={handleChange}
              error={errors.due_date}
              disabled={submitting || success}
              leadingIcon={Calendar}
              helperText="Leave blank if payment is expected immediately upon receipt."
            />
          </div>
        </Card>

        {/* Section 5: Review & Live Summary Card */}
        <Card variant="raised-sm" className="p-5 bg-[#E8EDF4]/60 border border-[#CBD5E1]/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                  Live Preview
                </span>
                <Badge variant="neutral" size="sm" dot>
                  Initial Status: Draft
                </Badge>
              </div>
              <p className="text-sm font-bold text-[#172033]">
                {formData.customer_name.trim() || "Client Name Unspecified"}
              </p>
              <p className="text-xs text-[#64748B]">
                {formData.customer_email.trim() || "No recipient email set"}
                {formData.due_date ? ` • Due on ${formData.due_date}` : " • Due on receipt"}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider block">
                Total Billed
              </span>
              <span className="text-2xl font-extrabold text-[#172033] font-mono">
                {formattedAmountPreview()}
              </span>
            </div>
          </div>
        </Card>

        {/* Action Controls */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
          <Link href="/invoices" className="w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={submitting || success}
            >
              Cancel
            </Button>
          </Link>

          <Button
            type="submit"
            variant="primary"
            className="w-full sm:w-auto shadow-primary-glow min-w-[160px]"
            disabled={submitting || success}
            icon={submitting ? RefreshCw : Plus}
            iconPosition="left"
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                Saving Invoice...
              </span>
            ) : (
              "Save Invoice"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
