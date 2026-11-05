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
  Checkbox,
  Divider,
} from "@/components/ui";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Google,
} from "@/components/icons";
import { validateLoginForm } from "@/lib/validation/auth";
import { loginUser, signInWithGoogle } from "@/lib/auth/auth-client";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorParam = searchParams.get("error");
  const confirmedParam = searchParams.get("confirmed");
  const messageParam = searchParams.get("message");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: true,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [serverSuccess, setServerSuccess] = useState("");
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(false);

  // Derive active message alerts directly from state or URL query parameters
  const displayedError = serverError || (errorParam ? decodeURIComponent(errorParam) : "");
  const displayedSuccess =
    serverSuccess ||
    (messageParam ? decodeURIComponent(messageParam) : "") ||
    (confirmedParam === "true"
      ? "Your email has been verified successfully! You can now sign in."
      : "");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? checked : value;

    setFormData((prev) => ({ ...prev, [name]: val }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (serverError) setServerError("");
  };

  const handleGoogleSignIn = async () => {
    setServerError("");
    setServerSuccess("");
    setOauthLoading(true);

    try {
      const nextDest = searchParams.get("next") || "/dashboard";
      const res = await signInWithGoogle({ nextUrl: nextDest });
      if (!res.success) {
        setServerError(res.message || "Failed to initiate Google Sign-In.");
        setOauthLoading(false);
      }
    } catch {
      setServerError("An unexpected error occurred with Google Sign-In. Please try again.");
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    setServerSuccess("");
    setUnconfirmedEmail(false);

    // 1. Client-side validation
    const validation = validateLoginForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setLoading(true);

    try {
      // 2. Call backend authentication route (/api/auth/login)
      const res = await loginUser({
        email: formData.email,
        password: formData.password,
      });

      if (!res.success) {
        if (res.requiresConfirmation) {
          setUnconfirmedEmail(true);
          setServerError(
            "Email confirmation is required before signing in. Please check your inbox for the confirmation link.",
          );
        } else {
          setServerError(res.message || "Invalid email or password.");
        }
        if (res.errors) {
          setErrors(res.errors);
        }
      } else {
        setServerSuccess("Welcome back! Redirecting to your dashboard...");
        const nextDest = searchParams.get("next") || "/dashboard";
        setTimeout(() => {
          router.push(nextDest);
        }, 600);
      }
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card variant="raised-lg" className="w-full">
      <CardHeader className="text-center sm:text-left">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold text-[#172033]">
            Welcome Back
          </CardTitle>
        </div>
        <CardDescription className="text-sm mt-1">
          Sign in to manage your invoices, track payments, and access the AI financial pilot.
        </CardDescription>
      </CardHeader>

      <Divider className="my-4" />

      {/* Server Alerts */}
      {displayedError && (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-xl bg-red-50 border border-[#DC2626]/30 text-[#DC2626] text-xs leading-relaxed flex items-start gap-2.5 shadow-inset-sm"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{unconfirmedEmail ? "Verification Pending" : "Authentication Failed"}</p>
            <p>{displayedError}</p>
          </div>
        </div>
      )}

      {displayedSuccess && (
        <div
          role="status"
          className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-[#16A34A]/30 text-[#16A34A] text-xs leading-relaxed flex items-center gap-2.5 shadow-inset-sm"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p className="font-semibold">{displayedSuccess}</p>
        </div>
      )}

      {/* Google OAuth Button */}
      <div className="space-y-4">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          loading={oauthLoading}
          disabled={loading || oauthLoading}
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-2.5 font-semibold text-[#172033]"
          icon={Google}
          iconPosition="left"
        >
          Sign in with Google
        </Button>

        <div className="relative my-4 flex items-center justify-center">
          <div className="w-full border-t border-[#CBD5E1]" />
          <span className="absolute bg-[#E8EDF4] px-3 text-xs uppercase tracking-wider text-[#64748B]">
            or sign in with email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Email Field */}
        <Input
          label="Email Address"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="freelancer@domain.com"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          leadingIcon={Mail}
          disabled={loading || oauthLoading}
        />

        {/* Password Field */}
        <Input
          label="Password"
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          leadingIcon={Lock}
          disabled={loading || oauthLoading}
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

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between pt-1">
          <Checkbox
            id="rememberMe"
            name="rememberMe"
            label="Remember me"
            checked={formData.rememberMe}
            onChange={(checked) =>
              setFormData((prev) => ({ ...prev, rememberMe: checked }))
            }
            disabled={loading || oauthLoading}
          />

          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          disabled={loading || oauthLoading}
          className="w-full mt-2"
          icon={ArrowRight}
          iconPosition="right"
        >
          Sign In
        </Button>
      </form>

      <CardFooter className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-[#64748B] pt-4 mt-6">
        <span>Don&apos;t have an account yet?</span>
        <Link
          href="/register"
          className="font-bold text-[#2563EB] hover:text-[#1D4ED8] hover:underline transition-colors"
        >
          Create free account
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
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
      <LoginContent />
    </Suspense>
  );
}
