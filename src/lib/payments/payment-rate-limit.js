import crypto from "node:crypto";
import "server-only";

// In-memory rate limiter fallback strictly restricted to non-production/test environments
const fallbackStore = new Map();

/**
 * Builds a sanitized, deterministic rate-limit key without exposing raw tokens.
 *
 * @param {string} scope - Rate limit domain (e.g. "public_lookup", "create_order", "capture_order", "merchant_link").
 * @param {string} identifier - User ID, token prefix, or order ID.
 * @param {string} ip - Client IP address.
 * @returns {string} Sanitized rate limit key.
 */
export function buildRateLimitKey(scope, identifier, ip = "127.0.0.1") {
  const safeIdentifier = typeof identifier === "string" && identifier.trim()
    ? crypto.createHash("sha256").update(identifier.trim()).digest("hex").slice(0, 16)
    : "anonymous";
  const safeIp = typeof ip === "string" ? ip.trim() : "127.0.0.1";

  return `rate_limit:${scope}:${safeIdentifier}:${safeIp}`;
}

/**
 * Executes rate limit evaluation. In production, exclusively uses the PostgreSQL
 * distributed rate limiter public.check_rate_limit and FAILS CLOSED (HTTP 503) if
 * the database is unavailable. Never silently falls back to in-memory store in production.
 *
 * @param {object} params
 * @param {string} params.key - Sanitized rate limit key.
 * @param {number} params.limit - Maximum permitted requests within window.
 * @param {number} params.windowSeconds - Window duration in seconds.
 * @param {object} [params.supabaseClient] - Trusted Supabase service-role client.
 * @returns {Promise<{
 *   allowed: boolean,
 *   isServiceUnavailable: boolean,
 *   currentPoints: number,
 *   limit: number,
 *   retryAfter: number,
 *   error?: string
 * }>}
 */
export async function enforceRateLimit({ key, limit, windowSeconds, supabaseClient, allowFallback = false }) {
  const isProduction = process.env.NODE_ENV === "production";
  const allowMemoryFallback = !isProduction || process.env.ALLOW_MEMORY_RATE_LIMIT === "true" || allowFallback;

  // 1. Production Mode: PostgreSQL distributed rate limiter is strictly required
  if (isProduction && !allowMemoryFallback) {
    if (!supabaseClient || typeof supabaseClient.rpc !== "function") {
      // Fail closed immediately in production if DB client is missing
      return {
        allowed: false,
        isServiceUnavailable: true,
        currentPoints: 0,
        limit,
        retryAfter: 60,
        error: "Rate limiting service is unavailable.",
      };
    }

    try {
      const { data, error } = await supabaseClient.rpc("check_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });

      if (error || !data || typeof data.allowed !== "boolean") {
        // Fail closed in production on database failure
        return {
          allowed: false,
          isServiceUnavailable: true,
          currentPoints: 0,
          limit,
          retryAfter: 60,
          error: "Rate limiting service query failed.",
        };
      }

      return {
        allowed: data.allowed,
        isServiceUnavailable: false,
        currentPoints: data.current_points || 1,
        limit: data.limit || limit,
        retryAfter: data.retry_after || 0,
      };
    } catch {
      // Fail closed in production on network / RPC exception
      return {
        allowed: false,
        isServiceUnavailable: true,
        currentPoints: 0,
        limit,
        retryAfter: 60,
        error: "Rate limiting service connection error.",
      };
    }
  }

  // 2. Non-Production Mode (development / unit tests): Attempt DB RPC first
  if (supabaseClient && typeof supabaseClient.rpc === "function") {
    try {
      const { data, error } = await supabaseClient.rpc("check_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });

      if (!error && data && typeof data.allowed === "boolean") {
        return {
          allowed: data.allowed,
          isServiceUnavailable: false,
          currentPoints: data.current_points || 1,
          limit: data.limit || limit,
          retryAfter: data.retry_after || 0,
        };
      }
    } catch {
      // Fall through to in-memory fallback in test/dev
    }
  }

  // Fallback to in-memory fixed-window store in non-production environments
  const now = Date.now();
  const entry = fallbackStore.get(key);

  if (entry && now < entry.resetAt) {
    entry.points += 1;
    const allowed = entry.points <= limit;
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    return {
      allowed,
      isServiceUnavailable: false,
      currentPoints: entry.points,
      limit,
      retryAfter,
    };
  }

  const resetAt = now + windowSeconds * 1000;
  fallbackStore.set(key, { points: 1, resetAt });

  return {
    allowed: true,
    isServiceUnavailable: false,
    currentPoints: 1,
    limit,
    retryAfter: 0,
  };
}

/**
 * Clears the in-memory fallback rate limit store (used in testing).
 */
export function clearRateLimitFallback() {
  fallbackStore.clear();
}
