"use client";

import React, { useState } from "react";
import {
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Modal,
  Tooltip,
  Divider,
  Skeleton,
  EmptyState,
  ThemeToggle,
} from "@/components/ui";

export default function DesignSystemPreviewPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [inputValue, setInputValue] = useState("2,450.00");
  const [textareaValue, setTextareaValue] = useState("Invoice for Q1 UX/UI design sprints and component library authoring.");
  const [selectedCurrency, setSelectedCurrency] = useState("USD");

  return (
    <main className="min-h-screen bg-[#E8EDF4] text-[#172033] py-10 px-4 sm:px-6 lg:px-12 max-w-7xl mx-auto space-y-12">
      {/* Page Header */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[#2563EB]">
              Design System Foundation • Stage 1
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#172033] mt-1">
              PayPilot AI — Component & Token Primitives
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle variant="pill" size="md" />
            <Badge variant="primary" size="md" dot>
              Modern Neumorphism + Minimalist Fintech
            </Badge>
          </div>
        </div>
        <p className="text-sm sm:text-base text-[#64748B] max-w-3xl leading-relaxed">
          Standardized visual tokens, typography scale, tactile neumorphic surfaces, and accessible UI primitives for enterprise-grade invoicing and payment workflows.
        </p>
      </header>

      <Divider />

      {/* 1. Color Palette Tokens */}
      <section className="space-y-4" aria-labelledby="section-colors">
        <h2 id="section-colors" className="text-xl font-bold tracking-tight text-[#172033]">
          1. Color Palette & Semantic Tokens
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {[
            { name: "Background / Surface", hex: "#E8EDF4", bg: "bg-[#E8EDF4]", text: "text-[#172033]", border: "border border-[#D1D8E2]" },
            { name: "Primary Action", hex: "#2563EB", bg: "bg-[#2563EB]", text: "text-white" },
            { name: "Primary Hover", hex: "#1D4ED8", bg: "bg-[#1D4ED8]", text: "text-white" },
            { name: "Text Primary", hex: "#172033", bg: "bg-[#172033]", text: "text-white" },
            { name: "Text Secondary", hex: "#64748B", bg: "bg-[#64748B]", text: "text-white" },
            { name: "Status: Success (Paid)", hex: "#16A34A", bg: "bg-[#16A34A]", text: "text-white" },
            { name: "Status: Warning (Pending)", hex: "#F59E0B", bg: "bg-[#F59E0B]", text: "text-white" },
            { name: "Status: Error (Overdue)", hex: "#DC2626", bg: "bg-[#DC2626]", text: "text-white" },
            { name: "Border Subtle", hex: "#D1D8E2", bg: "bg-[#D1D8E2]", text: "text-[#172033]" },
            { name: "Disabled Container", hex: "#DCE3EC", bg: "bg-[#DCE3EC]", text: "text-[#64748B]" },
          ].map((token) => (
            <Card key={token.name} variant="raised-sm" className="p-3.5 flex flex-col gap-2">
              <div className={`h-12 w-full rounded-lg ${token.bg} ${token.border || ""} shadow-inset-sm flex items-center justify-center`}>
                <span className={`text-[11px] font-mono font-semibold ${token.text}`}>{token.hex}</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#172033] truncate">{token.name}</p>
                <p className="text-[11px] text-[#64748B] font-mono">{token.hex}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 2. Neumorphic Shadow Elevations */}
      <section className="space-y-4" aria-labelledby="section-shadows">
        <h2 id="section-shadows" className="text-xl font-bold tracking-tight text-[#172033]">
          2. Neumorphic Elevation & Shadow System
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <Card variant="raised" className="text-center">
            <h3 className="font-semibold text-sm">Raised Surface</h3>
            <p className="text-xs text-[#64748B] mt-1">Cards & main widgets</p>
            <code className="text-[11px] font-mono block mt-2 text-[#2563EB]">8px 8px 16px #c5cad1</code>
          </Card>

          <Card variant="raised-sm" className="text-center">
            <h3 className="font-semibold text-sm">Raised Small</h3>
            <p className="text-xs text-[#64748B] mt-1">Buttons & control items</p>
            <code className="text-[11px] font-mono block mt-2 text-[#2563EB]">4px 4px 8px #c5cad1</code>
          </Card>

          <Card variant="inset" className="text-center">
            <h3 className="font-semibold text-sm">Inset Depressed</h3>
            <p className="text-xs text-[#64748B] mt-1">Inputs & active wells</p>
            <code className="text-[11px] font-mono block mt-2 text-[#2563EB]">inset 5px 5px 10px</code>
          </Card>

          <div className="bg-[#2563EB] text-white p-5 sm:p-6 rounded-2xl shadow-primary-glow text-center flex flex-col justify-center">
            <h3 className="font-semibold text-sm">Primary Glow</h3>
            <p className="text-xs text-blue-100 mt-1">Key fintech actions</p>
            <code className="text-[11px] font-mono block mt-2 text-white">0 4px 14px rgba(37,99,235)</code>
          </div>
        </div>
      </section>

      {/* 3. Typography Scale & Financial Figures */}
      <section className="space-y-4" aria-labelledby="section-typography">
        <h2 id="section-typography" className="text-xl font-bold tracking-tight text-[#172033]">
          3. Typography System & Tabular Financial Figures
        </h2>
        <Card variant="raised" className="space-y-6">
          <div className="border-b border-[#CBD5E1]/60 pb-4">
            <span className="text-xs font-mono text-[#64748B]">Display Heading (36px / 700)</span>
            <p className="text-3xl sm:text-4xl font-extrabold text-[#172033] tracking-tight mt-1">
              $148,920.50 <span className="text-sm font-semibold text-[#16A34A] tracking-normal">+18.4% this month</span>
            </p>
          </div>

          <div className="border-b border-[#CBD5E1]/60 pb-4">
            <span className="text-xs font-mono text-[#64748B]">Page Heading (24px / 700)</span>
            <p className="text-2xl font-bold text-[#172033] mt-1">Invoices & Accounts Receivable</p>
          </div>

          <div className="border-b border-[#CBD5E1]/60 pb-4">
            <span className="text-xs font-mono text-[#64748B]">Section & Card Headings (18px / 600)</span>
            <p className="text-lg font-semibold text-[#172033] mt-1">Recent Client Transactions</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-xs font-mono text-[#64748B]">Body Text (14px / 400)</span>
              <p className="text-sm text-[#172033] leading-relaxed mt-1">
                PayPilot automatically reconciles incoming PayPal Sandbox payments with outstanding invoice line items, calculating localized tax liabilities and overdue interest.
              </p>
            </div>
            <div>
              <span className="text-xs font-mono text-[#64748B]">Secondary & Meta Text (12px / 400)</span>
              <p className="text-xs text-[#64748B] leading-relaxed mt-1">
                Invoice INV-2026-089 was sent to client on Oct 24, 2026. Payment terms: Net 30.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* 4. Button Primitives */}
      <section className="space-y-4" aria-labelledby="section-buttons">
        <h2 id="section-buttons" className="text-xl font-bold tracking-tight text-[#172033]">
          4. Button Primitives & Interactive States
        </h2>
        <Card variant="raised" className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Variants</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary Action</Button>
              <Button variant="secondary">Secondary Action</Button>
              <Button variant="outline">Outline Action</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Sizes & Icons</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary">Small</Button>
              <Button size="md" variant="secondary">Medium (Default)</Button>
              <Button size="lg" variant="primary">Large Action</Button>
              <Button
                variant="secondary"
                icon={() => (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                )}
              >
                Create Invoice
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Filter"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">States</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" loading>Processing</Button>
              <Button variant="secondary" loading>Saving</Button>
              <Button variant="primary" disabled>Disabled Primary</Button>
              <Button variant="secondary" disabled>Disabled Secondary</Button>
            </div>
          </div>
        </Card>
      </section>

      {/* 5. Form Primitives */}
      <section className="space-y-4" aria-labelledby="section-forms">
        <h2 id="section-forms" className="text-xl font-bold tracking-tight text-[#172033]">
          5. Form Input Primitives & Validation States
        </h2>
        <Card variant="raised">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Standard Input"
              placeholder="e.g. Acme Corporation"
              helperText="Enter the registered company name"
            />

            <Input
              label="Currency Amount (Financial)"
              isCurrency
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              helperText="Tabular number formatting enabled"
            />

            <Input
              label="Success State"
              defaultValue="client@stripe-verified.com"
              success
              helperText="Verified recipient email"
            />

            <Input
              label="Error State"
              defaultValue="invalid-tax-id"
              error="Tax ID must follow format XX-XXXXXXX"
            />

            <Select
              label="Currency / Settlement"
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              options={[
                { value: "USD", label: "USD — United States Dollar ($)" },
                { value: "EUR", label: "EUR — Euro (€)" },
                { value: "GBP", label: "GBP — British Pound (£)" },
                { value: "CAD", label: "CAD — Canadian Dollar ($)" },
              ]}
              helperText="Settlement currency for PayPal Sandbox"
            />

            <Input
              label="Disabled Input"
              disabled
              defaultValue="INV-2026-AUTOGEN"
              helperText="Auto-assigned invoice sequence identifier"
            />

            <div className="md:col-span-2">
              <Textarea
                label="Invoice Notes & Payment Instructions"
                rows={3}
                maxLength={200}
                value={textareaValue}
                onChange={(e) => setTextareaValue(e.target.value)}
                helperText="Will appear at the bottom of the client payment view."
              />
            </div>

            <div className="md:col-span-2 pt-2">
              <Checkbox
                label="Enable Instant PayPal Express Checkout"
                description="Allows your client to pay with PayPal or Credit/Debit card directly from the link."
                checked={checkboxChecked}
                onChange={(e) => setCheckboxChecked(e.target.checked)}
              />
            </div>
          </div>
        </Card>
      </section>

      {/* 6. Badges & Status Indicators */}
      <section className="space-y-4" aria-labelledby="section-badges">
        <h2 id="section-badges" className="text-xl font-bold tracking-tight text-[#172033]">
          6. Status Badges (Invoice Lifecycle)
        </h2>
        <Card variant="raised" className="flex flex-wrap items-center gap-4">
          <Badge variant="success" dot size="md">Paid</Badge>
          <Badge variant="warning" dot size="md">Pending Approval</Badge>
          <Badge variant="error" dot size="md">Overdue (14 days)</Badge>
          <Badge variant="neutral" dot size="md">Draft</Badge>
          <Badge variant="primary" dot size="md">AI Generated</Badge>
          <Divider orientation="vertical" className="h-6" />
          <Badge variant="success" size="sm">Small Paid</Badge>
          <Badge variant="warning" size="sm">Small Pending</Badge>
          <Badge variant="error" size="sm">Small Overdue</Badge>
        </Card>
      </section>

      {/* 7. Card & Container Surfaces */}
      <section className="space-y-4" aria-labelledby="section-cards">
        <h2 id="section-cards" className="text-xl font-bold tracking-tight text-[#172033]">
          7. Card Surfaces & Modular Layouts
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card variant="raised">
            <CardHeader>
              <CardTitle>Raised Card</CardTitle>
              <CardDescription>Default surface elevation for widgets</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[#64748B]">
                Dual light-and-dark drop shadows cast an extruded appearance off the #E8EDF4 canvas.
              </p>
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="secondary">Action</Button>
            </CardFooter>
          </Card>

          <Card variant="inset">
            <CardHeader>
              <CardTitle>Inset Well</CardTitle>
              <CardDescription>Depressed container for sub-data</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[#64748B]">
                Reversed internal shadows simulate a sunken receptacle, ideal for inputs and summary breakdown wells.
              </p>
            </CardContent>
            <CardFooter>
              <span className="text-xs font-mono font-semibold text-[#2563EB]">Subtotal: $1,200</span>
            </CardFooter>
          </Card>

          <Card variant="interactive" onClick={() => alert("Card clicked!")}>
            <CardHeader>
              <CardTitle>Interactive Card</CardTitle>
              <CardDescription>Clickable invoice summary card</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[#64748B]">
                Hover to elevate, click to trigger tactile depression. Perfect for invoice list items.
              </p>
            </CardContent>
            <CardFooter>
              <span className="text-xs font-semibold text-[#16A34A]">Click to test</span>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* 8. Modals, Tooltips & Skeletons */}
      <section className="space-y-4" aria-labelledby="section-feedback">
        <h2 id="section-feedback" className="text-xl font-bold tracking-tight text-[#172033]">
          8. Feedback, Overlay & Loading Primitives
        </h2>
        <Card variant="raised" className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              Open Demo Modal
            </Button>

            <Tooltip content="Gemini 1.5 Flash Model Connected" position="top">
              <Button variant="secondary">Hover for Tooltip</Button>
            </Tooltip>
          </div>

          <Divider label="Skeleton Loaders" />

          <div className="space-y-3">
            <Skeleton variant="text" className="w-1/3" />
            <Skeleton variant="text" className="w-2/3" />
            <div className="grid grid-cols-3 gap-4 pt-2">
              <Skeleton variant="card" className="h-20" />
              <Skeleton variant="card" className="h-20" />
              <Skeleton variant="card" className="h-20" />
            </div>
          </div>

          <Divider label="Empty State Primitive" />

          <EmptyState
            title="No Invoices Issued Yet"
            description="Create your first client invoice manually or let the Gemini AI assistant draft one from a short text brief."
            actionLabel="Create Invoice"
            onAction={() => alert("Action triggered")}
          />
        </Card>
      </section>

      {/* Modal Demo */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Confirm Invoice Issuance"
        description="Review invoice details before sending to client."
      >
        <div className="space-y-4 py-2">
          <p className="text-sm text-[#64748B]">
            This will generate a PayPal Sandbox payment order and email a secure payment link to <strong className="text-[#172033]">client@acmecorp.com</strong>.
          </p>
          <div className="p-4 bg-[#E8EDF4] shadow-inset-sm rounded-xl space-y-1 text-sm font-mono">
            <div className="flex justify-between text-xs text-[#64748B]">
              <span>Subtotal:</span>
              <span>$2,450.00</span>
            </div>
            <div className="flex justify-between text-xs text-[#64748B]">
              <span>Tax (8%):</span>
              <span>$196.00</span>
            </div>
            <div className="flex justify-between font-bold text-[#172033] pt-1 border-t border-[#D1D8E2]">
              <span>Total Due:</span>
              <span className="text-[#2563EB]">$2,646.00</span>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Confirm & Send
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
