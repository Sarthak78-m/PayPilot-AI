"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Divider,
  Skeleton,
} from "@/components/ui";
import {
  Settings,
  ArrowLeft,
  User,
  ShieldCheck,
  LogOut,
  Mail,
  Lock,
  DollarSign,
  Bell,
  AlertCircle,
  CheckCircle2,
} from "@/components/icons";
import { getSessionUser, logoutUser } from "@/lib/auth/auth-client";

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSessionUser()
      .then((res) => {
        if (!mounted) return;
        if (res?.authenticated && res.user) {
          setUser(res.user);
          setError(null);
        } else {
          setError("Your session has expired or is unauthorized. Please sign in.");
        }
      })
      .catch(() => {
        if (mounted) {
          setError("Unable to connect to authentication service. Please check your network.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutUser();
    } finally {
      router.push("/login");
    }
  };

  const displayName = user?.name || (user?.email ? user.email.split("@")[0] : "Freelancer");
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <div className="space-y-5 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 rounded-xl" />
            <Skeleton className="h-4 w-72 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>

        <div className="space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight">
              Account Settings & Preferences
            </h1>
            <Badge variant="default" size="sm">
              Preferences
            </Badge>
            <Badge variant="primary" size="sm">
              Supabase Auth
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Review your freelancer profile, security credentials, and workspace configuration.
          </p>
        </div>

        <Link href="/dashboard">
          <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Unauthorized / Session Expired Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-raised-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <span className="font-semibold">{error}</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push("/login")}
            className="shrink-0"
          >
            Go to Sign In
          </Button>
        </div>
      )}

      {/* Architecture Readiness Notice */}
      <div className="p-3.5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-raised-sm flex items-center justify-between text-xs text-[#64748B]">
        <div className="flex items-center gap-2 truncate">
          <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
          <span className="truncate">
            <strong>Architecture Notice:</strong> Profile modification (
            <code className="text-[#172033] bg-[#CBD5E1]/50 px-1 py-0.5 rounded font-mono text-[11px]">
              PATCH /api/auth/profile
            </code>
            ) and preference persistence are scheduled for backend development. Displaying read-only data.
          </span>
        </div>
        <span className="text-[11px] font-mono shrink-0 hidden md:inline text-[#64748B]">
          Zero Simulated Writes
        </span>
      </div>

      {/* Section A: Profile */}
      <Card variant="raised" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white font-bold text-base flex items-center justify-center shadow-primary-glow shrink-0">
              {initials}
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">Freelancer Profile</CardTitle>
              <CardDescription className="text-xs">
                Your account identity and authenticated communication contact
              </CardDescription>
            </div>
          </div>
          <Badge variant="neutral" size="sm">
            Read-Only
          </Badge>
        </div>

        <Divider />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Full Name */}
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[#2563EB]" />
                Full Name
              </span>
              <span className="text-[10px] text-[#64748B] italic">Read-Only</span>
            </div>
            <p className="font-bold text-[#172033] text-sm">
              {user?.name || "Freelancer Account"}
            </p>
          </div>

          {/* Email Address */}
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[#2563EB]" />
                Email Address
              </span>
              <span className="text-[10px] text-[#64748B] italic">Verified Contact</span>
            </div>
            <p className="font-bold text-[#172033] text-sm font-mono truncate">
              {user?.email || "—"}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-[#64748B] pt-1">
          Profile updates require backend route handler{" "}
          <code className="text-[#172033] bg-[#CBD5E1]/50 px-1 py-0.5 rounded font-mono text-[10px]">
            PATCH /api/auth/profile
          </code>
          . Displayed values are retrieved directly from the verified session.
        </p>
      </Card>

      {/* Section B: Account & Security */}
      <Card variant="raised" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Account & Security</CardTitle>
            <CardDescription className="text-xs">
              Session credentials and sign-out controls
            </CardDescription>
          </div>
          <Badge variant="neutral" size="sm">
            Session Authenticated
          </Badge>
        </div>

        <Divider />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
          {/* Tile 1: Authentication Provider */}
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] block">
              Auth Provider
            </span>
            <p className="font-bold text-[#172033]">Supabase Auth SSR</p>
            <p className="text-[11px] text-[#64748B]">Session checked on initial page load</p>
          </div>

          {/* Tile 2: Cookie Security */}
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] block">
              Cookie Security
            </span>
            <p className="font-bold text-[#172033] flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#2563EB]" />
              <span>HttpOnly Session Cookie</span>
            </p>
            <p className="text-[11px] text-[#64748B]">Standard browser cookie storage</p>
          </div>

          {/* Tile 3: Password Status */}
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1 sm:col-span-2 lg:col-span-1">
            <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] block">
              Password Management
            </span>
            <p className="font-bold text-[#172033] flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[#2563EB]" />
              <span>Identity Protected</span>
            </p>
            <p className="text-[11px] text-[#64748B]">Managed via Supabase Auth</p>
          </div>
        </div>

        {/* Sign Out Action Bar */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#CBD5E1]/60">
          <p className="text-xs text-[#64748B]">
            Terminating your session clears client authentication cookies and returns to the login screen.
          </p>

          <Button
            variant="destructive"
            size="sm"
            icon={LogOut}
            iconPosition="left"
            onClick={handleLogout}
            loading={loggingOut}
            disabled={loggingOut}
            className="shrink-0"
          >
            Sign Out
          </Button>
        </div>
      </Card>

      {/* Section C: Preferences */}
      <Card variant="raised" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Workspace Preferences</CardTitle>
            <CardDescription className="text-xs">
              Application defaults and regional financial formatting
            </CardDescription>
          </div>
          <Badge variant="neutral" size="sm">
            Application Defaults
          </Badge>
        </div>

        <Divider />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Default Currency */}
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-[#2563EB]" />
                Currency
              </span>
              <Badge variant="neutral" size="sm">
                Application Default
              </Badge>
            </div>
            <p className="font-bold text-[#172033] text-sm">USD — United States Dollar ($)</p>
            <p className="text-[11px] text-[#64748B]">
              Application-level fallback for new invoices. Account-wide currency persistence is not supported by the backend.
            </p>
          </div>

          {/* Notifications */}
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-[#64748B]" />
                Notification System
              </span>
              <Badge variant="neutral" size="sm">
                Not Implemented
              </Badge>
            </div>
            <p className="font-bold text-[#64748B] text-sm">No Notification Service</p>
            <p className="text-[11px] text-[#64748B]">
              No real-time notification backend or webhook dispatch exists. The application does not currently deliver automated alerts.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-[#64748B]">
          User preference persistence requires backend route handler{" "}
          <code className="text-[#172033] bg-[#CBD5E1]/50 px-1 py-0.5 rounded font-mono text-[10px]">
            POST /api/settings/preferences
          </code>
          . Current configurations reflect static application defaults.
        </p>
      </Card>

      {/* Section D: Account Metadata */}
      <Card variant="raised" className="space-y-4">
        <div>
          <CardTitle className="text-base sm:text-lg">Account Information</CardTitle>
          <CardDescription className="text-xs">
            Verified database identifiers from authenticated session
          </CardDescription>
        </div>

        <Divider />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] block">
              User ID
            </span>
            <p className="font-mono font-bold text-[#172033] text-[11px] truncate" title={user?.id || ""}>
              {user?.id ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}` : "—"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] block">
              Roles & Permissions
            </span>
            <p className="font-medium text-[#64748B]">Not configured (Single-user model)</p>
          </div>

          <div className="p-3 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px] block">
              Subscription Plan
            </span>
            <p className="font-medium text-[#64748B]">No subscription system configured</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
