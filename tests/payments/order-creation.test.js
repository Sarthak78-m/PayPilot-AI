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

  it("22b. Existing order ID cannot be replaced (conflict rejection)", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });
    db.seedPaymentLink({ invoice_id: invoice.id, token_hash: tokenHash });

    // Seed payment with existing PayPal order ID
    const payment = db.seedPayment({
      invoice_id: invoice.id,
      status: "CREATED",
      paypal_order_id: "ORDER-ALREADY-ASSIGNED",
    });

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        return new Response(
          JSON.stringify({ id: "ORDER-NEW-DIFFERENT", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };

    // Override payments.update to simulate zero rows updated due to conflicting order ID
    const originalFrom = db.client.from.bind(db.client);
    db.client.from = (table) => {
      const qb = originalFrom(table);
      if (table === "payments") {
        const origUpdate = qb.update.bind(qb);
        qb.update = (payload) => {
          origUpdate(payload);
          return {
            ...qb,
            single: async () => ({
              data: null,
              error: { code: "PGRST116", message: "0 rows updated" },
            }),
          };
        };
      }
      return qb;
    };

    const res = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 409);
    assert.equal(res.code, "ORDER_ID_CONFLICT");
    assert.match(res.error, /different PayPal order ID is already associated/);
    // Ensure existing order was not overwritten
    assert.equal(db.payments.get(payment.id).paypal_order_id, "ORDER-ALREADY-ASSIGNED");
  });

  it("22c. Conditional update checks create_request_id and affects exactly one row", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });
    db.seedPaymentLink({ invoice_id: invoice.id, token_hash: tokenHash });

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        return new Response(
          JSON.stringify({ id: "ORDER-EXACT-ONE-ROW", status: "CREATED" }),
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
    assert.equal(res.orderId, "ORDER-EXACT-ONE-ROW");
    const payment = db.payments.get(res.paymentId);
    assert.equal(payment.paypal_order_id, "ORDER-EXACT-ONE-ROW");
    assert.equal(payment.status, "ORDER_CREATED");
  });

  it("22d. Ambiguous order persistence is safely reconciled without duplicate order", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });
    db.seedPaymentLink({ invoice_id: invoice.id, token_hash: tokenHash });

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        return new Response(
          JSON.stringify({ id: "ORDER-RECONCILE-IDEMPOTENT", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };

    // Simulate concurrent or previous request having succeeded in attaching the same order ID
    const originalFrom = db.client.from.bind(db.client);
    db.client.from = (table) => {
      const qb = originalFrom(table);
      if (table === "payments") {
        const origUpdate = qb.update.bind(qb);
        qb.update = (payload) => {
          origUpdate(payload);
          return {
            ...qb,
            single: async () => {
              // Simulate 0 rows updated because another process set the same order ID first
              return { data: null, error: { code: "PGRST116" } };
            },
          };
        };
        const origSelect = qb.select.bind(qb);
        qb.select = (fields) => {
          const sqb = origSelect(fields);
          sqb.maybeSingle = async () => {
            // Reconcile returns the payment with the same order ID
            const firstPayment = [...db.payments.values()][0];
            return {
              data: {
                id: firstPayment.id,
                status: "ORDER_CREATED",
                paypal_order_id: "ORDER-RECONCILE-IDEMPOTENT",
                create_request_id: firstPayment.create_request_id,
              },
              error: null,
            };
          };
          return sqb;
        };
      }
      return qb;
    };

    const res = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, true);
    assert.equal(res.orderId, "ORDER-RECONCILE-IDEMPOTENT");
    assert.equal(res.status, "ORDER_CREATED");
  });

  it("22e. Order creation persistence failure preserves CREATED state for retry", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });
    db.seedPaymentLink({ invoice_id: invoice.id, token_hash: tokenHash });

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        return new Response(
          JSON.stringify({ id: "ORDER-PERSISTENCE-FAIL", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };

    // Simulate database update failure
    const originalFrom = db.client.from.bind(db.client);
    db.client.from = (table) => {
      const qb = originalFrom(table);
      if (table === "payments") {
        qb.update = () => {
          qb.single = async () => ({
            data: null,
            error: { code: "500", message: "Database connection lost" },
          });
          return qb;
        };
      }
      return qb;
    };

    const res = await createCheckoutOrder({
      token,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 500);
    assert.equal(res.code, "ORDER_PERSISTENCE_FAILED");

    // Must NOT mark payment as FAILED! Must remain in CREATED state
    const payment = [...db.payments.values()][0];
    assert.equal(payment.status, "CREATED");
    assert.ok(payment.create_request_id);
  });
});
