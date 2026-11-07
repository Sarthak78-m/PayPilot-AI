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
  Modal,
  Input,
} from "@/components/ui";
import {
  ArrowLeft,
  User,
  Mail,
  AlertCircle,
  Trash2,
} from "@/components/icons";
import { getSessionUser, deleteAccount } from "@/lib/auth/auth-client";

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
            Manage your account identity and profile details.
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

      {/* Profile Information Section */}
      <Card variant="raised" className="p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white font-bold text-base flex items-center justify-center shadow-primary-glow shrink-0">
            {initials}
          </div>
          <div>
            <CardTitle className="text-lg">Profile Information</CardTitle>
            <CardDescription className="text-xs">
              Your personal details and account information
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
        </div>

        <p className="text-xs text-[#64748B] pt-1">
          Profile editing is currently unavailable.
        </p>
      </Card>

      {/* Delete Account Button */}
      <div className="flex justify-end pt-2">
        <Button
          variant="destructive"
          size="sm"
          icon={Trash2}
          iconPosition="left"
          onClick={handleOpenDeleteModal}
          className="w-full sm:w-auto shadow-[0_4px_14px_rgba(220,38,38,0.35)]"
        >
          Delete Account
        </Button>
      </div>

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
