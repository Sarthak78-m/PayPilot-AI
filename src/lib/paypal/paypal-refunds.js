import "server-only";

import { executePayPalRequest } from "./paypal-client";
import { PayPalError } from "./paypal-errors";
import { formatAmountString, normalizeCurrency } from "../payments/currency";

/**
 * Initiates an official refund for a captured PayPal transaction via Payments API v2.
 * Endpoint: POST /v2/payments/captures/{capture_id}/refund
 *
 * @param {object} params
 * @param {string} params.captureId - The original PayPal Capture ID (e.g. "8X123456789012345").
 * @param {number|string} [params.amount] - Refund amount. If omitted, full capture amount is refunded.
 * @param {string} [params.currency="USD"] - ISO currency code.
 * @param {string} [params.reason] - Reason or note to the payer.
 * @param {string} params.requestId - Idempotency request token (PayPal-Request-Id).
 * @param {object} [params.config] - Optional PayPal configuration override.
 * @param {number} [params.timeoutMs=15000] - Request timeout.
 * @returns {Promise<{
 *   refundId: string,
 *   status: string,
 *   amount: string,
 *   currency: string,
 *   createTime: string,
 *   updateTime: string,
 *   raw: object
 * }>}
 */
export async function refundPayPalCapture({
  captureId,
  amount = null,
  currency = "USD",
  reason = "",
  requestId,
  config = null,
  timeoutMs = 15000,
}) {
  if (!captureId || typeof captureId !== "string" || !captureId.trim()) {
    throw new PayPalError("Capture ID is required to execute a PayPal refund.", {
      code: "MISSING_CAPTURE_ID",
    });
  }

  if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
    throw new PayPalError("Idempotency requestId is required to execute a PayPal refund.", {
      code: "MISSING_REQUEST_ID",
    });
  }

  const cleanCaptureId = captureId.trim();
  const endpoint = `/v2/payments/captures/${encodeURIComponent(cleanCaptureId)}/refund`;

  const payload = {};

  if (amount !== null && amount !== undefined && Number(amount) > 0) {
    const formattedAmount = formatAmountString(amount);
    const normalizedCur = normalizeCurrency(currency);

    payload.amount = {
      value: formattedAmount,
      currency_code: normalizedCur,
    };
  }

  if (reason && typeof reason === "string" && reason.trim()) {
    payload.note_to_payer = reason.trim().slice(0, 255);
  }

  const raw = await executePayPalRequest({
    endpoint,
    method: "POST",
    body: payload,
    requestId: requestId.trim(),
    config,
    timeoutMs,
  });

  return {
    refundId: raw.id,
    status: raw.status || "COMPLETED",
    amount: raw.amount?.value || (amount ? formatAmountString(amount) : null),
    currency: raw.amount?.currency_code || currency,
    createTime: raw.create_time || new Date().toISOString(),
    updateTime: raw.update_time || new Date().toISOString(),
    raw,
  };
}

/**
 * Retrieves details of an existing PayPal refund.
 * Endpoint: GET /v2/payments/refunds/{refund_id}
 *
 * @param {object} params
 * @param {string} params.refundId - PayPal Refund ID.
 * @param {object} [params.config] - Optional PayPal configuration.
 * @returns {Promise<object>} Raw refund resource.
 */
export async function getPayPalRefund({ refundId, config = null }) {
  if (!refundId || typeof refundId !== "string" || !refundId.trim()) {
    throw new PayPalError("Refund ID is required to retrieve a PayPal refund.", {
      code: "MISSING_REFUND_ID",
    });
  }

  const cleanRefundId = refundId.trim();
  const endpoint = `/v2/payments/refunds/${encodeURIComponent(cleanRefundId)}`;

  return await executePayPalRequest({
    endpoint,
    method: "GET",
    config,
  });
}

/**
 * Retrieves details of an existing PayPal capture.
 * Used for status reconciliation and timeout recovery.
 * Endpoint: GET /v2/payments/captures/{capture_id}
 *
 * @param {object} params
 * @param {string} params.captureId - PayPal Capture ID.
 * @param {object} [params.config] - Optional PayPal configuration.
 * @returns {Promise<object>} Raw capture resource.
 */
export async function getPayPalCapture({ captureId, config = null }) {
  if (!captureId || typeof captureId !== "string" || !captureId.trim()) {
    throw new PayPalError("Capture ID is required to retrieve a PayPal capture.", {
      code: "MISSING_CAPTURE_ID",
    });
  }

  const cleanCaptureId = captureId.trim();
  const endpoint = `/v2/payments/captures/${encodeURIComponent(cleanCaptureId)}`;

  return await executePayPalRequest({
    endpoint,
    method: "GET",
    config,
  });
}
