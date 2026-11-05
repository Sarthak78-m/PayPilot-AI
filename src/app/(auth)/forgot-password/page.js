"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Mail,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  KeyRound,
  ArrowRight,
} from "@/components/icons";
import { validateForgotPasswordForm } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/auth/auth-client";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const validation = validateForgotPasswordForm({ email });
    if (!validation.isValid) {
      setError(validation.errors.email);
      return;
    }

    setLoading(true);

    try {
      const res = await requestPasswordReset({ email });

      if (res.isMissingEndpoint) {
        setError("Password reset service is temporarily unavailable. Please try again later or contact support.");
      } else if (!res.success) {
        setError(res.message || "Failed to send reset link.");
      } else {
        setIsSubmitted(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <Card variant="raised-lg" className="w-full text-center space-y-5 py-8">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-500/10 text-[#2563EB] flex items-center justify-center shadow-raised-sm">
          <KeyRound className="h-8 w-8 text-[#2563EB]" />
        </div>

        <div className="space-y-2">
          <Badge variant="primary" size="sm">
            Check Your Email
          </Badge>
          <CardTitle className="text-2xl font-bold text-[#172033]">
            Reset Link Dispatched
          </CardTitle>
          <CardDescription className="text-sm max-w-sm mx-auto leading-relaxed">
            If an account is registered with{" "}
            <span className="font-semibold text-[#172033]">{email}</span>, you will receive password reset instructions within a few minutes.
          </CardDescription>
        </div>

        

        <Divider />

        <div className="space-y-3 pt-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            icon={ArrowLeft}
            iconPosition="left"
            onClick={() => router.push("/login")}
          >
            Back to Sign In
          </Button>

          <button
            type="button"
            onClick={() => setIsSubmitted(false)}
            className="text-xs font-semibold text-[#64748B] hover:text-[#2563EB] transition-colors"
          >
            Didn&apos;t receive anything? Try another email
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="raised-lg" className="w-full">
      <CardHeader className="text-center sm:text-left">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold text-[#172033]">
            Reset Password
          </CardTitle>
        </div>
        <CardDescription className="text-sm mt-1">
          Enter the email address associated with your PayPilot AI account and we will send you a recovery link.
        </CardDescription>
      </CardHeader>

      <Divider className="my-4" />

      {error && (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-xl bg-red-50 border border-[#DC2626]/30 text-[#DC2626] text-xs leading-relaxed flex items-start gap-2.5 shadow-inset-sm"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Unable to Send Reset Link</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Your Registered Email"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="freelancer@domain.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError("");
          }}
          error={error}
          leadingIcon={Mail}
          disabled={loading}
          helperText="We will never share your email address with third parties."
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
          Send Recovery Instructions
        </Button>
      </form>

      <CardFooter className="flex items-center justify-center pt-4 mt-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#2563EB] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Remember your password? Back to Sign In</span>
        </Link>
      </CardFooter>
    </Card>
  );
}

