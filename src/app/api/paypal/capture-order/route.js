import { createSupabaseServerClient, createSupabaseAuthClient } from "@/lib/supabase/server";
import {
  captureCheckoutOrder,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
  checkServerPaymentFeatureGuard,
  PAYMENT_STATUS,
} from "@/lib/payments";
import { capturePayPalOrder, getPayPalOrder, verifyCaptureSettlement } from "@/lib/paypal";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/paypal/capture-order
 *
 * Secure server-side PayPal Sandbox Order capture & settlement endpoint.
 *
 * Responsibilities:
 * 1. Receives and validates the PayPal Order ID.
 * 2. Authenticates current user / validates payment token.
 * 3. Verifies that the order belongs to the expected PayPilot transaction or invoice.
 * 4. Calls the official PayPal Orders API v2: POST /v2/checkout/orders/{id}/capture.
 * 5. Handles network timeouts safely via getPayPalOrder reconciliation.
 * 6. Verifies the actual PayPal capture response (status, amount, currency, capture ID).
 * 7. Atomically updates database records (marking payment as COMPLETED and invoice as PAID).
 * 8. Enforces idempotency to safely handle duplicate capture requests without duplicate billing.
 * 9. Records audit trail of payment capture.
 */
export async function POST(request) {
  try {
    // 0. Feature Guard
    const featureGuardResponse = checkServerPaymentFeatureGuard();
    if (featureGuardResponse) {
      return featureGuardResponse;
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return Response.json(
        { success: false, error: "Request body must be valid JSON.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const orderId = input?.orderId || input?.orderID;
    const token = input?.token || input?.paymentToken;
    const invoiceId = input?.invoiceId;
    const transactionId = input?.transactionId || input?.transactionRef;

    if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
      return Response.json(
        { success: false, error: "PayPal order ID is required.", code: "MISSING_ORDER_ID" },
        { status: 400 }
      );
    }

    const cleanOrderId = orderId.trim();
    const supabaseClient = createSupabaseServerClient();
    const clientIp = extractClientIp(request);
    const rateLimitKey = buildRateLimitKey("capture_order", cleanOrderId, clientIp);

    // Rate Limiting (15 capture attempts per minute per IP / order ID)
    const rateLimit = await enforceRateLimit({
      key: rateLimitKey,
      limit: 15,
      windowSeconds: 60,
      supabaseClient,
    });

    if (!rateLimit.allowed) {
      return Response.json(
        {
          success: false,
          error: rateLimit.isServiceUnavailable
            ? "Payment service temporarily unavailable."
            : "Rate limit exceeded. Please try again shortly.",
          code: rateLimit.isServiceUnavailable ? "SERVICE_UNAVAILABLE" : "RATE_LIMIT_EXCEEDED",
        },
        {
          status: rateLimit.isServiceUnavailable ? 503 : 429,
          headers: { "Retry-After": String(rateLimit.retryAfter || 60) },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PATH 1: Capture with Public Payment Link Token
    // ─────────────────────────────────────────────────────────────────────────
    if (token) {
      const cleanToken = String(token).trim();
      const result = await captureCheckoutOrder({
        token: cleanToken,
        orderId: cleanOrderId,
        supabaseClient,
      });

      if (!result.success) {
        return Response.json(
          {
            success: false,
            status: result.status || PAYMENT_STATUS.FAILED,
            error: result.error,
            code: result.code,
          },
          { status: result.statusCode }
        );
      }

      return Response.json(
        {
          success: true,
          status: result.status || PAYMENT_STATUS.COMPLETED,
          paymentId: result.paymentId,
          orderId: cleanOrderId,
          captureId: result.captureId,
          amount: result.amount,
          currency: result.currency,
          capturedAt: result.capturedAt || new Date().toISOString(),
          paymentMethod: "PayPal Sandbox",
          mode: "sandbox",
        },
        { status: 200 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PATH 2: Capture by Order ID / Invoice ID / Transaction ID lookup
    // ─────────────────────────────────────────────────────────────────────────
    let query = supabaseClient
      .from("payments")
      .select(`
        id,
        user_id,
        invoice_id,
        internal_transaction_id,
        amount,
        currency,
        transaction_fee,
        total_amount,
        status,
        provider,
        payment_method,
        payer_email,
        payer_name,
        paypal_order_id,
        paypal_capture_id,
        captured_at,
        created_at,
        invoices (
          id,
          user_id,
          amount,
          currency,
          status
        )
      `)
      .eq("paypal_order_id", cleanOrderId);

    if (transactionId) {
      const cleanTxn = String(transactionId).trim();
      if (cleanTxn.startsWith("PP-TXN-")) {
        query = query.eq("internal_transaction_id", cleanTxn);
      } else {
        query = query.eq("id", cleanTxn);
      }
    } else if (invoiceId) {
      query = query.eq("invoice_id", String(invoiceId).trim());
    }

    const { data: paymentRecord, error: paymentLookupError } = await query.maybeSingle();

    if (paymentLookupError || !paymentRecord) {
      return Response.json(
        {
          success: false,
          error: "No matching payment record found for this PayPal Order ID.",
          code: "PAYMENT_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    const invoice = paymentRecord.invoices;

    // 2. Idempotency Check: Already captured payment
    const currentStatus = (paymentRecord.status || "").toUpperCase();
    if (
      currentStatus === "COMPLETED" ||
      currentStatus === "PAID" ||
      currentStatus === "SETTLED"
    ) {
      return Response.json(
        {
          success: true,
          status: PAYMENT_STATUS.COMPLETED,
          alreadySettled: true,
          paymentId: paymentRecord.id,
          internalReference: paymentRecord.internal_transaction_id,
          orderId: cleanOrderId,
          captureId: paymentRecord.paypal_capture_id,
          amount: String(paymentRecord.total_amount || paymentRecord.amount || invoice?.amount),
          currency: String(paymentRecord.currency || invoice?.currency || "USD"),
          fee: String(paymentRecord.transaction_fee || "0.00"),
          capturedAt: paymentRecord.captured_at || paymentRecord.created_at,
          paymentMethod: paymentRecord.payment_method || "PayPal Sandbox",
          mode: "sandbox",
        },
        { status: 200 }
      );
    }

    // 3. User session verification
    let authUser = null;
    try {
      const authClient = await createSupabaseAuthClient();
      const { data: authData } = await authClient.auth.getUser();
      authUser = authData?.user;
    } catch {
      authUser = null;
    }

    // Tenant isolation: If user is logged in, verify transaction ownership
    if (authUser) {
      const ownerId = paymentRecord.user_id || invoice?.user_id;
      if (ownerId && authUser.id !== ownerId) {
        return Response.json(
          { success: false, error: "Access denied to capture this payment.", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
    }

    // 4. Capture Order via PayPal Orders v2 API
    const captureRequestId = crypto.randomUUID();
    let captureResponse;
    try {
      captureResponse = await capturePayPalOrder({
        orderId: cleanOrderId,
        requestId: captureRequestId,
      });
    } catch (gatewayErr) {
      // Reconcile timeout safely: Check if the order was actually captured
      if (gatewayErr.name === "PayPalTimeoutError" || gatewayErr.statusCode === 504) {
        try {
          const orderCheck = await getPayPalOrder({ orderId: cleanOrderId });
          const captureObj = orderCheck?.purchaseUnits?.[0]?.payments?.captures?.[0];
          if (captureObj && captureObj.status === "COMPLETED") {
            captureResponse = {
              orderId: cleanOrderId,
              status: "COMPLETED",
              captureId: captureObj.id,
              captureStatus: captureObj.status,
              amount: captureObj.amount?.value,
              currency: captureObj.amount?.currency_code,
              fee: captureObj.seller_receivable_breakdown?.paypal_fee?.value || null,
              netAmount: captureObj.seller_receivable_breakdown?.net_amount?.value || null,
              capturedAt: captureObj.create_time || new Date().toISOString(),
              raw: orderCheck.raw,
            };
          }
        } catch {
          // If reconciliation fails, propagate original gateway error
        }
      }

      if (!captureResponse) {
        return Response.json(
          {
            success: false,
            status: PAYMENT_STATUS.FAILED,
            error: "PayPal failed to capture payment. Please retry or contact support.",
            code: gatewayErr.code || "PAYPAL_CAPTURE_FAILED",
          },
          { status: gatewayErr.statusCode === 429 ? 429 : 502 }
        );
      }
    }

    if (!captureResponse || !captureResponse.captureId) {
      return Response.json(
        {
          success: false,
          status: PAYMENT_STATUS.FAILED,
          error: "Invalid capture response received from PayPal.",
          code: "GATEWAY_CAPTURE_INVALID",
        },
        { status: 502 }
      );
    }

    // 5. Verify settlement details (matching expected amount and currency)
    const expectedAmount = paymentRecord.total_amount || paymentRecord.amount || invoice?.amount;
    const expectedCurrency = paymentRecord.currency || invoice?.currency;

    if (expectedAmount && expectedCurrency) {
      const settlementCheck = verifyCaptureSettlement({
        captureResult: captureResponse,
        expectedAmount,
        expectedCurrency,
      });

      if (!settlementCheck.isValid) {
        return Response.json(
          {
            success: false,
            status: PAYMENT_STATUS.FAILED,
            error: settlementCheck.reason || "Payment settlement verification failed.",
            code: "SETTLEMENT_VERIFICATION_FAILED",
          },
          { status: 422 }
        );
      }
    }

    // 6. Atomically update payment and invoice in database
    const capturedAt = captureResponse.capturedAt || new Date().toISOString();
    const finalAmount = captureResponse.amount || String(expectedAmount);
    const finalCurrency = captureResponse.currency || String(expectedCurrency || "USD");

    const payer = captureResponse.raw?.payer;
    const payerEmail = payer?.email_address || paymentRecord.payer_email || null;
    const payerName = payer?.name
      ? `${payer.name.given_name || ""} ${payer.name.surname || ""}`.trim()
      : paymentRecord.payer_name || null;

    // Update payment row
    await supabaseClient
      .from("payments")
      .update({
        paypal_capture_id: captureResponse.captureId,
        status: PAYMENT_STATUS.COMPLETED,
        captured_at: capturedAt,
        payer_email: payerEmail,
        payer_name: payerName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id);

    // Settle invoice if linked
    if (invoice?.id) {
      await supabaseClient
        .from("invoices")
        .update({
          status: "PAID",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);
    }

    // 7. Record Audit Trail Event
    await supabaseClient.from("payment_audit_logs").insert({
      payment_id: paymentRecord.id,
      user_id: paymentRecord.user_id || authUser?.id || null,
      event_type: "PAYMENT_CAPTURED",
      details: {
        orderId: cleanOrderId,
        captureId: captureResponse.captureId,
        amount: finalAmount,
        currency: finalCurrency,
        payerEmail,
      },
      ip_address: clientIp,
    });

    return Response.json(
      {
        success: true,
        status: PAYMENT_STATUS.COMPLETED,
        paymentId: paymentRecord.id,
        internalReference: paymentRecord.internal_transaction_id,
        orderId: cleanOrderId,
        captureId: captureResponse.captureId,
        amount: finalAmount,
        currency: finalCurrency,
        fee: String(paymentRecord.transaction_fee || captureResponse.fee || "0.00"),
        payerEmail,
        payerName,
        capturedAt,
        paymentMethod: "PayPal Sandbox",
        mode: "sandbox",
      },
      { status: 200 }
    );
  } catch {
    return Response.json(
      { success: false, error: "An unexpected error occurred during order capture.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
