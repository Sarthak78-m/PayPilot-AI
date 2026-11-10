import "server-only";

import dns from "node:dns";
import { getPayPalAccessToken } from "./paypal-auth";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore if unsupported
}
import {
  PayPalError,
  PayPalAuthError,
  PayPalRateLimitError,
  PayPalTimeoutError,
  PayPalNetworkError,
  PayPalApiError,
} from "./paypal-errors";

export const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";
export const PAYPAL_PRODUCTION_BASE_URL = "https://api-m.paypal.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

/**
 * Resolves the PayPal base URL based on environment variables.
 * Defaults all development, testing, and unconfigured environments to Sandbox.
 *
 * @param {string} [baseUrlEnv] - Explicit PAYPAL_BASE_URL override.
 * @param {string} [environmentEnv] - PAYPAL_ENVIRONMENT ("sandbox" | "production").
 * @returns {string} Fully qualified base URL without trailing slashes.
 */
export function resolvePayPalBaseUrl(
  baseUrlEnv = process.env.PAYPAL_BASE_URL,
  environmentEnv = process.env.PAYPAL_ENVIRONMENT || process.env.PAYPAL_MODE
) {
  if (baseUrlEnv && typeof baseUrlEnv === "string" && baseUrlEnv.trim()) {
    const trimmed = baseUrlEnv.trim().replace(/\/+$/, "");
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:") {
        throw new PayPalError(
          `Untrusted PayPal base URL "${trimmed}": Protocol must be HTTPS.`,
          { code: "UNTRUSTED_PAYPAL_BASE_URL" }
        );
      }
      const isTrustedHost =
        parsed.hostname === "paypal.com" ||
        parsed.hostname.endsWith(".paypal.com");

      if (!isTrustedHost) {
        throw new PayPalError(
          `Untrusted PayPal base URL "${trimmed}": Host must belong to paypal.com.`,
          { code: "UNTRUSTED_PAYPAL_BASE_URL" }
        );
      }
      return trimmed;
    } catch (err) {
      if (err instanceof PayPalError) throw err;
      throw new PayPalError(
        `Invalid PayPal base URL "${trimmed}": Must be a valid HTTPS URL.`,
        { code: "UNTRUSTED_PAYPAL_BASE_URL" }
      );
    }
  }

  const env = (environmentEnv || "").trim().toLowerCase();
  if (env === "production") {
    return PAYPAL_PRODUCTION_BASE_URL;
  }

  return PAYPAL_SANDBOX_BASE_URL;
}

/**
 * Validates and retrieves server-side PayPal credentials and operational environment.
 * Never exposes credentials to client-side bundles.
 *
 * @returns {{
 *   clientId: string,
 *   clientSecret: string,
 *   baseUrl: string,
 *   environment: "sandbox" | "production"
 * }}
 */
export function getPayPalConfig() {
  const sanitize = (val) => (typeof val === "string" ? val.trim().replace(/^["']|["']$/g, "").trim() : "");
  const clientId = sanitize(process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID);
  const clientSecret = sanitize(process.env.PAYPAL_CLIENT_SECRET);
  const rawEnv = sanitize(process.env.PAYPAL_MODE || process.env.PAYPAL_ENVIRONMENT).toLowerCase();
  const environment = rawEnv === "production" ? "production" : "sandbox";
  const baseUrl = resolvePayPalBaseUrl(process.env.PAYPAL_BASE_URL, rawEnv);
  const currency = (sanitize(process.env.PAYPAL_CURRENCY) || "USD").toUpperCase();

  if (!clientId || !clientSecret) {
    throw new PayPalError(
      "Missing PayPal server environment variables: PAYPAL_CLIENT_ID and/or PAYPAL_CLIENT_SECRET must be configured.",
      { code: "MISSING_PAYPAL_CREDENTIALS" }
    );
  }

  return {
    clientId,
    clientSecret,
    baseUrl,
    environment,
    currency,
  };
}

/**
 * Executes an authenticated HTTP request against the PayPal REST API.
 * Automatically injects OAuth bearer authorization, idempotency headers,
 * request timeouts, and typed error handling.
 *
 * @param {object} params
 * @param {string} params.endpoint - Relative API path (e.g. "/v2/checkout/orders").
 * @param {string} [params.method="GET"] - HTTP method.
 * @param {object|null} [params.body=null] - Request payload (will be JSON stringified).
 * @param {object} [params.headers={}] - Additional HTTP headers.
 * @param {string|null} [params.requestId=null] - PayPal-Request-Id idempotency token.
 * @param {object|null} [params.config=null] - Optional PayPal configuration override.
 * @param {number} [params.timeoutMs=15000] - Request timeout in milliseconds.
 * @returns {Promise<any>} Parsed response data or null (for 204 No Content).
 */
export async function executePayPalRequest({
  endpoint,
  method = "GET",
  body = null,
  headers = {},
  requestId = null,
  config = null,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  const resolvedConfig = config || getPayPalConfig();
  const accessToken = await getPayPalAccessToken(resolvedConfig, { timeoutMs });

  const url = `${resolvedConfig.baseUrl.replace(/\/+$/, "")}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const requestHeaders = {
    "Accept": "application/json",
    "Authorization": `Bearer ${accessToken}`,
    "Prefer": "return=representation",
    ...headers,
  };

  if (body !== null && body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (requestId) {
    requestHeaders["PayPal-Request-Id"] = String(requestId);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body !== null && body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted || err.name === "AbortError" || err.name === "TimeoutError") {
      throw new PayPalTimeoutError(`PayPal REST request timed out after ${timeoutMs}ms.`);
    }
    if (err instanceof PayPalError) {
      throw err;
    }
    throw new PayPalNetworkError(`PayPal REST network request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  // 1. Handle HTTP 401 Unauthorized
  if (res.status === 401) {
    throw new PayPalAuthError("PayPal REST request unauthorized. Access token may be invalid or expired.", {
      statusCode: 401,
    });
  }

  // 2. Handle HTTP 429 Rate Limit
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    throw new PayPalRateLimitError("PayPal REST API rate limit reached.", { retryAfter });
  }

  // 3. Handle non-2xx HTTP responses
  if (!res.ok) {
    let errorName = "API_ERROR";
    let message = `PayPal API returned HTTP ${res.status}.`;
    let debugId = res.headers.get("paypal-debug-id") || null;
    let details = [];

    try {
      const errJson = await res.json();
      if (errJson.name) errorName = errJson.name;
      if (errJson.message) message = errJson.message;
      if (errJson.debug_id) debugId = errJson.debug_id;
      if (Array.isArray(errJson.details)) details = errJson.details;
    } catch {
      // Non-JSON error payload (e.g. 502/503 HTML gateway error)
    }

    throw new PayPalApiError(message, {
      statusCode: res.status,
      errorName,
      debugId,
      details,
    });
  }

  // 4. Handle 204 No Content
  if (res.status === 204) {
    return null;
  }

  // 5. Parse JSON payload
  try {
    return await res.json();
  } catch {
    throw new PayPalApiError("Invalid JSON received from PayPal REST API.", {
      statusCode: res.status,
      errorName: "INVALID_JSON_RESPONSE",
    });
  }
}
