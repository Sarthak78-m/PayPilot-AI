import React from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, Badge } from "@/components/ui";
import { Bot, Sparkles, ArrowRight } from "@/components/icons";

export function AIAssistantCard() {
  const suggestedPrompts = [
    "Which client invoices are overdue?",
    "Draft a professional payment reminder",
    "Forecast expected revenue for next month",
  ];

  return (
    <Card
      variant="raised"
      className="relative overflow-hidden bg-gradient-to-br from-[#E8EDF4] to-[#DFE5EE] border border-white/80 p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white flex items-center justify-center shrink-0 shadow-primary-glow">
            <Bot className="h-5 w-5 text-white" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">PayPilot AI Assistant</CardTitle>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Ask questions about your accounts receivable, automate reminder drafts, or analyze cashflow trends.
            </CardDescription>
          </div>
        </div>

        <Link href="/assistant" className="shrink-0 self-start sm:self-auto">
          <Button
            variant="primary"
            size="sm"
            icon={ArrowRight}
            iconPosition="right"
            className="shadow-primary-glow"
          >
            Launch Assistant
          </Button>
        </Link>
      </div>

      {/* Suggested Prompts */}
      <div className="pt-2 border-t border-[#CBD5E1]/60">
        <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block mb-1.5">
          Suggested prompts:
        </span>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {suggestedPrompts.map((prompt) => (
            <Link
              key={prompt}
              href={`/assistant?q=${encodeURIComponent(prompt)}`}
              className="text-xs text-[#172033] bg-[#E8EDF4] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border border-white/60 transition-all flex items-center gap-1.5 hover:text-[#2563EB]"
            >
              <Sparkles className="h-3 w-3 text-[#2563EB]" />
              <span>{prompt}</span>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
