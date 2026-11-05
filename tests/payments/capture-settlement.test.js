import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { captureCheckoutOrder } from "@/lib/payments/payment-capture-service";
import { generatePaymentToken } from "@/lib/payments/payment-token";
import { clearPayPalTokenCache } from "@/lib/paypal";
import { createMockDatabase } from "../helpers/mock-database";

describe("PayPal Capture & Atomic Settlement (Tests 23–35)", () => {
  let db;
  const originalFetch = globalThis.fetch;
  const mockPayPalConfig = {
    clientId: "mock-client-id",
    clientSecret: "mock-client-secret",
    baseUrl: "https://api-m.sandbox.paypal.com",
  };
  const expectedMerchantId = "MERCHANT_VERIFIED_123";

  beforeEach(() => {
    db = createMockDatabase();
    clearPayPalTokenCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearPayPalTokenCache();
  });

  function setupPendingInvoiceAndPayment(opts = {}) {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({
      id: crypto.randomUUID(),
      amount: opts.amount || 300.0,
      currency: opts.currency || "USD",
      status: "PENDING",
    });

    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
    });

    const payment = db.seedPayment({
      invoice_id: invoice.id,
      amount: opts.amount || 300.0,
      currency: opts.currency || "USD",
      status: opts.paymentStatus || "ORDER_CREATED",
      paypal_order_id: opts.orderId || "ORDER-CAPTURE-TEST-1",
      capture_request_id: opts.captureRequestId || null,
    });

    return { token, invoice, payment, orderId: opts.orderId || "ORDER-CAPTURE-TEST-1" };
  }

  it("23. Requires correct order and payment association (order ID mismatch is rejected)", async () => {
    const { token } = setupPendingInvoiceAndPayment({ orderId: "ORDER-CORRECT-1" });

    const res = await captureCheckoutOrder({
      token,
      orderId: "ORDER-WRONG-999",
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 404);
    assert.equal(res.code, "PAYMENT_NOT_FOUND");
  });

  it("24, 25. Capture reservation succeeds before PayPal capture and reuses stable capture_request_id", async () => {
    const { token, orderId, payment } = setupPendingInvoiceAndPayment();
    let sentCaptureRequestId = null;

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/capture")) {
        sentCaptureRequestId = options.headers["PayPal-Request-Id"];
        return new Response(
          JSON.stringify({
            id: orderId,
            status: "COMPLETED",
            purchase_units: [
              {
                payments: {
                  captures: [
                    {
                      id: "CAP-STABLE-IDEMPOTENT-1",
                      status: "COMPLETED",
                      amount: { value: "300.00", currency_code: "USD" },
                      create_time: "2026-11-05T12:00:00Z",
                    },
                  ],
                },
              },
            ],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, true);
    const updatedPayment = db.payments.get(payment.id);
    assert.ok(updatedPayment.capture_request_id);
    assert.equal(sentCaptureRequestId, updatedPayment.capture_request_id, "PayPal-Request-Id must equal capture_request_id");
  });

  it("26. Completed verified capture settles payment and marks invoice PAID atomically", async () => {
    const { token, orderId, invoice, payment } = setupPendingInvoiceAndPayment();

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "CAP-SETTLED-SUCCESS-1",
                    status: "COMPLETED",
                    amount: { value: "300.00", currency_code: "USD" },
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

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, true);
    assert.equal(res.status, "COMPLETED");
    assert.equal(res.captureId, "CAP-SETTLED-SUCCESS-1");

    // Database assertions
    assert.equal(db.invoices.get(invoice.id).status, "PAID");
    assert.equal(db.payments.get(payment.id).status, "COMPLETED");
    assert.equal(db.payments.get(payment.id).paypal_capture_id, "CAP-SETTLED-SUCCESS-1");

    // Links revoked
    for (const link of db.invoicePaymentLinks.values()) {
      if (link.invoice_id === invoice.id) {
        assert.ok(link.revoked_at !== null, "Link must be revoked on settlement");
      }
    }
  });

  it("27. Amount mismatch between gateway capture and invoice is rejected", async () => {
    const { token, orderId } = setupPendingInvoiceAndPayment({ amount: 300.0 });

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "CAP-AMOUNT-MISMATCH",
                    status: "COMPLETED",
                    amount: { value: "100.00", currency_code: "USD" }, // Mismatch: 100 instead of 300
                  },
                ],
              },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 422);
    assert.equal(res.code, "SETTLEMENT_VERIFICATION_FAILED");
  });

  it("28. Currency mismatch between gateway capture and invoice is rejected", async () => {
    const { token, orderId } = setupPendingInvoiceAndPayment({ currency: "USD" });

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "CAP-CURR-MISMATCH",
                    status: "COMPLETED",
                    amount: { value: "300.00", currency_code: "EUR" }, // Mismatch: EUR instead of USD
                  },
                ],
              },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 422);
    assert.equal(res.code, "SETTLEMENT_VERIFICATION_FAILED");
  });

  it("29. Payee merchant mismatch is rejected", async () => {
    const { token, orderId } = setupPendingInvoiceAndPayment();

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "COMPLETED",
          purchase_units: [
            {
              payee: { merchant_id: "ROGUE_MERCHANT_FRAUD_666" },
              payments: {
                captures: [
                  {
                    id: "CAP-PAYEE-MISMATCH",
                    status: "COMPLETED",
                    amount: { value: "300.00", currency_code: "USD" },
                  },
                ],
              },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
      expectedMerchantId: "LEGITIMATE_MERCHANT_123",
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 422);
    assert.equal(res.code, "SETTLEMENT_VERIFICATION_FAILED");
  });

  it("31. PENDING gateway hold (eCheck) sets status to PENDING and does NOT mark invoice PAID", async () => {
    const { token, orderId, invoice, payment } = setupPendingInvoiceAndPayment();

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "PENDING",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "CAP-PENDING-ECHECK-1",
                    status: "PENDING",
                    amount: { value: "300.00", currency_code: "USD" },
                  },
                ],
              },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, true);
    assert.equal(res.status, "PENDING");

    // Invoice remains PENDING (not marked PAID)
    assert.equal(db.invoices.get(invoice.id).status, "PENDING");
    // Payment set to PENDING
    assert.equal(db.payments.get(payment.id).status, "PENDING");
  });

  it("32. DENIED/FAILED gateway response sets payment to FAILED and does NOT mark invoice PAID", async () => {
    const { token, orderId, invoice, payment } = setupPendingInvoiceAndPayment();

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "FAILED",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, false);
    assert.equal(res.status, "FAILED");

    // Invoice remains PENDING
    assert.equal(db.invoices.get(invoice.id).status, "PENDING");
    // Payment marked FAILED
    assert.equal(db.payments.get(payment.id).status, "FAILED");
  });

  it("33. Ambiguous network timeout does not mark payment FAILED or re-generate request ID", async () => {
    const { token, orderId, payment } = setupPendingInvoiceAndPayment();

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "MOCK_TOKEN", expires_in: 3600 }), { status: 200 });
      }
      // Simulate timeout
      return new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
      timeoutMs: 50,
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 504);
    assert.equal(res.code, "GATEWAY_TIMEOUT");

    // Payment remains in CAPTURING status so it can be retried safely
    const storedPayment = db.payments.get(payment.id);
    assert.equal(storedPayment.status, "CAPTURING");
    assert.ok(storedPayment.capture_request_id);
  });

  it("34, 35. Duplicate capture request returns original receipt without second charge", async () => {
    const { token, orderId, payment } = setupPendingInvoiceAndPayment({
      paymentStatus: "COMPLETED",
    });

    // Seed payment as already settled with capture ID
    payment.status = "COMPLETED";
    payment.paypal_capture_id = "CAP-EXISTING-SETTLED";

    let payPalCaptureFetchCount = 0;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/capture")) {
        payPalCaptureFetchCount++;
      }
      return new Response("{}", { status: 200 });
    };

    const res = await captureCheckoutOrder({
      token,
      orderId,
      supabaseClient: db.client,
      payPalConfig: mockPayPalConfig,
    });

    assert.equal(res.success, true);
    assert.equal(res.status, "COMPLETED");
    assert.equal(res.captureId, "CAP-EXISTING-SETTLED");
    assert.equal(res.alreadySettled, true);
    assert.equal(payPalCaptureFetchCount, 0, "No duplicate capture request sent to PayPal");
  });
});
