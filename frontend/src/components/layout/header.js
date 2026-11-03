"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  Search,
  Bell,
  Plus,
  Settings,
  LogOut,
  ChevronDown,
  X,
  Sparkles,
  CheckCircle2,
} from "@/components/icons";
import { Button, Badge, Divider } from "@/components/ui";
import { getSessionUser, logoutUser } from "@/lib/auth/auth-client";
import { useDashboardSearch } from "@/lib/context/search-context";

export function Header({
  onOpenMobile = () => {},
  searchQuery: propSearchQuery,
  onSearchChange: propOnSearchChange,
  title = "Dashboard",
  subtitle = "Financial overview and cashflow intelligence",
}) {
  const router = useRouter();
  const searchCtx = useDashboardSearch();

  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : (searchCtx?.searchQuery || "");
  const onSearchChange = (val) => {
    if (propOnSearchChange) propOnSearchChange(val);
    if (searchCtx?.setSearchQuery) searchCtx.setSearchQuery(val);
  };

  const [currentUser, setCurrentUser] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(2);

  const userMenuRef = useRef(null);
  const notificationsRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    getSessionUser().then((res) => {
      if (mounted && res?.authenticated && res.user) {
        setCurrentUser(res.user);
      }
    });

    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      mounted = false;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

  const displayName = currentUser?.name || (currentUser?.email ? currentUser.email.split("@")[0] : null);
  const greeting = displayName ? `Welcome back, ${displayName}` : "Welcome back";
  const initials = displayName
    ? displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "FP";

  return (
    <header className="sticky top-0 z-10 bg-[#E8EDF4]/90 backdrop-blur-md border-b border-[#CBD5E1]/60 px-4 sm:px-5 lg:px-6 py-3 transition-all">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Mobile Toggle & Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobile}
            className="lg:hidden p-2 rounded-xl text-[#64748B] hover:text-[#172033] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm transition-all shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[#172033] truncate leading-tight">
              {title}
            </h1>
            <p className="text-xs text-[#64748B] hidden sm:block truncate mt-0.5">
              {greeting} • {subtitle}
            </p>
          </div>
        </div>

        {/* Center: Search Field */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full flex items-center">
            <div className="absolute left-3.5 flex items-center pointer-events-none text-[#64748B]">
              <Search className="h-4 w-4" />
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter invoices, clients, payments..."
              className="w-full bg-[#E8EDF4] text-[#172033] placeholder-[#94A3B8] text-xs sm:text-sm rounded-xl py-2 pl-9 pr-8 shadow-inset-sm border border-[#D1D8E2] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
            />

            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 text-[#64748B] hover:text-[#172033] p-1 rounded-md"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions & User Menu */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Quick Create Invoice */}
          <Link href="/invoices/new" className="hidden sm:inline-flex">
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              iconPosition="left"
              className="shadow-primary-glow"
            >
              New Invoice
            </Button>
          </Link>

          {/* Notifications Dropdown */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (unreadNotifications > 0) setUnreadNotifications(0);
              }}
              className="relative p-2.5 rounded-xl text-[#64748B] hover:text-[#172033] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm transition-all"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#2563EB] ring-2 ring-[#E8EDF4]" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-[#E8EDF4] shadow-raised-lg border border-white/60 p-4 space-y-3 z-30 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                    System Updates
                  </span>
                  <Badge variant="primary" size="sm">
                    Phase 4 Active
                  </Badge>
                </div>
                <Divider />
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
                    <p className="font-semibold text-[#172033] flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
                      Supabase Client Connected
                    </p>
                    <p className="text-[11px] text-[#64748B]">
                      SSR session proxy active on port 3000.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
                    <p className="font-semibold text-[#172033] flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-[#2563EB]" />
                      Development Preview Mode
                    </p>
                    <p className="text-[11px] text-[#64748B]">
                      Displaying isolated mock financial data until backend endpoints deploy.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1.5 rounded-xl shadow-raised-sm hover:shadow-raised active:shadow-inset-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              aria-label="User Account Menu"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white font-bold text-xs flex items-center justify-center shadow-primary-glow">
                {initials}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-[#64748B] hidden sm:block" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#E8EDF4] shadow-raised-lg border border-white/60 p-2 space-y-1 z-30 animate-in fade-in zoom-in-95 duration-150 text-xs">
                <div className="px-3 py-2">
                  <p className="font-bold text-[#172033] truncate">
                    {displayName || "PayPilot Freelancer"}
                  </p>
                  <p className="text-[11px] text-[#64748B] truncate mt-0.5">
                    {currentUser?.email || "Signed in with Supabase"}
                  </p>
                </div>

                <Divider />

                <Link
                  href="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#64748B] hover:text-[#172033] hover:shadow-raised-sm active:shadow-inset-sm transition-all"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Account Settings</span>
                </Link>

                <Link
                  href="/design-system"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#64748B] hover:text-[#172033] hover:shadow-raised-sm active:shadow-inset-sm transition-all"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#2563EB]" />
                  <span>Design System</span>
                </Link>

                <Divider />

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#DC2626] hover:bg-red-50 hover:shadow-raised-sm active:shadow-inset-sm transition-all text-left"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
