/**
 * PayPilot AI — Authentication Client
 *
 * Interfaces with the existing Next.js / Supabase backend route handlers (/api/auth/*).
 * Follows strict backend protection rules: never fabricates fake authentication.
 */

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
  } catch (err) {
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
    };
  } catch (err) {
    return {
      success: false,
      status: 0,
      message: "Unable to connect to the authentication server. Please check your network or try again.",
      errors: {},
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
    });

    // Check if backend endpoint is implemented or returning 404
    if (res.status === 404) {
      return {
        success: false,
        isMissingEndpoint: true,
        message:
          "The backend password recovery route (/api/auth/forgot-password) is not yet implemented on the server.",
      };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        message: data.message || "Failed to submit password reset request.",
      };
    }

    return {
      success: true,
      message: data.message || "Password reset instructions have been sent to your email.",
    };
  } catch (err) {
    return {
      success: false,
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
    });

    if (res.status === 404) {
      return {
        success: false,
        isMissingEndpoint: true,
        message:
          "The backend password reset route (/api/auth/reset-password) is not yet implemented on the server.",
      };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        message: data.message || "Failed to reset password. The link may have expired.",
      };
    }

    return {
      success: true,
      message: data.message || "Password updated successfully. You may now sign in.",
    };
  } catch {
    return {
      success: false,
      message: "Network error while confirming password reset.",
    };
  }
}

