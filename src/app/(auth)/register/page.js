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
  Checkbox,
  Divider,
  Badge,
} from "@/components/ui";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
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
    acceptTerms: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

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
        setRegisteredEmail(formData.email);
        setIsSuccess(true);
        setRequiresConfirmation(res.requiresEmailConfirmation);
      }
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Confirmation state screen after successful registration
  if (isSuccess) {
    return (
      <Card variant="raised-lg" className="w-full text-center space-y-5 py-8">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 text-[#16A34A] flex items-center justify-center shadow-raised-sm">
          <CheckCircle2 className="h-8 w-8 text-[#16A34A]" />
        </div>

        <div className="space-y-2">
          <Badge variant="success" size="sm">
            {requiresConfirmation ? "Action Required" : "Account Ready"}
          </Badge>
          <CardTitle className="text-2xl font-bold text-[#172033]">
            {requiresConfirmation ? "Verify Your Email" : "Welcome to PayPilot AI"}
          </CardTitle>
          <CardDescription className="text-sm max-w-sm mx-auto leading-relaxed">
            {requiresConfirmation ? (
              <>
                We have sent an activation link to{" "}
                <span className="font-semibold text-[#172033]">{registeredEmail}</span>.
                Please check your inbox to confirm your account.
              </>
            ) : (
              "Your account has been created successfully. You can now log in to start issuing AI invoices."
            )}
          </CardDescription>
        </div>

        <Divider />

        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => router.push("/login")}
            icon={ArrowRight}
            iconPosition="right"
          >
            Proceed to Sign In
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
            Get Started
          </CardTitle>
          <Badge variant="primary" size="sm">
            Free Freelance Tier
          </Badge>
        </div>
        <CardDescription className="text-sm mt-1">
          Create your PayPilot AI account to generate invoices, automate billing, and get paid faster.
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
                Password Requirements
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
              className="text-[#64748B] hover:text-[#172033] p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        {/* Terms and Conditions Checkbox */}
        <div className="pt-1">
          <Checkbox
            id="acceptTerms"
            name="acceptTerms"
            label={
              <span className="text-xs text-[#64748B]">
                I agree to the{" "}
                <a href="#" className="font-semibold text-[#2563EB] hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#" className="font-semibold text-[#2563EB] hover:underline">
                  Privacy Policy
                </a>
                .
              </span>
            }
            checked={formData.acceptTerms}
            onChange={(checked) => {
              setFormData((prev) => ({ ...prev, acceptTerms: checked }));
              if (errors.acceptTerms) {
                setErrors((prev) => ({ ...prev, acceptTerms: null }));
              }
            }}
            disabled={loading}
          />
          {errors.acceptTerms && (
            <p className="text-xs text-[#DC2626] font-medium mt-1">
              {errors.acceptTerms}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
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

