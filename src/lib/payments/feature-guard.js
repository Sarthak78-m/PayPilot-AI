/**
 * Evaluates whether online PayPal checkout is enabled in the current environment.
 * The default deployment state is strictly disabled until separate activation is authorized.
 *
 * @returns {boolean} True only when NEXT_PUBLIC_PAYMENT_CHECKOUT_ENABLED is explicitly "true".
 */
export function isCheckoutFeatureEnabled() {
  if (typeof process === "undefined" || !process.env) {
    return false;
  }
  return process.env.NEXT_PUBLIC_PAYMENT_CHECKOUT_ENABLED === "true";
}

/**
 * Returns the public PayPal Client ID for frontend SDK initialization.
 * Never returns secrets or OAuth tokens.
 *
 * @returns {string} Public client ID or empty string if not configured.
 */
export function getPublicPayPalClientId() {
  if (typeof process === "undefined" || !process.env) {
    return "";
  }
  return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";
}
