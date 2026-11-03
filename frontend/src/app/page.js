import React from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Divider,
} from "@/components/ui";
import {
  PayPilotLogo,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  LayoutDashboard,
  Lock,
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
        <div className="inline-flex items-center gap-2">
          <Badge variant="primary" size="md" dot>
            Modern Neumorphism + Minimalist Fintech
          </Badge>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-[#172033] tracking-tight leading-tight">
          AI-Powered Invoicing & <br className="hidden sm:inline" />
          <span className="text-[#2563EB]">Instant Payment Collection</span>
        </h1>

        <p className="text-base sm:text-lg text-[#64748B] max-w-2xl mx-auto leading-relaxed">
          PayPilot AI streamlines billing, recovers outstanding client payments with conversational intelligence, and reconciles PayPal payouts effortlessly.
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
              Launch Dashboard
            </Button>
          </Link>
          <Link href="/login">
            <Button
              variant="secondary"
              size="lg"
              className="min-w-[160px]"
            >
              Sign In
            </Button>
          </Link>
          <Link href="/design-system">
            <Button
              variant="outline"
              size="lg"
              icon={Sparkles}
              iconPosition="left"
            >
              Design System
            </Button>
          </Link>
        </div>

        {/* Quick Suite Navigation Card */}
        <Card variant="raised-lg" className="max-w-xl mx-auto p-6 sm:p-8 text-left space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Platform Navigation</CardTitle>
              <CardDescription>
                Phase 3 & 4 production-grade modules
              </CardDescription>
            </div>
            <Badge variant="success" size="sm">
              Phase 4 Live
            </Badge>
          </div>

          <Divider />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/dashboard" className="block">
              <Button
                variant="primary"
                size="md"
                className="w-full justify-between shadow-primary-glow"
                icon={ArrowRight}
                iconPosition="right"
              >
                Dashboard Overview
              </Button>
            </Link>

            <Link href="/login" className="block">
              <Button
                variant="secondary"
                size="md"
                className="w-full justify-between"
                icon={ArrowRight}
                iconPosition="right"
              >
                Sign In
              </Button>
            </Link>

            <Link href="/register" className="block">
              <Button
                variant="outline"
                size="md"
                className="w-full justify-between"
                icon={ArrowRight}
                iconPosition="right"
              >
                Create Account
              </Button>
            </Link>

            <Link href="/forgot-password" className="block">
              <Button
                variant="outline"
                size="md"
                className="w-full justify-between"
                icon={ArrowRight}
                iconPosition="right"
              >
                Forgot Password
              </Button>
            </Link>
          </div>

          <Divider />

          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1">
            <Link
              href="/design-system"
              className="font-semibold text-[#2563EB] hover:underline flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Explore Neumorphic Design System</span>
            </Link>
            <span className="flex items-center gap-1 text-[#16A34A] font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>256-bit Secure</span>
            </span>
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-[#64748B] pt-8">
        <p>© {new Date().getFullYear()} PayPilot AI. Built with Next.js 16, React 19 & Tailwind CSS 4.</p>
      </footer>
    </div>
  );
}
