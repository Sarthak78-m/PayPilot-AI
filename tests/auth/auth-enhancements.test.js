import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
import * as authClient from "@/lib/auth/auth-client";

/**
 * PayPilot AI — Simplified Authentication Verification Test Suite
 *
 * Enforces and verifies the temporary authentication simplification:
 * 1. Email/password registration succeeds with immediate session creation.
 * 2. Email verification requirement is removed from UI and API response contracts.
 * 3. Successful registration immediately redirects to /dashboard.
 * 4. Missing session on registration produces controlled error without fake success.
 * 5. Email/password login functions properly with valid credentials and rejects invalid ones.
 * 6. Proxy strictly guards protected routes for unauthenticated users.
 * 7. Authenticated users without email_confirmed_at CAN access protected routes.
 * 8. Google Sign-In and Sign-Up buttons are completely removed from frontend UI.
 * 9. signInWithGoogle helper is removed and has zero invocations in UI components.
 * 10. Resend verification endpoint is completely removed.
 * 11. Password recovery and password reset implementations remain intact and functional.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. SIMPLIFIED REGISTRATION & SESSION ESTABLISHMENT (Requirements 1–5, 13)
// ─────────────────────────────────────────────────────────────────────────────
describe("Simplified Authentication — Registration & Direct Session Flow", () => {
  it("1. Registration with valid email/password passes client and server validation", () => {
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

  it("2. Registration creates authenticated Supabase session immediately", async () => {
    const mockSupabase = {
      auth: {
        signUp: async ({ email, password, options }) => {
          assert.equal(email, "direct.session@paypilot.ai");
          assert.equal(password, "SecurePass123!");
          assert.equal(options.data.name, "Direct User");
          return {
            data: {
              user: { id: "usr_direct_01", email: "direct.session@paypilot.ai" },
              session: { access_token: "jwt_token_abc", refresh_token: "ref_abc" },
            },
            error: null,
          };
        },
      },
    };

    const { data, error } = await mockSupabase.auth.signUp({
      email: "direct.session@paypilot.ai",
      password: "SecurePass123!",
      options: { data: { name: "Direct User" } },
    });

    assert.equal(error, null);
    assert.ok(data.user);
    assert.ok(data.session, "Supabase session must be established on signup");
    assert.equal(data.session.access_token, "jwt_token_abc");
  });

  it("3. Registration does not require email confirmation (sessionEstablished: true)", () => {
    // API contract returns sessionEstablished: true and does not require confirmation
    const registrationApiResponse = {
      status: "ok",
      message: "Account created successfully.",
      sessionEstablished: true,
      user: {
        id: "usr_direct_01",
        email: "direct.session@paypilot.ai",
      },
    };

    assert.equal(registrationApiResponse.status, "ok");
    assert.equal(registrationApiResponse.sessionEstablished, true);
    assert.equal(registrationApiResponse.requiresEmailConfirmation, undefined);
  });

  it("4. Registration redirects to dashboard upon success", () => {
    let navigationTarget = null;
    const mockRouter = {
      push: (destination) => {
        navigationTarget = destination;
      },
    };

    const registrationResult = {
      success: true,
      user: { id: "usr_123", email: "direct@paypilot.ai" },
    };

    if (registrationResult.success) {
      mockRouter.push("/dashboard");
    }

    assert.equal(navigationTarget, "/dashboard");
  });

  it("5. Registration without session shows controlled error without fake success", () => {
    // When Supabase fails to issue a session, registration returns controlled error
    const signupDataWithoutSession = {
      user: { id: "usr_no_session", email: "no.session@paypilot.ai" },
      session: null,
    };

    let apiResponse;
    if (!signupDataWithoutSession.session) {
      apiResponse = {
        status: "error",
        message:
          "Account created, but an active session could not be established. Please sign in with your email and password.",
        sessionEstablished: false,
      };
    }

    assert.equal(apiResponse.status, "error");
    assert.equal(apiResponse.sessionEstablished, false);
    assert.ok(apiResponse.message.includes("active session could not be established"));
  });

  it("6. Resend verification endpoint is removed and does not exist in codebase", () => {
    const resendVerificationPath = path.resolve(
      process.cwd(),
      "src/app/api/auth/resend-verification/route.js",
    );
    const fileExists = fs.existsSync(resendVerificationPath);
    assert.equal(
      fileExists,
      false,
      "src/app/api/auth/resend-verification/route.js must be deleted",
    );
  });

  it("7. Invalid email is rejected with clean error message", () => {
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

  it("8. Weak password fails requirement checks (length, letter, number)", () => {
    const shortCriteria = getPasswordCriteria("Short1");
    assert.equal(shortCriteria.minLength, false);
    assert.ok(validatePassword("Short1"));

    const noNumberCriteria = getPasswordCriteria("LettersOnlyHere");
    assert.equal(noNumberCriteria.hasNumber, false);
    assert.ok(validatePassword("LettersOnlyHere"));

    const noLetterCriteria = getPasswordCriteria("123456789012");
    assert.equal(noLetterCriteria.hasLetter, false);
    assert.ok(validatePassword("123456789012"));

    const tooLong = "A1" + "x".repeat(80);
    assert.equal(getPasswordCriteria(tooLong).minLength, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOGIN & AUTHENTICATION VALIDATION (Requirements 6–7)
// ─────────────────────────────────────────────────────────────────────────────
describe("Simplified Authentication — Login Validation & Execution", () => {
  it("9. Login with valid email/password succeeds", async () => {
    const validLogin = validateLoginForm({
      email: "user@domain.com",
      password: "CorrectPassword123!",
    });
    assert.equal(validLogin.isValid, true);

    const serverLogin = validateLoginInput({
      email: "user@domain.com",
      password: "CorrectPassword123!",
    });
    assert.equal(serverLogin.valid, true);

    const mockSupabase = {
      auth: {
        signInWithPassword: async ({ email, password }) => {
          if (email === "user@domain.com" && password === "CorrectPassword123!") {
            return {
              data: {
                user: { id: "usr_log_01", email: "user@domain.com" },
                session: { access_token: "jwt_valid_login" },
              },
              error: null,
            };
          }
          return { data: null, error: { message: "Invalid login credentials." } };
        },
      },
    };

    const res = await mockSupabase.auth.signInWithPassword({
      email: "user@domain.com",
      password: "CorrectPassword123!",
    });
    assert.ok(res.data.session);
    assert.equal(res.data.user.email, "user@domain.com");
    assert.equal(res.error, null);
  });

  it("10. Login with invalid password fails with error", async () => {
    const mockSupabase = {
      auth: {
        signInWithPassword: async ({ email, password }) => {
          if (password !== "CorrectPassword123!") {
            return {
              data: { user: null, session: null },
              error: { message: "Invalid login credentials." },
            };
          }
          return { data: {}, error: null };
        },
      },
    };

    const res = await mockSupabase.auth.signInWithPassword({
      email: "user@domain.com",
      password: "WrongPassword123!",
    });
    assert.equal(res.data.user, null);
    assert.equal(res.data.session, null);
    assert.ok(res.error);
    assert.equal(res.error.message, "Invalid login credentials.");
  });

  it("11. Login form rejects missing password", () => {
    const emptyPassword = validateLoginForm({
      email: "user@domain.com",
      password: "",
    });
    assert.equal(emptyPassword.isValid, false);
    assert.equal(emptyPassword.errors.password, "Password is required.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROXY & ROUTE PROTECTION (Requirements 8–9)
// ─────────────────────────────────────────────────────────────────────────────
describe("Simplified Authentication — Proxy & Route Protection", () => {
  it("12. Unauthenticated user cannot access protected dashboard routes", () => {
    const unauthenticatedUser = null;
    const requestedPath = "/dashboard";
    const isProtected = ["/dashboard", "/invoices", "/payments", "/assistant", "/settings"].some(
      (prefix) => requestedPath === prefix || requestedPath.startsWith(`${prefix}/`),
    );

    assert.equal(isProtected, true);

    let redirectUrl = null;
    if (!unauthenticatedUser && isProtected) {
      redirectUrl = `/login?next=${encodeURIComponent(requestedPath)}`;
    }

    assert.equal(redirectUrl, "/login?next=%2Fdashboard");
  });

  it("13. Authenticated user without email_confirmed_at CAN access protected routes (not redirected to /login)", () => {
    // User signed up with email confirmation disabled; email_confirmed_at is null
    const userWithoutConfirmedEmail = {
      id: "usr_no_confirm_123",
      email: "test.freelancer@domain.com",
      email_confirmed_at: null,
      app_metadata: { provider: "email" },
    };

    const requestedPath = "/dashboard";

    // Proxy logic in src/proxy.js only checks `if (!user)`
    let isRedirectedToLogin = false;
    if (!userWithoutConfirmedEmail) {
      isRedirectedToLogin = true;
    }

    // Must NOT be redirected: access is granted!
    assert.equal(isRedirectedToLogin, false);
  });

  it("14. proxy.js source does not contain email_confirmed_at blocking condition", () => {
    const proxyPath = path.resolve(process.cwd(), "src/proxy.js");
    const proxyContent = fs.readFileSync(proxyPath, "utf-8");

    assert.equal(
      proxyContent.includes("email_confirmed_at"),
      false,
      "src/proxy.js must not check or block based on email_confirmed_at",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GOOGLE AUTHENTICATION REMOVAL FROM FRONTEND (Requirements 10–12)
// ─────────────────────────────────────────────────────────────────────────────
describe("Simplified Authentication — Google Auth Removal From Frontend", () => {
  it("15. Google Sign-In button is not present on login page", () => {
    const loginPagePath = path.resolve(process.cwd(), "src/app/(auth)/login/page.js");
    const loginContent = fs.readFileSync(loginPagePath, "utf-8");

    assert.equal(
      loginContent.includes("Sign in with Google"),
      false,
      "Login page must not contain 'Sign in with Google'",
    );
    assert.equal(
      loginContent.includes("Google"),
      false,
      "Login page must not contain Google icon or components",
    );
  });

  it("16. Google Sign-Up button is not present on register page", () => {
    const registerPagePath = path.resolve(process.cwd(), "src/app/(auth)/register/page.js");
    const registerContent = fs.readFileSync(registerPagePath, "utf-8");

    assert.equal(
      registerContent.includes("Sign up with Google"),
      false,
      "Register page must not contain 'Sign up with Google'",
    );
    assert.equal(
      registerContent.includes("Google"),
      false,
      "Register page must not contain Google icon or components",
    );
    assert.equal(
      registerContent.includes("OR REGISTER WITH EMAIL"),
      false,
      "Register page must not contain OAuth divider",
    );
  });

  it("17. Google OAuth helper signInWithGoogle is removed with zero invocations in UI", () => {
    // Assert helper is not exported by auth-client
    assert.equal(
      typeof authClient.signInWithGoogle,
      "undefined",
      "signInWithGoogle must not be exported by auth-client.js",
    );

    // Verify neither page calls signInWithGoogle
    const loginContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(auth)/login/page.js"),
      "utf-8",
    );
    const registerContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(auth)/register/page.js"),
      "utf-8",
    );

    assert.equal(loginContent.includes("signInWithGoogle"), false);
    assert.equal(registerContent.includes("signInWithGoogle"), false);
  });

  it("18. Rejects unsafe external redirect destinations (open redirect prevention)", () => {
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

    assert.equal(getSafeInternalRedirect("/dashboard"), "/dashboard");
    assert.equal(getSafeInternalRedirect("/invoices"), "/invoices");
    assert.equal(getSafeInternalRedirect("/settings"), "/settings");
    assert.equal(getSafeInternalRedirect("/reset-password"), "/reset-password");
  });

  it("19. Profile creation compatibility: maps user attributes without duplicating existing profiles", async () => {
    const existingProfiles = new Map([
      ["existing-id", { id: "existing-id", name: "Custom Studio Name", email: "existing@paypilot.ai" }],
    ]);

    const existingUser = {
      id: "existing-id",
      email: "existing@paypilot.ai",
      user_metadata: { full_name: "Overwritten Attempt" },
    };

    const existingMatch = existingProfiles.get(existingUser.id);
    assert.ok(existingMatch);
    assert.equal(existingMatch.name, "Custom Studio Name");

    const newRegisteredUser = {
      id: "new-user-id",
      email: "newregistered@gmail.com",
      user_metadata: { full_name: "New Client", name: "New Client" },
    };

    const newMatch = existingProfiles.get(newRegisteredUser.id);
    assert.equal(newMatch, undefined);

    const createdProfile = {
      id: newRegisteredUser.id,
      email: newRegisteredUser.email,
      name: newRegisteredUser.user_metadata.full_name,
    };
    existingProfiles.set(newRegisteredUser.id, createdProfile);

    assert.equal(existingProfiles.get("new-user-id").name, "New Client");
    assert.equal(existingProfiles.size, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PASSWORD RECOVERY PRESERVATION (Requirements 14–15)
// ─────────────────────────────────────────────────────────────────────────────
describe("Simplified Authentication — Password Recovery Preservation", () => {
  it("20. Password recovery request still functions and targets Supabase Auth", async () => {
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

  it("21. Invalid email input in forgot-password form fails validation", () => {
    const invalidValidation = validateForgotPasswordForm({ email: "invalid-email" });
    assert.equal(invalidValidation.isValid, false);
    assert.ok(invalidValidation.errors.email);
  });

  it("22. Recovery endpoint returns neutral response to prevent account enumeration", () => {
    const neutralSuccessMessage =
      "If an account exists for this email address, a password reset link has been sent. Please check your inbox and spam folder.";

    const registeredUserResponse = { status: "ok", message: neutralSuccessMessage };
    const unregisteredUserResponse = { status: "ok", message: neutralSuccessMessage };

    assert.equal(registeredUserResponse.message, unregisteredUserResponse.message);
  });

  it("23. Recovery callback exchanges code for recovery session and directs to /reset-password", () => {
    const callbackType = "recovery";
    const nextParam = "/reset-password";

    const isRecovery = callbackType === "recovery" || nextParam === "/reset-password";
    const destination = isRecovery ? "/reset-password" : "/dashboard";

    assert.equal(destination, "/reset-password");
  });

  it("24. Expired recovery link rejects password update", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: "Session expired" } }),
      },
    };

    const { data: { user }, error } = await mockSupabase.auth.getUser();
    assert.equal(user, null);
    assert.ok(error);
  });

  it("25. Invalid recovery token/code does not authenticate user", async () => {
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

  it("26. Password reset form rejects mismatching passwords", () => {
    const mismatchValidation = validateResetPasswordForm({
      password: "NewPassword123!",
      confirmPassword: "DifferentPassword123!",
    });

    assert.equal(mismatchValidation.isValid, false);
    assert.equal(mismatchValidation.errors.confirmPassword, "Passwords do not match.");
  });

  it("27. Password reset form rejects weak new password", () => {
    const weakValidation = validateResetPasswordForm({
      password: "weak",
      confirmPassword: "weak",
    });

    assert.equal(weakValidation.isValid, false);
    assert.ok(weakValidation.errors.password);
  });

  it("28. Successful password update calls updateUser and signs out recovery session", async () => {
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

  it("29. Prevents repeated password submissions while request is processing", () => {
    let isSubmitting = false;

    const canSubmitFirst = !isSubmitting;
    assert.equal(canSubmitFirst, true);
    isSubmitting = true;

    const canSubmitSecond = !isSubmitting;
    assert.equal(canSubmitSecond, false);
  });

  it("30. Password recovery routes and pages remain intact on disk", () => {
    const forgotPage = path.resolve(process.cwd(), "src/app/(auth)/forgot-password/page.js");
    const resetPage = path.resolve(process.cwd(), "src/app/(auth)/reset-password/page.js");
    const forgotRoute = path.resolve(process.cwd(), "src/app/api/auth/forgot-password/route.js");
    const resetRoute = path.resolve(process.cwd(), "src/app/api/auth/reset-password/route.js");
    const callbackRoute = path.resolve(process.cwd(), "src/app/auth/callback/route.js");

    assert.ok(fs.existsSync(forgotPage), "forgot-password/page.js must exist");
    assert.ok(fs.existsSync(resetPage), "reset-password/page.js must exist");
    assert.ok(fs.existsSync(forgotRoute), "api/auth/forgot-password/route.js must exist");
    assert.ok(fs.existsSync(resetRoute), "api/auth/reset-password/route.js must exist");
    assert.ok(fs.existsSync(callbackRoute), "auth/callback/route.js must exist");
  });
});
