import "server-only";

import {
  PayPalAuthError,
  PayPalRateLimitError,
  PayPalTimeoutError,
  PayPalNetworkError,
  PayPalApiError,
} from "./paypal-errors";

/**
 * In-memory token cache entry.
 *
 * @type {{
 *   token: string | null,
 *   expiresAt: number,
 *   cacheKey: string | null
 * }}
 */
let tokenCache = {
  token: null,
  expiresAt: 0,
  cacheKey: null,
};

/**
 * In-flight token acquisition promise for request deduplication.
 *
 * @type {Promise<string> | null}
 */
let inFlightAuthPromise = null;

/**
 * Safety buffer (in milliseconds) subtracted from token expiry to guarantee
 * refreshing before actual PayPal token invalidation. (Default: 60 seconds)
 */
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

/**
 * Default timeout for token request in milliseconds (10 seconds).
 */
const DEFAULT_AUTH_TIMEOUT_MS = 10000;

/**
 * Generates an internal cache key based on endpoint and client ID.
 *
 * @param {string} baseUrl
 * @param {string} clientId
 * @returns {string}
 */
function createCacheKey(baseUrl, clientId) {
  return `${baseUrl.trim().toLowerCase()}::${clientId.trim()}`;
}

/**
 * Clears the in-memory PayPal access token cache.
 * Exported primarily for automated testing and isolated cache eviction.
 */
export function clearPayPalTokenCache() {
  tokenCache = {
    token: null,
    expiresAt: 0,
    cacheKey: null,
  };
  inFlightAuthPromise = null;
}

/**
 * Returns diagnostic metadata about current token cache without leaking raw token.
 *
 * @returns {{ hasCachedToken: boolean, isExpired: boolean, timeRemainingMs: number }}
 */
export function getPayPalTokenCacheStatus() {
  const now = Date.now();
  const hasCachedToken = Boolean(tokenCache.token);
  const isExpired = !hasCachedToken || now >= tokenCache.expiresAt;
  const timeRemainingMs = Math.max(0, tokenCache.expiresAt - now);

  return {
    hasCachedToken,
    isExpired,
    timeRemainingMs,
  };
}

/**
 * Fetches a fresh OAuth 2.0 access token directly from PayPal.
 *
 * @param {object} config - PayPal configuration.
 * @param {string} config.clientId - PayPal Client ID.
 * @param {string} config.clientSecret - PayPal Client Secret.
 * @param {string} config.baseUrl - PayPal Base URL.
 * @param {number} [timeoutMs] - Request timeout in milliseconds.
 * @returns {Promise<{ token: string, expiresIn: number }>}
 */
async function requestNewAccessToken({ clientId, clientSecret, baseUrl }, timeoutMs = DEFAULT_AUTH_TIMEOUT_MS) {
  const tokenUrl = `${baseUrl.replace(/\/+$/, "")}/v1/oauth2/token`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted || err.name === "AbortError" || err.name === "TimeoutError") {
      throw new PayPalTimeoutError(`PayPal OAuth request timed out after ${timeoutMs}ms.`);
    }
    throw new PayPalNetworkError(`PayPal OAuth network connection failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  // 1. Handle HTTP 401 / 403 Authentication failures
  if (res.status === 401 || res.status === 403) {
    let description = "Invalid client credentials or unauthorized.";
    try {
      const errJson = await res.json();
      if (errJson.error_description) {
        description = errJson.error_description;
      }
    } catch {
      // Ignore JSON parse failure on error body
    }
    throw new PayPalAuthError(`PayPal OAuth authentication failed (HTTP ${res.status}): ${description}`, {
      statusCode: res.status,
    });
  }

  // 2. Handle HTTP 429 Rate Limits
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    throw new PayPalRateLimitError("PayPal OAuth rate limit exceeded.", { retryAfter });
  }

  // 3. Handle other non-200 responses
  if (!res.ok) {
    let errorDetails = [];
    let errorName = "OAUTH_REQUEST_FAILED";
    try {
      const errJson = await res.json();
      errorName = errJson.error || errJson.name || errorName;
      if (errJson.error_description) {
        errorDetails.push({ issue: errJson.error_description });
      }
    } catch {
      // Ignore JSON parse failure
    }
    throw new PayPalApiError(`PayPal OAuth endpoint returned HTTP ${res.status}.`, {
      statusCode: res.status,
      errorName,
      details: errorDetails,
    });
  }

  // 4. Parse successful token payload
  let data;
  try {
    data = await res.json();
  } catch {
    throw new PayPalApiError("Invalid JSON received from PayPal OAuth endpoint.", {
      statusCode: res.status,
      errorName: "INVALID_JSON_RESPONSE",
    });
  }

  if (!data || !data.access_token) {
    throw new PayPalApiError("PayPal OAuth response missing access_token field.", {
      statusCode: res.status,
      errorName: "MISSING_ACCESS_TOKEN",
    });
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  return {
    token: data.access_token,
    expiresIn,
  };
}

/**
 * Obtains a valid PayPal OAuth 2.0 access token, using in-memory cache
 * and deduplicating concurrent in-flight requests.
 *
 * @param {object} config - PayPal configuration.
 * @param {string} config.clientId - PayPal Client ID.
 * @param {string} config.clientSecret - PayPal Client Secret.
 * @param {string} config.baseUrl - PayPal Base URL.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds.
 * @param {boolean} [options.forceRefresh=false] - Force token refresh ignoring cache.
 * @returns {Promise<string>} Bearer access token string.
 */
export async function getPayPalAccessToken(config, { timeoutMs = DEFAULT_AUTH_TIMEOUT_MS, forceRefresh = false } = {}) {
  const { clientId, clientSecret, baseUrl } = config;

  if (!clientId || !clientSecret) {
    throw new PayPalAuthError("Missing PayPal server credentials: clientId and clientSecret are required.");
  }

  const cacheKey = createCacheKey(baseUrl, clientId);
  const now = Date.now();

  // Return cached token if still valid and not forcing refresh
  if (!forceRefresh && tokenCache.token && tokenCache.cacheKey === cacheKey && now < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  // If another concurrent request is currently acquiring a token, await the same promise
  if (inFlightAuthPromise) {
    return inFlightAuthPromise;
  }

  // Start new token acquisition with concurrency deduplication
  inFlightAuthPromise = (async () => {
    try {
      const { token, expiresIn } = await requestNewAccessToken({ clientId, clientSecret, baseUrl }, timeoutMs);

      // Compute expiry timestamp with safety buffer
      const bufferMs = Math.min(TOKEN_EXPIRY_BUFFER_MS, (expiresIn * 1000) / 2);
      const expiresAt = Date.now() + expiresIn * 1000 - bufferMs;

      tokenCache = {
        token,
        expiresAt,
        cacheKey,
      };

      return token;
    } finally {
      inFlightAuthPromise = null;
    }
  })();

  return inFlightAuthPromise;
}
