import React from "react";
import Link from "next/link";
import { PayPilotLogo, ShieldCheck } from "@/components/icons";

export const metadata = {
  title: "PayPilot AI — Authentication",
  description: "Secure login and account management for PayPilot AI invoicing platform.",
};

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#E8EDF4] text-[#172033] flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Header / Branding */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between pb-6">
        <Link
          href="/"
          className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-xl"
        >
          <PayPilotLogo className="h-10 w-10 transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <span className="text-lg font-extrabold tracking-tight text-[#172033] leading-none">
              PayPilot<span className="text-[#2563EB]">.AI</span>
            </span>
            <span className="text-[11px] font-medium text-[#64748B] tracking-wide mt-0.5">
              Smart Invoicing & Cashflow
            </span>
          </div>
        </Link>
      </header>

      {/* Main Auth Content Container */}
      <main className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center">
        {children}
      </main>

      {/* Trust & Security Footer */}
      <footer className="w-full max-w-md mx-auto pt-8 flex flex-col items-center gap-3 text-center text-xs text-[#64748B]">
        <div className="flex items-center gap-1.5 text-[#64748B] font-medium">
          <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
          <span>Encrypted Connection & Data Protection</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <a href="#" className="hover:text-[#2563EB] transition-colors">
            Privacy Policy
          </a>
          <span className="text-[#CBD5E1]">•</span>
          <a href="#" className="hover:text-[#2563EB] transition-colors">
            Terms of Service
          </a>
          <span className="text-[#CBD5E1]">•</span>
          <a href="#" className="hover:text-[#2563EB] transition-colors">
            Security Overview
          </a>
        </div>
        <p className="text-[10px] text-[#94A3B8]">
          © {new Date().getFullYear()} PayPilot AI Inc. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
