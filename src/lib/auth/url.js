/**
 * PayPilot AI — Authentication URL & Redirect Resolution Utility
 *
 * Resolves fully-qualified base URLs across Localhost, Vercel Previews,
 * and Production environments without open redirect vulnerabilities.
 */

const ALLOWED_REDIRECT_PATHS = [
  "/dashboard",
  "/invoices",
  "/invoices/new",
  "/invoices/generate",
  "/payments",
  "/assistant",
  "/settings",
  "/reset-password",
  "/login",
  "/register",
];

/**
 * Returns the application's base URL.
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL
 * 2. NEXT_PUBLIC_APP_URL
 * 3. VERCEL_URL (prefixed with https://)
 * 4. Fallback to http://localhost:3000
 *
 * @param {Request} [request] - Optional request to inspect headers
 * @returns {string} Fully qualified base URL without trailing slash.
 */
export function getSiteBaseUrl(request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && typeof siteUrl === "string" && siteUrl.trim()) {
    return siteUrl.trim().replace(/\/+$/, "");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && typeof appUrl === "string" && appUrl.trim()) {
    return appUrl.trim().replace(/\/+$/, "");
  }

  if (process.env.VERCEL_URL && typeof process.env.VERCEL_URL === "string" && process.env.VERCEL_URL.trim()) {
    return `https://${process.env.VERCEL_URL.trim()}`.replace(/\/+$/, "");
  }

  if (request && typeof request.headers?.get === "function") {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "http";
    if (host && !host.includes("://") && !host.includes("@")) {
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  }

  return "http://localhost:3000";
}

/**
 * Validates and sanitizes a destination path to prevent open redirect vulnerabilities.
 * Rejects external URLs, protocol-relative URLs (//evil.com), backslash tricks,
 * and control characters.
 *
 * @param {string|null|undefined} target - Untrusted destination path
 * @param {string} [fallback="/dashboard"] - Safe default fallback path
 * @returns {string} Safe internal relative path
 */
export function getSafeInternalRedirect(target, fallback = "/dashboard") {
  if (!target || typeof target !== "string") {
    return fallback;
  }

  const trimmed = target.trim();

  // Must begin with single forward slash, but not double slash or backslash
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Reject URLs with protocol schemes (e.g. /http:/evil.com)
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  // Reject control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback;
  }

  try {
    // Parse using dummy base to ensure path is strictly relative
    const parsed = new URL(trimmed, "http://localhost");
    const pathOnly = parsed.pathname;

    // Check against allowlist prefix
    const isAllowed = ALLOWED_REDIRECT_PATHS.some(
      (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
    );

    if (isAllowed) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
