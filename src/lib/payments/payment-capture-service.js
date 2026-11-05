import "server-only";

import { hashPaymentToken, isValidPaymentTokenFormat } from "./payment-token";
import { capturePayPalOrder, verifyCaptureSettlement } from "@/lib/paypal";

/**
 * Validates checkout token and order ID, reserves capture via PostgreSQL RPC,
 * executes capture against PayPal Orders v2, and atomically settles the invoice.
 *
 * @param {object} params
 * @param {string} params.token - Public Base64URL payment link token.
 * @param {string} params.orderId - PayPal Order ID.
 * @param {object} params.supabaseClient - Trusted service-role Supabase client.
 * @param {object} [params.payPalConfig] - Optional PayPal configuration override.
 * @param {string} [params.expectedMerchantId] - Optional merchant ID override for payee verification.
 * @returns {Promise<{
 *   success: boolean,
 *   status?: string,
 *   paymentId?: string,
 *   captureId?: string,
 *   amount?: string,
 *   currency?: string,
 *   capturedAt?: string,
 *   alreadySettled?: boolean,
 *   message?: string,
 *   error?: string,
 *   code?: string,
 *   statusCode: number
 * }>}
 */
export async function captureCheckoutOrder({
  token,
  orderId,
  supabaseClient,
  payPalConfig = null,
  expectedMerchantId = process.env.PAYPAL_SANDBOX_MERCHANT_ID || process.env.PAYPAL_MERCHANT_ID,
  timeoutMs = 15000,
}) {
  if (!isValidPaymentTokenFormat(token)) {
    return {
      success: false,
      error: "Payment link is invalid or has expired.",
      code: "INVALID_TOKEN_FORMAT",
      statusCode: 404,
    };
  }

  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return {
      success: false,
      error: "PayPal order ID is required for capture.",
      code: "INVALID_ORDER_ID",
      statusCode: 400,
    };
  }

  const cleanOrderId = orderId.trim();
  const tokenHash = hashPaymentToken(token);

  // 1. Resolve payment link and associated invoice
  const { data: linkRecord, error: linkError } = await supabaseClient
    .from("invoice_payment_links")
    .select(`
      id,
      invoice_id,
      expires_at,
      revoked_at,
      invoices (
        id,
        status,
        amount,
        currency
      )
    `)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkError || !linkRecord) {
    return {
      success: false,
      error: "Payment link is invalid or has expired.",
      code: "LINK_NOT_FOUND",
      statusCode: 404,
    };
  }

  if (linkRecord.revoked_at !== null) {
    return {
      success: false,
      error: "Payment link has been revoked.",
      code: "LINK_REVOKED",
      statusCode: 404,
    };
  }

  if (new Date(linkRecord.expires_at) <= new Date()) {
    return {
      success: false,
      error: "Payment link has expired.",
      code: "LINK_EXPIRED",
      statusCode: 404,
    };
  }

  const invoice = linkRecord.invoices;
  if (!invoice) {
    return {
      success: false,
      error: "Associated invoice record not found.",
      code: "INVOICE_NOT_FOUND",
      statusCode: 404,
    };
  }

  // 2. Find active payment attempt matching invoice and PayPal order ID
  const { data: paymentRecord, error: paymentError } = await supabaseClient
    .from("payments")
    .select("*")
    .eq("invoice_id", invoice.id)
    .eq("paypal_order_id", cleanOrderId)
    .maybeSingle();

  if (paymentError || !paymentRecord) {
    return {
      success: false,
      error: "Payment attempt not found for this order.",
      code: "PAYMENT_NOT_FOUND",
      statusCode: 404,
    };
  }

  // 3. Atomically lock invoice/payment and reserve capture via PostgreSQL RPC
  const { data: reserveResult, error: reserveError } = await supabaseClient.rpc(
    "reserve_payment_capture",
    {
      p_payment_id: paymentRecord.id,
      p_paypal_order_id: cleanOrderId,
    }
  );

  if (reserveError) {
    return {
      success: false,
      error: "Failed to reserve payment capture.",
      code: "DATABASE_RPC_ERROR",
      statusCode: 500,
    };
  }

  if (!reserveResult || !reserveResult.success) {
    const code = reserveResult?.code || "CAPTURE_RESERVATION_FAILED";
    const message = reserveResult?.message || "Payment attempt is not eligible for capture.";
    let statusCode = 400;
    if (code === "INVOICE_ALREADY_PAID" || code === "INVALID_PAYMENT_STATUS" || code === "TERMINAL_PAYMENT_STATE") {
      statusCode = 409;
    } else if (code === "ORDER_ID_MISMATCH") {
      statusCode = 422;
    }

    return {
      success: false,
      error: message,
      code,
      statusCode,
    };
  }

  // 3a. Idempotent check: Payment already settled previously
  if (reserveResult.already_completed) {
    return {
      success: true,
      status: "COMPLETED",
      paymentId: reserveResult.payment_id,
      captureId: reserveResult.paypal_capture_id,
      amount: String(reserveResult.amount),
      currency: reserveResult.currency,
      alreadySettled: true,
      statusCode: 200,
    };
  }

  // 3b. Gateway clearance hold (e.g. eCheck): Never call capture again
  if (reserveResult.is_pending_clearance) {
    return {
      success: true,
      status: "PENDING",
      paymentId: reserveResult.payment_id,
      captureId: reserveResult.paypal_capture_id,
      amount: String(reserveResult.amount),
      currency: reserveResult.currency,
      message: reserveResult.message || "Capture is pending gateway clearance. Awaiting settlement confirmation.",
      statusCode: 200,
    };
  }

  const captureRequestId = reserveResult.capture_request_id;

  // 4. Call PayPal Orders v2 Capture API with the stable capture_request_id
  let captureResult;
  try {
    captureResult = await capturePayPalOrder({
      orderId: cleanOrderId,
      requestId: captureRequestId,
      config: payPalConfig,
      timeoutMs,
    });
  } catch (err) {
    // Ambiguous timeout: preserve CAPTURING state and capture_request_id; do not mark FAILED
    if (err.name === "PayPalTimeoutError" || err.statusCode === 504) {
      return {
        success: false,
        error: "PayPal did not respond in time. Please retry capture with the same order ID.",
        code: "GATEWAY_TIMEOUT",
        statusCode: 504,
      };
    }

    return {
      success: false,
      error: "Payment gateway error during capture. Please retry.",
      code: err.code || "PAYPAL_CAPTURE_FAILED",
      statusCode: err.statusCode === 429 ? 429 : 502,
    };
  }

  const captureStatus = (captureResult.status || captureResult.captureStatus || "").toUpperCase();

  // 5. Handle Non-Completed Gateway States
  if (captureStatus === "PENDING") {
    // Persist pending state without marking invoice PAID
    await supabaseClient
      .from("payments")
      .update({
        status: "PENDING",
        paypal_capture_id: captureResult.captureId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id)
      .eq("status", "CAPTURING");

    return {
      success: true,
      status: "PENDING",
      paymentId: paymentRecord.id,
      captureId: captureResult.captureId,
      message: "Payment captured with pending clearance. Awaiting settlement confirmation.",
      statusCode: 200,
    };
  }

  if (captureStatus === "FAILED" || captureStatus === "DENIED") {
    // Record failure in payments table without marking invoice PAID
    await supabaseClient
      .from("payments")
      .update({
        status: "FAILED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id)
      .eq("status", "CAPTURING");

    return {
      success: false,
      status: "FAILED",
      error: "Payment authorization or capture was declined by PayPal.",
      code: "PAYMENT_DECLINED",
      statusCode: 422,
    };
  }

  // 6. Verify Settlement Anti-Tampering (authoritative amount, currency, payee)
  const settlementVerification = verifyCaptureSettlement({
    captureResult,
    expectedAmount: paymentRecord.amount,
    expectedCurrency: paymentRecord.currency,
    expectedPayeeId: expectedMerchantId,
  });

  if (!settlementVerification.isValid) {
    return {
      success: false,
      error: `Settlement verification failed: ${settlementVerification.reason}`,
      code: "SETTLEMENT_VERIFICATION_FAILED",
      statusCode: 422,
    };
  }

  // 7. Atomic Settlement Commit via PostgreSQL RPC
  const { data: settleResult, error: settleError } = await supabaseClient.rpc(
    "settle_invoice_payment",
    {
      p_payment_id: paymentRecord.id,
      p_paypal_order_id: cleanOrderId,
      p_paypal_capture_id: captureResult.captureId,
      p_verified_amount: Number(captureResult.amount),
      p_verified_currency: captureResult.currency,
      p_captured_at: captureResult.capturedAt,
      p_provider: "paypal",
    }
  );

  if (settleError) {
    return {
      success: false,
      error: "Failed to record payment settlement in database.",
      code: "SETTLEMENT_RPC_ERROR",
      statusCode: 500,
    };
  }

  if (!settleResult || !settleResult.success) {
    return {
      success: false,
      error: settleResult?.message || "Settlement failed in database.",
      code: settleResult?.code || "SETTLEMENT_REJECTED",
      statusCode: 409,
    };
  }

  return {
    success: true,
    status: "COMPLETED",
    paymentId: paymentRecord.id,
    captureId: captureResult.captureId,
    amount: String(captureResult.amount),
    currency: captureResult.currency,
    capturedAt: captureResult.capturedAt,
    alreadySettled: Boolean(settleResult.already_settled),
    statusCode: 200,
  };
}
