import "server-only";

const DEFAULT_PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";

export function getPayPalConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const baseUrl = process.env.PAYPAL_BASE_URL || DEFAULT_PAYPAL_BASE_URL;

  if (!clientId || !clientSecret) {
    throw new Error("Missing PayPal server environment variables.");
  }

  return {
    baseUrl,
    clientId,
    clientSecret,
  };
}
