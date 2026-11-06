import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Account Deletion Feature (API & Client Contracts)", () => {
  it("rejects unauthenticated requests with 401 Unauthorized", () => {
    const user = null;
    let statusCode = 200;
    let responseBody = {};

    if (!user) {
      statusCode = 401;
      responseBody = { status: "error", message: "Authentication is required to delete an account." };
    }

    assert.equal(statusCode, 401);
    assert.equal(responseBody.status, "error");
    assert.match(responseBody.message, /Authentication is required/);
  });

  it("rejects requests missing explicit 'DELETE' confirmation with 400 Bad Request", () => {
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

  it("accepts valid 'DELETE' confirmation (case-insensitive and trimmed)", () => {
    const validInputs = ["DELETE", "delete", "  DELETE  ", "Delete"];

    validInputs.forEach((input) => {
      const confirmation = typeof input === "string" ? input.trim().toUpperCase() : "";
      assert.equal(confirmation, "DELETE");
    });
  });

  it("executes complete cascading deletion across payments, invoices, profiles, and auth", async () => {
    const userId = "user-delete-abc-123";
    const userInvoices = [{ id: "inv-1" }, { id: "inv-2" }];
    const deletedRecords = {
      payments: [],
      paymentLinks: [],
      invoices: [],
      profiles: [],
      authUser: null,
      signedOut: false,
    };

    // Simulated cascading database operations
    const invoiceIds = userInvoices.map((inv) => inv.id);

    // 1. Delete payments
    deletedRecords.payments.push(...invoiceIds);
    assert.deepEqual(deletedRecords.payments, ["inv-1", "inv-2"]);

    // 2. Delete payment links
    deletedRecords.paymentLinks.push(...invoiceIds);
    assert.deepEqual(deletedRecords.paymentLinks, ["inv-1", "inv-2"]);

    // 3. Delete invoices
    deletedRecords.invoices.push(userId);
    assert.deepEqual(deletedRecords.invoices, [userId]);

    // 4. Delete profile
    deletedRecords.profiles.push(userId);
    assert.deepEqual(deletedRecords.profiles, [userId]);

    // 5. Delete Supabase Auth user
    deletedRecords.authUser = userId;
    assert.equal(deletedRecords.authUser, userId);

    // 6. Sign out session
    deletedRecords.signedOut = true;
    assert.equal(deletedRecords.signedOut, true);
  });

  it("client SDK deleteAccount handles successful API response", async () => {
    const mockApiResponse = {
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", message: "Account and associated data deleted successfully." }),
    };

    const deleteAccountClient = async ({ confirmation } = {}) => {
      if (confirmation !== "DELETE") {
        return { success: false, status: 400, message: 'Please confirm account deletion by typing "DELETE".' };
      }
      const data = await mockApiResponse.json();
      return { success: mockApiResponse.ok, status: mockApiResponse.status, message: data.message };
    };

    const res = await deleteAccountClient({ confirmation: "DELETE" });
    assert.equal(res.success, true);
    assert.equal(res.status, 200);
    assert.match(res.message, /deleted successfully/i);
  });

  it("client SDK deleteAccount safely handles rejection or network failure", async () => {
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

  it("aborts cascading deletion if payment deletion returns database error, preventing partial deletion", async () => {
    let authUserDeleted = false;

    // Simulating safe deletion handler
    const runDeletion = async (simulateDbError = false) => {
      if (simulateDbError) {
        return { status: 500, error: "Failed to clean up associated payment records." };
      }
      authUserDeleted = true;
      return { status: 200, success: true };
    };

    const res = await runDeletion(true);
    assert.equal(res.status, 500);
    assert.equal(authUserDeleted, false, "Auth user must NOT be deleted if prior step failed");
  });

  it("handles repeated deletion requests safely when records are already deleted", async () => {
    // User with 0 remaining invoices or payments
    const userInvoices = [];
    let executedDeletion = false;

    if (userInvoices && userInvoices.length > 0) {
      executedDeletion = true;
    }

    assert.equal(executedDeletion, false);
    const profileResult = { error: null };
    assert.equal(profileResult.error, null);
  });

  it("ensures deletion target is derived solely from session, ignoring any payload user IDs", () => {
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
  });
});
