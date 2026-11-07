import "server-only";

import crypto from "node:crypto";
import { calculateTransactionFee, convertCurrency, normalizeCurrency, parseAndValidateAmount } from "./currency";
import { PAYMENT_STATUS } from "./payment-state-machine";

/**
 * Generates an official, human-readable, collision-resistant PayPilot internal transaction reference.
 * Example: "PP-TXN-1718000000000-8F3A2B1C"
 *
 * @returns {string} Unique reference string.
 */
export function generateInternalTransactionReference() {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `PP-TXN-${timestamp}-${randomBytes}`;
}

/**
 * Initiates an official PayPilot payment transaction.
 *
 * Enforces backend source of truth for:
 * - Fee calculation
 * - Total amount payable
 * - Currency validation
 * - User ownership
 * - Audit logging
 *
 * @param {object} params
 * @param {string} params.userId - Authenticated user ID.
 * @param {number|string} params.amount - User requested amount.
 * @param {string} [params.currency="USD"] - Requested currency.
 * @param {string} [params.category="Payment"] - Payment category / service.
 * @param {string} [params.recipientEmail] - Recipient / payee email address.
 * @param {string} [params.recipientName] - Recipient / payee name.
 * @param {string} [params.description] - Transaction description / purpose.
 * @param {string} [params.invoiceId] - Optional associated invoice reference.
 * @param {string} [params.clientIp] - Client IP address for security audit.
 * @param {object} params.supabaseClient - Trusted service-role Supabase client.
 * @returns {Promise<{
 *   success: boolean,
 *   transaction?: object,
 *   error?: string,
 *   code?: string,
 *   statusCode: number
 * }>}
 */
export async function initiatePaymentTransaction({
  userId,
  amount,
  currency = "USD",
  category = "Payment",
  recipientEmail = null,
  recipientName = null,
  description = null,
  invoiceId = null,
  clientIp = null,
  supabaseClient,
}) {
  if (!userId || typeof userId !== "string") {
    return {
      success: false,
      error: "User authentication is required to initiate a payment transaction.",
      code: "UNAUTHORIZED",
      statusCode: 401,
    };
  }

  // 1. Authoritative Amount Validation
  let validatedAmount;
  try {
    validatedAmount = parseAndValidateAmount(amount);
  } catch (err) {
    return {
      success: false,
      error: err.message || "Invalid transaction amount.",
      code: "INVALID_AMOUNT",
      statusCode: 400,
    };
  }

  // 2. Authoritative Currency Validation & Normalization
  const normalizedCur = normalizeCurrency(currency);

  // 3. Optional invoice validation if linked
  let linkedInvoice = null;
  if (invoiceId) {
    const { data: inv, error: invError } = await supabaseClient
      .from("invoices")
      .select("id, user_id, amount, currency, status, customer_name, customer_email")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invError || !inv) {
      return {
        success: false,
        error: "Associated invoice record not found.",
        code: "INVOICE_NOT_FOUND",
        statusCode: 404,
      };
    }

    if (inv.status === "PAID") {
      return {
        success: false,
        error: "This invoice has already been settled in full.",
        code: "INVOICE_ALREADY_PAID",
        statusCode: 409,
      };
    }

    linkedInvoice = inv;
  }

  // 4. Server-Side Fee Calculation (Frontend is NEVER trusted)
  const feeCalculation = calculateTransactionFee(validatedAmount, normalizedCur);

  // 5. Multi-Currency Conversion Preview (e.g. INR input with PayPal Sandbox USD)
  const configuredPayPalCurrency = (process.env.PAYPAL_CURRENCY || "USD").trim().toUpperCase();
  const conversion = convertCurrency({
    amount: feeCalculation.totalAmount,
    fromCurrency: normalizedCur,
    toCurrency: configuredPayPalCurrency,
  });

  // 6. Generate Unique Internal Transaction Reference
  const internalRef = generateInternalTransactionReference();
  const now = new Date().toISOString();

  // 7. Persist Pending Transaction Record
  const insertPayload = {
    user_id: userId,
    invoice_id: linkedInvoice?.id || null,
    internal_transaction_id: internalRef,
    amount: feeCalculation.baseAmount,
    currency: normalizedCur,
    transaction_fee: feeCalculation.fee,
    total_amount: feeCalculation.totalAmount,
    category: String(category || "Payment").slice(0, 50),
    recipient_email: recipientEmail ? String(recipientEmail).trim().toLowerCase().slice(0, 255) : null,
    recipient_name: recipientName ? String(recipientName).trim().slice(0, 100) : null,
    description: description ? String(description).slice(0, 500) : `PayPilot payment of ${feeCalculation.formattedBase} ${normalizedCur}`,
    status: PAYMENT_STATUS.INITIATED,
    provider: "paypal",
    payment_method: "PayPal Sandbox",
    created_at: now,
    updated_at: now,
  };

  const { data: insertedPayment, error: insertError } = await supabaseClient
    .from("payments")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError || !insertedPayment) {
    return {
      success: false,
      error: "Failed to persist transaction record. Please try again.",
      code: "DB_PERSISTENCE_FAILED",
      statusCode: 500,
    };
  }

  // 8. Record Audit Trail Event
  await supabaseClient.from("payment_audit_logs").insert({
    payment_id: insertedPayment.id,
    user_id: userId,
    event_type: "TRANSACTION_INITIATED",
    details: {
      internalReference: internalRef,
      amount: feeCalculation.baseAmount,
      fee: feeCalculation.fee,
      totalAmount: feeCalculation.totalAmount,
      currency: normalizedCur,
      paypalTargetCurrency: configuredPayPalCurrency,
      conversion: conversion.requiresConversion ? conversion : null,
      category,
      recipient: recipientEmail || recipientName,
    },
    ip_address: clientIp,
    created_at: now,
  });

  return {
    success: true,
    statusCode: 201,
    transaction: {
      id: insertedPayment.id,
      internalReference: internalRef,
      amount: feeCalculation.baseAmount,
      fee: feeCalculation.fee,
      totalAmount: feeCalculation.totalAmount,
      currency: normalizedCur,
      formattedBase: feeCalculation.formattedBase,
      formattedFee: feeCalculation.formattedFee,
      formattedTotal: feeCalculation.formattedTotal,
      category: insertedPayment.category,
      recipientEmail: insertedPayment.recipient_email,
      recipientName: insertedPayment.recipient_name,
      description: insertedPayment.description,
      status: PAYMENT_STATUS.INITIATED,
      createdAt: insertedPayment.created_at,
      payPalTargetCurrency: configuredPayPalCurrency,
      conversion: conversion.requiresConversion ? conversion : null,
    },
  };
}
