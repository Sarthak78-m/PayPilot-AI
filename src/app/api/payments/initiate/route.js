import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  initiatePaymentTransaction,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
  checkServerPaymentFeatureGuard,
} from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/initiate
 *
 * Initiates an official PayPilot transaction on the backend.
 *
 * Responsibilities:
 * - Authenticates the currently logged-in user.
 * - Server-side validation of amount and currency.
 * - Server-side calculation of processing fees and final payable amount.
 * - Generation of unique internal transaction reference (e.g. PP-TXN-...).
 * - Creation of pending transaction record with status INITIATED.
 * - Association of transaction with authenticated user.
 * - Recording of security audit trail.
 */
export async function POST(request) {
  try {
    // 0. Feature Guard
    const featureGuardResponse = checkServerPaymentFeatureGuard();
    if (featureGuardResponse) {
      return featureGuardResponse;
    }

    // 1. Authenticate currently logged-in user
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { success: false, error: "Authentication is required to initiate a transaction.", code: "UNAUTHORIZED" },
        { status: 401 }
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

    const {
      amount,
      currency,
      category,
      recipientEmail,
      recipientName,
      description,
      invoiceId,
    } = input || {};

    const clientIp = extractClientIp(request);
    const supabaseClient = createSupabaseServerClient();

    // 2. Rate limiting (20 transaction initiations per minute per user)
    const rateLimitKey = buildRateLimitKey("initiate_payment", user.id, clientIp);
    const rateLimit = await enforceRateLimit({
      key: rateLimitKey,
      limit: 20,
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

    // 3. Execute authoritative transaction initiation
    const result = await initiatePaymentTransaction({
      userId: user.id,
      amount,
      currency,
      category,
      recipientEmail,
      recipientName,
      description,
      invoiceId,
      clientIp,
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
        data: result.transaction,
      },
      { status: result.statusCode }
    );
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: "An unexpected error occurred while initiating transaction.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
