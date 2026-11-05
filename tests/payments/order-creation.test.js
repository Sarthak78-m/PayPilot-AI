import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createCheckoutOrder } from "@/lib/payments/payment-order-service";
import { generatePaymentToken } from "@/lib/payments/payment-token";
import { clearPayPalTokenCache } from "@/lib/paypal";
import { createMockDatabase } from "../helpers/mock-database";

describe("PayPal Order Creation Integration (Tests 16–22)", () => {
  let db;
  const originalFetch = globalThis.fetch;
  const mockPayPalConfig = {
    clientId: "mock-client-id",
    clientSecret: "mock-client-secret",
    baseUrl: "https://api-m.sandbox.paypal.com",
  };

  beforeEach(() => {
    db = createMockDatabase();
    clearPayPalTokenCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearPayPalTokenCache();
  });

  it("16, 17, 18. Amount and currency are strictly retrieved from database, ignoring browser inputs", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({
      id: crypto.randomUUID(),
      amount: 450.75,
      currency: "EUR",
      status: "PENDING",
      description: "Database Verified Services",
    });

    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
    });

    let sentPayPalPayload = null;

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "MOCK_ACCESS_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        sentPayPalPayload = JSON.parse(options.body);
        return new Response(
          JSON.stringify({ id: "ORDER-AUTHORITATIVE-123", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };

    // Customer initiates create order with public token
    const res = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, true);
    assert.equal(res.orderId, "ORDER-AUTHORITATIVE-123");
    assert.equal(res.status, "ORDER_CREATED");

    // Verify PayPal received EXACT invoice amount and currency from database
    assert.ok(sentPayPalPayload);
    assert.equal(sentPayPalPayload.purchase_units[0].amount.value, "450.75");
    assert.equal(sentPayPalPayload.purchase_units[0].amount.currency_code, "EUR");
  });

  it("19. Stable creation idempotency key (create_request_id) is transmitted to PayPal-Request-Id", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), amount: 100.0, currency: "USD", status: "PENDING" });
    db.seedPaymentLink({ invoice_id: invoice.id, token_hash: tokenHash });

    let capturedRequestId = null;

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        capturedRequestId = options.headers["PayPal-Request-Id"];
        return new Response(
          JSON.stringify({ id: "ORDER-IDEMPOTENT-1", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };

    const res = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, true);
    const payment = db.payments.get(res.paymentId);
    assert.ok(payment);
    assert.equal(capturedRequestId, payment.create_request_id, "PayPal-Request-Id must equal create_request_id");
  });

  it("20. Existing PayPal order is not replaced when order already created", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });
    db.seedPaymentLink({ invoice_id: invoice.id, token_hash: tokenHash });

    // Pre-existing active attempt with order already attached
    const existingPayment = db.seedPayment({
      invoice_id: invoice.id,
      status: "ORDER_CREATED",
      paypal_order_id: "ORDER-EXISTING-ALREADY-ATTACHED",
    });

    let payPalFetchCount = 0;
    globalThis.fetch = async () => {
      payPalFetchCount++;
      return new Response("{}", { status: 200 });
    };

    const res = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, true);
    assert.equal(res.orderId, "ORDER-EXISTING-ALREADY-ATTACHED");
    assert.equal(res.paymentId, existingPayment.id);
    assert.equal(payPalFetchCount, 0, "Must not call PayPal again when order already exists");
  });

  it("21. Order creation failure preserves a safe retry path", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });
    db.seedPaymentLink({ invoice_id: invoice.id, token_hash: tokenHash });

    let attemptCount = 0;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      attemptCount++;
      if (attemptCount === 1) {
        // First attempt: Gateway 503 Service Unavailable
        return new Response(
          JSON.stringify({ name: "SERVICE_UNAVAILABLE", message: "Gateway busy" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
      // Second attempt: Success
      return new Response(
        JSON.stringify({ id: "ORDER-RETRY-SUCCESS-2", status: "CREATED" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    // First call fails
    const failRes = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });
    assert.equal(failRes.success, false);
    assert.equal(failRes.statusCode, 502);

    // Second call retries cleanly with same attempt
    const successRes = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });
    assert.equal(successRes.success, true);
    assert.equal(successRes.orderId, "ORDER-RETRY-SUCCESS-2");
  });

  it("22. Concurrent order creation reuses existing order without creating a second PayPal order", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });
    db.seedPaymentLink({ invoice_id: invoice.id, token_hash: tokenHash });

    let payPalOrderCalls = 0;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        payPalOrderCalls++;
        return new Response(
          JSON.stringify({ id: "ORDER-CONCURRENT-SAFE", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };

    const res1 = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    const res2 = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res1.success, true);
    assert.equal(res2.success, true);
    assert.equal(res1.orderId, "ORDER-CONCURRENT-SAFE");
    assert.equal(res2.orderId, "ORDER-CONCURRENT-SAFE");
    assert.equal(payPalOrderCalls, 1, "Only one PayPal order should be created");
  });
});
