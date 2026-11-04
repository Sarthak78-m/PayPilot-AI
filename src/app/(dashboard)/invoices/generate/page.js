"use client";

import React from "react";
import Link from "next/link";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import { Sparkles, ArrowLeft } from "@/components/icons";

export default function AIInvoiceGeneratePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
              AI Invoice Generator
            </h1>
            <Badge variant="primary" size="sm">
              Gemini Powered
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Convert natural language prompts into complete, structured invoices.
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
          title="AI Invoice Generator"
          description="Prompt-to-invoice generation with editable preview and Gemini AI integration is scheduled for Phase 6."
          icon={Sparkles}
          actionLabel="Return to Dashboard"
          onAction={() => (window.location.href = "/dashboard")}
        />
      </Card>
    </div>
  );
}

