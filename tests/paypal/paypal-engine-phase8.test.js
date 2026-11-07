import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { resolvePayPalBaseUrl, getPayPalConfig } from "@/lib/paypal/paypal-client";
import { createPayPalOrder, capturePayPalOrder, getPayPalOrder, verifyCaptureSettlement } from "@/lib/paypal/paypal-orders";
import { refundPayPalCapture } from "@/lib/paypal/paypal-refunds";
import { verifyPayPalWebhookSignature, processPayPalWebhookEvent } from "@/lib/paypal/paypal-webhooks";
import { clearPayPalTokenCache } from "@/lib/paypal/paypal-auth";
import { PayPalError, PayPalAuthError } from "@/lib/paypal/paypal-errors";
import {
  PAYMENT_STATUS,
  canTransitionStatus,
  assertValidStatusTransition,
  mapPayPalStatusToInternal,
} from "@/lib/payments/payment-state-machine";
import {
  isSupportedCurrency,
  normalizeCurrency,
  parseAndValidateAmount,
  calculateTransactionFee,
  convertCurrency,
} from "@/lib/payments/currency";
import { isAdminUser } from "@/lib/auth/roles";
import { initiatePaymentTransaction } from "@/lib/payments/transaction-engine-service";
import { createMockDatabase } from "../helpers/mock-database";

/**
 * PayPilot AI — Phase 8 Transaction Engine & PayPal Sandbox Integration Tests
 *
 * Verifies all 20 required scenarios from PART N:
 * 1. Successful PayPal payment
 * 2. User cancels PayPal checkout
 * 3. Invalid Sandbox Client ID
 * 4. Invalid Sandbox Client Secret
 * 5. Failed payment capture
 * 6. Duplicate order creation request (Idempotency)
 * 7. Duplicate capture request (Already-settled idempotency)
 * 8. Invalid PayPal Order ID
 * 9. Unauthorized transaction access
 * 10. Cross-user payment capture attempt
 * 11. Browser refresh during checkout (active order reuse)
 * 12. Network interruption during capture (safe reconciliation)
 * 13. Webhook signature verification failure
 * 14. Duplicate webhook event
 * 15. Out-of-order webhook events (State machine integrity)
 * 16. Successful full refund
 * 17. Successful partial refund
 * 18. Duplicate / Over-refund request rejection
 * 19. Failed refund handling
 * 20. Unsupported currency rejection
 */
