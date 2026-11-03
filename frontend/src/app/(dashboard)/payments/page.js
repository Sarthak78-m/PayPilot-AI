"use client";

import React from "react";
import Link from "next/link";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import { CreditCard, ArrowLeft } from "@/components/icons";

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
              Payments & Settlements
            </h1>
            <Badge variant="success" size="sm">
              PayPal Reconciled
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Monitor client payouts, payment histories, and PayPal Sandbox settlements.
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
          title="Payments & Payouts Suite"
          description="The full payment transaction history, payout tracking, and PayPal integration interface are scheduled for Phase 8."
          icon={CreditCard}
          actionLabel="Return to Dashboard"
          onAction={() => (window.location.href = "/dashboard")}
        />
      </Card>
    </div>
  );
}

