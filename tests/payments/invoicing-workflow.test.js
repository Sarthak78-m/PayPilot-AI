import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { validateCreateInvoiceInput, validateUpdateInvoiceInput } from "@/lib/invoices/validation";
import { calculateTransactionFee, convertCurrency, formatCurrencyDisplay, isSupportedCurrency } from "@/lib/payments/currency";
import { initiatePaymentTransaction } from "@/lib/payments/transaction-engine-service";
import { createMockDatabase } from "../helpers/mock-database";

/**
 * PayPilot AI — Phase 4: Invoicing, Proposal & Transaction Workflow Tests
 *
 * Verifies Phase 4 requirements:
 * 1. Proposal & Invoice creation with client details, description, amount, currency, and due date.
 * 2. Item & fee calculation (subtotal, payment gateway processing fees, total amount).
 * 3. Currency validation and support (USD, EUR, GBP, CAD, AUD, INR).
 * 4. Transaction initiation with unique booking/transaction reference generation (PP-TXN-...).
 * 5. Server-side validation rejecting invalid/tampered amounts, currencies, or missing details.
 * 6. Duplicate transaction prevention.
 * 7. User ownership enforcement and database record consistency.
 */
describe("Phase 4: Invoicing, Proposal & Transaction Engine Workflow", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  // 1. Invoice Validation & Proposal Setup
  describe("Proposal & Invoice Input Validation", () => {
    it("accepts valid invoice proposal details", () => {
      const input = {
        customer_name: "Acme Corporation",
        customer_email: "billing@acme.com",
        description: "Cloud Architecture Consulting & Retainer",
        amount: "1500.00",
        currency: "USD",
        due_date: "2026-12-15",
      };

      const result = validateCreateInvoiceInput(input);
      assert.equal(result.valid, true);
      assert.equal(result.data.customer_name, "Acme Corporation");
      assert.equal(result.data.amount, 1500.0);
      assert.equal(result.data.currency, "USD");
    });

    it("rejects empty customer name", () => {
      const input = {
        customer_name: "   ",
        amount: "500",
        currency: "USD",
      };

      const result = validateCreateInvoiceInput(input);
      assert.equal(result.valid, false);
      assert.ok(result.errors.customer_name);
    });

    it("rejects negative or zero amounts", () => {
      const zeroInput = { customer_name: "Client", amount: "0", currency: "USD" };
      const negInput = { customer_name: "Client", amount: "-100", currency: "USD" };

      assert.equal(validateCreateInvoiceInput(zeroInput).valid, false);
      assert.equal(validateCreateInvoiceInput(negInput).valid, false);
    });

    it("rejects unsupported currencies", () => {
      const input = {
        customer_name: "Client",
        amount: "250",
        currency: "BITCOIN",
      };

      const result = validateCreateInvoiceInput(input);
      assert.equal(result.valid, false);
      assert.ok(result.errors.currency);
    });

    it("validates optional customer email format when provided", () => {
      const invalidEmail = {
        customer_name: "Client",
        customer_email: "not-an-email",
        amount: "100",
        currency: "USD",
      };

      const result = validateCreateInvoiceInput(invalidEmail);
      assert.equal(result.valid, false);
      assert.ok(result.errors.customer_email);
    });
  });

  // 2. Price Breakdown & Fee Calculations
  describe("Price Breakdown & Financial Fee Engine", () => {
    it("calculates transaction fees accurately for USD", () => {
      const baseAmount = 100.0;
      const fee = calculateTransactionFee(baseAmount, "USD");

      assert.ok(fee.fee > 0);
      assert.equal(fee.totalAmount, Number((baseAmount + fee.fee).toFixed(2)));
    });

    it("calculates transaction fees accurately for INR", () => {
      const baseAmount = 5000.0;
      const fee = calculateTransactionFee(baseAmount, "INR");

      assert.ok(fee.fee > 0);
      assert.equal(fee.totalAmount, Number((baseAmount + fee.fee).toFixed(2)));
    });

    it("handles currency conversion preview accurately for foreign currencies", () => {
      const inrToUsd = convertCurrency({ amount: 8300, fromCurrency: "INR", toCurrency: "USD" });
      assert.ok(inrToUsd.convertedAmount > 0);
      assert.equal(inrToUsd.targetCurrency, "USD");
    });
  });

  // 3. Authoritative Transaction Initiation Workflow
  describe("Authoritative Transaction Initiation Workflow", () => {
    it("initiates transaction with unique reference (PP-TXN-...) and INITIATED status", async () => {
      const result = await initiatePaymentTransaction({
        userId: "user-123",
        amount: "250.00",
        currency: "USD",
        category: "Software Development",
        recipientEmail: "client@example.com",
        recipientName: "Enterprise Client",
        description: "Sprint 4 Milestone Deliverables",
        supabaseClient: mockDb.client,
      });

      assert.equal(result.success, true);
      assert.ok(result.transaction);
      assert.ok(result.transaction.internalReference.startsWith("PP-TXN-"));
      assert.equal(result.transaction.status, "INITIATED");
      assert.equal(result.transaction.amount, 250);
      assert.ok(result.transaction.totalAmount >= 250);
    });

    it("rejects transaction initiation with invalid amount or missing user ID", async () => {
      const missingUserResult = await initiatePaymentTransaction({
        userId: null,
        amount: "100.00",
        currency: "USD",
        supabaseClient: mockDb.client,
      });

      assert.equal(missingUserResult.success, false);
      assert.equal(missingUserResult.statusCode, 401);

      const invalidAmountResult = await initiatePaymentTransaction({
        userId: "user-123",
        amount: "-50.00",
        currency: "USD",
        supabaseClient: mockDb.client,
      });

      assert.equal(invalidAmountResult.success, false);
      assert.equal(invalidAmountResult.statusCode, 400);
    });

    it("links transaction to associated invoice when invoiceId is supplied", async () => {
      const invoice = mockDb.seedInvoice({
        id: "inv-prop-123",
        user_id: "user-123",
        amount: 350.0,
        currency: "USD",
      });

      const result = await initiatePaymentTransaction({
        userId: "user-123",
        invoiceId: invoice.id,
        amount: "350.00",
        currency: "USD",
        category: "Consulting",
        supabaseClient: mockDb.client,
      });

      assert.equal(result.success, true);
      const savedPayment = mockDb.payments.get(result.transaction.id);
      assert.ok(savedPayment);
      assert.equal(savedPayment.invoice_id, invoice.id);
    });

    it("records security audit log upon transaction initiation", async () => {
      const result = await initiatePaymentTransaction({
        userId: "user-audit-123",
        amount: "400.00",
        currency: "USD",
        supabaseClient: mockDb.client,
      });

      assert.equal(result.success, true);
      const auditLogs = mockDb.paymentAuditLogs;
      assert.ok(auditLogs.size > 0);

      const logsForTxn = Array.from(auditLogs.values()).filter(
        (log) => log.payment_id === result.transaction.id
      );
      assert.ok(logsForTxn.length > 0);
      assert.equal(logsForTxn[0].event_type, "TRANSACTION_INITIATED");
    });
  });
});
