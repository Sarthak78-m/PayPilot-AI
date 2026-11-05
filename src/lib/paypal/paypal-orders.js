import "server-only";

import { executePayPalRequest } from "./paypal-client";
import { PayPalError } from "./paypal-errors";

/**
 * Validates and formats a monetary amount to 2 decimal places.
 *
 * @param {number|string} amount
 * @returns {string} Formatted string representation (e.g. "120.00")
 */
function formatAmount(amount) {
  const parsed = Number(amount);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
    throw new PayPalError(
      `Invalid payment amount "${amount}". Amount must be a positive finite number.`,
      { code: "INVALID_AMOUNT" }
    );
  }
  return parsed.toFixed(2);
}

/**
 * Validates an ISO 4217 currency code.
 *
 * @param {string} currency
 * @returns {string} Normalized 3-letter uppercase currency code.
 */
function normalizeCurrency(currency) {
  if (!currency || typeof currency !== "string" || currency.trim().length !== 3) {
    throw new PayPalError(
      `Invalid currency "${currency}". Must be a valid 3-letter ISO 4217 currency code.`,
      { code: "INVALID_CURRENCY" }
    );
  }
  return currency.trim().toUpperCase();
}

/**
 * Creates an order via PayPal Orders v2 API with intent CAPTURE.
 * Requires an explicit idempotency requestId (e.g. create_request_id).
 *
 * @param {object} params
 * @param {number|string} params.amount - Total amount to charge (positive numeric).
 * @param {string} [params.currency="USD"] - 3-letter ISO currency code.
 * @param {string} params.requestId - PayPal-Request-Id idempotency token (required).
 * @param {string} [params.invoiceId] - Server-side invoice reference.
 * @param {string} [params.customId] - Optional internal metadata ID.
 * @param {string} [params.description] - Human-readable order description.
 * @param {string} [params.returnUrl] - URL for buyer approval redirection.
 * @param {string} [params.cancelUrl] - URL for buyer cancellation redirection.
 * @param {object} [params.config] - Optional PayPal configuration.
 * @param {number} [params.timeoutMs] - Request timeout.
 * @returns {Promise<{
 *   orderId: string,
 *   status: string,
 *   approveUrl: string|null,
 *   links: Array<object>,
 *   raw: object
 * }>}
 */
export async function createPayPalOrder({
  amount,
  currency = "USD",
  requestId,
  invoiceId,
  customId,
  description,
  returnUrl,
  cancelUrl,
  config = null,
  timeoutMs = 15000,
}) {
  if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
    throw new PayPalError(
      "Idempotency requestId is required to create a PayPal Order.",
      { code: "MISSING_REQUEST_ID" }
    );
  }

  const formattedAmount = formatAmount(amount);
  const normalizedCurrency = normalizeCurrency(currency);

  const purchaseUnit = {
    reference_id: invoiceId ? String(invoiceId).slice(0, 256) : "default",
    description: description
      ? String(description).slice(0, 127)
      : invoiceId
        ? `Invoice #${invoiceId}`.slice(0, 127)
        : "PayPilot AI Invoice Payment",
    amount: {
      currency_code: normalizedCurrency,
      value: formattedAmount,
    },
  };

  const resolvedCustomId = customId || invoiceId;
  if (resolvedCustomId) {
    purchaseUnit.custom_id = String(resolvedCustomId).slice(0, 127);
  }

  const payload = {
    intent: "CAPTURE",
    purchase_units: [purchaseUnit],
  };

  if (returnUrl || cancelUrl) {
    payload.payment_source = {
      paypal: {
        experience_context: {
          user_action: "PAY_NOW",
          ...(returnUrl ? { return_url: returnUrl } : {}),
          ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
        },
      },
    };
  }

  const raw = await executePayPalRequest({
    endpoint: "/v2/checkout/orders",
    method: "POST",
    body: payload,
    requestId: requestId.trim(),
    config,
    timeoutMs,
  });

  const approveUrl = raw?.links?.find((link) => link.rel === "approve")?.href || null;

  return {
    orderId: raw.id,
    status: raw.status,
    approveUrl,
    links: Array.isArray(raw?.links) ? raw.links : [],
    raw,
  };
}

/**
 * Captures payment for an approved PayPal order via Orders v2.
 * Requires an explicit idempotency requestId (e.g. capture_request_id).
 *
 * @param {object} params
 * @param {string} params.orderId - PayPal Order ID (e.g. "5O190127TN364715T").
 * @param {string} params.requestId - PayPal-Request-Id idempotency token (required).
 * @param {object} [params.config] - Optional PayPal configuration.
 * @param {number} [params.timeoutMs] - Request timeout.
 * @returns {Promise<{
 *   orderId: string,
 *   status: string,
 *   captureId: string|null,
 *   captureStatus: string|null,
 *   amount: string|null,
 *   currency: string|null,
 *   fee: string|null,
 *   netAmount: string|null,
 *   capturedAt: string,
 *   raw: object
 * }>}
 */
