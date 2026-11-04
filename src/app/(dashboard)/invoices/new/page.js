"use client";

import React from "react";
import Link from "next/link";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import { Plus, ArrowLeft, FileText } from "@/components/icons";

export default function NewInvoicePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
            Create New Invoice
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manual invoice creation and client line-item setup.
          </p>
        </div>

        <Link href="/dashboard">
          <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Card variant="raised-lg" className="p-8 text-center">
        <EmptyState
          title="Manual Invoice Creator"
          description="The invoice builder interface with customer lookup, line items, and tax calculations is scheduled for Phase 5."
          icon={Plus}
          actionLabel="Return to Dashboard"
          onAction={() => (window.location.href = "/dashboard")}
        />
      </Card>
    </div>
  );
}

