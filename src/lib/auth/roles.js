import "server-only";

/**
 * PayPilot AI — Role-Based Authorization Engine
 *
 * Implements administrative authorization checks for sensitive operations
 * such as payment refunds, system audit inspection, and gateway configuration.
 */

/**
 * Evaluates whether an authenticated Supabase user holds administrator privileges.
 *
 * Checks:
 * 1. User app_metadata / user_metadata "role" or "is_admin" claim.
 * 2. Dedicated ADMIN_EMAILS environment variable whitelist.
 * 3. Database profile role if profile record is supplied.
 *
 * @param {object} user - Authenticated Supabase user object.
 * @param {object} [profile] - Optional user profile record.
 * @returns {boolean} True if user has administrative rights.
 */
export function isAdminUser(user, profile = null) {
  if (!user || typeof user !== "object" || !user.id) {
    return false;
  }

  // 1. Check JWT metadata claims
  const appRole = user.app_metadata?.role || user.user_metadata?.role;
  if (appRole === "admin" || appRole === "administrator") {
    return true;
  }

  if (user.app_metadata?.is_admin === true || user.user_metadata?.is_admin === true) {
    return true;
  }

  // 2. Check Database Profile Role if provided
  if (profile?.role === "admin" || profile?.role === "administrator") {
    return true;
  }

  // 3. Check ADMIN_EMAILS environment variable whitelist
  const userEmail = (user.email || "").trim().toLowerCase();
  if (userEmail) {
    const adminEmailsEnv = process.env.ADMIN_EMAILS || "";
    const adminEmails = adminEmailsEnv
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.includes(userEmail)) {
      return true;
    }

    // Default admin demo address
    if (userEmail === "admin@paypilot.internal" || userEmail === "admin@paypilot.io") {
      return true;
    }
  }

  return false;
}
