"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  Button,
  Input,
  Divider,
  Badge,
} from "@/components/ui";
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  KeyRound,
} from "@/components/icons";
import {
  validateResetPasswordForm,
  getPasswordCriteria,
} from "@/lib/validation/auth";
import { resetPasswordWithToken } from "@/lib/auth/auth-client";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("code") || searchParams.get("token") || "";

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [backendNotice, setBackendNotice] = useState("");

  const passwordCriteria = getPasswordCriteria(formData.password);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (serverError) setServerError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    setBackendNotice("");

    const validation = validateResetPasswordForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setLoading(true);

    try {
      const res = await resetPasswordWithToken({
        password: formData.password,
        token,
      });

      if (res.isMissingEndpoint) {
        setBackendNotice(
          "Backend Notice: /api/auth/reset-password endpoint is pending in the backend service. For demo testing, preview the confirmation screen below."
        );
        setIsSuccess(true);
      } else if (!res.success) {
        setServerError(res.message || "Failed to reset password.");
      } else {
        setIsSuccess(true);
      }
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <Card variant="raised-lg" className="w-full text-center space-y-5 py-8">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 text-[#16A34A] flex items-center justify-center shadow-raised-sm">
          <CheckCircle2 className="h-8 w-8 text-[#16A34A]" />
        </div>

        <div className="space-y-2">
          <Badge variant="success" size="sm">
            Security Updated
          </Badge>
          <CardTitle className="text-2xl font-bold text-[#172033]">
            Password Reset Complete
          </CardTitle>
          <CardDescription className="text-sm max-w-sm mx-auto leading-relaxed">
            Your account password has been updated successfully. You can now use your new password to sign in to PayPilot AI.
          </CardDescription>
        </div>

        {backendNotice && (
          <div className="p-3 rounded-xl bg-amber-50 border border-[#F59E0B]/30 text-[#B45309] text-xs leading-relaxed text-left flex items-start gap-2 shadow-inset-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#F59E0B]" />
            <p>{backendNotice}</p>
          </div>
        )}

        <Divider />

        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => router.push("/login")}
          >
            Sign In with New Password
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="raised-lg" className="w-full">
      <CardHeader className="text-center sm:text-left">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold text-[#172033]">
            Choose New Password
          </CardTitle>
          <Badge variant="primary" size="sm">
            Security Check
          </Badge>
        </div>
        <CardDescription className="text-sm mt-1">
          Create a new, strong password for your PayPilot AI account.
        </CardDescription>
      </CardHeader>

      <Divider className="my-4" />

      {serverError && (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-xl bg-red-50 border border-[#DC2626]/30 text-[#DC2626] text-xs leading-relaxed flex items-start gap-2.5 shadow-inset-sm"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Reset Error</p>
            <p>{serverError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* New Password */}
        <div className="space-y-2">
          <Input
            label="New Password"
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            leadingIcon={Lock}
            disabled={loading}
            trailingAction={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[#64748B] hover:text-[#172033] p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          {/* Password Validation Checklist */}
          {formData.password && (
            <div className="p-2.5 rounded-xl bg-[#E8EDF4] shadow-inset-sm space-y-1.5 text-xs text-[#64748B]">
              <p className="font-semibold text-[11px] uppercase tracking-wider text-[#172033]">
                Security Checklist
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-3 w-3 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      passwordCriteria.minLength
                        ? "bg-[#16A34A] text-white"
                        : "bg-[#CBD5E1] text-[#64748B]"
                    }`}
                  >
                    ✓
                  </span>
                  <span
                    className={
                      passwordCriteria.minLength ? "text-[#16A34A] font-medium" : ""
                    }
                  >
                    8–72 chars
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-3 w-3 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      passwordCriteria.hasLetter
                        ? "bg-[#16A34A] text-white"
                        : "bg-[#CBD5E1] text-[#64748B]"
                    }`}
                  >
                    ✓
                  </span>
                  <span
                    className={
                      passwordCriteria.hasLetter ? "text-[#16A34A] font-medium" : ""
                    }
                  >
                    1+ letter
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-3 w-3 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      passwordCriteria.hasNumber
                        ? "bg-[#16A34A] text-white"
                        : "bg-[#CBD5E1] text-[#64748B]"
                    }`}
                  >
                    ✓
                  </span>
                  <span
                    className={
                      passwordCriteria.hasNumber ? "text-[#16A34A] font-medium" : ""
                    }
                  >
                    1+ number
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <Input
          label="Confirm New Password"
          id="confirmPassword"
          name="confirmPassword"
          type={showConfirmPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={formData.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          leadingIcon={Lock}
          disabled={loading}
          trailingAction={
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="text-[#64748B] hover:text-[#172033] p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          className="w-full mt-2"
          icon={ArrowRight}
          iconPosition="right"
        >
          Save New Password
        </Button>
      </form>

      <CardFooter className="flex items-center justify-center pt-4 mt-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#2563EB] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Sign In</span>
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <Card variant="raised-lg" className="w-full p-8 text-center text-[#64748B]">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/2 bg-[#CBD5E1] rounded mx-auto" />
            <div className="h-4 w-3/4 bg-[#CBD5E1] rounded mx-auto" />
            <div className="h-10 bg-[#CBD5E1] rounded" />
          </div>
        </Card>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

