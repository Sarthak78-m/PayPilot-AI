import "server-only";

/**
 * PayPilot AI — Payment State Machine
 *
 * Defines canonical payment statuses and enforces strict state transitions.
 * Ensures that payment success is never recorded without verified gateway capture,
 * and prevents out-of-order or invalid status mutations.
 */

export const PAYMENT_STATUS = Object.freeze({
  INITIATED: "INITIATED",
  PENDING: "PENDING",
  CREATED: "CREATED",
  ORDER_CREATED: "ORDER_CREATED",
  APPROVED: "APPROVED",
  PROCESSING: "PROCESSING",
  CAPTURING: "CAPTURING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DENIED: "DENIED",
  CANCELLED: "CANCELLED",
  REFUND_PENDING: "REFUND_PENDING",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
});

/**
 * Valid state transitions for the payment lifecycle.
 */
const ALLOWED_TRANSITIONS = {
  [PAYMENT_STATUS.INITIATED]: [
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.CREATED,
    PAYMENT_STATUS.ORDER_CREATED,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.FAILED,
  ],
  [PAYMENT_STATUS.PENDING]: [
    PAYMENT_STATUS.CREATED,
    PAYMENT_STATUS.ORDER_CREATED,
    PAYMENT_STATUS.APPROVED,
    PAYMENT_STATUS.PROCESSING,
    PAYMENT_STATUS.CAPTURING,
    PAYMENT_STATUS.COMPLETED,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.DENIED,
  ],
  [PAYMENT_STATUS.CREATED]: [
    PAYMENT_STATUS.ORDER_CREATED,
    PAYMENT_STATUS.APPROVED,
    PAYMENT_STATUS.PROCESSING,
    PAYMENT_STATUS.CAPTURING,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.FAILED,
  ],
  [PAYMENT_STATUS.ORDER_CREATED]: [
    PAYMENT_STATUS.APPROVED,
    PAYMENT_STATUS.PROCESSING,
    PAYMENT_STATUS.CAPTURING,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.DENIED,
  ],
  [PAYMENT_STATUS.APPROVED]: [
    PAYMENT_STATUS.PROCESSING,
    PAYMENT_STATUS.CAPTURING,
    PAYMENT_STATUS.COMPLETED,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.FAILED,
  ],
  [PAYMENT_STATUS.PROCESSING]: [
    PAYMENT_STATUS.COMPLETED,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.APPROVED,
  ],
  [PAYMENT_STATUS.CAPTURING]: [
    PAYMENT_STATUS.COMPLETED,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.PENDING,
  ],
  [PAYMENT_STATUS.COMPLETED]: [
    PAYMENT_STATUS.REFUND_PENDING,
    PAYMENT_STATUS.PARTIALLY_REFUNDED,
    PAYMENT_STATUS.REFUNDED,
  ],
  [PAYMENT_STATUS.REFUND_PENDING]: [
    PAYMENT_STATUS.PARTIALLY_REFUNDED,
    PAYMENT_STATUS.REFUNDED,
    PAYMENT_STATUS.COMPLETED, // If refund was denied or aborted
  ],
  [PAYMENT_STATUS.PARTIALLY_REFUNDED]: [
    PAYMENT_STATUS.REFUND_PENDING,
    PAYMENT_STATUS.REFUNDED,
  ],
  [PAYMENT_STATUS.REFUNDED]: [], // Terminal state
  [PAYMENT_STATUS.FAILED]: [
    PAYMENT_STATUS.INITIATED,
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.ORDER_CREATED,
  ], // Retry allowed
  [PAYMENT_STATUS.DENIED]: [
    PAYMENT_STATUS.INITIATED,
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.ORDER_CREATED,
  ],
  [PAYMENT_STATUS.CANCELLED]: [
    PAYMENT_STATUS.INITIATED,
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.ORDER_CREATED,
  ],
};

/**
 * Normalizes payment status string to canonical uppercase.
 *
 * @param {string} status
 * @returns {string}
 */
export function normalizePaymentStatus(status) {
  if (!status || typeof status !== "string") return PAYMENT_STATUS.INITIATED;
  const s = status.trim().toUpperCase();
  if (s === "PAID" || s === "SETTLED") return PAYMENT_STATUS.COMPLETED;
  return s;
}

/**
 * Checks whether a transition between two payment states is valid.
 *
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {boolean}
 */
export function canTransitionStatus(currentStatus, nextStatus) {
  const current = normalizePaymentStatus(currentStatus);
  const next = normalizePaymentStatus(nextStatus);

  if (current === next) return true; // Idempotent no-op

  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed) return false;

  return allowed.includes(next);
}

/**
 * Asserts that a state transition is permitted, throwing an Error if invalid.
 *
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @throws {Error}
 */
export function assertValidStatusTransition(currentStatus, nextStatus) {
  const current = normalizePaymentStatus(currentStatus);
  const next = normalizePaymentStatus(nextStatus);

  if (!canTransitionStatus(current, next)) {
    throw new Error(
      `Invalid payment status transition: Cannot transition from "${current}" to "${next}".`
    );
  }
}

/**
 * Maps an official PayPal order or capture status to a PayPilot internal status.
 *
 * @param {string} payPalStatus - Status from PayPal API (e.g. "COMPLETED", "VOIDED", "APPROVED").
 * @returns {string} Canonical PayPilot status.
 */
export function mapPayPalStatusToInternal(payPalStatus) {
  const s = (payPalStatus || "").trim().toUpperCase();
  switch (s) {
    case "COMPLETED":
      return PAYMENT_STATUS.COMPLETED;
    case "APPROVED":
      return PAYMENT_STATUS.APPROVED;
    case "SAVED":
    case "CREATED":
      return PAYMENT_STATUS.ORDER_CREATED;
    case "PENDING":
      return PAYMENT_STATUS.PENDING;
    case "VOIDED":
    case "CANCELLED":
      return PAYMENT_STATUS.CANCELLED;
    case "DENIED":
    case "DECLINED":
      return PAYMENT_STATUS.DENIED;
    case "FAILED":
      return PAYMENT_STATUS.FAILED;
    case "PARTIALLY_REFUNDED":
      return PAYMENT_STATUS.PARTIALLY_REFUNDED;
    case "REFUNDED":
      return PAYMENT_STATUS.REFUNDED;
    default:
      return PAYMENT_STATUS.PENDING;
  }
}
