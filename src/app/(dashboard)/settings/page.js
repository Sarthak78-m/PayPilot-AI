"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Divider,
  Skeleton,
} from "@/components/ui";
import {
  ArrowLeft,
  User,
  Mail,
  KeyRound,
  LogOut,
  AlertCircle,
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

  const displayName = user?.name || (user?.email ? user.email.split("@")[0] : "");
  const initials = displayName
    ? displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48 rounded-xl" />
            <Skeleton className="h-4 w-72 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>

        <div className="space-y-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage your account identity, security, and workspace preferences.
          </p>
        </div>

        <Link href="/dashboard">
          <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Session Expired / Error Banner */}
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

      {/* SECTION A: Profile Information */}
      <Card variant="raised" className="p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white font-bold text-base flex items-center justify-center shadow-primary-glow shrink-0">
            {initials}
          </div>
          <div>
            <CardTitle className="text-lg">Profile Information</CardTitle>
            <CardDescription className="text-xs">
              Your personal details and authenticated account identifier
            </CardDescription>
          </div>
        </div>

        <Divider />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Full Name */}
          <div className="p-4 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-[#2563EB]" />
              Full Name
            </span>
            <p className="font-bold text-[#172033] text-sm">
              {user?.name || (user?.email ? user.email.split("@")[0] : "Not provided")}
            </p>
          </div>

          {/* Email Address */}
          <div className="p-4 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-[#2563EB]" />
              Email Address
            </span>
            <p className="font-bold text-[#172033] text-sm font-mono truncate">
              {user?.email || "Unavailable"}
            </p>
          </div>

          {/* Account ID */}
          <div className="p-4 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1 md:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-[#2563EB]" />
              Account ID
            </span>
            <p className="font-mono font-bold text-[#172033] text-xs sm:text-sm select-all break-all">
              {user?.id || user?.userId || "Unavailable"}
            </p>
          </div>
        </div>

        <p className="text-xs text-[#64748B] pt-1">
          Profile editing is currently unavailable.
        </p>
      </Card>

      {/* SECTION B: Security */}
      <Card variant="raised" className="p-6 sm:p-8 space-y-6">
        <div>
          <CardTitle className="text-lg">Security</CardTitle>
          <CardDescription className="text-xs">
            Manage your authenticated session and account access
          </CardDescription>
        </div>

        <Divider />

        <div className="space-y-4">
          <p className="text-sm text-[#64748B] leading-relaxed">
            Your account is authenticated securely through Supabase authentication. Session credentials are encrypted and stored in secure browser cookies.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#CBD5E1]/60">
            <p className="text-xs text-[#64748B]">
              Sign out of this session on this device.
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
        </div>
      </Card>

      {/* SECTION C: Preferences */}
      <Card variant="raised" className="p-6 sm:p-8 space-y-4">
        <div>
          <CardTitle className="text-lg">Preferences</CardTitle>
          <CardDescription className="text-xs">
            Workspace and notification configuration
          </CardDescription>
        </div>

        <Divider />

        <p className="text-sm text-[#64748B] leading-relaxed">
          Custom currency preferences and notification settings are not currently configurable. Default settings apply to your account.
        </p>
      </Card>
    </div>
  );
}
