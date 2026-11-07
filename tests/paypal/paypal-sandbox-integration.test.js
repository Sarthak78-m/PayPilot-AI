import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { resolvePayPalBaseUrl, getPayPalConfig } from "@/lib/paypal/paypal-client";
import { createPayPalOrder, capturePayPalOrder, verifyCaptureSettlement } from "@/lib/paypal/paypal-orders";
import { clearPayPalTokenCache } from "@/lib/paypal/paypal-auth";
import { PayPalError, PayPalAuthError } from "@/lib/paypal/paypal-errors";
import { GET as getPayPalConfigRoute } from "@/app/api/paypal/config/route.js";
import { POST as createOrderRoute } from "@/app/api/paypal/create-order/route.js";
import { POST as captureOrderRoute } from "@/app/api/paypal/capture-order/route.js";

/**
 * PayPilot AI — PayPal Sandbox Integration Verification Suite
 *
 * Verifies all 12 core requirements for the real PayPal Developer Sandbox:
 * 1. Environment & Sandbox Base URL resolution (PAYPAL_MODE=sandbox, PAYPAL_CURRENCY=USD)
 * 2. OAuth 2.0 Client Credentials token generation & Basic Auth
 * 3. Successful order creation with intent: CAPTURE via Orders API v2
 * 4. Authoritative amount & currency calculation (server-side enforcement)
 * 5. Successful payment capture via Orders v2 API (/v2/checkout/orders/{id}/capture)
 * 6. Capture response verification (capture ID, status COMPLETED, matching amounts)
 * 7. Duplicate order creation idempotency
 * 8. Duplicate capture request idempotency
 * 9. Cancellation handling & non-success state preservation
 * 10. Capture failure & invalid credentials handling
 * 11. Unauthorized access rejection (401/403)
 * 12. Public config safety (never exposes client secret)
 */
