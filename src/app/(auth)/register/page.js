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
} from "@/components/ui";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
} from "@/components/icons";
import {
  validateRegisterForm,
  getPasswordCriteria,
} from "@/lib/validation/auth";
import { registerUser } from "@/lib/auth/auth-client";

export default function RegisterPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");

  const passwordCriteria = getPasswordCriteria(formData.password);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? checked : value;

    setFormData((prev) => ({ ...prev, [name]: val }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (serverError) setServerError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    const validation = validateRegisterForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setLoading(true);

    try {
      const res = await registerUser({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      if (!res.success) {
        setServerError(res.message || "Failed to create account.");
        if (res.errors) {
          setErrors(res.errors);
        }
      } else {
        // Registration succeeded with immediate session: redirect directly to dashboard
        router.push("/dashboard");
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
          <CardTitle className="text-2xl font-bold text-[#172033] dark:text-[#F8FAFC]">
            Get Started
          </CardTitle>
        </div>
        <CardDescription className="text-sm mt-1 text-[#64748B] dark:text-[#94A3B8]">
          Create your PayPilot AI account to generate invoices, automate billing, and get paid faster.
        </CardDescription>
      </CardHeader>

      <Divider className="my-4" />

      {serverError && (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-[#DC2626]/30 dark:border-red-900/50 text-[#DC2626] dark:text-red-300 text-xs leading-relaxed flex items-start gap-2.5 shadow-inset-sm"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Registration Issue</p>
            <p>{serverError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Full Name */}
        <Input
          label="Full Name"
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="Alex Rivera"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          leadingIcon={User}
          disabled={loading}
        />

        {/* Email Address */}
        <Input
          label="Work Email Address"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="alex@studio.design"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          leadingIcon={Mail}
          disabled={loading}
        />

        {/* Password */}
        <div className="space-y-2">
          <Input
            label="Password"
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
                className="text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          {/* Password Validation Checklist */}
          {formData.password && (
            <div className="p-2.5 rounded-xl bg-[#E8EDF4] dark:bg-[#111726] shadow-inset-sm space-y-1.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <p className="font-semibold text-[11px] uppercase tracking-wider text-[#172033] dark:text-[#F8FAFC]">
                Password Requirements
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-3 w-3 rounded-full flex items-center justify-center text-[9px] font-bold ${passwordCriteria.minLength
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
                    className={`h-3 w-3 rounded-full flex items-center justify-center text-[9px] font-bold ${passwordCriteria.hasLetter
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
                    className={`h-3 w-3 rounded-full flex items-center justify-center text-[9px] font-bold ${passwordCriteria.hasNumber
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
          label="Confirm Password"
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
              className="text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />


        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          disabled={loading}
          className="w-full mt-2"
          icon={ArrowRight}
          iconPosition="right"
        >
          Create Free Account
        </Button>
      </form>

      <CardFooter className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-[#64748B] pt-4 mt-6">
        <span>Already have a PayPilot AI account?</span>
        <Link
          href="/login"
          className="font-bold text-[#2563EB] hover:text-[#1D4ED8] hover:underline transition-colors"
        >
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
