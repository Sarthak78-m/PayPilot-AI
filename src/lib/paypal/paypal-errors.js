import "server-only";

/**
 * Strips sensitive authentication tokens, authorization headers,
 * and credentials from error message strings.
 *
 * @param {string} text - Message to sanitize.
 * @returns {string} Sanitized string.
 */
export function sanitizePayPalMessage(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/Basic\s+[A-Za-z0-9+/=_-]+/gi, "Basic [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9+/=._-]+/gi, "Bearer [REDACTED]")
    .replace(/(client_secret=)[^&]+/gi, "$1[REDACTED]")
    .replace(/(client_id=)[^&]+/gi, "$1[REDACTED]");
}

/**
 * Base class for all PayPal-related errors.
 */
export class PayPalError extends Error {
  constructor(message, options = {}) {
    super(sanitizePayPalMessage(message));
    this.name = "PayPalError";
    this.code = options.code || "PAYPAL_ERROR";
    if (options.cause) {
      this.cause = options.cause;
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Thrown when PayPal OAuth 2.0 authentication fails (HTTP 401/403 or invalid credentials).
 */
export class PayPalAuthError extends PayPalError {
  constructor(message = "PayPal authentication failed.", options = {}) {
    super(message, { ...options, code: options.code || "PAYPAL_AUTH_ERROR" });
    this.name = "PayPalAuthError";
    this.statusCode = options.statusCode || 401;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
    };
  }
}

/**
 * Thrown when PayPal returns HTTP 429 Too Many Requests.
 */
export class PayPalRateLimitError extends PayPalError {
  constructor(message = "PayPal rate limit exceeded.", options = {}) {
    super(message, { ...options, code: options.code || "PAYPAL_RATE_LIMIT" });
    this.name = "PayPalRateLimitError";
    this.statusCode = 429;
    this.retryAfter = options.retryAfter !== undefined && options.retryAfter !== null
      ? Number(options.retryAfter)
      : null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Thrown when a PayPal network request times out.
 */
export class PayPalTimeoutError extends PayPalError {
  constructor(message = "PayPal request timed out.", options = {}) {
    super(message, { ...options, code: options.code || "PAYPAL_TIMEOUT" });
    this.name = "PayPalTimeoutError";
    this.statusCode = 504;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
    };
  }
}

/**
 * Thrown when a low-level network failure occurs (e.g. DNS failure, connection reset).
 */
export class PayPalNetworkError extends PayPalError {
  constructor(message = "PayPal network connection failed.", options = {}) {
    super(message, { ...options, code: options.code || "PAYPAL_NETWORK_ERROR" });
    this.name = "PayPalNetworkError";
    this.statusCode = 502;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
    };
  }
}

/**
 * Thrown when PayPal returns a non-2xx API error (e.g. 400, 422, 500, 503).
 */
export class PayPalApiError extends PayPalError {
  constructor(message, options = {}) {
    super(message || "PayPal API returned an error.", {
      ...options,
      code: options.code || "PAYPAL_API_ERROR",
    });
    this.name = "PayPalApiError";
    this.statusCode = options.statusCode || 500;
    this.errorName = options.errorName || "UNKNOWN_ERROR";
    this.debugId = options.debugId || null;
    this.details = Array.isArray(options.details) ? options.details : [];
  }

  toJSON() {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
      errorName: this.errorName,
      debugId: this.debugId,
      details: this.details,
    };
  }
}
