import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { isAdminUser } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refundPayPalCapture } from "@/lib/paypal";
import {
  parseAndValidateAmount,
  formatAmountString,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
  PAYMENT_STATUS,
} from "@/lib/payments";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/paypal/refund
 *
 * Administrator-authorized PayPal Refund execution endpoint.
 *
 * Responsibilities:
 * 1. Authenticates current user.
 * 2. Enforces strict administrative authorization (RBAC).
 * 3. Retrieves original payment and verifies capture presence.
 * 4. Calculates and validates refundable balance (preventing over-refunding).
 * 5. Calls official PayPal Capture Refund API: POST /v2/payments/captures/{id}/refund.
 * 6. Records actual PayPal refund ID in payment_refunds table.
 * 7. Transitions payment state machine to REFUNDED or PARTIALLY_REFUNDED.
 * 8. Records comprehensive security audit log.
 */
export async function POST(request) {
  try {
    // 1. Authenticate user
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { success: false, error: "Authentication is required.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const supabaseClient = createSupabaseServerClient();

    // 2. Authorize administrator privileges
    const { data: userProfile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!isAdminUser(user, userProfile)) {
      return Response.json(
        {
          success: false,
          error: "Administrative privileges are required to initiate payment refunds.",
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
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

    const { paymentId, amount, reason } = input || {};

    if (!paymentId || typeof paymentId !== "string" || !paymentId.trim()) {
      return Response.json(
        { success: false, error: "paymentId reference is required.", code: "MISSING_PAYMENT_ID" },
        { status: 400 }
      );
    }

    const clientIp = extractClientIp(request);
    const rateLimitKey = buildRateLimitKey("refund_payment", user.id, clientIp);
    const rateLimit = await enforceRateLimit({
      key: rateLimitKey,
      limit: 10,
      windowSeconds: 60,
      supabaseClient,
    });

    if (!rateLimit.allowed) {
      return Response.json(
        {
          success: false,
          error: "Rate limit exceeded for refund requests. Please try again shortly.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter || 60) } }
      );
    }

    // 3. Retrieve original payment record
    const cleanPaymentId = paymentId.trim();
    let query = supabaseClient.from("payments").select("*");

    if (cleanPaymentId.startsWith("PP-TXN-")) {
      query = query.eq("internal_transaction_id", cleanPaymentId);
    } else {
      query = query.eq("id", cleanPaymentId);
    }

    const { data: paymentRecord, error: paymentLookupError } = await query.maybeSingle();

    if (paymentLookupError || !paymentRecord) {
      return Response.json(
        { success: false, error: "Payment record not found.", code: "PAYMENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    // 4. Verify payment capture presence
    if (!paymentRecord.paypal_capture_id) {
      return Response.json(
        {
          success: false,
          error: "Payment cannot be refunded: No verified PayPal capture ID exists on this record.",
          code: "MISSING_CAPTURE_RECORD",
        },
        { status: 422 }
      );
    }

    // 5. Verify payment status eligibility
    const statusUpper = (paymentRecord.status || "").toUpperCase();
    if (statusUpper !== "COMPLETED" && statusUpper !== "PARTIALLY_REFUNDED") {
      return Response.json(
        {
          success: false,
          error: `Payment with status "${paymentRecord.status}" is not eligible for refund. Must be COMPLETED or PARTIALLY_REFUNDED.`,
          code: "INELIGIBLE_PAYMENT_STATUS",
        },
        { status: 422 }
      );
    }

    // 6. Calculate refundable balance
    const { data: existingRefunds } = await supabaseClient
      .from("payment_refunds")
      .select("refund_amount")
      .eq("payment_id", paymentRecord.id);

    const totalAlreadyRefunded = (existingRefunds || []).reduce(
      (sum, r) => sum + (Number(r.refund_amount) || 0),
      0
    );

    const originalPayableAmount = Number(paymentRecord.total_amount || paymentRecord.amount);
    const remainingRefundable = Math.round((originalPayableAmount - totalAlreadyRefunded) * 100) / 100;

    if (remainingRefundable <= 0) {
      return Response.json(
        {
          success: false,
          error: "This payment has already been refunded in full.",
          code: "ALREADY_FULLY_REFUNDED",
        },
        { status: 409 }
      );
    }

    // Determine refund amount
    let refundAmountNum;
    if (amount !== undefined && amount !== null && String(amount).trim() !== "") {
      try {
        refundAmountNum = parseAndValidateAmount(amount);
      } catch (err) {
        return Response.json(
          { success: false, error: err.message, code: "INVALID_REFUND_AMOUNT" },
          { status: 400 }
        );
      }

      if (refundAmountNum > remainingRefundable) {
        return Response.json(
          {
            success: false,
            error: `Refund amount (${formatAmountString(refundAmountNum)}) exceeds remaining refundable balance (${formatAmountString(remainingRefundable)}).`,
            code: "EXCEEDS_REFUNDABLE_AMOUNT",
          },
          { status: 400 }
        );
      }
    } else {
      // Default to full remaining balance
      refundAmountNum = remainingRefundable;
    }

    // 7. Execute PayPal Refund API
    const refundRequestId = crypto.randomUUID();
    let refundResult;

    try {
      refundResult = await refundPayPalCapture({
        captureId: paymentRecord.paypal_capture_id,
        amount: refundAmountNum,
        currency: paymentRecord.currency || "USD",
        reason: reason || "PayPilot administrative refund",
        requestId: refundRequestId,
      });
    } catch (gatewayErr) {
      return Response.json(
        {
          success: false,
          error: gatewayErr.message || "PayPal rejected the refund request.",
          code: gatewayErr.code || "PAYPAL_REFUND_FAILED",
        },
        { status: gatewayErr.statusCode === 429 ? 429 : 502 }
      );
    }

    if (!refundResult?.refundId) {
      return Response.json(
        { success: false, error: "Invalid refund response from PayPal Sandbox.", code: "GATEWAY_RESPONSE_INVALID" },
        { status: 502 }
      );
    }

    const now = new Date().toISOString();
    const newTotalRefunded = Math.round((totalAlreadyRefunded + refundAmountNum) * 100) / 100;
    const isFullRefund = newTotalRefunded >= originalPayableAmount;
    const nextPaymentStatus = isFullRefund ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED;

    // 8. Persist to payment_refunds
    await supabaseClient.from("payment_refunds").insert({
      payment_id: paymentRecord.id,
      paypal_refund_id: refundResult.refundId,
      refund_amount: refundAmountNum,
      currency: paymentRecord.currency || "USD",
      refund_reason: reason ? String(reason).slice(0, 255) : null,
      refund_status: refundResult.status || "COMPLETED",
      initiated_by: user.id,
      created_at: now,
      updated_at: now,
    });

    // 9. Update payments status
    await supabaseClient
      .from("payments")
      .update({
        status: nextPaymentStatus,
        updated_at: now,
      })
      .eq("id", paymentRecord.id);

    // 10. Record Audit Trail
    await supabaseClient.from("payment_audit_logs").insert({
      payment_id: paymentRecord.id,
      user_id: user.id,
      event_type: "REFUND_COMPLETED",
      details: {
        refundId: refundResult.refundId,
        refundAmount: refundAmountNum,
        currency: paymentRecord.currency || "USD",
        fullRefund: isFullRefund,
        remainingRefundable: Math.round((originalPayableAmount - newTotalRefunded) * 100) / 100,
        reason,
      },
      ip_address: clientIp,
      created_at: now,
    });

    return Response.json(
      {
        success: true,
        refundId: refundResult.refundId,
        status: refundResult.status || "COMPLETED",
        refundAmount: formatAmountString(refundAmountNum),
        currency: paymentRecord.currency || "USD",
        paymentId: paymentRecord.id,
        newPaymentStatus: nextPaymentStatus,
        remainingRefundable: formatAmountString(Math.max(0, originalPayableAmount - newTotalRefunded)),
        mode: "sandbox",
      },
      { status: 200 }
    );
  } catch (err) {
    return Response.json(
      { success: false, error: "An unexpected error occurred during refund processing.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
