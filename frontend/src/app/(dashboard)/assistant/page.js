"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import { Bot, ArrowLeft, Sparkles } from "@/components/icons";

function AssistantContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
              PayPilot AI Assistant
            </h1>
            <Badge variant="primary" size="sm">
              Conversational Copilot
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Conversational collections, payment reminders, and financial inquiries.
          </p>
        </div>

        <Link href="/dashboard">
          <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Card variant="raised-lg" className="p-8 text-center">
        {query && (
          <div className="mb-6 p-3 rounded-xl bg-blue-50 border border-[#2563EB]/20 text-xs text-[#2563EB] max-w-md mx-auto flex items-center gap-2 shadow-inset-sm">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="font-semibold">Selected Prompt: &ldquo;{query}&rdquo;</span>
          </div>
        )}

        <EmptyState
          title="AI Assistant Chat Interface"
          description="The interactive AI financial assistant chat, suggested prompt engine, and conversational memory are scheduled for Phase 7."
          icon={Bot}
          actionLabel="Return to Dashboard"
          onAction={() => (window.location.href = "/dashboard")}
        />
      </Card>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense
      fallback={
        <Card variant="raised-lg" className="p-8 text-center text-[#64748B]">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 bg-[#CBD5E1] rounded mx-auto" />
            <div className="h-32 bg-[#CBD5E1] rounded" />
          </div>
        </Card>
      }
    >
      <AssistantContent />
    </Suspense>
  );
}

