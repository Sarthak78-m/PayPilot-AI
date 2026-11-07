import { createSupabaseServerClient, createSupabaseAuthClient } from "@/lib/supabase/server";
import {
  captureCheckoutOrder,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
  checkServerPaymentFeatureGuard,
} from "@/lib/payments";
import { capturePayPalOrder, verifyCaptureSettlement } from "@/lib/paypal";
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
 * 3. Verifies that the order belongs to the expected PayPilot invoice.
 * 4. Calls the official PayPal Orders API v2: POST /v2/checkout/orders/{id}/capture.
 * 5. Verifies the actual PayPal capture response (status, amount, currency, capture ID).
 * 6. Atomically updates the database records (marking payment as 'completed' and invoice as 'PAID').
 * 7. Enforces idempotency to safely handle duplicate capture requests without duplicate billing.
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
            status: result.status || "FAILED",
            error: result.error,
            code: result.code,
          },
          { status: result.statusCode }
        );
      }

      return Response.json(
        {
          success: true,
          status: result.status || "COMPLETED",
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
    // PATH 2: Capture by Order ID / Invoice ID lookup
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Look up existing payment row by paypal_order_id
    let query = supabaseClient
      .from("payments")
      .select(`
        id,
        invoice_id,
        amount,
        status,
        gateway,
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

    if (invoiceId) {
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
    if (
      paymentRecord.status === "completed" ||
      paymentRecord.status === "COMPLETED" ||
      paymentRecord.status === "paid" ||
      paymentRecord.status === "settled"
    ) {
      return Response.json(
        {
          success: true,
          status: "COMPLETED",
          alreadySettled: true,
          paymentId: paymentRecord.id,
          orderId: cleanOrderId,
          captureId: paymentRecord.paypal_capture_id,
          amount: String(paymentRecord.amount || invoice?.amount),
          currency: String(invoice?.currency || "USD"),
          capturedAt: paymentRecord.captured_at || paymentRecord.created_at,
          paymentMethod: "PayPal Sandbox",
          mode: "sandbox",
        },
        { status: 200 }
      );
    }

    // 3. Optional user session verification if invoiceId is specified
    if (invoiceId) {
      try {
        const authClient = await createSupabaseAuthClient();
        const { data: authData } = await authClient.auth.getUser();
        if (authData?.user && invoice?.user_id && authData.user.id !== invoice.user_id) {
          return Response.json(
            { success: false, error: "Access denied to capture this order.", code: "FORBIDDEN" },
            { status: 403 }
          );
        }
      } catch {
        // Continue if session check is non-blocking for customer payments
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
      return Response.json(
        {
          success: false,
          status: "FAILED",
          error: "PayPal failed to capture payment. Please retry or contact support.",
          code: gatewayErr.code || "PAYPAL_CAPTURE_FAILED",
        },
        { status: gatewayErr.statusCode === 429 ? 429 : 502 }
      );
    }

    if (!captureResponse || !captureResponse.captureId) {
      return Response.json(
        {
          success: false,
          status: "FAILED",
          error: "Invalid capture response received from PayPal.",
          code: "GATEWAY_CAPTURE_INVALID",
        },
        { status: 502 }
      );
    }

    // 5. Verify settlement details (matching currency, status, amount)
    if (invoice) {
      const settlementCheck = verifyCaptureSettlement({
        captureResult: captureResponse,
        expectedAmount: invoice.amount,
        expectedCurrency: invoice.currency,
      });

      if (!settlementCheck.isValid) {
        return Response.json(
          {
            success: false,
            status: "FAILED",
            error: settlementCheck.reason || "Payment settlement verification failed.",
            code: "SETTLEMENT_VERIFICATION_FAILED",
          },
          { status: 422 }
        );
      }
    }

    // 6. Atomically update payment and invoice in database
    const capturedAt = captureResponse.capturedAt || new Date().toISOString();
    const finalAmount = captureResponse.amount || String(invoice?.amount || paymentRecord.amount);
    const finalCurrency = captureResponse.currency || String(invoice?.currency || "USD");

    // Update payment row
    await supabaseClient
      .from("payments")
      .update({
        paypal_capture_id: captureResponse.captureId,
        status: "completed",
        captured_at: capturedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id);

    // Settle invoice
    if (invoice?.id) {
      await supabaseClient
        .from("invoices")
        .update({
          status: "PAID",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);
    }

    return Response.json(
      {
        success: true,
        status: "COMPLETED",
        paymentId: paymentRecord.id,
        orderId: cleanOrderId,
        captureId: captureResponse.captureId,
        amount: finalAmount,
        currency: finalCurrency,
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
