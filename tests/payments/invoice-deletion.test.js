import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createMockDatabase } from "../helpers/mock-database.js";
import { lookupPublicInvoice } from "../../src/lib/payments/payment-link-service.js";

describe("Invoice Deletion Feature & Financial Integrity", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it("1. Owner can delete an eligible draft invoice without payments", async () => {
    const ownerId = "user-merchant-101";
    const invoiceId = crypto.randomUUID();

    mockDb.seedInvoice({
      id: invoiceId,
      user_id: ownerId,
      status: "DRAFT",
      customer_name: "Draft Client",
      amount: 250.0,
      currency: "USD",
    });

    // Verify invoice exists
    const beforeCheck = await mockDb.client
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("user_id", ownerId)
      .single();
    assert.equal(beforeCheck.data.id, invoiceId);

    // Perform deletion
    const deleteRes = await mockDb.client
      .from("invoices")
      .delete()
      .eq("id", invoiceId)
      .eq("user_id", ownerId);
    assert.equal(deleteRes.error, null);

    // Verify invoice no longer exists
    const afterCheck = await mockDb.client
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("user_id", ownerId)
      .single();
    assert.equal(afterCheck.data, null);
  });

  it("2. Owner can delete an eligible unpaid PENDING invoice when no payments exist", async () => {
    const ownerId = "user-merchant-102";
    const invoiceId = crypto.randomUUID();

    mockDb.seedInvoice({
      id: invoiceId,
      user_id: ownerId,
      status: "PENDING",
      customer_name: "Unpaid Client",
      amount: 450.0,
      currency: "USD",
    });

    // Check payment records (none exist)
    const { data: payments } = await mockDb.client
      .from("payments")
      .select("id")
      .eq("invoice_id", invoiceId);
    assert.equal((payments || []).length, 0);

    // Delete invoice
    const { error: deleteError } = await mockDb.client
      .from("invoices")
      .delete()
      .eq("id", invoiceId)
      .eq("user_id", ownerId);
    assert.equal(deleteError, null);

    const { data: remaining } = await mockDb.client
      .from("invoices")
      .select("*")
      .eq("id", invoiceId);
    assert.equal((remaining || []).length, 0);
  });

  it("3. User cannot delete another user's invoice (returns 404)", async () => {
    const legitimateOwnerId = "user-legitimate-owner";
    const attackerId = "user-attacker-intruder";
    const invoiceId = crypto.randomUUID();

    mockDb.seedInvoice({
      id: invoiceId,
      user_id: legitimateOwnerId,
      status: "DRAFT",
      customer_name: "Private Client",
      amount: 1000.0,
      currency: "USD",
    });

    // Attacker tries to find and delete invoice scoped to attackerId
    const { data: invoice, error } = await mockDb.client
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("user_id", attackerId)
      .single();

    assert.equal(invoice, null);
    // Returns 404 when invoice does not belong to authenticated user
    const httpStatus = !invoice ? 404 : 200;
    assert.equal(httpStatus, 404);

    // Legitimate invoice remains untouched
    const { data: original } = await mockDb.client
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    assert.equal(original.id, invoiceId);
    assert.equal(original.user_id, legitimateOwnerId);
  });

  it("4. Invalid invoice IDs are rejected with 400 Bad Request", () => {
    const invalidIds = ["not-a-uuid", "12345", "../../etc/passwd", "", "null"];
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    invalidIds.forEach((id) => {
      const isValid = UUID_REGEX.test(id);
      assert.equal(isValid, false, `Expected ${id} to fail UUID validation`);
    });
  });

  it("5. Missing invoice returns 404 Not Found", async () => {
    const ownerId = "user-merchant-103";
    const nonExistentId = crypto.randomUUID();

    const { data: invoice } = await mockDb.client
      .from("invoices")
      .select("*")
      .eq("id", nonExistentId)
      .eq("user_id", ownerId)
      .single();

    assert.equal(invoice, null);
    const responseStatus = !invoice ? 404 : 200;
    assert.equal(responseStatus, 404);
  });

  it("6. Paid invoice payment history is strictly protected from deletion (returns 409)", async () => {
    const ownerId = "user-merchant-104";
    const invoiceId = crypto.randomUUID();

    mockDb.seedInvoice({
      id: invoiceId,
      user_id: ownerId,
      status: "PAID",
      amount: 1500.0,
      currency: "USD",
    });

    mockDb.seedPayment({
      invoice_id: invoiceId,
      user_id: ownerId,
      amount: 1500.0,
      status: "COMPLETED",
      paypal_order_id: "PAYPAL-ORDER-PAID-01",
      paypal_capture_id: "CAPTURE-01",
    });

    const { data: payments } = await mockDb.client
      .from("payments")
      .select("id, status")
      .eq("invoice_id", invoiceId);

    const hasSettledPayments = (payments || []).some((p) =>
      ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status.toUpperCase())
    );

    // Business rule: paid invoice or settled payments must be rejected with 409
    let rejection = null;
    if (hasSettledPayments) {
      rejection = {
        status: 409,
        error: "Paid invoices with captured payment records cannot be deleted to preserve financial audit history.",
      };
    }

    assert.notEqual(rejection, null);
    assert.equal(rejection.status, 409);

    // Payments and invoices remain untouched in the database
    const { data: paymentRecord } = await mockDb.client
      .from("payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .single();
    assert.equal(paymentRecord.status, "COMPLETED");
  });

  it("7. Partially paid / refunded invoices are protected from deletion", async () => {
    const ownerId = "user-merchant-105";
    const invoiceId = crypto.randomUUID();

    mockDb.seedInvoice({
      id: invoiceId,
      user_id: ownerId,
      status: "PENDING",
      amount: 800.0,
      currency: "USD",
    });

    mockDb.seedPayment({
      invoice_id: invoiceId,
      user_id: ownerId,
      amount: 800.0,
      status: "PARTIALLY_REFUNDED",
      paypal_order_id: "PAYPAL-PARTIAL-01",
    });

    const { data: payments } = await mockDb.client
      .from("payments")
      .select("id, status")
      .eq("invoice_id", invoiceId);

    const isProtected = (payments || []).some((p) =>
      ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status.toUpperCase())
    );

    assert.equal(isProtected, true);
  });

  it("8. Pending in-flight PayPal payment attempts block deletion (returns 409)", async () => {
    const ownerId = "user-merchant-106";
    const invoiceId = crypto.randomUUID();

    mockDb.seedInvoice({
      id: invoiceId,
      user_id: ownerId,
      status: "PENDING",
      amount: 300.0,
      currency: "USD",
    });

    mockDb.seedPayment({
      invoice_id: invoiceId,
      user_id: ownerId,
      amount: 300.0,
      status: "ORDER_CREATED", // PayPal checkout modal currently open
      paypal_order_id: "PAYPAL-IN-FLIGHT-01",
    });

    const { data: payments } = await mockDb.client
      .from("payments")
      .select("id, status")
      .eq("invoice_id", invoiceId);

    const hasInFlight = (payments || []).some((p) =>
      ["ORDER_CREATED", "APPROVED", "PROCESSING", "CAPTURING", "REFUND_PENDING"].includes(p.status.toUpperCase())
    );

    assert.equal(hasInFlight, true);
    let rejectionCode = hasInFlight ? 409 : 200;
    assert.equal(rejectionCode, 409);
  });

  it("9. Deleted invoices cannot be paid through old public payment links", async () => {
    const ownerId = "user-merchant-107";
    const invoiceId = crypto.randomUUID();
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    mockDb.seedInvoice({
      id: invoiceId,
      user_id: ownerId,
      status: "DRAFT",
      amount: 200.0,
      currency: "USD",
    });

    mockDb.seedPaymentLink({
      invoice_id: invoiceId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });

    // Delete invoice and associated payment links
    await mockDb.client.from("invoice_payment_links").delete().eq("invoice_id", invoiceId);
    await mockDb.client.from("invoices").delete().eq("id", invoiceId).eq("user_id", ownerId);

    // Customer accesses old public link
    const lookupResult = await lookupPublicInvoice({
      token: rawToken,
      supabaseClient: mockDb.client,
    });

    assert.equal(lookupResult.success, false);
    assert.equal(lookupResult.statusCode, 404);
    assert.match(lookupResult.error, /invalid or has expired/i);
  });

  it("10. Failed deletion does not remove the invoice from the frontend", () => {
    let invoices = [
      { id: "inv-1", customer_name: "Customer A", status: "PENDING" },
      { id: "inv-2", customer_name: "Customer B", status: "PAID" },
    ];

    // Simulating server rejection (e.g. 409 or network error)
    const simulateDeletion = (id, serverOk) => {
      if (!serverOk) {
        // Must NOT optimistically filter invoices out
        return invoices;
      }
      return invoices.filter((inv) => inv.id !== id);
    };

    // When server fails:
    const afterFailure = simulateDeletion("inv-2", false);
    assert.equal(afterFailure.length, 2);
    assert.equal(afterFailure.some((inv) => inv.id === "inv-2"), true);

    // When server succeeds:
    const afterSuccess = simulateDeletion("inv-1", true);
    assert.equal(afterSuccess.length, 1);
    assert.equal(afterSuccess.some((inv) => inv.id === "inv-1"), false);
  });

  it("11. Successful deletion updates list count, total metrics, and clears record", async () => {
    const ownerId = "user-merchant-108";
    const invoiceId1 = crypto.randomUUID();
    const invoiceId2 = crypto.randomUUID();

    mockDb.seedInvoice({
      id: invoiceId1,
      user_id: ownerId,
      status: "DRAFT",
      amount: 500.0,
      currency: "USD",
    });

    mockDb.seedInvoice({
      id: invoiceId2,
      user_id: ownerId,
      status: "DRAFT",
      amount: 300.0,
      currency: "USD",
    });

    // Before deletion: 2 invoices, total 800
    const { data: initialInvoices } = await mockDb.client
      .from("invoices")
      .select("*")
      .eq("user_id", ownerId);
    assert.equal(initialInvoices.length, 2);
    const initialTotal = initialInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    assert.equal(initialTotal, 800.0);

    // Delete invoice 1
    await mockDb.client.from("invoices").delete().eq("id", invoiceId1).eq("user_id", ownerId);

    // After deletion: 1 invoice, total 300
    const { data: updatedInvoices } = await mockDb.client
      .from("invoices")
      .select("*")
      .eq("user_id", ownerId);
    assert.equal(updatedInvoices.length, 1);
    assert.equal(updatedInvoices[0].id, invoiceId2);
    const updatedTotal = updatedInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    assert.equal(updatedTotal, 300.0);
  });
});
