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
  Modal,
  Input,
} from "@/components/ui";
import {
  ArrowLeft,
  User,
  Mail,
  KeyRound,
  LogOut,
  AlertCircle,
  Sun,
  Moon,
  CheckCircle2,
  Trash2,
} from "@/components/icons";
import { getSessionUser, logoutUser, deleteAccount } from "@/lib/auth/auth-client";
import { useTheme } from "@/lib/context/theme-context";

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme, isDark } = useTheme();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

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

  const handleOpenDeleteModal = () => {
    setDeleteConfirmText("");
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteError('Please type "DELETE" to confirm.');
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteAccount({ confirmation: "DELETE" });
      if (!res.success) {
        setDeleteError(res.message || "Failed to delete account. Please try again.");
        return;
      }

      setDeleteModalOpen(false);
      router.push("/login?message=Your+account+has+been+permanently+deleted.");
    } catch {
      setDeleteError("Unable to connect to service. Please check your network.");
    } finally {
      setDeleting(false);
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

      {/* SECTION C: Preferences & Theme */}
      <Card variant="raised" className="p-6 sm:p-8 space-y-6">
        <div>
          <CardTitle className="text-lg">Appearance & Theme</CardTitle>
          <CardDescription className="text-xs">
            Choose your preferred workspace aesthetic. Switches seamlessly across the entire application.
          </CardDescription>
        </div>

        <Divider />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Light Theme Card */}
          <div
            onClick={() => setTheme("light")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setTheme("light");
              }
            }}
            className={`p-5 rounded-2xl cursor-pointer transition-all duration-200 flex flex-col justify-between gap-4 border ${
              !isDark
                ? "bg-[#E8EDF4] border-[#2563EB] shadow-raised-lg ring-2 ring-[#2563EB]"
                : "bg-[#E8EDF4] border-[#CBD5E1]/60 shadow-raised-sm hover:shadow-raised"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-[#F59E0B] flex items-center justify-center shadow-inset-sm">
                  <Sun className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#172033]">Light Theme</h4>
                  <p className="text-[11px] text-[#64748B]">Soft Daylight Neumorphic</p>
                </div>
              </div>

              {!isDark ? (
                <Badge variant="primary" size="sm" dot>
                  Active
                </Badge>
              ) : (
                <span className="text-[11px] font-medium text-[#64748B]">Select</span>
              )}
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Daylight-balanced pastel slate palette with dual-plane soft extrusion shadows, optimized for high ambient light workspaces.
            </p>
          </div>

          {/* Black Theme Card */}
          <div
            onClick={() => setTheme("dark")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setTheme("dark");
              }
            }}
            className={`p-5 rounded-2xl cursor-pointer transition-all duration-200 flex flex-col justify-between gap-4 border ${
              isDark
                ? "bg-[#111726] border-[#3B82F6] shadow-raised-lg ring-2 ring-[#3B82F6]"
                : "bg-[#E8EDF4] border-[#CBD5E1]/60 shadow-raised-sm hover:shadow-raised"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-[#3B82F6] flex items-center justify-center shadow-inset-sm">
                  <Moon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#172033]">Black Theme</h4>
                  <p className="text-[11px] text-[#64748B]">Obsidian Midnight Neumorphic</p>
                </div>
              </div>

              {isDark ? (
                <Badge variant="primary" size="sm" dot>
                  Active
                </Badge>
              ) : (
                <span className="text-[11px] font-medium text-[#64748B]">Select</span>
              )}
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Deep pitch-black canvas with obsidian surfaces, glowing edge highlights, and high-contrast typography, engineered for night sessions.
            </p>
          </div>
        </div>

        <Divider />

        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>Theme preference persists automatically in browser storage.</span>
          <span className="font-semibold text-[#2563EB]">
            Currently: {!isDark ? "Light (Daylight)" : "Black (Obsidian)"}
          </span>
        </div>
      </Card>

      {/* SECTION D: Danger Zone — Delete Account */}
      <Card
        variant="raised"
        className="p-6 sm:p-8 space-y-6 border border-red-200/80 dark:border-red-900/40"
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg text-[#DC2626] dark:text-[#EF4444] flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              <span>Danger Zone</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Irreversible actions regarding your account, billing data, and personal records.
            </CardDescription>
          </div>
        </div>

        <Divider />

        <div className="p-5 rounded-2xl bg-red-50/80 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-inset-sm">
          <div className="space-y-1.5">
            <h4 className="font-bold text-sm text-[#172033] dark:text-[#F8FAFC]">
              Delete Account Permanently
            </h4>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-xl leading-relaxed">
              Permanently delete your profile, client invoices, payment histories, and access credentials. Once confirmed, this data cannot be recovered.
            </p>
          </div>

          <Button
            variant="destructive"
            size="sm"
            icon={Trash2}
            iconPosition="left"
            onClick={handleOpenDeleteModal}
            className="shrink-0 shadow-[0_4px_14px_rgba(220,38,38,0.35)]"
          >
            Delete Account
          </Button>
        </div>
      </Card>

      {/* Delete Account Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!deleting) setDeleteModalOpen(false);
        }}
        title="Delete Account Permanently"
        description="This action is irreversible and immediately wipes all records."
      >
        <div className="space-y-4 py-2">
          {/* Warning Banner */}
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400 flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Warning: All your data will be permanently erased.</p>
              <p className="text-[11px] leading-relaxed opacity-90">
                This will delete your user profile, all generated invoices, payment links, transaction ledgers, and authentication credentials.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/40 text-xs text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="space-y-2 pt-1">
            <label
              htmlFor="delete-account-confirm-input"
              className="text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] block"
            >
              To confirm, type <span className="font-mono font-bold text-[#DC2626] dark:text-[#EF4444]">DELETE</span> below:
            </label>
            <Input
              id="delete-account-confirm-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  deleteConfirmText.trim().toUpperCase() === "DELETE" &&
                  !deleting
                ) {
                  e.preventDefault();
                  handleConfirmDelete();
                }
              }}
              placeholder="Type DELETE to confirm"
              disabled={deleting}
              autoFocus
            />
          </div>

          <Divider />

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              icon={Trash2}
              iconPosition="left"
              onClick={handleConfirmDelete}
              loading={deleting}
              disabled={deleting || deleteConfirmText.trim().toUpperCase() !== "DELETE"}
            >
              Permanently Delete Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
