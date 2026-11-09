/**
 * PayPilot AI — Currency & Fee Management Engine
 *
 * Implements server-authoritative monetary validation, fee computation,
 * decimal precision formatting, and multi-currency exchange conversion.
 */

export const SUPPORTED_CURRENCIES = Object.freeze([
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "INR",
]);

/**
 * Standard processing fee rate matrix (Percentage + Fixed fee per transaction).
 * Standard PayPal developer merchant rates.
 */
const PROCESSING_FEE_RATES = {
  USD: { percent: 0.029, fixed: 0.3 },
  EUR: { percent: 0.029, fixed: 0.35 },
  GBP: { percent: 0.029, fixed: 0.3 },
  CAD: { percent: 0.029, fixed: 0.3 },
  AUD: { percent: 0.029, fixed: 0.3 },
  INR: { percent: 0.029, fixed: 3.0 },
};

/**
 * Deterministic reference exchange rates (relative to USD = 1.0).
 * Used when multi-currency checkout is enabled (e.g. INR input charged as USD).
 */
const BASE_USD_EXCHANGE_RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
  INR: 83.5,
};

/**
 * Validates that a currency code is a supported 3-letter ISO code.
 *
 * @param {string} currency
 * @returns {boolean}
 */
export function isSupportedCurrency(currency) {
  if (!currency || typeof currency !== "string") return false;
  return SUPPORTED_CURRENCIES.includes(currency.trim().toUpperCase());
}

/**
 * Normalizes and validates currency code, defaulting to configured PAYPAL_CURRENCY or USD.
 *
 * @param {string} [currency]
 * @returns {string} 3-letter uppercase currency code.
 */
export function normalizeCurrency(currency) {
  if (currency && typeof currency === "string") {
    const code = currency.trim().toUpperCase();
    if (SUPPORTED_CURRENCIES.includes(code)) {
      return code;
    }
  }
  const defaultCurrency = (process.env.PAYPAL_CURRENCY || "USD").trim().toUpperCase();
  return SUPPORTED_CURRENCIES.includes(defaultCurrency) ? defaultCurrency : "USD";
}

/**
 * Validates and formats a monetary amount to 2 decimal places.
 * Rejects negative numbers, NaN, Infinity, and non-numeric values.
 *
 * @param {number|string} amount
 * @returns {number} Formatted number with 2 decimal precision.
 */
export function parseAndValidateAmount(amount) {
  const parsed = Number(amount);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid payment amount "${amount}". Must be a positive finite number.`);
  }

  // Maximum single transaction limit guard ($1,000,000 equivalent)
  if (parsed > 1000000.0) {
    throw new Error("Payment amount exceeds maximum transaction limit of 1,000,000.00.");
  }

  // Round to exactly 2 decimal places to avoid IEEE 754 precision issues
  return Math.round(parsed * 100) / 100;
}

/**
 * Formats a monetary amount into a clean 2-decimal string (e.g. "120.50").
 *
 * @param {number|string} amount
 * @returns {string}
 */
export function formatAmountString(amount) {
  const valid = parseAndValidateAmount(amount);
  return valid.toFixed(2);
}

/**
 * Calculates backend transaction fees based on amount and currency.
 * The calculation is strictly performed server-side.
 *
 * @param {number|string} amount
 * @param {string} [currency="USD"]
 * @returns {{
 *   baseAmount: number,
 *   fee: number,
 *   totalAmount: number,
 *   currency: string,
 *   formattedBase: string,
 *   formattedFee: string,
 *   formattedTotal: string
 * }}
 */
export function calculateTransactionFee(amount, currency = "USD") {
  const base = parseAndValidateAmount(amount);
  const cur = normalizeCurrency(currency);
  const rate = PROCESSING_FEE_RATES[cur] || PROCESSING_FEE_RATES.USD;

  // Fee = (Amount * rate.percent) + rate.fixed
  const rawFee = base * rate.percent + rate.fixed;
  const fee = Math.round(rawFee * 100) / 100;
  const total = Math.round((base + fee) * 100) / 100;

  return {
    baseAmount: base,
    fee,
    totalAmount: total,
    currency: cur,
    formattedBase: base.toFixed(2),
    formattedFee: fee.toFixed(2),
    formattedTotal: total.toFixed(2),
  };
}

/**
 * Converts an amount from one currency to another server-side.
 * If source and target are the same, returns unchanged amount.
 *
 * @param {object} params
 * @param {number|string} params.amount - Source amount.
 * @param {string} params.fromCurrency - Source currency code.
 * @param {string} [params.toCurrency="USD"] - Target currency code.
 * @returns {{
 *   originalAmount: number,
 *   originalCurrency: string,
 *   convertedAmount: number,
 *   targetCurrency: string,
 *   exchangeRate: number,
 *   requiresConversion: boolean
 * }}
 */
export function convertCurrency({ amount, fromCurrency, toCurrency = "USD" }) {
  const num = Number(amount);
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);

  if (Number.isNaN(num) || !Number.isFinite(num) || num <= 0) {
    const fromUsd = BASE_USD_EXCHANGE_RATES[from] || 1.0;
    const toUsd = BASE_USD_EXCHANGE_RATES[to] || 1.0;
    const rate = from === to ? 1.0 : Math.round((toUsd / fromUsd) * 10000) / 10000;
    return {
      originalAmount: 0,
      originalCurrency: from,
      convertedAmount: 0,
      targetCurrency: to,
      exchangeRate: rate,
      requiresConversion: from !== to,
    };
  }

  const base = parseAndValidateAmount(amount);

  if (from === to) {
    return {
      originalAmount: base,
      originalCurrency: from,
      convertedAmount: base,
      targetCurrency: to,
      exchangeRate: 1.0,
      requiresConversion: false,
    };
  }

  // Cross rate calculation via base USD
  const fromUsdRate = BASE_USD_EXCHANGE_RATES[from] || 1.0;
  const toUsdRate = BASE_USD_EXCHANGE_RATES[to] || 1.0;

  // 1 unit of from = (toUsdRate / fromUsdRate) units of to
  const exactRate = toUsdRate / fromUsdRate;
  const exchangeRate = Math.round(exactRate * 1000000) / 1000000;
  const converted = Math.round(((base * toUsdRate) / fromUsdRate) * 100) / 100;

  return {
    originalAmount: base,
    originalCurrency: from,
    convertedAmount: converted,
    targetCurrency: to,
    exchangeRate,
    requiresConversion: true,
  };
}

/**
 * Formats a currency value with the standard Intl formatter for display.
 *
 * @param {number|string} amount
 * @param {string} [currency="USD"]
 * @returns {string}
 */
export function formatCurrencyDisplay(amount, currency = "USD") {
  const num = Number(amount) || 0;
  const cur = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${cur} ${num.toFixed(2)}`;
  }
}
