import React from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription } from "@/components/ui";
import { Plus, Sparkles, CreditCard, Bot } from "@/components/icons";

export function QuickActions() {
  const actions = [
    {
      title: "Create Invoice",
      description: "Draft manual billing",
      href: "/invoices/new",
      icon: Plus,
      color: "text-[#2563EB]",
      bg: "bg-blue-500/10",
      border: "hover:border-[#2563EB]/40",
    },
    {
      title: "Generate with AI",
      description: "Prompt-driven invoicing",
      href: "/invoices/generate",
      icon: Sparkles,
      color: "text-[#2563EB]",
      bg: "bg-blue-500/10",
      border: "hover:border-[#2563EB]/40",
      badge: "Fast",
    },
    {
      title: "View Payments",
      description: "Reconcile PayPal payouts",
      href: "/payments",
      icon: CreditCard,
      color: "text-[#16A34A]",
      bg: "bg-emerald-500/10",
      border: "hover:border-[#16A34A]/40",
    },
    {
      title: "Ask AI Assistant",
      description: "Financial copilot insights",
      href: "/assistant",
      icon: Bot,
      color: "text-[#2563EB]",
      bg: "bg-blue-500/10",
      border: "hover:border-[#2563EB]/40",
    },
  ];

  return (
    <Card variant="raised" className="space-y-3">
      <div>
        <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
        <CardDescription className="text-xs">
          Essential billing workflows and conversational automation shortcuts
        </CardDescription>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <Link
              key={act.title}
              href={act.href}
              className={`p-3 rounded-xl bg-[#E8EDF4] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm transition-all duration-150 flex flex-col justify-between gap-2.5 group border border-white/80 dark:border-white/10 ${act.border}`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`h-8 w-8 rounded-xl ${act.bg} ${act.color} shadow-inset-sm flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                {act.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#2563EB] text-white shadow-primary-glow">
                    {act.badge}
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-[#172033] group-hover:text-[#2563EB] transition-colors leading-tight">
                  {act.title}
                </p>
                <p className="text-[11px] text-[#64748B] mt-0.5 truncate">
                  {act.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
