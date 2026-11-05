import "server-only";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_EXPIRY_DAYS = 1;
const MAX_EXPIRY_DAYS = 30;
const DEFAULT_EXPIRY_DAYS = 7;

/**
 * Validates whether a value is a valid v4/RFC-compliant UUID.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isValidUUID(id) {
  if (typeof id !== "string") return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Validates expiration duration in days (must be integer between 1 and 30).
 *
 * @param {any} days
 * @returns {{ valid: boolean, days: number, error?: string }}
 */
export function validateExpiryDays(days) {
  if (days === undefined || days === null) {
    return { valid: true, days: DEFAULT_EXPIRY_DAYS };
  }

  const parsed = Number(days);
  if (!Number.isInteger(parsed) || parsed < MIN_EXPIRY_DAYS || parsed > MAX_EXPIRY_DAYS) {
    return {
      valid: false,
      days: DEFAULT_EXPIRY_DAYS,
      error: `Expiry duration must be an integer between ${MIN_EXPIRY_DAYS} and ${MAX_EXPIRY_DAYS} days.`,
    };
  }

  return { valid: true, days: parsed };
}

/**
 * Calculates a future ISO-8601 expiration timestamp from a day duration.
 *
 * @param {number} days
 * @returns {string} ISO-8601 timestamp string.
 */
export function calculateExpirationDate(days = DEFAULT_EXPIRY_DAYS) {
  const expiresMs = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Date(expiresMs).toISOString();
}

/**
 * Extracts and sanitizes client IP from Next.js request headers.
 *
 * @param {Request} request
 * @returns {string}
 */
export function extractClientIp(request) {
  const xForwardedFor = request?.headers?.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = request?.headers?.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  return "127.0.0.1";
}
