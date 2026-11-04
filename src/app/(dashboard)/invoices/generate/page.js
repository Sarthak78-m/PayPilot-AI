"use client";

import React, { useState } from "react";
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
  Sparkles,
  ArrowLeft,
  Calendar,
  AlertCircle,
  CheckCircle2,
  User,
  Mail,
  FileText,
  RefreshCw,
  Plus,
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

const EXAMPLE_PROMPTS = [
  "Invoice Acme Corp $3,200 for Q4 cybersecurity audit and penetration testing, due Dec 15, 2026, billing@acme.com",
  "Bill Wayne Enterprises $4,500 for AI consulting and infrastructure setup due December 31, 2026",
  "Full-stack React web design for Stark Industries, amount 8,500 USD payable by next month",
];

export default function AIInvoiceGeneratePage() {
  const router = useRouter();

  // Workflow steps: "prompt" -> "review"
  const [step, setStep] = useState("prompt");

  // Prompt input
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);

  // Gemini extracted data & review state
  const [extractedData, setExtractedData] = useState({
    customer_name: "",
    customer_email: "",
    description: "",
    amount: "",
    currency: "USD",
    due_date: "",
  });

  const [missingFields, setMissingFields] = useState([]);
  const [clarificationNotes, setClarificationNotes] = useState(null);

  // Review form validation & persistence state
  const [formErrors, setFormErrors] = useState({});
  const [persistError, setPersistError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [is401, setIs401] = useState(false);

  // Handle example prompt selection
  const handleSelectExample = (exampleText) => {
    setPrompt(exampleText);
    setGenerationError(null);
  };

  // Step 1: Call Gemini generation endpoint
  const handleGenerate = async (e) => {
    if (e) e.preventDefault();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setGenerationError("Please enter a natural-language invoice description before generating.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setIs401(false);

    try {
      const res = await fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setIs401(true);
          setGenerationError("Your session has expired. Please sign in to generate invoices.");
          return;
        }

        setGenerationError(
          body.message || `AI invoice generation failed (HTTP ${res.status}). Please try again.`
        );
        return;
      }

      if (body.status === "ok" && body.data) {
        const { draft, missing_fields = [], clarification_notes = null } = body.data;

        // Populate review form with extracted data without hallucinating missing values
        setExtractedData({
          customer_name: draft?.customer_name || "",
          customer_email: draft?.customer_email || "",
          description: draft?.description || "",
          amount: draft?.amount !== null && draft?.amount !== undefined ? String(draft.amount) : "",
          currency: draft?.currency || "USD",
          due_date: draft?.due_date || "",
        });

        setMissingFields(Array.isArray(missing_fields) ? missing_fields : []);
        setClarificationNotes(clarification_notes);
        setFormErrors({});
        setPersistError(null);
        setStep("review");
      } else {
        setGenerationError(body.message || "Failed to parse AI generation response.");
      }
    } catch {
      setGenerationError("Network error. Unable to contact AI generation service. Please check your connection.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Field change handler in review form
  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setExtractedData((prev) => ({ ...prev, [name]: value }));

    // Clear field-specific error
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }

    // Remove from missing fields badge if user filled it
    if (value.trim()) {
      setMissingFields((prev) => prev.filter((f) => f !== name));
    }

    if (persistError) {
      setPersistError(null);
    }
  };

  // Client-side validation for review form
  const validateReviewForm = () => {
    const errors = {};

    const trimmedName = extractedData.customer_name.trim();
    if (!trimmedName) {
      errors.customer_name = "Customer name is required.";
    } else if (trimmedName.length > 200) {
      errors.customer_name = "Customer name must not exceed 200 characters.";
    }

    const trimmedEmail = extractedData.customer_email.trim();
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail.toLowerCase())) {
      errors.customer_email = "Enter a valid email address.";
    }

    const trimmedDesc = extractedData.description.trim();
    if (!trimmedDesc) {
      errors.description = "Invoice description is required.";
    } else if (trimmedDesc.length > 1000) {
      errors.description = "Description must not exceed 1000 characters.";
    }

    const rawAmount = extractedData.amount.trim();
    const numAmount = Number(rawAmount);
    if (!rawAmount || isNaN(numAmount)) {
      errors.amount = "Enter a valid numeric amount.";
    } else if (numAmount <= 0) {
      errors.amount = "Amount must be greater than zero.";
    } else if (Math.round(numAmount * 100) !== numAmount * 100) {
      errors.amount = "Amount can have at most two decimal places.";
    } else if (numAmount > 9999999999.99) {
      errors.amount = "Amount exceeds the allowable limit.";
    }

    const validCurrencies = new Set(SUPPORTED_CURRENCIES.map((c) => c.value));
    if (!extractedData.currency || !validCurrencies.has(extractedData.currency.toUpperCase())) {
      errors.currency = "Select a supported currency.";
    }

    const trimmedDate = extractedData.due_date.trim();
    if (trimmedDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        errors.due_date = "Due date must follow the YYYY-MM-DD format.";
      } else {
        const d = new Date(trimmedDate + "T00:00:00Z");
        if (isNaN(d.getTime())) {
          errors.due_date = "Invalid calendar date.";
        }
      }
    }

    return errors;
  };

  // Step 2: Explicit user confirmation & final persistence
  const handleConfirmAndSave = async (e) => {
    e.preventDefault();

    if (isSaving) return;

    const validationErrors = validateReviewForm();
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      setPersistError("Please fill in all required fields and correct highlighted errors.");
      return;
    }

    setIsSaving(true);
    setPersistError(null);
    setIs401(false);

    try {
      // Build strictly allowed payload — never send user_id, id, or status
      const payload = {
        customer_name: extractedData.customer_name.trim(),
        description: extractedData.description.trim(),
        amount: Number(extractedData.amount.trim()),
        currency: extractedData.currency.toUpperCase(),
      };

      if (extractedData.customer_email.trim()) {
        payload.customer_email = extractedData.customer_email.trim().toLowerCase();
      }

      if (extractedData.due_date.trim()) {
        payload.due_date = extractedData.due_date.trim();
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setIs401(true);
          setPersistError("Your session has expired. Please sign in to save invoices.");
          return;
        }

        if (res.status === 400 && body.errors) {
          setFormErrors(body.errors);
          setPersistError(body.message || "Invoice validation failed on the server.");
          return;
        }

        setPersistError(body.message || `Failed to save invoice (HTTP ${res.status}).`);
        return;
      }

      // Success
      setIsSaved(true);
      setTimeout(() => {
        router.push("/invoices");
      }, 800);
    } catch {
      setPersistError("Network connection error. Unable to reach server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const formattedAmountPreview = () => {
    const val = Number(extractedData.amount);
    const sym = CURRENCY_SYMBOLS[extractedData.currency] || extractedData.currency;
    if (!extractedData.amount || isNaN(val)) return `${sym} 0.00`;
    return `${sym} ${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
              AI Invoice Generator
            </h1>
            <Badge variant="primary" size="sm">
              Gemini 2.5 Flash
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Describe client work in plain English to extract structured line items and billing details.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/invoices/new">
            <Button variant="outline" size="sm" icon={Plus} iconPosition="left">
              Create Manually
            </Button>
          </Link>
          <Link href="/invoices">
            <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
              Invoices
            </Button>
          </Link>
        </div>
      </div>

      {/* Session Expired (401) Alert */}
      {is401 && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-raised-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <span className="font-semibold">
              {generationError || persistError || "Your session has expired. Please sign in."}
            </span>
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

      {/* Persistence Success Banner */}
      {isSaved && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 shadow-raised-sm animate-pulse">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-bold">Invoice created and saved successfully!</p>
            <p className="text-emerald-700">Redirecting to your invoice listing...</p>
          </div>
        </div>
      )}

      {/* WORKFLOW VIEW: PROMPT INPUT */}
      {step === "prompt" && (
        <div className="space-y-6">
          {/* Generation Error Alert */}
          {!is401 && generationError && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-3 shadow-raised-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{generationError}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="shrink-0"
              >
                Retry
              </Button>
            </div>
          )}

          <Card variant="raised-lg" className="p-6 space-y-5">
            <div className="border-b border-[#CBD5E1]/40 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#2563EB]" />
                <h2 className="text-base font-bold text-[#172033]">
                  Describe Your Transaction
                </h2>
              </div>
              <p className="text-xs text-[#64748B] mt-1">
                Enter client name, amount, scope of work, settlement currency, and due date in plain language.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="invoice-prompt"
                className="text-xs font-semibold uppercase tracking-wider text-[#172033]"
              >
                Invoice Prompt Description *
              </label>
              <textarea
                id="invoice-prompt"
                rows={5}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  if (generationError) setGenerationError(null);
                }}
                disabled={isGenerating}
                placeholder="e.g. Bill Acme Corp $4,500 USD for Q4 cybersecurity audit and penetration testing. Send to billing@acme.com, payment due on Dec 31, 2026."
                className="w-full bg-[#E8EDF4] text-[#172033] placeholder-[#94A3B8] text-sm rounded-xl p-3.5 shadow-inset-sm transition-all duration-150 focus:outline-none border border-[#D1D8E2] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB] resize-y"
              />
              <div className="flex justify-between items-center text-[11px] text-[#64748B]">
                <span>Gemini strictly extracts stated facts and will not fabricate missing values.</span>
                <span>{prompt.length} / 5000 chars</span>
              </div>
            </div>

            {/* Example Prompt Shortcuts */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-semibold text-[#172033] block">
                Quick Example Prompts:
              </span>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((ex, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectExample(ex)}
                    disabled={isGenerating}
                    className="text-left text-xs bg-[#E8EDF4] hover:bg-[#DCE3EC] text-[#172033] px-3 py-2 rounded-xl border border-[#CBD5E1]/60 shadow-raised-sm hover:shadow-raised transition-all disabled:opacity-50"
                  >
                    &ldquo;{ex}&rdquo;
                  </button>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#CBD5E1]/40">
              <Link href="/invoices">
                <Button variant="secondary" size="md" disabled={isGenerating}>
                  Cancel
                </Button>
              </Link>

              <Button
                variant="primary"
                size="md"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                icon={isGenerating ? RefreshCw : Sparkles}
                iconPosition="left"
                className="shadow-primary-glow min-w-[200px]"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-1.5">
                    Analyzing with Gemini...
                  </span>
                ) : (
                  "Generate Invoice Draft"
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* WORKFLOW VIEW: DRAFT REVIEW & CONFIRMATION */}
      {step === "review" && (
        <form onSubmit={handleConfirmAndSave} noValidate className="space-y-6">
          {/* Status Banners */}
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-start gap-3 shadow-raised-sm">
            <Sparkles className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-bold">Draft Generated with Gemini AI</p>
                <Badge variant="neutral" size="sm" dot>
                  Unsaved Draft
                </Badge>
              </div>
              <p className="text-blue-700">
                Review and modify the extracted fields below. The invoice will only be saved when you explicitly confirm.
              </p>
            </div>
          </div>

          {/* Missing Fields Indicator */}
          {missingFields.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3 shadow-raised-sm">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Incomplete Information Detected</p>
                <p className="text-amber-800">
                  The description was missing key details:{" "}
                  <span className="font-semibold underline">
                    {missingFields.join(", ")}
                  </span>
                  . Please complete these fields below before saving.
                </p>
              </div>
            </div>
          )}

          {/* Clarification Notes */}
          {clarificationNotes && (
            <div className="p-3.5 rounded-xl bg-[#E8EDF4] border border-[#CBD5E1]/60 text-xs text-[#172033] flex items-center gap-2">
              <Badge variant="primary" size="sm">
                AI Note
              </Badge>
              <span className="text-[#64748B]">{clarificationNotes}</span>
            </div>
          )}

          {/* Persistence Error Banner */}
          {!is401 && persistError && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 shadow-raised-sm">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span className="font-medium">{persistError}</span>
            </div>
          )}

          {/* Section 1: Customer Information */}
          <Card variant="raised-md" className="p-6 space-y-4">
            <div className="border-b border-[#CBD5E1]/40 pb-3">
              <h2 className="text-sm font-bold text-[#172033] uppercase tracking-wider flex items-center gap-2">
                <User className="h-4 w-4 text-[#2563EB]" />
                1. Customer Information
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Customer Name"
                id="customer_name"
                name="customer_name"
                value={extractedData.customer_name}
                onChange={handleFieldChange}
                placeholder="e.g. Acme Corporation"
                required
                error={formErrors.customer_name}
                disabled={isSaving || isSaved}
                leadingIcon={User}
                maxLength={200}
                helperText={
                  missingFields.includes("customer_name")
                    ? "Required: not specified in original prompt."
                    : undefined
                }
              />

              <Input
                label="Customer Email"
                id="customer_email"
                name="customer_email"
                type="email"
                value={extractedData.customer_email}
                onChange={handleFieldChange}
                placeholder="e.g. billing@acme.com (optional)"
                error={formErrors.customer_email}
                disabled={isSaving || isSaved}
                leadingIcon={Mail}
                helperText="Optional. Recipient billing address."
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
            </div>

            <Textarea
              label="Invoice Description"
              id="description"
              name="description"
              value={extractedData.description}
              onChange={handleFieldChange}
              placeholder="Summary of services rendered..."
              required
              rows={4}
              maxLength={1000}
              error={formErrors.description}
              disabled={isSaving || isSaved}
              helperText={
                missingFields.includes("description")
                  ? "Required: specify scope of work."
                  : "Extracted from prompt. You can freely edit or expand."
              }
            />
          </Card>

          {/* Section 3: Amount & Currency */}
          <Card variant="raised-md" className="p-6 space-y-4">
            <div className="border-b border-[#CBD5E1]/40 pb-3">
              <h2 className="text-sm font-bold text-[#172033] uppercase tracking-wider flex items-center gap-2">
                <span className="font-bold text-[#2563EB]">$</span>
                3. Amount & Settlement Currency
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Total Amount"
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max="9999999999.99"
                value={extractedData.amount}
                onChange={handleFieldChange}
                placeholder="0.00"
                required
                isCurrency={true}
                error={formErrors.amount}
                disabled={isSaving || isSaved}
                helperText={
                  missingFields.includes("amount")
                    ? "Required: amount was missing or ambiguous."
                    : "Numeric value with up to 2 decimal places."
                }
              />

              <Select
                label="Settlement Currency"
                id="currency"
                name="currency"
                value={extractedData.currency}
                onChange={handleFieldChange}
                options={SUPPORTED_CURRENCIES}
                required
                error={formErrors.currency}
                disabled={isSaving || isSaved}
                helperText="Supported ISO 4217 settlement currency."
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
            </div>

            <div className="max-w-md">
              <Input
                label="Due Date"
                id="due_date"
                name="due_date"
                type="date"
                value={extractedData.due_date}
                onChange={handleFieldChange}
                error={formErrors.due_date}
                disabled={isSaving || isSaved}
                leadingIcon={Calendar}
                helperText="Optional. Leave blank if payable upon receipt."
              />
            </div>
          </Card>

          {/* Section 5: Live Summary Preview Card */}
          <Card variant="raised-sm" className="p-5 bg-[#E8EDF4]/60 border border-[#CBD5E1]/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                    Invoice Preview
                  </span>
                  <Badge variant="neutral" size="sm" dot>
                    Initial Status: Draft
                  </Badge>
                </div>
                <p className="text-sm font-bold text-[#172033]">
                  {extractedData.customer_name.trim() || "Customer Unspecified"}
                </p>
                <p className="text-xs text-[#64748B]">
                  {extractedData.customer_email.trim() || "No recipient email set"}
                  {extractedData.due_date ? ` • Due on ${extractedData.due_date}` : " • Due on receipt"}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider block">
                  Total Receivable
                </span>
                <span className="text-2xl font-extrabold text-[#172033] font-mono">
                  {formattedAmountPreview()}
                </span>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("prompt")}
              disabled={isSaving || isSaved}
              icon={ArrowLeft}
              iconPosition="left"
            >
              Back to Prompt
            </Button>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Link href="/invoices" className="w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={isSaving || isSaved}
                >
                  Discard
                </Button>
              </Link>

              <Button
                type="submit"
                variant="primary"
                className="w-full sm:w-auto shadow-primary-glow min-w-[200px]"
                disabled={isSaving || isSaved}
                icon={isSaving ? RefreshCw : CheckCircle2}
                iconPosition="left"
              >
                {isSaving ? (
                  <span className="flex items-center gap-1.5">
                    Saving to Database...
                  </span>
                ) : (
                  "Confirm & Save Invoice"
                )}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
