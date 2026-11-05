import crypto from "node:crypto";
import "server-only";

// In-memory rate limiter fallback for testing or before database migration execution
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
 * Executes fixed-window rate limit evaluation. First attempts the privileged
 * database function public.check_rate_limit; if database migration is pending,
 * seamlessly falls back to an in-memory fixed window.
 *
 * @param {object} params
 * @param {string} params.key - Sanitized rate limit key.
 * @param {number} params.limit - Maximum permitted requests within window.
 * @param {number} params.windowSeconds - Window duration in seconds.
 * @param {object} [params.supabaseClient] - Trusted Supabase service-role client.
 * @returns {Promise<{ allowed: boolean, currentPoints: number, limit: number, retryAfter: number }>}
 */
export async function enforceRateLimit({ key, limit, windowSeconds, supabaseClient }) {
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
          currentPoints: data.current_points || 1,
          limit: data.limit || limit,
          retryAfter: data.retry_after || windowSeconds,
        };
      }
    } catch {
      // Fall through to in-memory fallback
    }
  }

  // In-memory fallback
  const now = Date.now();
  const entry = fallbackStore.get(key);

  if (entry && now < entry.resetAt) {
    entry.points += 1;
    const allowed = entry.points <= limit;
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    return {
      allowed,
      currentPoints: entry.points,
      limit,
      retryAfter,
    };
  }

  // New window
  const resetAt = now + windowSeconds * 1000;
  fallbackStore.set(key, { points: 1, resetAt });

  return {
    allowed: true,
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
