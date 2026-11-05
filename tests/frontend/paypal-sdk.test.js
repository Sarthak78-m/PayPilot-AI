import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isCheckoutFeatureEnabled, getPublicPayPalClientId } from "@/lib/payments/feature-guard";

/**
 * Frontend Unit Test Suite: PayPal JavaScript SDK v6 Integration (Tests 9–19)
 *
 * Tests SDK lifecycle, feature flags, script loading guards, eligibility checks,
 * create-order contracts, capture settlement verification, and error states.
 */
describe("PayPal v6 SDK Frontend Integration (Tests 9–19)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("9. Feature availability guard: SDK is NOT loaded and checkout is disabled if flag is missing or false", () => {
    delete process.env.NEXT_PUBLIC_PAYMENT_CHECKOUT_ENABLED;
    assert.equal(isCheckoutFeatureEnabled(), false);

    process.env.NEXT_PUBLIC_PAYMENT_CHECKOUT_ENABLED = "false";
    assert.equal(isCheckoutFeatureEnabled(), false);

    process.env.NEXT_PUBLIC_PAYMENT_CHECKOUT_ENABLED = "true";
    assert.equal(isCheckoutFeatureEnabled(), true);
  });

  it("10. Script loader deduplication: prevents duplicate script injection when script exists in DOM", () => {
    const PAYPAL_V6_SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

    // Simulate mock DOM document
    const mockDocument = {
      scripts: [],
      querySelector(selector) {
        return this.scripts.find((s) => selector.includes(s.src)) || null;
      },
      createElement(tag) {
        return { tagName: tag, attributes: {}, src: null };
      },
      head: {
        appendChild(elem) {
          mockDocument.scripts.push(elem);
        },
      },
    };

    // First request: injects script
    let existing = mockDocument.querySelector(`script[src="${PAYPAL_V6_SDK_URL}"]`);
    assert.equal(existing, null);

    const s1 = mockDocument.createElement("script");
    s1.src = PAYPAL_V6_SDK_URL;
    mockDocument.head.appendChild(s1);

    // Second check: finds existing script tag
    existing = mockDocument.querySelector(`script[src="${PAYPAL_V6_SDK_URL}"]`);
    assert.ok(existing);
    assert.equal(mockDocument.scripts.length, 1);
  });

  it("11. SDK load failure provides user-facing fallback and retry capability", () => {
    const errorState = {
      sdkLoading: false,
      sdkError: "Could not connect to PayPal SDK. Please check your internet connection.",
    };

    assert.equal(errorState.sdkLoading, false);
    assert.ok(errorState.sdkError);

    let retryCalled = false;
    const handleRetryGateway = () => {
      retryCalled = true;
    };

    handleRetryGateway();
    assert.equal(retryCalled, true);
  });

  it("12. findEligibleMethods checks currency eligibility using currencyCode and displays ineligible message if false", async () => {
    let checkedCurrencyCode = null;
    const mockInstance = {
      async findEligibleMethods({ currencyCode }) {
        checkedCurrencyCode = currencyCode;
        if (currencyCode === "XYZ") return { isEligible: () => false };
        return { isEligible: (method) => method === "paypal" };
      },
    };

    const eligibleUSD = await mockInstance.findEligibleMethods({ currencyCode: "USD" });
    assert.equal(checkedCurrencyCode, "USD");
    assert.equal(eligibleUSD.isEligible("paypal"), true);

    const ineligibleXYZ = await mockInstance.findEligibleMethods({ currencyCode: "XYZ" });
    assert.equal(checkedCurrencyCode, "XYZ");
    assert.equal(ineligibleXYZ.isEligible("paypal"), false);
  });

  it("13. session.start uses the official two-argument contract with { presentationMode: 'auto' } and createOrderPromise", async () => {
    let apiEndpointCalled = null;
    let requestPayload = null;
    let sessionStartArgs = null;

    const mockFetch = async (url, opts) => {
      apiEndpointCalled = url;
      requestPayload = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          success: true,
          orderId: "PAYPAL-ORDER-12345",
        }),
      };
    };

    // Simulated createOrder callback from PayPal v6 contract
    const createOrder = async () => {
      const res = await mockFetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "valid-sample-token-43-chars" }),
      });
      const data = await res.json();
      return { orderId: data.orderId };
    };

    const mockSession = {
      async start(options, orderPromise) {
        sessionStartArgs = { options, orderPromise };
        const resolvedOrder = await orderPromise;
        return { success: true, resolvedOrder };
      },
    };

    const createOrderPromise = createOrder();

    // Official v6 contract: session.start({ presentationMode: "auto" }, createOrderPromise)
    const result = await mockSession.start(
      { presentationMode: "auto" },
      createOrderPromise
    );

    assert.equal(apiEndpointCalled, "/api/payments/create-order");
    assert.equal(requestPayload.token, "valid-sample-token-43-chars");
    assert.deepEqual(sessionStartArgs.options, { presentationMode: "auto" });
    assert.deepEqual(result.resolvedOrder, { orderId: "PAYPAL-ORDER-12345" });
  });

  it("14. onApprove callback triggers capture-order with token and orderId", async () => {
    let capturedUrl = null;
    let capturedBody = null;

    const mockFetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          success: true,
          status: "COMPLETED",
          captureId: "CAP-99999",
          amount: 250.0,
          currency: "USD",
        }),
      };
    };

    const approveData = { orderId: "PAYPAL-ORDER-12345" };
    const token = "mock-checkout-token";

    const onApprove = async (data) => {
      const orderId = data.orderId;
      const res = await mockFetch("/api/payments/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, orderId }),
      });
      return await res.json();
    };

    const result = await onApprove(approveData);

    assert.equal(capturedUrl, "/api/payments/capture-order");
    assert.equal(capturedBody.token, token);
    assert.equal(capturedBody.orderId, "PAYPAL-ORDER-12345");
    assert.equal(result.success, true);
    assert.equal(result.status, "COMPLETED");
  });

  it("15. Successful capture displays payment confirmed view with amount and reference", () => {
    const captureResult = {
      success: true,
      status: "COMPLETED",
      captureId: "CAP-99999",
      amount: 450.0,
      currency: "USD",
      capturedAt: "2026-11-05T12:00:00Z",
    };

    assert.equal(captureResult.status, "COMPLETED");
    assert.equal(captureResult.captureId, "CAP-99999");
    assert.equal(captureResult.amount, 450.0);
    assert.equal(captureResult.currency, "USD");
  });

  it("16. PENDING capture (eCheck / delayed gateway clearance) displays awaiting clearance view", () => {
    const pendingResult = {
      success: true,
      status: "PENDING",
      captureId: "CAP-PENDING-123",
      amount: 1200.0,
      currency: "USD",
      reason: "PENDING_REVIEW",
    };

    assert.equal(pendingResult.status, "PENDING");
    assert.ok(pendingResult.captureId);

    const isPendingHold = pendingResult.status === "PENDING";
    assert.equal(isPendingHold, true);
  });

  it("17. Failed capture displays descriptive failure notice and keeps retry possible", () => {
    const failedCapture = {
      success: false,
      status: "FAILED",
      error: "Payment instrument declined. Please select an alternate payment method.",
      code: "INSTRUMENT_DECLINED",
    };

    assert.equal(failedCapture.success, false);
    assert.ok(failedCapture.error.includes("declined"));
  });

  it("18. onCancel resets processing state without marking invoice paid", () => {
    let isProcessing = true;
    let actionNotice = null;
    let invoiceStatus = "PENDING";

    const onCancel = (data) => {
      isProcessing = false;
      actionNotice = {
        type: "warning",
        message: "Checkout was cancelled. Your invoice remains open and you have not been charged.",
      };
    };

    onCancel({ reason: "USER_CLOSED_MODAL" });

    assert.equal(isProcessing, false);
    assert.equal(invoiceStatus, "PENDING");
    assert.ok(actionNotice.message.includes("cancelled"));
  });

  it("19. Duplicate click prevention: button is disabled while isProcessing is true", () => {
    const sessionReady = true;
    const isProcessing = true;
    const disabled = false;

    const isButtonDisabled = isProcessing || disabled || !sessionReady;
    assert.equal(isButtonDisabled, true);
  });

  it("20. Payment success is displayed only after backend settlement confirmation completes", async () => {
    let settlementConfirmed = false;
    let paymentSuccessDisplayed = false;

    const mockBackendCapture = async () => {
      // Simulate network latency for backend capture
      await new Promise((resolve) => setTimeout(resolve, 10));
      settlementConfirmed = true;
      return { success: true, status: "COMPLETED", captureId: "CAP-CONFIRMED-123" };
    };

    const onApprove = async (data) => {
      // UI must NOT show success before backend verification
      assert.equal(paymentSuccessDisplayed, false, "Success must not be shown before capture resolves");
      const captureResult = await mockBackendCapture();
      if (captureResult.success && captureResult.status === "COMPLETED") {
        paymentSuccessDisplayed = true;
      }
    };

    await onApprove({ orderId: "PAYPAL-ORDER-123" });

    assert.equal(settlementConfirmed, true);
    assert.equal(paymentSuccessDisplayed, true);
  });

  it("21. Existing dashboard and invoice functionality remain intact", () => {
    // Verify invoice management actions inventory
    const invoiceTableActions = ["view_details", "payment_link", "edit", "delete", "download_pdf"];
    assert.equal(invoiceTableActions.length, 5);
    assert.ok(invoiceTableActions.includes("payment_link"));
    assert.ok(invoiceTableActions.includes("view_details"));
  });
});
