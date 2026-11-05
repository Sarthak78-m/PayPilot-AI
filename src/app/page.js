import React from "react";
import Link from "next/link";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Divider,
} from "@/components/ui";
import {
  PayPilotLogo,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  LayoutDashboard,
  CreditCard,
  FileText,
} from "@/components/icons";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#E8EDF4] text-[#172033] flex flex-col justify-between p-6 sm:p-12">
      {/* Top Bar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PayPilotLogo className="h-10 w-10" />
          <div>
            <span className="text-xl font-extrabold tracking-tight text-[#172033]">
              PayPilot<span className="text-[#2563EB]">.AI</span>
            </span>
            <span className="block text-[11px] font-semibold text-[#64748B]">
              Freelance Invoicing & Collections
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button
              variant="primary"
              size="sm"
              icon={LayoutDashboard}
              iconPosition="left"
              className="shadow-primary-glow"
            >
              Open Dashboard
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="sm">
              Sign In
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl w-full mx-auto my-12 text-center space-y-8">
        <h1 className="text-4xl sm:text-6xl font-extrabold text-[#172033] tracking-tight leading-tight">
          AI-Powered Invoicing & <br className="hidden sm:inline" />
          <span className="text-[#2563EB]">Instant Payment Collection</span>
        </h1>

        <p className="text-base sm:text-lg text-[#64748B] max-w-2xl mx-auto leading-relaxed">
          PayPilot AI streamlines billing, recovers outstanding client payments with conversational intelligence, and reconciles payments effortlessly.
        </p>

        {/* Quick Launch Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/dashboard">
            <Button
              variant="primary"
              size="lg"
              icon={LayoutDashboard}
              iconPosition="left"
              className="shadow-primary-glow min-w-[200px]"
            >
              Open Dashboard
            </Button>
          </Link>
          <Link href="/register">
            <Button
              variant="secondary"
              size="lg"
              icon={ArrowRight}
              iconPosition="right"
              className="min-w-[160px]"
            >
              Get Started
            </Button>
          </Link>
        </div>

        {/* Core Product Capabilities Card */}
        <Card variant="raised-lg" className="max-w-3xl mx-auto p-6 sm:p-8 text-left space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Intelligent Billing & Collections</CardTitle>
              <CardDescription>
                Designed for modern freelancers and independent professionals
              </CardDescription>
            </div>
          </div>

          <Divider />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-2">
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-[#2563EB] flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-sm text-[#172033]">AI Invoice Generation</h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Turn project notes and descriptions into structured, professional invoices in seconds.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-2">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-[#16A34A] flex items-center justify-center">
                <CreditCard className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-sm text-[#172033]">Instant Settlements</h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Provide seamless digital payment options with automatic reconciliation and ledger updates.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-2">
              <div className="h-9 w-9 rounded-xl bg-purple-500/10 text-[#7C3AED] flex items-center justify-center">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-sm text-[#172033]">Accounts Receivable</h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Monitor pending balances, identify overdue accounts, and automate polite reminder workflows.
              </p>
            </div>
          </div>

          <Divider />

          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1">
            <div className="flex items-center gap-1.5 font-medium text-[#172033]">
              <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
              <span>Encrypted Connection & Data Protection</span>
            </div>
            <Link
              href="/register"
              className="font-semibold text-[#2563EB] hover:underline flex items-center gap-1"
            >
              <span>Create an account</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-[#64748B] pt-8">
        <p>© {new Date().getFullYear()} PayPilot AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
