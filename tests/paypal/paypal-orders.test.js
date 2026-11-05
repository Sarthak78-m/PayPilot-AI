import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder,
  verifyCaptureSettlement,
} from "@/lib/paypal/paypal-orders";
import { clearPayPalTokenCache } from "@/lib/paypal/paypal-auth";
import { PayPalError } from "@/lib/paypal/paypal-errors";

describe("PayPal Orders v2 Service", () => {
  const originalFetch = globalThis.fetch;
  const mockConfig = {
    clientId: "mock_client_id",
    clientSecret: "mock_client_secret",
    baseUrl: "https://api-m.sandbox.paypal.com",
  };

  beforeEach(() => {
    clearPayPalTokenCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearPayPalTokenCache();
  });

  it("5. Creates an order with intent: CAPTURE via Orders v2 API", async () => {
    let capturedBody = null;
    let capturedHeaders = null;
    let capturedUrl = null;

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "VALID_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      capturedUrl = urlStr;
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);

      return new Response(
        JSON.stringify({
          id: "ORDER-888-CREATED",
          status: "CREATED",
          intent: "CAPTURE",
          links: [
            { href: "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-888-CREATED", rel: "self", method: "GET" },
            { href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-888-CREATED", rel: "approve", method: "GET" },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await createPayPalOrder({
      amount: "150.00",
      currency: "USD",
      requestId: "create-req-uuid-1111",
      invoiceId: "inv-9999",
      description: "Consulting Services Q4",
      config: mockConfig,
    });

    assert.equal(result.orderId, "ORDER-888-CREATED");
    assert.equal(result.status, "CREATED");
    assert.equal(result.approveUrl, "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-888-CREATED");
    assert.equal(capturedUrl, "https://api-m.sandbox.paypal.com/v2/checkout/orders");

    // Verify intent CAPTURE
    assert.equal(capturedBody.intent, "CAPTURE");
    assert.equal(capturedBody.purchase_units[0].amount.value, "150.00");
    assert.equal(capturedBody.purchase_units[0].amount.currency_code, "USD");
    assert.equal(capturedBody.purchase_units[0].reference_id, "inv-9999");
  });

  it("6. Captures an approved order via Orders v2 API", async () => {
    let capturedUrl = null;
    let capturedHeaders = null;

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "VALID_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      capturedUrl = urlStr;
      capturedHeaders = options.headers;

      return new Response(
        JSON.stringify({
          id: "ORDER-888-CREATED",
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: "inv-9999",
              payments: {
                captures: [
                  {
                    id: "CAPTURE-XYZ-555",
                    status: "COMPLETED",
                    amount: { value: "150.00", currency_code: "USD" },
                    final_capture: true,
                    seller_receivable_breakdown: {
                      gross_amount: { value: "150.00", currency_code: "USD" },
                      paypal_fee: { value: "4.65", currency_code: "USD" },
                      net_amount: { value: "145.35", currency_code: "USD" },
                    },
                    create_time: "2026-11-05T12:00:00Z",
                  },
                ],
              },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const captureResult = await capturePayPalOrder({
      orderId: "ORDER-888-CREATED",
      requestId: "capture-req-uuid-2222",
      config: mockConfig,
    });

    assert.equal(captureResult.orderId, "ORDER-888-CREATED");
    assert.equal(captureResult.status, "COMPLETED");
    assert.equal(captureResult.captureId, "CAPTURE-XYZ-555");
    assert.equal(captureResult.captureStatus, "COMPLETED");
    assert.equal(captureResult.amount, "150.00");
    assert.equal(captureResult.currency, "USD");
    assert.equal(captureResult.fee, "4.65");
    assert.equal(captureResult.netAmount, "145.35");
    assert.equal(captureResult.capturedAt, "2026-11-05T12:00:00Z");
    assert.equal(capturedUrl, "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-888-CREATED/capture");
  });

  it("7. Transmits PayPal-Request-Id header correctly for create and capture idempotency", async () => {
    const recordedHeaders = [];

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "VALID_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      recordedHeaders.push({
        url: urlStr,
        requestId: options.headers["PayPal-Request-Id"],
      });

      if (urlStr.endsWith("/capture")) {
        return new Response(JSON.stringify({ id: "ORDER-1", status: "COMPLETED" }), { status: 200 });
      }

      return new Response(JSON.stringify({ id: "ORDER-1", status: "CREATED" }), { status: 201 });
    };

    const createRequestId = "persistent-create-uuid-aaa";
    const captureRequestId = "persistent-capture-uuid-bbb";

    // Create order with create_request_id
    await createPayPalOrder({
      amount: "75.00",
      currency: "USD",
      requestId: createRequestId,
      config: mockConfig,
    });

    // Capture order with capture_request_id
    await capturePayPalOrder({
      orderId: "ORDER-1",
      requestId: captureRequestId,
      config: mockConfig,
    });

    assert.equal(recordedHeaders.length, 2);
    assert.equal(recordedHeaders[0].requestId, createRequestId, "Order creation must send create_request_id");
    assert.equal(recordedHeaders[1].requestId, captureRequestId, "Order capture must send capture_request_id");

    // Retry with the identical request ID preserves exact header value
    await capturePayPalOrder({
      orderId: "ORDER-1",
      requestId: captureRequestId,
      config: mockConfig,
    });
    assert.equal(recordedHeaders[2].requestId, captureRequestId, "Retry must reuse exact capture_request_id");
  });

  it("validates input strictly and rejects invalid amounts or currencies", async () => {
    // Missing requestId
    await assert.rejects(
      async () => createPayPalOrder({ amount: "50.00", currency: "USD", requestId: "" }),
      (err) => err instanceof PayPalError && err.code === "MISSING_REQUEST_ID"
    );

    // Negative / zero / invalid amount
    await assert.rejects(
      async () => createPayPalOrder({ amount: "-10", currency: "USD", requestId: "req-1" }),
      (err) => err instanceof PayPalError && err.code === "INVALID_AMOUNT"
    );
    await assert.rejects(
      async () => createPayPalOrder({ amount: "0", currency: "USD", requestId: "req-1" }),
      (err) => err instanceof PayPalError && err.code === "INVALID_AMOUNT"
    );
    await assert.rejects(
      async () => createPayPalOrder({ amount: "invalid", currency: "USD", requestId: "req-1" }),
      (err) => err instanceof PayPalError && err.code === "INVALID_AMOUNT"
    );

    // Invalid currency
    await assert.rejects(
      async () => createPayPalOrder({ amount: "50.00", currency: "US", requestId: "req-1" }),
      (err) => err instanceof PayPalError && err.code === "INVALID_CURRENCY"
    );
    await assert.rejects(
      async () => createPayPalOrder({ amount: "50.00", currency: "", requestId: "req-1" }),
      (err) => err instanceof PayPalError && err.code === "INVALID_CURRENCY"
    );

    // Missing orderId on capture
    await assert.rejects(
      async () => capturePayPalOrder({ orderId: "", requestId: "req-1" }),
      (err) => err instanceof PayPalError && err.code === "MISSING_ORDER_ID"
    );
  });

  it("retrieves an existing order via getPayPalOrder", async () => {
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
          id: "ORDER-RETRIEVED-123",
          status: "APPROVED",
          intent: "CAPTURE",
          purchase_units: [{ amount: { value: "200.00", currency_code: "USD" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const order = await getPayPalOrder({ orderId: "ORDER-RETRIEVED-123", config: mockConfig });
    assert.equal(order.orderId, "ORDER-RETRIEVED-123");
    assert.equal(order.status, "APPROVED");
    assert.equal(order.intent, "CAPTURE");
  });

  it("verifies settlement matching amount, currency, and payee identity", () => {
    const validCapture = {
      status: "COMPLETED",
      amount: "150.00",
      currency: "USD",
      raw: {
        purchase_units: [
          {
            payee: {
              merchant_id: "MERCHANT_ABC123",
              email_address: "merchant@paypilot.ai",
            },
          },
        ],
      },
    };

    // 1. Valid matching
    const res1 = verifyCaptureSettlement({
      captureResult: validCapture,
      expectedAmount: 150.0,
      expectedCurrency: "USD",
      expectedPayeeId: "MERCHANT_ABC123",
      expectedPayeeEmail: "merchant@paypilot.ai",
    });
    assert.equal(res1.isValid, true);

    // 2. Amount mismatch
    const res2 = verifyCaptureSettlement({
      captureResult: validCapture,
      expectedAmount: 200.0,
      expectedCurrency: "USD",
    });
    assert.equal(res2.isValid, false);
    assert.match(res2.reason, /Amount mismatch/);

    // 3. Currency mismatch
    const res3 = verifyCaptureSettlement({
      captureResult: validCapture,
      expectedAmount: 150.0,
      expectedCurrency: "EUR",
    });
    assert.equal(res3.isValid, false);
    assert.match(res3.reason, /Currency mismatch/);

    // 4. Payee ID mismatch
    const res4 = verifyCaptureSettlement({
      captureResult: validCapture,
      expectedAmount: 150.0,
      expectedCurrency: "USD",
      expectedPayeeId: "WRONG_MERCHANT_XYZ",
    });
    assert.equal(res4.isValid, false);
    assert.match(res4.reason, /Payee merchant_id mismatch/);

    // 5. Status mismatch
    const res5 = verifyCaptureSettlement({
      captureResult: { ...validCapture, status: "VOIDED" },
      expectedAmount: 150.0,
      expectedCurrency: "USD",
    });
    assert.equal(res5.isValid, false);
    assert.match(res5.reason, /Capture status is/);
  });
});
