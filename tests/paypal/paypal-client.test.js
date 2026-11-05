import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getPayPalConfig,
  resolvePayPalBaseUrl,
  executePayPalRequest,
  PAYPAL_SANDBOX_BASE_URL,
  PAYPAL_PRODUCTION_BASE_URL,
} from "@/lib/paypal/paypal-client";
import { clearPayPalTokenCache } from "@/lib/paypal/paypal-auth";
import {
  PayPalError,
  PayPalAuthError,
  PayPalRateLimitError,
  PayPalTimeoutError,
  PayPalNetworkError,
  PayPalApiError,
  sanitizePayPalMessage,
} from "@/lib/paypal/paypal-errors";

describe("PayPal REST Client & Configuration", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearPayPalTokenCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    clearPayPalTokenCache();
  });

  it("13. Throws descriptive error when required PayPal environment variables are missing", () => {
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;

    assert.throws(
      () => getPayPalConfig(),
      (err) => {
        assert.ok(err instanceof PayPalError);
        assert.match(err.message, /Missing PayPal server environment variables/);
        return true;
      }
    );

    // Partial configuration (only clientId set)
    process.env.PAYPAL_CLIENT_ID = "some_id";
    delete process.env.PAYPAL_CLIENT_SECRET;

    assert.throws(() => getPayPalConfig(), PayPalError);
  });

  it("15. Correctly selects Sandbox and Production base URLs based on configuration", () => {
    // 15a: Default when no env set -> Sandbox
    assert.equal(resolvePayPalBaseUrl(undefined, undefined), PAYPAL_SANDBOX_BASE_URL);
    assert.equal(resolvePayPalBaseUrl("", "sandbox"), PAYPAL_SANDBOX_BASE_URL);
    assert.equal(resolvePayPalBaseUrl(undefined, "development"), PAYPAL_SANDBOX_BASE_URL);

    // 15b: Explicit production environment
    assert.equal(resolvePayPalBaseUrl(undefined, "production"), PAYPAL_PRODUCTION_BASE_URL);
    assert.equal(resolvePayPalBaseUrl("", "PRODUCTION"), PAYPAL_PRODUCTION_BASE_URL);

    // 15c: Custom PAYPAL_BASE_URL override takes precedence and trims trailing slashes
    assert.equal(
      resolvePayPalBaseUrl("https://custom-proxy.sandbox.paypal.com/paypal///", "production"),
      "https://custom-proxy.sandbox.paypal.com/paypal"
    );

    // 15d: Rejects non-HTTPS or non-paypal.com URLs
    assert.throws(
      () => resolvePayPalBaseUrl("http://api-m.sandbox.paypal.com", "sandbox"),
      (err) => {
        assert.ok(err instanceof PayPalError);
        assert.equal(err.code, "UNTRUSTED_PAYPAL_BASE_URL");
        return true;
      }
    );
    assert.throws(
      () => resolvePayPalBaseUrl("https://evil-paypal.com", "sandbox"),
      (err) => {
        assert.ok(err instanceof PayPalError);
        assert.equal(err.code, "UNTRUSTED_PAYPAL_BASE_URL");
        return true;
      }
    );

    // 15e: getPayPalConfig integrates environment resolution
    process.env.PAYPAL_CLIENT_ID = "client_abc";
    process.env.PAYPAL_CLIENT_SECRET = "secret_xyz";
    delete process.env.PAYPAL_BASE_URL;
    process.env.PAYPAL_ENVIRONMENT = "sandbox";

    const configSandbox = getPayPalConfig();
    assert.equal(configSandbox.baseUrl, PAYPAL_SANDBOX_BASE_URL);
    assert.equal(configSandbox.environment, "sandbox");

    process.env.PAYPAL_ENVIRONMENT = "production";
    const configProduction = getPayPalConfig();
    assert.equal(configProduction.baseUrl, PAYPAL_PRODUCTION_BASE_URL);
    assert.equal(configProduction.environment, "production");
  });

  it("9. Handles invalid/malformed non-JSON PayPal API responses gracefully", async () => {
    // Mock OAuth success first, then return HTML from API call
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "VALID_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("<html><body>502 Bad Gateway from Cloudflare</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    };

    const mockConfig = {
      clientId: "id",
      clientSecret: "secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
    };

    await assert.rejects(
      async () => executePayPalRequest({ endpoint: "/v2/checkout/orders", config: mockConfig }),
      (err) => {
        assert.ok(err instanceof PayPalApiError);
        assert.match(err.message, /Invalid JSON received from PayPal REST API/);
        return true;
      }
    );
  });

  it("10. Handles request timeouts and maps them to PayPalTimeoutError", async () => {
    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "VALID_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Simulate a hung connection that listens to abort signal
      return new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => {
          const timeoutErr = new Error("The operation was aborted");
          timeoutErr.name = "AbortError";
          reject(timeoutErr);
        });
      });
    };

    const mockConfig = {
      clientId: "id",
      clientSecret: "secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
    };

    await assert.rejects(
      async () => executePayPalRequest({
        endpoint: "/v2/checkout/orders",
        config: mockConfig,
        timeoutMs: 50, // Short timeout for test speed
      }),
      (err) => {
        assert.ok(err instanceof PayPalTimeoutError);
        assert.equal(err.statusCode, 504);
        assert.match(err.message, /timed out/);
        return true;
      }
    );
  });

  it("11. Handles HTTP 429 Too Many Requests with PayPalRateLimitError", async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "VALID_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ name: "RATE_LIMIT_REACHED", message: "Too many requests" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    };

    const mockConfig = {
      clientId: "id",
      clientSecret: "secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
    };

    await assert.rejects(
      async () => executePayPalRequest({ endpoint: "/v2/checkout/orders", config: mockConfig }),
      (err) => {
        assert.ok(err instanceof PayPalRateLimitError);
        assert.equal(err.statusCode, 429);
        assert.equal(err.retryAfter, 60);
        return true;
      }
    );
  });

  it("12. Handles HTTP 5xx errors and parses PayPal debug details", async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "VALID_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          name: "INTERNAL_SERVER_ERROR",
          message: "An internal server error occurred.",
          debug_id: "pp_dbg_999a888b",
          details: [{ issue: "DOWNSTREAM_TIMEOUT", description: "Processor did not respond" }],
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "PayPal-Debug-Id": "pp_dbg_999a888b",
          },
        }
      );
    };

    const mockConfig = {
      clientId: "id",
      clientSecret: "secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
    };

    await assert.rejects(
      async () => executePayPalRequest({ endpoint: "/v2/checkout/orders", config: mockConfig }),
      (err) => {
        assert.ok(err instanceof PayPalApiError);
        assert.equal(err.statusCode, 500);
        assert.equal(err.errorName, "INTERNAL_SERVER_ERROR");
        assert.equal(err.debugId, "pp_dbg_999a888b");
        assert.equal(err.details.length, 1);
        assert.equal(err.details[0].issue, "DOWNSTREAM_TIMEOUT");
        return true;
      }
    );
  });

  it("14. Sanitizes sensitive tokens and auth strings from error messages", () => {
    const raw = "Failed during Basic dXNlcjpwYXNz and Bearer eyJhbGciOiJIUzI1NiJ9.test and client_secret=very_secret_key";
    const sanitized = sanitizePayPalMessage(raw);

    assert.equal(sanitized.includes("dXNlcjpwYXNz"), false);
    assert.equal(sanitized.includes("eyJhbGciOiJIUzI1NiJ9"), false);
    assert.equal(sanitized.includes("very_secret_key"), false);
    assert.match(sanitized, /Basic \[REDACTED\]/);
    assert.match(sanitized, /Bearer \[REDACTED\]/);
    assert.match(sanitized, /client_secret=\[REDACTED\]/);
  });

  it("handles low-level network failure with PayPalNetworkError", async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "VALID_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new TypeError("fetch failed: ECONNREFUSED");
    };

    const mockConfig = {
      clientId: "id",
      clientSecret: "secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
    };

    await assert.rejects(
      async () => executePayPalRequest({ endpoint: "/v2/checkout/orders", config: mockConfig }),
      PayPalNetworkError
    );
  });
});
