"use client";

import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, Button, Badge, EmptyState } from "@/components/ui";
import { FileText, Plus, ArrowLeft, Sparkles } from "@/components/icons";

export default function InvoicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
              Invoices & Billing
            </h1>
            <Badge variant="primary" size="sm">
              Phase 5 Destination
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage, filter, export, and track accounts receivable.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/dashboard">
            <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
              Dashboard
            </Button>
          </Link>
          <Link href="/invoices/new">
            <Button variant="primary" size="sm" icon={Plus} iconPosition="left" className="shadow-primary-glow">
              Create Invoice
            </Button>
          </Link>
        </div>
      </div>

      <Card variant="raised-lg" className="p-8 text-center">
        <EmptyState
          title="Invoice Management Suite"
          description="The full invoice management interface, line-item authoring, and PDF export modules are scheduled for Phase 5 development."
          icon={FileText}
          actionLabel="Return to Dashboard"
          onAction={() => (window.location.href = "/dashboard")}
        />
      </Card>
    </div>
  );
}