export async function capturePayPalOrder({
  orderId,
  requestId,
  config = null,
  timeoutMs = 15000,
}) {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    throw new PayPalError("orderId is required to capture a PayPal order.", {
      code: "MISSING_ORDER_ID",
    });
  }

  if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
    throw new PayPalError(
      "Idempotency requestId is required to capture a PayPal order.",
      { code: "MISSING_REQUEST_ID" }
    );
  }

  const cleanOrderId = orderId.trim();
  const endpoint = `/v2/checkout/orders/${encodeURIComponent(cleanOrderId)}/capture`;

  const raw = await executePayPalRequest({
    endpoint,
    method: "POST",
    body: {},
    requestId: requestId.trim(),
    config,
    timeoutMs,
  });

  // Extract primary capture record
  const primaryPurchaseUnit = raw?.purchase_units?.[0];
  const capture = primaryPurchaseUnit?.payments?.captures?.[0];

  const captureId = capture?.id || null;
  const captureStatus = capture?.status || null;
  const amount = capture?.amount?.value || primaryPurchaseUnit?.amount?.value || null;
  const currency = capture?.amount?.currency_code || primaryPurchaseUnit?.amount?.currency_code || null;
  const fee = capture?.seller_receivable_breakdown?.paypal_fee?.value || null;
  const netAmount = capture?.seller_receivable_breakdown?.net_amount?.value || null;
  const capturedAt = capture?.create_time || raw?.create_time || new Date().toISOString();

  return {
    orderId: raw.id || cleanOrderId,
    status: raw.status,
    captureId,
    captureStatus,
    amount,
    currency,
    fee,
    netAmount,
    capturedAt,
    raw,
  };
}

/**
 * Retrieves details of an existing PayPal Order.
 *
 * @param {object} params
 * @param {string} params.orderId - PayPal Order ID.
 * @param {object} [params.config] - Optional PayPal configuration.
 * @param {number} [params.timeoutMs] - Request timeout.
 * @returns {Promise<{
 *   orderId: string,
 *   status: string,
 *   intent: string,
 *   purchaseUnits: Array<object>,
 *   raw: object
 * }>}
 */
export async function getPayPalOrder({
  orderId,
  config = null,
  timeoutMs = 15000,
}) {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    throw new PayPalError("orderId is required to retrieve a PayPal order.", {
      code: "MISSING_ORDER_ID",
    });
  }

  const cleanOrderId = orderId.trim();
  const endpoint = `/v2/checkout/orders/${encodeURIComponent(cleanOrderId)}`;

  const raw = await executePayPalRequest({
    endpoint,
    method: "GET",
    requestId: null,
    config,
    timeoutMs,
  });

  return {
    orderId: raw.id || cleanOrderId,
    status: raw.status,
    intent: raw.intent,
    purchaseUnits: raw.purchase_units || [],
    raw,
  };
}

/**
 * Verifies that a captured PayPal payment matches server-authoritative expectations:
 * verified amount, verified currency, and optional payee identity.
 *
 * @param {object} params
 * @param {object} params.captureResult - Result from capturePayPalOrder.
 * @param {number|string} params.expectedAmount - Authoritative amount from database invoice.
 * @param {string} params.expectedCurrency - Authoritative currency code from database invoice.
 * @param {string} [params.expectedPayeeId] - Expected PayPal merchant/payee account ID.
 * @param {string} [params.expectedPayeeEmail] - Expected PayPal merchant/payee email address.
 * @returns {{ isValid: boolean, reason?: string }}
 */
export function verifyCaptureSettlement({
  captureResult,
  expectedAmount,
  expectedCurrency,
  expectedPayeeId,
  expectedPayeeEmail,
}) {
  if (!captureResult || typeof captureResult !== "object") {
    return { isValid: false, reason: "Missing or invalid capture result object." };
  }

  // 1. Verify capture status
  const status = (captureResult.status || captureResult.captureStatus || "").toUpperCase();
  if (status !== "COMPLETED" && status !== "PENDING") {
    return {
      isValid: false,
      reason: `Capture status is "${status}". Expected COMPLETED or PENDING.`,
    };
  }

  // 2. Verify captured amount matches authoritative expected amount
  const capturedAmountNum = Number(captureResult.amount);
  const expectedAmountNum = Number(expectedAmount);
  if (
    Number.isNaN(capturedAmountNum) ||
    Number.isNaN(expectedAmountNum) ||
    Math.abs(capturedAmountNum - expectedAmountNum) > 0.001
  ) {
    return {
      isValid: false,
      reason: `Amount mismatch: captured ${captureResult.amount}, expected ${expectedAmount}.`,
    };
  }

  // 3. Verify currency matches authoritative expected currency
  const capturedCurrency = (captureResult.currency || "").toUpperCase();
  const normalizedExpectedCurrency = (expectedCurrency || "").toUpperCase();
  if (!capturedCurrency || capturedCurrency !== normalizedExpectedCurrency) {
    return {
      isValid: false,
      reason: `Currency mismatch: captured ${capturedCurrency}, expected ${normalizedExpectedCurrency}.`,
    };
  }

  // 4. Verify payee identity if expected payee ID is specified
  const primaryUnit = captureResult.raw?.purchase_units?.[0];
  const payee = primaryUnit?.payee;
  if (expectedPayeeId && payee?.merchant_id) {
    if (payee.merchant_id.trim().toLowerCase() !== expectedPayeeId.trim().toLowerCase()) {
      return {
        isValid: false,
        reason: `Payee merchant_id mismatch: received ${payee.merchant_id}, expected ${expectedPayeeId}.`,
      };
    }
  }

  // 5. Verify payee email if specified
  if (expectedPayeeEmail && payee?.email_address) {
    if (payee.email_address.trim().toLowerCase() !== expectedPayeeEmail.trim().toLowerCase()) {
      return {
        isValid: false,
        reason: `Payee email_address mismatch: received ${payee.email_address}, expected ${expectedPayeeEmail}.`,
      };
    }
  }

  return { isValid: true };
}
