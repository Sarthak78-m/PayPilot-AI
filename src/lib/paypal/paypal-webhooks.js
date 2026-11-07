import "server-only";

import { executePayPalRequest } from "./paypal-client";
import { PayPalError } from "./paypal-errors";
import { canTransitionStatus, PAYMENT_STATUS } from "../payments/payment-state-machine";

/**
 * Verifies the authenticity of an incoming PayPal Webhook using the official
 * PayPal REST verification endpoint: POST /v1/notifications/verify-webhook-signature
 *
 * @param {object} params
 * @param {Headers|object} params.headers - HTTP request headers.
 * @param {object} params.event - Raw JSON webhook event payload.
 * @param {string} [params.webhookId] - PayPal Webhook ID override.
 * @param {object} [params.config] - Optional PayPal configuration.
 * @returns {Promise<{ isValid: boolean, status: string, reason?: string }>}
 */
export async function verifyPayPalWebhookSignature({
  headers,
  event,
  webhookId = null,
  config = null,
}) {
  const getHeader = (name) => {
    if (!headers) return null;
    if (typeof headers.get === "function") {
      return headers.get(name) || headers.get(name.toLowerCase());
    }
    return headers[name] || headers[name.toLowerCase()] || null;
  };

  const authAlgo = getHeader("paypal-auth-algo");
  const certUrl = getHeader("paypal-cert-url");
  const transmissionId = getHeader("paypal-transmission-id");
  const transmissionSig = getHeader("paypal-transmission-sig");
  const transmissionTime = getHeader("paypal-transmission-time");

  const resolvedWebhookId = webhookId || process.env.PAYPAL_WEBHOOK_ID;

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return {
      isValid: false,
      status: "MISSING_HEADERS",
      reason: "Missing one or more required PayPal transmission signature headers.",
    };
  }

  if (!resolvedWebhookId) {
    return {
      isValid: false,
      status: "CONFIG_ERROR",
      reason: "PAYPAL_WEBHOOK_ID is not configured on the server.",
    };
  }

  try {
    const verificationPayload = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: resolvedWebhookId.trim(),
      webhook_event: event,
    };

    const response = await executePayPalRequest({
      endpoint: "/v1/notifications/verify-webhook-signature",
      method: "POST",
      body: verificationPayload,
      config,
    });

    const status = response?.verification_status?.toUpperCase();

    if (status === "SUCCESS") {
      return { isValid: true, status: "SUCCESS" };
    }

    return {
      isValid: false,
      status: status || "FAILURE",
      reason: `PayPal webhook signature rejected with status "${status}".`,
    };
  } catch (err) {
    return {
      isValid: false,
      status: "VERIFICATION_ERROR",
      reason: err.message || "Failed to communicate with PayPal webhook verification service.",
    };
  }
}

/**
 * Idempotently processes an authenticated PayPal webhook event, updating payment
 * state machine records, audit trails, and invoice settlements.
 *
 * Supported events:
 * - CHECKOUT.ORDER.APPROVED
 * - PAYMENT.CAPTURE.COMPLETED
 * - PAYMENT.CAPTURE.DENIED
 * - PAYMENT.CAPTURE.PENDING
 * - PAYMENT.CAPTURE.REFUNDED
 * - PAYMENT.CAPTURE.REVERSED
 *
 * @param {object} params
 * @param {object} params.event - Verified PayPal Webhook event object.
 * @param {object} params.supabaseClient - Trusted service-role Supabase client.
 * @returns {Promise<{ success: boolean, eventId: string, processed: boolean, action: string }>}
 */
