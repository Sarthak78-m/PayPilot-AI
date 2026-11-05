import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  captureCheckoutOrder,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
  checkServerPaymentFeatureGuard,
} from "@/lib/payments";

export async function POST(request) {
  try {
    // 0. Server-side payment feature guard
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

    const token = input?.token || input?.paymentToken;
    const orderId = input?.orderId;

    if (!token || typeof token !== "string" || !token.trim()) {
      return Response.json(
        { success: false, error: "Payment token is required.", code: "MISSING_TOKEN" },
        { status: 400 }
      );
    }

    if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
      return Response.json(
        { success: false, error: "PayPal order ID is required.", code: "MISSING_ORDER_ID" },
        { status: 400 }
      );
    }

    const cleanToken = token.trim();
    const cleanOrderId = orderId.trim();

    const supabaseClient = createSupabaseServerClient();
    const clientIp = extractClientIp(request);
    const rateLimitKey = buildRateLimitKey("capture_order", cleanOrderId, clientIp);

    // 1. Rate limiting (15 capture attempts per minute per IP / order ID)
    const rateLimit = await enforceRateLimit({
      key: rateLimitKey,
      limit: 15,
      windowSeconds: 60,
      supabaseClient,
    });

    if (!rateLimit.allowed) {
      if (rateLimit.isServiceUnavailable) {
        return Response.json(
          {
            success: false,
            error: "Payment service is temporarily unavailable. Please try again shortly.",
            code: "SERVICE_UNAVAILABLE",
          },
          {
            status: 503,
            headers: { "Retry-After": String(rateLimit.retryAfter || 60) },
          }
        );
      }
      return Response.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again shortly.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    // 2. Execute capture and settlement
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

    const responsePayload = {
      success: true,
      status: result.status,
      paymentId: result.paymentId,
      captureId: result.captureId,
    };

    if (result.amount !== undefined) responsePayload.amount = result.amount;
    if (result.currency !== undefined) responsePayload.currency = result.currency;
    if (result.capturedAt !== undefined) responsePayload.capturedAt = result.capturedAt;
    if (result.alreadySettled !== undefined) responsePayload.alreadySettled = result.alreadySettled;
    if (result.message !== undefined) responsePayload.message = result.message;

    return Response.json(responsePayload, { status: 200 });
  } catch {
    return Response.json(
      { success: false, error: "An unexpected error occurred during order capture.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
