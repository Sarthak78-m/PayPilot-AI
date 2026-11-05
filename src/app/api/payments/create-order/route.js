import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createCheckoutOrder,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
} from "@/lib/payments";

export async function POST(request) {
  try {
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
    if (!token || typeof token !== "string" || !token.trim()) {
      return Response.json(
        { success: false, error: "Payment token is required.", code: "MISSING_TOKEN" },
        { status: 400 }
      );
    }

    const cleanToken = token.trim();
    const supabaseClient = createSupabaseServerClient();
    const clientIp = extractClientIp(request);
    const rateLimitKey = buildRateLimitKey("create_order", cleanToken, clientIp);

    // 1. Rate limiting (15 order creation attempts per minute per IP / token)
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
          error: "Rate limit exceeded. Please try again shortly.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    // 2. Initialize checkout order
    const result = await createCheckoutOrder({
      token: cleanToken,
      supabaseClient,
    });

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error, code: result.code },
        { status: result.statusCode }
      );
    }

    return Response.json(
      {
        success: true,
        paymentId: result.paymentId,
        orderId: result.orderId,
        status: result.status,
      },
      { status: 200 }
    );
  } catch {
    return Response.json(
      { success: false, error: "An unexpected error occurred during order creation.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