export async function processPayPalWebhookEvent({ event, supabaseClient }) {
  if (!event || !event.id || !event.event_type) {
    throw new PayPalError("Invalid webhook event structure.", { code: "INVALID_EVENT" });
  }

  const eventId = event.id;
  const eventType = event.event_type;
  const resource = event.resource || {};

  // 1. Check for Duplicate Webhook Event (Idempotency)
  const { data: existingEvent } = await supabaseClient
    .from("paypal_webhook_events")
    .select("id, processing_status")
    .eq("paypal_event_id", eventId)
    .maybeSingle();

  if (existingEvent && existingEvent.processing_status === "PROCESSED") {
    return {
      success: true,
      eventId,
      processed: false,
      action: "ALREADY_PROCESSED",
    };
  }

  // 2. Extract Associated Gateway Identifiers
  let orderId = null;
  let captureId = null;

  if (eventType === "CHECKOUT.ORDER.APPROVED") {
    orderId = resource.id;
  } else if (
    eventType.startsWith("PAYMENT.CAPTURE.") ||
    eventType.startsWith("PAYMENT.REFUND.")
  ) {
    if (eventType === "PAYMENT.CAPTURE.REFUNDED") {
      // In refund events, resource is the refund or capture
      captureId = resource.links?.find((l) => l.rel === "up")?.href?.split("/").pop() || null;
      if (!captureId && resource.id?.startsWith("8")) {
        captureId = resource.id;
      }
    } else {
      captureId = resource.id;
    }
    orderId =
      resource.supplementary_data?.related_ids?.order_id ||
      resource.custom_id ||
      null;
  }

  // Record initial event entry if not already present
  if (!existingEvent) {
    await supabaseClient.from("paypal_webhook_events").insert({
      paypal_event_id: eventId,
      event_type: eventType,
      resource_type: event.resource_type || "UNKNOWN",
      resource_id: resource.id || null,
      related_order_id: orderId,
      related_capture_id: captureId,
      payload: event,
      verification_status: "SUCCESS",
      processing_status: "PROCESSING",
      received_at: event.create_time || new Date().toISOString(),
    });
  }

  // 3. Find matching payment in PayPilot database
  let paymentRecord = null;

  if (captureId) {
    const { data: byCapture } = await supabaseClient
      .from("payments")
      .select("*, invoices(*)")
      .eq("paypal_capture_id", captureId)
      .maybeSingle();
    paymentRecord = byCapture;
  }

  if (!paymentRecord && orderId) {
    const { data: byOrder } = await supabaseClient
      .from("payments")
      .select("*, invoices(*)")
      .eq("paypal_order_id", orderId)
      .maybeSingle();
    paymentRecord = byOrder;
  }

  if (!paymentRecord) {
    // Event has no matching internal transaction; mark as ignored safely
    await supabaseClient
      .from("paypal_webhook_events")
      .update({
        processing_status: "IGNORED_UNMATCHED",
        processed_at: new Date().toISOString(),
      })
      .eq("paypal_event_id", eventId);

    return {
      success: true,
      eventId,
      processed: false,
      action: "UNMATCHED_RESOURCE",
    };
  }

  let actionTaken = "NO_STATE_CHANGE";
  const now = new Date().toISOString();

  // 4. State Machine Transition Dispatcher
  switch (eventType) {
    case "CHECKOUT.ORDER.APPROVED": {
      if (canTransitionStatus(paymentRecord.status, PAYMENT_STATUS.APPROVED)) {
        await supabaseClient
          .from("payments")
          .update({
            status: PAYMENT_STATUS.APPROVED,
            updated_at: now,
          })
          .eq("id", paymentRecord.id);

        await supabaseClient.from("payment_audit_logs").insert({
          payment_id: paymentRecord.id,
          user_id: paymentRecord.user_id,
          event_type: "PAYMENT_APPROVED",
          details: { webhookEventId: eventId, orderId },
        });

        actionTaken = "STATUS_UPDATED_APPROVED";
      }
      break;
    }

    case "PAYMENT.CAPTURE.COMPLETED": {
      if (canTransitionStatus(paymentRecord.status, PAYMENT_STATUS.COMPLETED)) {
        const capturedAmount = resource.amount?.value || paymentRecord.amount;
        const capturedCurrency = resource.amount?.currency_code || paymentRecord.currency;
        const payerEmail = resource.payer?.email_address || null;

        await supabaseClient
          .from("payments")
          .update({
            paypal_capture_id: captureId || paymentRecord.paypal_capture_id,
            status: PAYMENT_STATUS.COMPLETED,
            captured_at: resource.create_time || now,
            payer_email: payerEmail || paymentRecord.payer_email,
            updated_at: now,
          })
          .eq("id", paymentRecord.id);

        if (paymentRecord.invoice_id) {
          await supabaseClient
            .from("invoices")
            .update({ status: "PAID", updated_at: now })
            .eq("id", paymentRecord.invoice_id);
        }

        await supabaseClient.from("payment_audit_logs").insert({
          payment_id: paymentRecord.id,
          user_id: paymentRecord.user_id,
          event_type: "PAYMENT_CAPTURED",
          details: {
            webhookEventId: eventId,
            captureId: captureId || paymentRecord.paypal_capture_id,
            amount: capturedAmount,
            currency: capturedCurrency,
          },
        });

        actionTaken = "SETTLED_COMPLETED";
      }
      break;
    }

    case "PAYMENT.CAPTURE.DENIED": {
      if (canTransitionStatus(paymentRecord.status, PAYMENT_STATUS.DENIED)) {
        await supabaseClient
          .from("payments")
          .update({
            status: PAYMENT_STATUS.DENIED,
            failure_reason: resource.status_details?.reason || "Declined by PayPal.",
            updated_at: now,
          })
          .eq("id", paymentRecord.id);

        await supabaseClient.from("payment_audit_logs").insert({
          payment_id: paymentRecord.id,
          user_id: paymentRecord.user_id,
          event_type: "PAYMENT_FAILED",
          details: { webhookEventId: eventId, reason: "PAYMENT_CAPTURE_DENIED" },
        });

        actionTaken = "MARKED_DENIED";
      }
      break;
    }

    case "PAYMENT.CAPTURE.PENDING": {
      if (canTransitionStatus(paymentRecord.status, PAYMENT_STATUS.PENDING)) {
        await supabaseClient
          .from("payments")
          .update({
            status: PAYMENT_STATUS.PENDING,
            updated_at: now,
          })
          .eq("id", paymentRecord.id);

        actionTaken = "MARKED_PENDING";
      }
      break;
    }

    case "PAYMENT.CAPTURE.REFUNDED":
    case "PAYMENT.CAPTURE.REVERSED": {
      const refundAmount = Number(resource.amount?.value) || Number(paymentRecord.amount);
      const isFullRefund = refundAmount >= Number(paymentRecord.amount);
      const nextStatus = isFullRefund
        ? PAYMENT_STATUS.REFUNDED
        : PAYMENT_STATUS.PARTIALLY_REFUNDED;

      if (canTransitionStatus(paymentRecord.status, nextStatus)) {
        await supabaseClient
          .from("payments")
          .update({
            status: nextStatus,
            updated_at: now,
          })
          .eq("id", paymentRecord.id);

        // Record refund entry if resource has refund ID
        if (resource.id) {
          await supabaseClient
            .from("payment_refunds")
            .upsert({
              payment_id: paymentRecord.id,
              paypal_refund_id: resource.id,
              refund_amount: refundAmount,
              currency: resource.amount?.currency_code || paymentRecord.currency,
              refund_reason: resource.note_to_payer || "Gateway webhook refund event",
              refund_status: "COMPLETED",
              created_at: now,
              updated_at: now,
            }, { onConflict: "paypal_refund_id" });
        }

        await supabaseClient.from("payment_audit_logs").insert({
          payment_id: paymentRecord.id,
          user_id: paymentRecord.user_id,
          event_type: "REFUND_COMPLETED",
          details: {
            webhookEventId: eventId,
            refundId: resource.id,
            amount: refundAmount,
            full: isFullRefund,
          },
        });

        actionTaken = isFullRefund ? "FULL_REFUND_APPLIED" : "PARTIAL_REFUND_APPLIED";
      }
      break;
    }

    default:
      actionTaken = `UNHANDLED_EVENT_${eventType}`;
  }

  // 5. Mark webhook event as processed
  await supabaseClient
    .from("paypal_webhook_events")
    .update({
      processing_status: "PROCESSED",
      processed_at: now,
    })
    .eq("paypal_event_id", eventId);

  return {
    success: true,
    eventId,
    processed: true,
    action: actionTaken,
  };
}
