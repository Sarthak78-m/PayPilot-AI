import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyPayPalWebhookSignature, processPayPalWebhookEvent } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * POST /api/paypal/webhook
 *
 * Official PayPal Developer Sandbox Webhook Receiver.
 *
 * Responsibilities:
 * 1. Receives incoming webhook events from PayPal.
 * 2. Authenticates transmission using PayPal webhook signature verification (POST /v1/notifications/verify-webhook-signature).
 * 3. Rejects invalid or forged transmission signatures with HTTP 400.
 * 4. Dispatches lifecycle events:
 *    - CHECKOUT.ORDER.APPROVED
 *    - PAYMENT.CAPTURE.COMPLETED
 *    - PAYMENT.CAPTURE.DENIED
 *    - PAYMENT.CAPTURE.PENDING
 *    - PAYMENT.CAPTURE.REFUNDED
 *    - PAYMENT.CAPTURE.REVERSED
 * 5. Idempotently persists and updates database records, audit trails, and invoice settlements.
 */
export async function POST(request) {
  try {
    let event;
    try {
      event = await request.json();
    } catch {
      return Response.json(
        { success: false, error: "Invalid JSON webhook payload." },
        { status: 400 }
      );
    }

    if (!event || !event.id || !event.event_type) {
      return Response.json(
        { success: false, error: "Missing required webhook event fields (id, event_type)." },
        { status: 400 }
      );
    }

    // 1. Verify Webhook Signature via official PayPal REST API
    const verification = await verifyPayPalWebhookSignature({
      headers: request.headers,
      event,
    });

    if (!verification.isValid) {
      return Response.json(
        {
          success: false,
          error: "Webhook signature verification failed.",
          reason: verification.reason,
          status: verification.status,
        },
        { status: 400 }
      );
    }

    // 2. Process Verified Webhook Event Idempotently
    const supabaseClient = createSupabaseServerClient();
    const result = await processPayPalWebhookEvent({
      event,
      supabaseClient,
    });

    return Response.json(
      {
        success: true,
        eventId: event.id,
        eventType: event.event_type,
        action: result.action,
        processed: result.processed,
      },
      { status: 200 }
    );
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: "Internal error processing PayPal webhook.",
        message: err.message,
      },
      { status: 500 }
    );
  }
}
