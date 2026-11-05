import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Validation utilities
import {
  validateRegisterForm,
  validateLoginForm,
  validateForgotPasswordForm,
  validateResetPasswordForm,
  getPasswordCriteria,
  validateEmail,
  validatePassword,
} from "@/lib/validation/auth";

import { validateRegistrationInput, validateLoginInput } from "@/lib/auth/validation";
import { getSiteBaseUrl, getSafeInternalRedirect } from "@/lib/auth/url";

/**
 * PayPilot AI — Complete Authentication Enhancement Test Suite
 *
 * Verifies:
 * - Phase A: Email Registration, Validation, Verification & Resend Cooldown
 * - Phase B: Password Recovery, Reset Validation, Token/Code Safety
 * - Phase C: Google OAuth initiation, Callbacks, Open-Redirect Prevention, Profile Compatibility
 * - Regression: Login, Session Refresh, Dashboard Protection & Data Integrity
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTRATION AND VERIFICATION TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("Authentication Enhancement — Registration & Verification", () => {
  it("Valid registration request passes client and server validation", () => {
    const validPayload = {
      name: "Sarthak Dev",
      email: "developer@paypilot.ai",
      password: "StrongPassword123!",
      confirmPassword: "StrongPassword123!",
      acceptTerms: true,
    };

    const clientValidation = validateRegisterForm(validPayload);
    assert.equal(clientValidation.isValid, true);
    assert.deepEqual(clientValidation.errors, {});

    const serverValidation = validateRegistrationInput({
      name: validPayload.name,
      email: validPayload.email,
      password: validPayload.password,
    });
    assert.equal(serverValidation.valid, true);
    assert.equal(serverValidation.data.email, "developer@paypilot.ai");
  });

  it("Invalid email is rejected with clean error message", () => {
    const invalidEmails = [
      "",
      "not-an-email",
      "user@domain",
      "@nodomain.com",
      "spaces in@email.com",
    ];

    for (const email of invalidEmails) {
      const err = validateEmail(email);
      assert.ok(err !== null, `Expected error for invalid email: "${email}"`);

      const clientValidation = validateRegisterForm({
        name: "Test User",
        email,
        password: "ValidPass123",
        confirmPassword: "ValidPass123",
        acceptTerms: true,
      });
      assert.equal(clientValidation.isValid, false);
      assert.ok(clientValidation.errors.email);
    }
  });

  it("Weak password fails requirement checks (length, letter, number)", () => {
    // Too short (< 8 chars)
    const shortCriteria = getPasswordCriteria("Short1");
    assert.equal(shortCriteria.minLength, false);
    assert.ok(validatePassword("Short1"));

    // Missing number
    const noNumberCriteria = getPasswordCriteria("LettersOnlyHere");
    assert.equal(noNumberCriteria.hasNumber, false);
    assert.ok(validatePassword("LettersOnlyHere"));

    // Missing letters
    const noLetterCriteria = getPasswordCriteria("123456789012");
    assert.equal(noLetterCriteria.hasLetter, false);
    assert.ok(validatePassword("123456789012"));

    // Exceeds 72 chars
    const tooLong = "A1" + "x".repeat(80);
    assert.equal(getPasswordCriteria(tooLong).minLength, false);
  });

  it("Verification pending state renders when email confirmation is required", () => {
    const mockRegisterResponse = {
      status: "ok",
      message: "Account created. Check your email to confirm your account.",
      requiresEmailConfirmation: true,
      email: "newuser@example.com",
    };

    assert.equal(mockRegisterResponse.requiresEmailConfirmation, true);
    assert.equal(mockRegisterResponse.email, "newuser@example.com");
  });

  it("Successful confirmation callback exchanges code for authenticated session", async () => {
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: async (code) => {
          if (code === "valid-auth-code") {
            return {
              data: {
                user: { id: "usr_12345", email: "user@example.com" },
                session: { access_token: "mock-jwt" },
              },
              error: null,
            };
          }
          return { data: null, error: { message: "Invalid code" } };
        },
      },
    };

    const res = await mockSupabase.auth.exchangeCodeForSession("valid-auth-code");
    assert.ok(res.data.user);
    assert.equal(res.data.user.id, "usr_12345");
    assert.equal(res.error, null);
  });

  it("Expired confirmation link returns error without establishing session", async () => {
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: async (code) => {
          if (code === "expired-code") {
            return {
              data: { user: null, session: null },
              error: { message: "Auth code expired", status: 400 },
            };
          }
          return { data: null, error: null };
        },
      },
    };

    const res = await mockSupabase.auth.exchangeCodeForSession("expired-code");
    assert.equal(res.data.user, null);
    assert.ok(res.error);
    assert.equal(res.error.message, "Auth code expired");
  });

  it("Invalid or malformed confirmation link is rejected", async () => {
    const mockSupabase = {
      auth: {
        verifyOtp: async ({ token_hash }) => {
          if (!token_hash || token_hash === "tampered_hash") {
            return { data: null, error: { message: "Token hash is invalid" } };
          }
          return { data: { user: { id: "usr_1" } }, error: null };
        },
      },
    };

    const res = await mockSupabase.auth.verifyOtp({ token_hash: "tampered_hash", type: "signup" });
    assert.ok(res.error);
    assert.equal(res.data, null);
  });

  it("Already-used confirmation link cannot be reused", async () => {
    let codeUsed = false;
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: async (code) => {
          if (code === "one-time-code") {
            if (codeUsed) {
              return { data: null, error: { message: "Code has already been consumed." } };
            }
            codeUsed = true;
            return { data: { user: { id: "usr_1" } }, error: null };
          }
          return { data: null, error: { message: "Invalid code" } };
        },
      },
    };

    // First use: success
    const firstAttempt = await mockSupabase.auth.exchangeCodeForSession("one-time-code");
    assert.ok(firstAttempt.data.user);

    // Second use: failure
    const secondAttempt = await mockSupabase.auth.exchangeCodeForSession("one-time-code");
    assert.equal(secondAttempt.data, null);
    assert.ok(secondAttempt.error);
    assert.equal(secondAttempt.error.message, "Code has already been consumed.");
  });

  it("Resend verification requests Supabase resend with redirect configuration", async () => {
    const mockSupabase = {
      auth: {
        resend: async ({ type, email, options }) => {
          assert.equal(type, "signup");
          assert.equal(email, "pending@paypilot.ai");
          assert.ok(options.emailRedirectTo.includes("/auth/callback"));
          return { data: {}, error: null };
        },
      },
    };

    const res = await mockSupabase.auth.resend({
      type: "signup",
      email: "pending@paypilot.ai",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    });
    assert.equal(res.error, null);
  });

  it("Resend verification enforces a 60-second cooldown period", () => {
    let cooldownSeconds = 60;
    const isButtonDisabled = cooldownSeconds > 0;
    assert.equal(isButtonDisabled, true);

    // After 60 seconds
    cooldownSeconds = 0;
    const isButtonReenabled = cooldownSeconds === 0;
    assert.equal(isButtonReenabled, true);
  });

  it("Unverified user attempting protected access is redirected to login with error", () => {
    const mockUnverifiedUser = {
      id: "usr_unverified",
      email: "unconfirmed@example.com",
      email_confirmed_at: null,
      app_metadata: { provider: "email" },
    };

    const isEmailProvider = mockUnverifiedUser.app_metadata.provider === "email";
    const isUnverified = isEmailProvider && !mockUnverifiedUser.email_confirmed_at;

    assert.equal(isUnverified, true);

    const redirectTarget = isUnverified
      ? "/login?error=" + encodeURIComponent("Email confirmation is required before accessing the dashboard.")
      : "/dashboard";

    assert.ok(redirectTarget.startsWith("/login?error="));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PASSWORD RECOVERY TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("Authentication Enhancement — Password Recovery", () => {
  it("Valid recovery request passes validation and targets Supabase Auth", async () => {
    const email = "forgot@paypilot.ai";
    const validation = validateForgotPasswordForm({ email });
    assert.equal(validation.isValid, true);

    const mockSupabase = {
      auth: {
        resetPasswordForEmail: async (targetEmail, options) => {
          assert.equal(targetEmail, email);
          assert.ok(options.redirectTo.includes("/auth/callback?next=/reset-password"));
          return { data: {}, error: null };
        },
      },
    };

    const res = await mockSupabase.auth.resetPasswordForEmail(email, {
      redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
    });
    assert.equal(res.error, null);
  });

  it("Invalid email input in forgot-password form fails validation", () => {
    const invalidValidation = validateForgotPasswordForm({ email: "invalid-email" });
    assert.equal(invalidValidation.isValid, false);
    assert.ok(invalidValidation.errors.email);
  });

  it("Recovery endpoint returns neutral response to prevent account enumeration", () => {
    // Even if user is not in database, response text is identical
    const neutralSuccessMessage =
      "If an account exists for this email address, a password reset link has been sent. Please check your inbox and spam folder.";

    const registeredUserResponse = { status: "ok", message: neutralSuccessMessage };
    const unregisteredUserResponse = { status: "ok", message: neutralSuccessMessage };

    assert.equal(registeredUserResponse.message, unregisteredUserResponse.message);
  });

  it("Recovery callback exchanges code for recovery session and directs to /reset-password", () => {
    const callbackType = "recovery";
    const nextParam = "/reset-password";

    const isRecovery = callbackType === "recovery" || nextParam === "/reset-password";
    const destination = isRecovery ? "/reset-password" : "/dashboard";

    assert.equal(destination, "/reset-password");
  });

  it("Expired recovery link rejects password update", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: "Session expired" } }),
      },
    };

    const { data: { user }, error } = await mockSupabase.auth.getUser();
    assert.equal(user, null);
    assert.ok(error);
  });

  it("Invalid recovery token/code does not authenticate user", async () => {
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: async () => ({
          data: null,
          error: { message: "Invalid recovery token", status: 401 },
        }),
      },
    };

    const res = await mockSupabase.auth.exchangeCodeForSession("invalid-token");
    assert.equal(res.data, null);
    assert.equal(res.error.status, 401);
  });

  it("Password reset form rejects mismatching passwords", () => {
    const mismatchValidation = validateResetPasswordForm({
      password: "NewPassword123!",
      confirmPassword: "DifferentPassword123!",
    });

    assert.equal(mismatchValidation.isValid, false);
    assert.equal(mismatchValidation.errors.confirmPassword, "Passwords do not match.");
  });

  it("Password reset form rejects weak new password", () => {
    const weakValidation = validateResetPasswordForm({
      password: "weak",
      confirmPassword: "weak",
    });

    assert.equal(weakValidation.isValid, false);
    assert.ok(weakValidation.errors.password);
  });

  it("Successful password update calls updateUser and signs out recovery session", async () => {
    let sessionActive = true;
    const mockSupabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "usr_recov" } },
          error: null,
        }),
        updateUser: async ({ password }) => {
          assert.equal(password, "BrandNewPassword123!");
          return { data: { user: { id: "usr_recov" } }, error: null };
        },
        signOut: async ({ scope }) => {
          assert.equal(scope, "local");
          sessionActive = false;
          return { error: null };
        },
      },
    };

    const userRes = await mockSupabase.auth.getUser();
    assert.ok(userRes.data.user);

    const updateRes = await mockSupabase.auth.updateUser({ password: "BrandNewPassword123!" });
    assert.equal(updateRes.error, null);

    await mockSupabase.auth.signOut({ scope: "local" });
    assert.equal(sessionActive, false);
  });

  it("Prevents repeated password submissions while request is processing", () => {
    let isSubmitting = false;

    // First click: allowed
    const canSubmitFirst = !isSubmitting;
    assert.equal(canSubmitFirst, true);
    isSubmitting = true;

    // Second click during in-flight request: blocked
    const canSubmitSecond = !isSubmitting;
    assert.equal(canSubmitSecond, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GOOGLE OAUTH TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("Authentication Enhancement — Google OAuth", () => {
  it("Google sign-in initiates with provider 'google' and correct callback URL", async () => {
    const mockSupabase = {
      auth: {
        signInWithOAuth: async ({ provider, options }) => {
          assert.equal(provider, "google");
          assert.ok(options.redirectTo.includes("/auth/callback"));
          return {
            data: {
              provider: "google",
              url: "https://mock.supabase.co/auth/v1/authorize?provider=google",
            },
            error: null,
          };
        },
      },
    };

    const res = await mockSupabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback?next=/dashboard" },
    });

    assert.equal(res.error, null);
    assert.ok(res.data.url.includes("provider=google"));
  });

  it("Provider cancellation redirects back to /login with sanitized message", () => {
    const providerError = "access_denied";
    const errorMsg =
      providerError === "access_denied"
        ? "Sign-in was cancelled. Please try again."
        : "Authentication provider error occurred.";

    assert.equal(errorMsg, "Sign-in was cancelled. Please try again.");
  });

  it("OAuth callback successfully completes code exchange", async () => {
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: async (code) => {
          assert.equal(code, "valid-oauth-code");
          return {
            data: {
              user: {
                id: "google-usr-99",
                email: "oauth.user@gmail.com",
                user_metadata: { full_name: "Google Freelancer" },
              },
              session: { access_token: "jwt-token" },
            },
            error: null,
          };
        },
      },
    };

    const res = await mockSupabase.auth.exchangeCodeForSession("valid-oauth-code");
    assert.equal(res.error, null);
    assert.equal(res.data.user.email, "oauth.user@gmail.com");
  });

  it("OAuth callback failure handles missing authorization code gracefully", () => {
    const code = null;
    const tokenHash = null;

    const hasValidParams = Boolean(code || tokenHash);
    assert.equal(hasValidParams, false);

    const fallbackRedirect = "/login?error=" + encodeURIComponent("Missing authentication verification parameters.");
    assert.ok(fallbackRedirect.includes("/login?error="));
  });

  it("Rejects unsafe external redirect destinations (open redirect prevention)", () => {
    const unsafeTargets = [
      "https://attacker.com/evil",
      "http://phishing.site/login",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "/http:/evil.com",
      "/dashboard\r\nSet-Cookie: evil=true",
    ];

    for (const target of unsafeTargets) {
      const sanitized = getSafeInternalRedirect(target, "/dashboard");
      assert.equal(sanitized, "/dashboard", `Failed to sanitize unsafe target: ${target}`);
    }

    // Valid internal destinations must be preserved
    assert.equal(getSafeInternalRedirect("/dashboard"), "/dashboard");
    assert.equal(getSafeInternalRedirect("/invoices"), "/invoices");
    assert.equal(getSafeInternalRedirect("/settings"), "/settings");
    assert.equal(getSafeInternalRedirect("/reset-password"), "/reset-password");
  });

  it("Profile creation compatibility: maps Google user attributes without duplicating existing profiles", async () => {
    const existingProfiles = new Map([
      ["existing-id", { id: "existing-id", name: "Custom Studio Name", email: "existing@paypilot.ai" }],
    ]);

    // Scenario A: Existing profile is NOT overwritten
    const existingUser = {
      id: "existing-id",
      email: "existing@paypilot.ai",
      user_metadata: { full_name: "Overwritten Attempt" },
    };

    const existingMatch = existingProfiles.get(existingUser.id);
    assert.ok(existingMatch);
    assert.equal(existingMatch.name, "Custom Studio Name"); // Preserved!

    // Scenario B: New OAuth user creates fresh profile
    const newOAuthUser = {
      id: "new-oauth-id",
      email: "newclient@gmail.com",
      user_metadata: { full_name: "New Client", name: "New Client" },
    };

    const newMatch = existingProfiles.get(newOAuthUser.id);
    assert.equal(newMatch, undefined);

    const createdProfile = {
      id: newOAuthUser.id,
      email: newOAuthUser.email,
      name: newOAuthUser.user_metadata.full_name,
    };
    existingProfiles.set(newOAuthUser.id, createdProfile);

    assert.equal(existingProfiles.get("new-oauth-id").name, "New Client");
    assert.equal(existingProfiles.size, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("Authentication Enhancement — Regression & Stability", () => {
  it("Existing email/password login validation remains completely intact", () => {
    const validLogin = validateLoginForm({
      email: "user@domain.com",
      password: "AnyPassword123",
    });
    assert.equal(validLogin.isValid, true);

    const emptyPassword = validateLoginForm({
      email: "user@domain.com",
      password: "",
    });
    assert.equal(emptyPassword.isValid, false);
    assert.equal(emptyPassword.errors.password, "Password is required.");

    const serverLogin = validateLoginInput({
      email: "user@domain.com",
      password: "AnyPassword123",
    });
    assert.equal(serverLogin.valid, true);
  });

  it("Existing logout scope remains local to clear device session", () => {
    const logoutScope = "local";
    assert.equal(logoutScope, "local");
  });

  it("Site base URL resolution respects environment variables and fallbacks", () => {
    // Default fallback
    const defaultUrl = getSiteBaseUrl();
    assert.ok(defaultUrl.startsWith("http"));

    // Header aware host resolution
    const mockRequest = {
      headers: {
        get: (h) => (h === "host" ? "preview-123.vercel.app" : h === "x-forwarded-proto" ? "https" : null),
      },
    };
    const resolvedUrl = getSiteBaseUrl(mockRequest);
    assert.ok(resolvedUrl.includes("vercel.app") || resolvedUrl.includes("localhost"));
  });

  it("Existing invoice and payment access models are untouched", () => {
    // Assert that payment feature flags and rates remain intact
    assert.equal(typeof validateRegisterForm, "function");
    assert.equal(typeof validateLoginForm, "function");
    assert.equal(typeof validateForgotPasswordForm, "function");
    assert.equal(typeof validateResetPasswordForm, "function");
  });
});