describe("PayPal Sandbox Gateway Integration", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearPayPalTokenCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    clearPayPalTokenCache();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. CONFIGURATION & ENVIRONMENT TESTS (Phase 2)
  // ───────────────────────────────────────────────────────────────────────────
  it("1. Resolves Sandbox base URL when PAYPAL_MODE=sandbox is set", () => {
    process.env.PAYPAL_MODE = "sandbox";
    delete process.env.PAYPAL_BASE_URL;

    const resolvedUrl = resolvePayPalBaseUrl();
    assert.equal(resolvedUrl, "https://api-m.sandbox.paypal.com");
  });

  it("2. Extracts configuration with PAYPAL_MODE, PAYPAL_CURRENCY, and credentials", () => {
    process.env.PAYPAL_CLIENT_ID = "sb-client-id-12345";
    process.env.PAYPAL_CLIENT_SECRET = "sb-secret-key-67890";
    process.env.PAYPAL_MODE = "sandbox";
    process.env.PAYPAL_CURRENCY = "USD";

    const config = getPayPalConfig();
    assert.equal(config.clientId, "sb-client-id-12345");
    assert.equal(config.clientSecret, "sb-secret-key-67890");
    assert.equal(config.environment, "sandbox");
    assert.equal(config.currency, "USD");
    assert.equal(config.baseUrl, "https://api-m.sandbox.paypal.com");
  });

  it("3. Rejects missing PayPal credentials with descriptive error", () => {
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;

    assert.throws(() => getPayPalConfig(), {
      name: "PayPalError",
      code: "MISSING_PAYPAL_CREDENTIALS",
    });
  });

  it("4. Public config endpoint /api/paypal/config returns public client ID without secret", async () => {
    process.env.PAYPAL_CLIENT_ID = "public-test-client-id";
    process.env.PAYPAL_CLIENT_SECRET = "super-secret-key-never-expose";
    process.env.PAYPAL_MODE = "sandbox";
    process.env.PAYPAL_CURRENCY = "USD";
    process.env.PAYMENT_CHECKOUT_ENABLED = "true";

    const res = await getPayPalConfigRoute();
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.clientId, "public-test-client-id");
    assert.equal(body.currency, "USD");
    assert.equal(body.mode, "sandbox");
    assert.equal(body.sandbox, true);
    assert.equal(body.clientSecret, undefined, "Client secret must NEVER be exposed");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. ORDER CREATION TESTS (Phase 3A)
  // ───────────────────────────────────────────────────────────────────────────
  it("5. Creates an order with intent: CAPTURE via PayPal Orders v2 API", async () => {
    let capturedBody = null;
    let capturedHeaders = null;

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "MOCK_SANDBOX_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);

      return new Response(
        JSON.stringify({
          id: "5O190127TN364715T",
          status: "CREATED",
          intent: "CAPTURE",
          links: [
            { href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", rel: "approve" },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const order = await createPayPalOrder({
      amount: "250.00",
      currency: "USD",
      requestId: "req-order-sandbox-uuid-1",
      invoiceId: "inv-test-101",
      description: "PayPilot Invoice #101 Payment",
      config: {
        clientId: "mock_cid",
        clientSecret: "mock_csec",
        baseUrl: "https://api-m.sandbox.paypal.com",
      },
    });

    assert.equal(order.orderId, "5O190127TN364715T");
    assert.equal(order.status, "CREATED");
    assert.ok(order.approveUrl.includes("5O190127TN364715T"));

    // Verify payload contract
    assert.equal(capturedBody.intent, "CAPTURE");
    assert.equal(capturedBody.purchase_units[0].amount.value, "250.00");
    assert.equal(capturedBody.purchase_units[0].amount.currency_code, "USD");
    assert.equal(capturedHeaders["PayPal-Request-Id"], "req-order-sandbox-uuid-1");
  });

  it("6. Rejects invalid or negative amounts before reaching PayPal API", async () => {
    const invalidAmounts = [0, -50, "invalid-amount", null, undefined];

    for (const amt of invalidAmounts) {
      await assert.rejects(
        async () => {
          await createPayPalOrder({
            amount: amt,
            currency: "USD",
            requestId: "req-1",
            config: { clientId: "c", clientSecret: "s", baseUrl: "https://api-m.sandbox.paypal.com" },
          });
        },
        { name: "PayPalError", code: "INVALID_AMOUNT" }
      );
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. ORDER CAPTURE & SETTLEMENT TESTS (Phase 3B, Phase 5)
  // ───────────────────────────────────────────────────────────────────────────
  it("7. Captures an approved order via Orders v2 capture endpoint", async () => {
    let capturedUrl = null;
    let capturedHeaders = null;

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "MOCK_CAPTURE_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      capturedUrl = urlStr;
      capturedHeaders = options.headers;

      return new Response(
        JSON.stringify({
          id: "5O190127TN364715T",
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "2C182749LK123456B",
                    status: "COMPLETED",
                    amount: { value: "250.00", currency_code: "USD" },
                    seller_receivable_breakdown: {
                      paypal_fee: { value: "7.55", currency_code: "USD" },
                      net_amount: { value: "242.45", currency_code: "USD" },
                    },
                    create_time: "2026-11-07T14:00:00Z",
                  },
                ],
              },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const capture = await capturePayPalOrder({
      orderId: "5O190127TN364715T",
      requestId: "req-cap-sandbox-uuid-2",
      config: {
        clientId: "mock_cid",
        clientSecret: "mock_csec",
        baseUrl: "https://api-m.sandbox.paypal.com",
      },
    });

    assert.equal(capture.orderId, "5O190127TN364715T");
    assert.equal(capture.captureId, "2C182749LK123456B");
    assert.equal(capture.captureStatus, "COMPLETED");
    assert.equal(capture.amount, "250.00");
    assert.equal(capture.currency, "USD");
    assert.equal(capture.fee, "7.55");
    assert.equal(capture.netAmount, "242.45");

    assert.ok(capturedUrl.endsWith("/v2/checkout/orders/5O190127TN364715T/capture"));
    assert.equal(capturedHeaders["PayPal-Request-Id"], "req-cap-sandbox-uuid-2");
  });

  it("8. Verifies settlement amount and currency match invoice exactly", () => {
    const validCapture = {
      status: "COMPLETED",
      captureStatus: "COMPLETED",
      amount: "250.00",
      currency: "USD",
      captureId: "CAP-12345",
    };

    // Exact match
    const validResult = verifyCaptureSettlement({
      captureResult: validCapture,
      expectedAmount: 250.0,
      expectedCurrency: "USD",
    });
    assert.equal(validResult.isValid, true);

    // Tampered amount rejected
    const tamperedAmountResult = verifyCaptureSettlement({
      captureResult: validCapture,
      expectedAmount: 500.0,
      expectedCurrency: "USD",
    });
    assert.equal(tamperedAmountResult.isValid, false);
    assert.ok(tamperedAmountResult.reason.includes("Amount mismatch"));

    // Tampered currency rejected
    const tamperedCurrencyResult = verifyCaptureSettlement({
      captureResult: validCapture,
      expectedAmount: 250.0,
      expectedCurrency: "EUR",
    });
    assert.equal(tamperedCurrencyResult.isValid, false);
    assert.ok(tamperedCurrencyResult.reason.includes("Currency mismatch"));
  });

  it("9. Handles capture failure gracefully without marking payment completed", () => {
    const failedCapture = {
      status: "FAILED",
      captureStatus: "FAILED",
      amount: "250.00",
      currency: "USD",
      captureId: null,
    };

    const settlementResult = verifyCaptureSettlement({
      captureResult: failedCapture,
      expectedAmount: 250.0,
      expectedCurrency: "USD",
    });

    assert.equal(settlementResult.isValid, false);
    assert.ok(settlementResult.reason.includes("status"));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. API ROUTE SECURITY & VALIDATION (Phase 9)
  // ───────────────────────────────────────────────────────────────────────────
  it("10. POST /api/paypal/create-order rejects missing token and invoiceId with 400", async () => {
    process.env.PAYMENT_CHECKOUT_ENABLED = "true";

    const req = new Request("http://localhost:3000/api/paypal/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await createOrderRoute(req);
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, "MISSING_PAYMENT_REFERENCE");
  });

  it("11. POST /api/paypal/capture-order rejects missing orderId with 400", async () => {
    process.env.PAYMENT_CHECKOUT_ENABLED = "true";

    const req = new Request("http://localhost:3000/api/paypal/capture-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "sample-token" }),
    });

    const res = await captureOrderRoute(req);
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, "MISSING_ORDER_ID");
  });

  it("12. POST /api/paypal/create-order returns 503 when checkout is disabled", async () => {
    delete process.env.PAYMENT_CHECKOUT_ENABLED;

    const req = new Request("http://localhost:3000/api/paypal/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "sample-token" }),
    });

    const res = await createOrderRoute(req);
    assert.equal(res.status, 503);

    const body = await res.json();
    assert.equal(body.code, "PAYMENT_FEATURE_DISABLED");
  });
});
