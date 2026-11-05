/**
 * PayPilot AI — Authentication Client
 *
 * Interfaces with Next.js / Supabase backend route handlers (/api/auth/*)
 * and Supabase Auth OAuth flow.
 * Follows strict backend protection rules: never fabricates fake authentication.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function loginUser({ email, password }) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        message: data.message || "Failed to sign in. Please verify your credentials.",
        errors: data.errors || {},
        requiresConfirmation: res.status === 403,
      };
    }

    return {
      success: true,
      status: res.status,
      message: data.message || "Signed in successfully.",
    };
  } catch {
    return {
      success: false,
      status: 0,
      message: "Unable to connect to the authentication server. Please check your network or try again.",
      errors: {},
    };
  }
}

export async function registerUser({ name, email, password }) {
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        message: data.message || "Unable to complete registration.",
        errors: data.errors || {},
        isDuplicate: res.status === 409,
      };
    }

    return {
      success: true,
      status: res.status,
      message: data.message || "Account created successfully.",
      requiresEmailConfirmation: Boolean(data.requiresEmailConfirmation),
      email: data.email || email,
    };
  } catch {
    return {
      success: false,
      status: 0,
      message: "Unable to connect to the authentication server. Please check your network or try again.",
      errors: {},
    };
  }
}

export async function resendVerificationEmail({ email }) {
  try {
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        message: data.message || "Failed to resend confirmation email.",
      };
    }

    return {
      success: true,
      status: res.status,
      message: data.message || "Verification link dispatched.",
    };
  } catch {
    return {
      success: false,
      status: 0,
      message: "Network error while resending verification email. Please check your connection.",
    };
  }
}

export async function logoutUser() {
  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));
    return {
      success: res.ok,
      message: data.message || (res.ok ? "Signed out successfully." : "Failed to sign out."),
    };
  } catch {
    return {
      success: false,
      message: "Network error while signing out.",
    };
  }
}

export async function getSessionUser() {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      return { authenticated: false, user: null };
    }

    const data = await res.json().catch(() => ({}));
    return {
      authenticated: true,
      user: data.user || null,
    };
  } catch {
    return { authenticated: false, user: null };
  }
}

export async function requestPasswordReset({ email }) {
  try {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        message: data.message || "Failed to submit password reset request.",
      };
    }

    return {
      success: true,
      status: res.status,
      message: data.message || "Password reset instructions have been sent to your email.",
    };
  } catch {
    return {
      success: false,
      status: 0,
      message: "Network error while requesting password reset.",
    };
  }
}

export async function resetPasswordWithToken({ password, token }) {
  try {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, token }),
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        message: data.message || "Failed to reset password. The link may have expired.",
      };
    }

    return {
      success: true,
      status: res.status,
      message: data.message || "Password updated successfully. You may now sign in.",
    };
  } catch {
    return {
      success: false,
      status: 0,
      message: "Network error while confirming password reset.",
    };
  }
}

export async function signInWithGoogle({ nextUrl = "/dashboard" } = {}) {
  try {
    const supabase = createSupabaseBrowserClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return {
        success: false,
        message: error.message || "Google Sign-In service is unavailable.",
      };
    }

    if (data?.url && typeof window !== "undefined") {
      window.location.href = data.url;
      return { success: true };
    }

    return {
      success: false,
      message: "Unable to retrieve Google OAuth authorization URL.",
    };
  } catch (err) {
    return {
      success: false,
      message: err.message || "An error occurred initiating Google Sign-In.",
    };
  }
}
