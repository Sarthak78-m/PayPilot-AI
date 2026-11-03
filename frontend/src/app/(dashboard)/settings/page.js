"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, Button, Badge, Divider } from "@/components/ui";
import { Settings, ArrowLeft, User, ShieldCheck, LogOut } from "@/components/icons";
import { getSessionUser, logoutUser } from "@/lib/auth/auth-client";

export default function SettingsPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    getSessionUser().then((res) => {
      if (res?.authenticated && res.user) {
        setUser(res.user);
      }
    });
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
              Account Settings
            </h1>
            <Badge variant="default" size="sm">
              Preferences
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage your freelancer profile, billing details, and security credentials.
          </p>
        </div>

        <Link href="/dashboard">
          <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Profile Card */}
      <Card variant="raised-lg" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white font-bold text-base flex items-center justify-center shadow-primary-glow">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-base font-bold text-[#172033]">
                {user?.name || "Freelancer Account"}
              </p>
              <p className="text-xs text-[#64748B]">
                {user?.email || "Supabase authenticated"}
              </p>
            </div>
          </div>
          <Badge variant="success" size="sm">
            Active Session
          </Badge>
        </div>

        <Divider />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px]">
              Authentication Provider
            </span>
            <p className="font-bold text-[#172033]">Supabase Auth SSR</p>
          </div>
          <div className="p-3.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1">
            <span className="font-semibold text-[#64748B] uppercase tracking-wider text-[10px]">
              Security Protocol
            </span>
            <p className="font-bold text-[#172033] flex items-center gap-1.5 text-[#16A34A]">
              <ShieldCheck className="h-4 w-4" />
              <span>256-bit Encrypted Session</span>
            </p>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <p className="text-xs text-[#64748B]">
            Full profile customization and PayPal gateway settings will be unlocked in Phase 9.
          </p>
          <Button
            variant="destructive"
            size="sm"
            icon={LogOut}
            iconPosition="left"
            onClick={async () => {
              await logoutUser();
              window.location.href = "/login";
            }}
          >
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}

