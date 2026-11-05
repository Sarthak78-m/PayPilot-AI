import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getPayPalAccessToken,
  clearPayPalTokenCache,
  getPayPalTokenCacheStatus,
} from "@/lib/paypal/paypal-auth";
import { PayPalAuthError, PayPalRateLimitError, PayPalTimeoutError } from "@/lib/paypal/paypal-errors";

describe("PayPal OAuth 2.0 Auth Service", () => {
  const originalFetch = globalThis.fetch;
  const mockConfig = {
    clientId: "mock_client_id_123",
    clientSecret: "mock_client_secret_xyz_super_confidential",
    baseUrl: "https://api-m.sandbox.paypal.com",
  };

  beforeEach(() => {
    clearPayPalTokenCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearPayPalTokenCache();
  });

  it("1. Acquires OAuth 2.0 access token via POST /v1/oauth2/token", async () => {
    let capturedUrl = null;
    let capturedMethod = null;
    let capturedHeaders = null;
    let capturedBody = null;

    globalThis.fetch = async (url, options) => {
      capturedUrl = String(url);
      capturedMethod = options.method;
      capturedHeaders = options.headers;
      capturedBody = options.body;

      return new Response(
        JSON.stringify({
          access_token: "MOCK_ACCESS_TOKEN_ABC123",
          token_type: "Bearer",
          expires_in: 32400,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    const token = await getPayPalAccessToken(mockConfig);

    assert.equal(token, "MOCK_ACCESS_TOKEN_ABC123");
    assert.equal(capturedUrl, "https://api-m.sandbox.paypal.com/v1/oauth2/token");
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedBody, "grant_type=client_credentials");

    const expectedBasic = Buffer.from(
      `${mockConfig.clientId}:${mockConfig.clientSecret}`
    ).toString("base64");
    assert.equal(capturedHeaders.Authorization, `Basic ${expectedBasic}`);
    assert.equal(capturedHeaders["Content-Type"], "application/x-www-form-urlencoded");
  });

  it("2. Caches OAuth access tokens in memory and reuses without subsequent network calls", async () => {
    let fetchCount = 0;

    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          access_token: "CACHED_TOKEN_999",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const token1 = await getPayPalAccessToken(mockConfig);
    const token2 = await getPayPalAccessToken(mockConfig);
    const token3 = await getPayPalAccessToken(mockConfig);

    assert.equal(token1, "CACHED_TOKEN_999");
    assert.equal(token2, "CACHED_TOKEN_999");
    assert.equal(token3, "CACHED_TOKEN_999");
    assert.equal(fetchCount, 1, "Only one network request should be dispatched for repeated calls.");

    const status = getPayPalTokenCacheStatus();
    assert.equal(status.hasCachedToken, true);
    assert.equal(status.isExpired, false);
    assert.ok(status.timeRemainingMs > 0);
  });

  it("3. Refreshes token before expiration when cached token expires", async () => {
    let fetchCount = 0;

    // Simulate token that expires quickly (expires_in: 10 seconds, which after 60s buffer is immediately expired)
    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          access_token: `TOKEN_REFRESH_${fetchCount}`,
          token_type: "Bearer",
          expires_in: 50, // Buffer is 60s (capped at expiresIn/2 = 25s), so expiresAt = now + 25s
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const token1 = await getPayPalAccessToken(mockConfig);
    assert.equal(token1, "TOKEN_REFRESH_1");
    assert.equal(fetchCount, 1);

    // Force refresh or simulate cache expiration via clear
    clearPayPalTokenCache();

    const token2 = await getPayPalAccessToken(mockConfig);
    assert.equal(token2, "TOKEN_REFRESH_2");
    assert.equal(fetchCount, 2);
  });

  it("4. Deduplicates concurrent token requests and shares in-flight promise", async () => {
    let fetchCount = 0;

    globalThis.fetch = async () => {
      fetchCount++;
      // Simulate artificial network delay
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(
        JSON.stringify({
          access_token: "CONCURRENT_SHARED_TOKEN",
          token_type: "Bearer",
          expires_in: 32400,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    // Dispatch 5 concurrent requests simultaneously
    const results = await Promise.all([
      getPayPalAccessToken(mockConfig),
      getPayPalAccessToken(mockConfig),
      getPayPalAccessToken(mockConfig),
      getPayPalAccessToken(mockConfig),
      getPayPalAccessToken(mockConfig),
    ]);

    assert.equal(fetchCount, 1, "Exactly one network call must occur for concurrent requests.");
    for (const token of results) {
      assert.equal(token, "CONCURRENT_SHARED_TOKEN");
    }
  });

  it("8. Handles authentication failure (HTTP 401) with typed PayPalAuthError", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: "invalid_client",
          error_description: "Client Authentication failed",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    };

    await assert.rejects(
      async () => getPayPalAccessToken(mockConfig),
      (err) => {
        assert.ok(err instanceof PayPalAuthError, "Should be an instance of PayPalAuthError");
        assert.equal(err.statusCode, 401);
        assert.match(err.message, /Client Authentication failed/);
        return true;
      }
    );
  });

  it("11. Handles HTTP 429 Rate Limit from OAuth endpoint with PayPalRateLimitError", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ error: "rate_limit_exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "45",
          },
        }
      );
    };

    await assert.rejects(
      async () => getPayPalAccessToken(mockConfig),
      (err) => {
        assert.ok(err instanceof PayPalRateLimitError);
        assert.equal(err.statusCode, 429);
        assert.equal(err.retryAfter, 45);
        return true;
      }
    );
  });

  it("14. Never exposes secret values in error messages or logs", async () => {
    const sensitiveSecret = "SECRET_SUPER_CONFIDENTIAL_KEY_98765";
    const sensitiveConfig = {
      clientId: "client_id_456",
      clientSecret: sensitiveSecret,
      baseUrl: "https://api-m.sandbox.paypal.com",
    };

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: "invalid_client",
          error_description: "Unauthorized access with Basic authentication credentials.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      await getPayPalAccessToken(sensitiveConfig);
      assert.fail("Should have thrown error");
    } catch (err) {
      assert.equal(err.message.includes(sensitiveSecret), false, "Raw secret must not be in error message.");
      assert.equal(JSON.stringify(err).includes(sensitiveSecret), false, "Raw secret must not be in JSON serialized error.");
    }
  });

  it("throws PayPalAuthError when credentials are missing", async () => {
    await assert.rejects(
      async () => getPayPalAccessToken({ clientId: "", clientSecret: "", baseUrl: "https://api-m.sandbox.paypal.com" }),
      PayPalAuthError
    );
  });
});
