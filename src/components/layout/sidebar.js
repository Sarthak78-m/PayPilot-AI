"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PayPilotLogo,
  LayoutDashboard,
  FileText,
  CreditCard,
  Bot,
  Settings,
  Sparkles,
  LogOut,
  X,
  User,
} from "@/components/icons";
import { Badge, Divider, ThemeToggle } from "@/components/ui";
import { getSessionUser, logoutUser } from "@/lib/auth/auth-client";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: FileText,
  },
  {
    label: "AI Invoice Generator",
    href: "/invoices/generate",
    icon: Sparkles,
    badge: "AI",
  },
  {
    label: "AI Assistant",
    href: "/assistant",
    icon: Bot,
  },
  {
    label: "Payments",
    href: "/payments",
    icon: CreditCard,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar({ mobileOpen = false, onCloseMobile = () => {} }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSessionUser().then((res) => {
      if (mounted && res?.authenticated && res.user) {
        setCurrentUser(res.user);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logoutUser();
    router.push("/login");
  };

  const displayName = currentUser?.name || (currentUser?.email ? currentUser.email.split("@")[0] : "Freelancer");
  const displayEmail = currentUser?.email || "Account Active";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full">
      {/* Top Brand Lockup */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            onClick={onCloseMobile}
            className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-xl"
          >
            <PayPilotLogo className="h-8 w-8 sm:h-9 sm:w-9 transition-transform group-hover:scale-105" />
            <div className="flex flex-col">
              <span className="text-base font-extrabold tracking-tight text-[#172033] leading-none">
                PayPilot<span className="text-[#2563EB]">.AI</span>
              </span>
              <span className="text-[10px] font-semibold text-[#64748B] tracking-wider uppercase mt-1">
                Fintech Invoicing
              </span>
            </div>
          </Link>

          {/* Mobile Close Button */}
          {mobileOpen && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-2 rounded-xl text-[#64748B] hover:text-[#172033] shadow-raised-sm active:shadow-inset-sm"
              aria-label="Close navigation sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <Divider />

        {/* Navigation Items */}
        <nav className="space-y-1" aria-label="Main Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 select-none group ${
                  isActive
                    ? "bg-[#E8EDF4] text-[#2563EB] shadow-inset-sm font-semibold border-l-4 border-[#2563EB]"
                    : "text-[#64748B] hover:text-[#172033] hover:shadow-raised-sm active:shadow-inset-sm"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`shrink-0 transition-colors ${
                      isActive ? "text-[#2563EB]" : "text-[#64748B] group-hover:text-[#172033]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#2563EB] text-white shadow-primary-glow shrink-0 ml-1.5">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Session Footer Card */}
      <div className="pt-4 space-y-2.5">
        <Divider />

        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-[#64748B]">Theme</span>
          <ThemeToggle variant="pill" size="sm" />
        </div>

        <div className="p-2.5 rounded-xl bg-[#E8EDF4] shadow-raised-sm border border-white/80 dark:border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-primary-glow">
              {initials || <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#172033] truncate leading-tight">
                {displayName}
              </p>
              <p className="text-[10px] text-[#64748B] truncate leading-tight mt-0.5">
                {displayEmail}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm transition-colors shrink-0"
            title="Sign out of PayPilot AI"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 h-screen sticky top-0 flex-col border-r border-[#CBD5E1]/60 bg-[#E8EDF4] p-4 z-20">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#172033]/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer Surface */}
          <div className="relative w-64 max-w-[85vw] h-full bg-[#E8EDF4] shadow-raised-lg p-4 flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
