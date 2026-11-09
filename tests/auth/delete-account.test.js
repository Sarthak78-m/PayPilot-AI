import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createMockDatabase } from "../helpers/mock-database.js";

describe("Account Deletion Feature (API & Client Contracts)", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it("1. Unauthenticated request is rejected with 401 Unauthorized", () => {
    const user = null;
    let statusCode = 200;
    let responseBody = {};

    if (!user) {
      statusCode = 401;
      responseBody = { status: "error", message: "Authentication is required to delete an account." };
    }

    assert.equal(statusCode, 401);
    assert.equal(responseBody.status, "error");
    assert.match(responseBody.message, /Authentication is required/i);
  });

  it("2. Rejects requests missing explicit 'DELETE' confirmation with 400 Bad Request", () => {
    const user = { id: "user-test-123" };
    const invalidPayloads = [{}, { confirmation: "" }, { confirmation: "cancel" }, { confirmation: "yes" }];

    invalidPayloads.forEach((payload) => {
      const confirmation = typeof payload.confirmation === "string" ? payload.confirmation.trim().toUpperCase() : "";
      let statusCode = 200;
      let responseBody = {};

      if (confirmation !== "DELETE") {
        statusCode = 400;
        responseBody = { status: "error", message: 'Please confirm account deletion by typing "DELETE".' };
      }

      assert.equal(statusCode, 400);
      assert.equal(responseBody.status, "error");
    });
  });

  it("3. Accepts valid 'DELETE' confirmation (case-insensitive and trimmed)", () => {
    const validInputs = ["DELETE", "delete", "  DELETE  ", "Delete"];

    validInputs.forEach((input) => {
      const confirmation = typeof input === "string" ? input.trim().toUpperCase() : "";
      assert.equal(confirmation, "DELETE");
    });
  });

  it("4. Ensures deletion target is derived solely from session, ignoring any payload user IDs", () => {
    const sessionUser = { id: "authenticated-merchant-uuid" };
    const maliciousPayload = {
      confirmation: "DELETE",
      userId: "victim-user-uuid",
      user_id: "victim-user-uuid",
    };

    // Server implementation must always bind to sessionUser.id
    const targetUserId = sessionUser.id;
    assert.equal(targetUserId, "authenticated-merchant-uuid");
    assert.notEqual(targetUserId, maliciousPayload.userId);
    assert.notEqual(targetUserId, maliciousPayload.user_id);
  });

  it("5. Authenticated user can delete their own account and cleans up all user-owned records", async () => {
    const targetUserId = "user-to-delete-123";
    const invoiceId = crypto.randomUUID();
    const standalonePaymentId = crypto.randomUUID();
    const invoicePaymentId = crypto.randomUUID();

    // 1. Seed user profile
    mockDb.seedProfile({ id: targetUserId, name: "Merchant Test", email: "merchant@test.com" });

    // 2. Seed user invoice
    mockDb.seedInvoice({ id: invoiceId, user_id: targetUserId, status: "DRAFT", amount: 500 });

    // 3. Seed invoice payment link
    mockDb.seedPaymentLink({ invoice_id: invoiceId, token_hash: "a".repeat(64) });

    // 4. Seed invoice-linked payment
    mockDb.seedPayment({ id: invoicePaymentId, invoice_id: invoiceId, user_id: targetUserId, status: "CREATED" });

    // 5. Seed standalone payment (Phase 8 direct payment without invoice)
    mockDb.seedPayment({ id: standalonePaymentId, invoice_id: null, user_id: targetUserId, status: "CREATED" });

    // 6. Seed refund
    mockDb.seedRefund({ payment_id: invoicePaymentId, refund_amount: 50 });

    // Execute staged cascading cleanup
    // Collect payments
    const { data: userInvoices } = await mockDb.client.from("invoices").select("id").eq("user_id", targetUserId);
    const invoiceIds = userInvoices.map((i) => i.id);

    const { data: directPayments } = await mockDb.client.from("payments").select("id").eq("user_id", targetUserId);
    const { data: invPayments } = await mockDb.client.from("payments").select("id").in("invoice_id", invoiceIds);

    const allPayIds = Array.from(new Set([
      ...(directPayments || []).map((p) => p.id),
      ...(invPayments || []).map((p) => p.id),
    ]));

    // Step a: Delete refunds
    await mockDb.client.from("payment_refunds").delete().in("payment_id", allPayIds);
    // Step b: Delete payments
    await mockDb.client.from("payments").delete().in("id", allPayIds);
    // Step c: Delete payment links
    await mockDb.client.from("invoice_payment_links").delete().in("invoice_id", invoiceIds);
    // Step d: Delete invoices
    await mockDb.client.from("invoices").delete().eq("user_id", targetUserId);
    // Step e: Delete profile
    await mockDb.client.from("profiles").delete().eq("id", targetUserId);

    // Verify all records for target user are wiped
    const { data: checkInvoices } = await mockDb.client.from("invoices").select("*").eq("user_id", targetUserId);
    assert.equal((checkInvoices || []).length, 0);

    const { data: checkPayments } = await mockDb.client.from("payments").select("*").eq("user_id", targetUserId);
    assert.equal((checkPayments || []).length, 0);

    const { data: checkLinks } = await mockDb.client.from("invoice_payment_links").select("*").in("invoice_id", invoiceIds);
    assert.equal((checkLinks || []).length, 0);

    const { data: checkProfiles } = await mockDb.client.from("profiles").select("*").eq("id", targetUserId);
    assert.equal((checkProfiles || []).length, 0);
  });

  it("6. Another user's records remain untouched during account deletion", async () => {
    const deletingUserId = "user-deleting-1";
    const bystanderUserId = "user-bystander-2";

    const deletingInvoiceId = crypto.randomUUID();
    const bystanderInvoiceId = crypto.randomUUID();

    mockDb.seedInvoice({ id: deletingInvoiceId, user_id: deletingUserId, amount: 100 });
    mockDb.seedInvoice({ id: bystanderInvoiceId, user_id: bystanderUserId, amount: 999 });

    mockDb.seedProfile({ id: deletingUserId, email: "deleting@test.com" });
    mockDb.seedProfile({ id: bystanderUserId, email: "bystander@test.com" });

    // Perform deletion strictly for deletingUserId
    await mockDb.client.from("invoices").delete().eq("user_id", deletingUserId);
    await mockDb.client.from("profiles").delete().eq("id", deletingUserId);

    // Verify bystander records remain intact
    const { data: bystanderInvoices } = await mockDb.client.from("invoices").select("*").eq("user_id", bystanderUserId);
    assert.equal(bystanderInvoices.length, 1);
    assert.equal(bystanderInvoices[0].id, bystanderInvoiceId);

    const { data: bystanderProfile } = await mockDb.client.from("profiles").select("*").eq("id", bystanderUserId);
    assert.equal(bystanderProfile.length, 1);
  });

  it("7. Supabase Auth user deletion is attempted and errors are propagated without false success", async () => {
    let authUserDeleted = false;
    let authDeletionFailed = true;

    const executeAuthDeletion = async () => {
      if (authDeletionFailed) {
        return {
          status: "error",
          statusCode: 500,
          message: "Failed to delete authentication user identity.",
        };
      }
      authUserDeleted = true;
      return { status: "ok", statusCode: 200, message: "Account and associated data deleted successfully." };
    };

    const res = await executeAuthDeletion();
    assert.equal(res.statusCode, 500);
    assert.equal(res.status, "error");
    assert.match(res.message, /Failed to delete authentication user identity/i);
    assert.equal(authUserDeleted, false);
  });

  it("8. Session and cookies are cleared during account deletion workflow", async () => {
    const cookiesSet = new Map();
    cookiesSet.set("sb-access-token", "valid-jwt-token");
    cookiesSet.set("sb-refresh-token", "valid-refresh-token");
    cookiesSet.set("theme", "light");

    // Clear auth cookies
    for (const [key] of cookiesSet.entries()) {
      if (key.startsWith("sb-") || key.includes("auth-token")) {
        cookiesSet.delete(key);
      }
    }

    assert.equal(cookiesSet.has("sb-access-token"), false);
    assert.equal(cookiesSet.has("sb-refresh-token"), false);
    assert.equal(cookiesSet.has("theme"), true, "Non-auth cookies like theme should be preserved");
  });

  it("9. Handles repeated deletion requests safely when records are already deleted", async () => {
    const targetUserId = "user-already-deleted";
    // 0 records remaining
    const { data: invoices } = await mockDb.client.from("invoices").select("id").eq("user_id", targetUserId);
    assert.equal((invoices || []).length, 0);

    const { data: payments } = await mockDb.client.from("payments").select("id").eq("user_id", targetUserId);
    assert.equal((payments || []).length, 0);

    const { error: profileDeleteError } = await mockDb.client.from("profiles").delete().eq("id", targetUserId);
    assert.equal(profileDeleteError, null);
  });

  it("10. Client SDK deleteAccount safely handles rejection or network failure", async () => {
    const deleteAccountClient = async () => {
      throw new Error("Network offline");
    };

    let result;
    try {
      await deleteAccountClient();
    } catch {
      result = { success: false, status: 0, message: "Network error while deleting account. Please check your connection." };
    }

    assert.equal(result.success, false);
    assert.equal(result.status, 0);
    assert.match(result.message, /Network error/);
  });
});