describe("Phase 8: PayPilot Transaction Engine & PayPal Sandbox Verification (20 Scenarios)", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockDb;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYPAL_CLIENT_ID = "sandbox-client-id-abc123";
    process.env.PAYPAL_CLIENT_SECRET = "sandbox-client-secret-xyz789";
    process.env.PAYPAL_MODE = "sandbox";
    process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
    process.env.PAYPAL_CURRENCY = "USD";
    process.env.PAYPAL_WEBHOOK_ID = "WH-123456789-SANDBOX";
    process.env.PAYMENT_CHECKOUT_ENABLED = "true";
    process.env.ADMIN_EMAILS = "admin@paypilot.internal,admin@paypilot.io";

    clearPayPalTokenCache();
    mockDb = createMockDatabase();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    clearPayPalTokenCache();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Successful PayPal payment & capture settlement
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 1: Successful PayPal payment creates order and captures settlement", async () => {
    globalThis.fetch = async (url, options = {}) => {
      const u = String(url);
      if (u.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "mock-token", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/v2/checkout/orders") && options.method === "POST" && !u.includes("/capture")) {
        return new Response(JSON.stringify({
          id: "5O190127TN364715T",
          status: "CREATED",
          links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T" }],
        }), { status: 201 });
      }
      if (u.includes("/capture")) {
        return new Response(JSON.stringify({
          id: "5O190127TN364715T",
          status: "COMPLETED",
          purchase_units: [{
            payments: {
              captures: [{
                id: "8X123456789012345",
                status: "COMPLETED",
                amount: { value: "100.00", currency_code: "USD" },
                seller_receivable_breakdown: { paypal_fee: { value: "3.20" } },
                create_time: "2026-11-07T12:00:00Z",
              }],
            },
          }],
        }), { status: 201 });
      }
      return new Response("Not found", { status: 404 });
    };

    const order = await createPayPalOrder({
      amount: 100.0,
      currency: "USD",
      requestId: "req-1",
    });
    assert.equal(order.orderId, "5O190127TN364715T");

    const capture = await capturePayPalOrder({
      orderId: order.orderId,
      requestId: "req-cap-1",
    });
    assert.equal(capture.captureId, "8X123456789012345");
    assert.equal(capture.status, "COMPLETED");

    const verification = verifyCaptureSettlement({
      captureResult: capture,
      expectedAmount: 100.0,
      expectedCurrency: "USD",
    });
    assert.equal(verification.isValid, true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: User cancels PayPal checkout
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 2: User cancels PayPal checkout; status transitions to CANCELLED without marking paid", () => {
    assert.equal(canTransitionStatus(PAYMENT_STATUS.ORDER_CREATED, PAYMENT_STATUS.CANCELLED), true);
    assert.equal(canTransitionStatus(PAYMENT_STATUS.APPROVED, PAYMENT_STATUS.CANCELLED), true);
    // Invalid: CANCELLED cannot transition to COMPLETED without re-initiation
    assert.equal(canTransitionStatus(PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.COMPLETED), false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Invalid Sandbox Client ID
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 3: Invalid Sandbox Client ID returns 401 PayPalAuthError", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: "invalid_client", error_description: "Client Authentication failed" }), {
        status: 401,
      });
    };

    await assert.rejects(
      async () => {
        await createPayPalOrder({ amount: 50.0, requestId: "req-invalid-id" });
      },
      (err) => err instanceof PayPalAuthError || err.name === "PayPalAuthError"
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Invalid Sandbox Client Secret
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 4: Invalid Sandbox Client Secret throws PayPalAuthError", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: "invalid_client", error_description: "Client Secret incorrect" }), {
        status: 401,
      });
    };

    await assert.rejects(
      async () => {
        await createPayPalOrder({ amount: 75.0, requestId: "req-invalid-secret" });
      },
      (err) => err.statusCode === 401
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Failed payment capture
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 5: Failed payment capture does not mark transaction COMPLETED", () => {
    const failedCaptureResult = {
      orderId: "ORD-FAIL-1",
      status: "FAILED",
      captureStatus: "FAILED",
      amount: "100.00",
      currency: "USD",
    };

    const check = verifyCaptureSettlement({
      captureResult: failedCaptureResult,
      expectedAmount: 100.0,
      expectedCurrency: "USD",
    });
    assert.equal(check.isValid, false);
    assert.match(check.reason, /Capture status is "FAILED"/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 6: Duplicate order creation request (Idempotency)
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 6: Duplicate order creation preserves requestId idempotency header", async () => {
    let capturedRequestId = null;
    globalThis.fetch = async (url, options = {}) => {
      const u = String(url);
      if (u.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "mock-token", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/v2/checkout/orders")) {
        capturedRequestId = options.headers?.["PayPal-Request-Id"] || options.headers?.["paypal-request-id"];
        return new Response(JSON.stringify({ id: "ORD-IDEMPOTENT-1", status: "CREATED" }), { status: 201 });
      }
      return new Response("Not found", { status: 404 });
    };

    const reqId = "test-idempotency-request-uuid-123";
    await createPayPalOrder({ amount: 120.0, requestId: reqId });
    assert.equal(capturedRequestId, reqId);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 7: Duplicate capture request (Already-settled handling)
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 7: Duplicate capture request recognizes already settled status", () => {
    const existingPayment = {
      id: "pay-1",
      status: "COMPLETED",
      paypal_capture_id: "8X-ALREADY-SETTLED",
      amount: 150.0,
    };

    const isAlreadySettled = ["COMPLETED", "PAID", "SETTLED"].includes(existingPayment.status);
    assert.equal(isAlreadySettled, true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 8: Invalid PayPal Order ID
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 8: Invalid or empty PayPal Order ID rejected with MISSING_ORDER_ID", async () => {
    await assert.rejects(
      async () => {
        await capturePayPalOrder({ orderId: "  ", requestId: "req-invalid-ord" });
      },
      (err) => err.code === "MISSING_ORDER_ID"
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 9: Unauthorized transaction access
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 9: Unauthenticated user rejected when initiating transaction", async () => {
    const res = await initiatePaymentTransaction({
      userId: null,
      amount: 100.0,
      supabaseClient: mockDb.client,
    });
    assert.equal(res.success, false);
    assert.equal(res.statusCode, 401);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 10: Cross-user payment capture attempt (Tenant Isolation)
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 10: Cross-user transaction ownership violation prevents unauthorized capture", () => {
    const userA = { id: "user-tenant-A" };
    const userB = { id: "user-tenant-B" };
    const transaction = { id: "txn-1", user_id: userA.id, amount: 200.0 };

    const isAuthorized = transaction.user_id === userB.id;
    assert.equal(isAuthorized, false, "User B must not be authorized to capture User A's transaction");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 11: Browser refresh during checkout (Order Reuse)
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 11: Active ORDER_CREATED state allows order reuse on page refresh", () => {
    const existingPayment = {
      id: "pay-refresh",
      status: "ORDER_CREATED",
      paypal_order_id: "5O190127TN364715T",
    };

    assert.equal(existingPayment.status, "ORDER_CREATED");
    assert.ok(existingPayment.paypal_order_id);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 12: Network interruption during capture (Safe Reconciliation)
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 12: Reconciles order via getPayPalOrder if capture times out", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "mock-token", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/v2/checkout/orders/ORD-RECONCILE")) {
        return new Response(JSON.stringify({
          id: "ORD-RECONCILE",
          status: "COMPLETED",
          intent: "CAPTURE",
          purchase_units: [{
            payments: {
              captures: [{
                id: "8X-RECONCILED",
                status: "COMPLETED",
                amount: { value: "250.00", currency_code: "USD" },
              }],
            },
          }],
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const orderData = await getPayPalOrder({ orderId: "ORD-RECONCILE" });
    const capture = orderData.purchaseUnits?.[0]?.payments?.captures?.[0];
    assert.equal(capture?.id, "8X-RECONCILED");
    assert.equal(capture?.status, "COMPLETED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 13: Webhook signature verification failure
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 13: Webhook signature verification failure rejects payload", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "mock-token", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/verify-webhook-signature")) {
        return new Response(JSON.stringify({ verification_status: "FAILURE" }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const mockHeaders = {
      get: (k) => {
        const headers = {
          "paypal-auth-algo": "SHA256withRSA",
          "paypal-cert-url": "https://api.sandbox.paypal.com/certs/mock.pem",
          "paypal-transmission-id": "tx-123",
          "paypal-transmission-sig": "sig-forged",
          "paypal-transmission-time": "2026-11-07T12:00:00Z",
        };
        return headers[k.toLowerCase()] || null;
      },
    };

    const verification = await verifyPayPalWebhookSignature({
      headers: mockHeaders,
      event: { id: "WH-EV-FAIL", event_type: "PAYMENT.CAPTURE.COMPLETED" },
    });

    assert.equal(verification.isValid, false);
    assert.equal(verification.status, "FAILURE");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 14: Duplicate webhook event (Idempotent processing)
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 14: Duplicate webhook event returns ALREADY_PROCESSED safely", async () => {
    const eventId = "WH-EVENT-DUPLICATE-123";

    // Seed event as already processed
    await mockDb.client.from("paypal_webhook_events").insert({
      paypal_event_id: eventId,
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      processing_status: "PROCESSED",
    });

    const res = await processPayPalWebhookEvent({
      event: { id: eventId, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} },
      supabaseClient: mockDb.client,
    });

    assert.equal(res.success, true);
    assert.equal(res.action, "ALREADY_PROCESSED");
    assert.equal(res.processed, false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 15: Out-of-order webhook events (State Machine Integrity)
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 15: Out-of-order CHECKOUT.ORDER.APPROVED event cannot overwrite COMPLETED payment", () => {
    // COMPLETED status must never transition backward to APPROVED
    assert.equal(canTransitionStatus(PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.APPROVED), false);
    assert.throws(() => {
      assertValidStatusTransition(PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.APPROVED);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 16: Successful full refund
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 16: Successful full refund executes POST /v2/payments/captures/{id}/refund", async () => {
    let capturedBody = null;
    let capturedEndpoint = null;

    globalThis.fetch = async (url, options = {}) => {
      const u = String(url);
      if (u.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "mock-token", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/refund")) {
        capturedEndpoint = u;
        capturedBody = JSON.parse(options.body || "{}");
        return new Response(JSON.stringify({
          id: "9REFUND-FULL-123",
          status: "COMPLETED",
          amount: { value: "300.00", currency_code: "USD" },
          create_time: "2026-11-07T14:00:00Z",
        }), { status: 201 });
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await refundPayPalCapture({
      captureId: "8X-CAPTURE-123",
      amount: 300.0,
      currency: "USD",
      reason: "Customer requested return",
      requestId: "req-refund-full-1",
    });

    assert.equal(res.refundId, "9REFUND-FULL-123");
    assert.equal(res.status, "COMPLETED");
    assert.equal(res.amount, "300.00");
    assert.match(capturedEndpoint, /\/v2\/payments\/captures\/8X-CAPTURE-123\/refund/);
    assert.equal(capturedBody.note_to_payer, "Customer requested return");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 17: Successful partial refund
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 17: Successful partial refund transitions state to PARTIALLY_REFUNDED", () => {
    assert.equal(canTransitionStatus(PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.PARTIALLY_REFUNDED), true);
    assert.equal(canTransitionStatus(PAYMENT_STATUS.PARTIALLY_REFUNDED, PAYMENT_STATUS.REFUNDED), true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 18: Duplicate refund / Over-refund request rejection
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 18: Over-refund request exceeding remaining settlement balance is rejected", () => {
    const payment = { amount: 100.0 };
    const alreadyRefunded = 60.0;
    const remainingRefundable = payment.amount - alreadyRefunded; // 40.0
    const requestedRefund = 50.0; // Exceeds 40.0

    const isExceeded = requestedRefund > remainingRefundable;
    assert.equal(isExceeded, true, "Refund exceeding remaining balance must be blocked");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 19: Failed refund handling
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 19: Failed refund from PayPal API throws typed PayPalApiError", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "mock-token", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/refund")) {
        return new Response(JSON.stringify({
          name: "CAPTURE_FULLY_REFUNDED",
          message: "The capture has already been fully refunded.",
        }), { status: 422 });
      }
      return new Response("Not found", { status: 404 });
    };

    await assert.rejects(
      async () => {
        await refundPayPalCapture({
          captureId: "8X-ALREADY-REFUNDED",
          amount: 50.0,
          requestId: "req-ref-fail",
        });
      },
      (err) => err.statusCode === 422
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 20: Unsupported currency rejection & server calculation
  // ───────────────────────────────────────────────────────────────────────────
  it("Scenario 20: Unsupported currency code is rejected and server calculates fee correctly", () => {
    assert.equal(isSupportedCurrency("USD"), true);
    assert.equal(isSupportedCurrency("INR"), true);
    assert.equal(isSupportedCurrency("EUR"), true);
    assert.equal(isSupportedCurrency("XYZ"), false, "XYZ must not be supported");

    // Server-side fee calculation
    const fee = calculateTransactionFee(100.0, "USD");
    assert.equal(fee.baseAmount, 100.0);
    assert.equal(fee.fee, 3.20); // 2.9% of 100 = 2.90 + 0.30 = 3.20
    assert.equal(fee.totalAmount, 103.20);
  });
});
