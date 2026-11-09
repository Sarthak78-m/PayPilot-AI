import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient, createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isValidUUID,
  validateUpdateInvoiceInput,
  validateStatusTransition,
} from "@/lib/invoices/validation";

// ──────────────────────────────────────────────
// GET /api/invoices/[id] — Retrieve a single invoice
// ──────────────────────────────────────────────

export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 },
      );
    }

    const { id } = await params;

    if (!isValidUUID(id)) {
      return Response.json(
        { status: "error", message: "Invalid invoice ID format." },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseAuthClient();

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return Response.json(
        { status: "error", message: "Invoice not found." },
        { status: 404 },
      );
    }

    return Response.json({ status: "ok", data });
  } catch {
    return Response.json(
      { status: "error", message: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────
// PATCH /api/invoices/[id] — Update an invoice
// ──────────────────────────────────────────────

export async function PATCH(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 },
      );
    }

    const { id } = await params;

    if (!isValidUUID(id)) {
      return Response.json(
        { status: "error", message: "Invalid invoice ID format." },
        { status: 400 },
      );
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return Response.json(
        { status: "error", message: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    // Reject client-controlled immutable/ownership fields.
    if (
      input?.id !== undefined ||
      input?.user_id !== undefined ||
      input?.created_at !== undefined ||
      input?.updated_at !== undefined
    ) {
      return Response.json(
        { status: "error", message: "Cannot modify id, user_id, created_at, or updated_at." },
        { status: 400 },
      );
    }

    // Only verified payment processing may mark an invoice PAID.
    if (
      input?.status !== undefined &&
      typeof input.status === "string" &&
      input.status.toUpperCase() === "PAID"
    ) {
      return Response.json(
        { status: "error", message: "Invoices cannot be directly marked as PAID via this API." },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseAuthClient();

    // Retrieve existing invoice to check ownership and state.
    const { data: existingInvoice, error: fetchError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingInvoice) {
      return Response.json(
        { status: "error", message: "Invoice not found." },
        { status: 404 },
      );
    }

    // PAID invoices cannot be edited through ordinary invoice APIs.
    if (existingInvoice.status === "PAID") {
      return Response.json(
        { status: "error", message: "Cannot modify an invoice that is already PAID." },
        { status: 409 },
      );
    }

    // CANCELLED invoices cannot be modified.
    if (existingInvoice.status === "CANCELLED") {
      return Response.json(
        { status: "error", message: "Cannot modify a CANCELLED invoice." },
        { status: 409 },
      );
    }

    // Handle status transition if requested.
    let newStatus = null;
    if (input?.status !== undefined) {
      const transition = validateStatusTransition(existingInvoice.status, input.status);
      if (!transition.valid) {
        return Response.json(
          { status: "error", message: transition.error },
          { status: 409 },
        );
      }
      newStatus = input.status.toUpperCase();
    }

    // Validate editable fields.
    const validation = validateUpdateInvoiceInput(input);
    const hasFieldUpdates = validation.valid && Object.keys(validation.data).length > 0;

    if (!hasFieldUpdates && !newStatus) {
      return Response.json(
        {
          status: "error",
          message: "No valid fields provided for update.",
          errors: validation.errors,
        },
        { status: 400 },
      );
    }

    if (!validation.valid && Object.keys(validation.errors).some((k) => k !== "_form")) {
      return Response.json(
        { status: "error", message: "Invalid invoice details.", errors: validation.errors },
        { status: 400 },
      );
    }

    // Build update payload.
    const updatePayload = {
      ...(validation.data || {}),
      updated_at: new Date().toISOString(),
    };

    if (newStatus) {
      updatePayload.status = newStatus;
    }

    const { data: updatedInvoice, error: updateError } = await supabase
      .from("invoices")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      return Response.json(
        { status: "error", message: "Failed to update invoice." },
        { status: 500 },
      );
    }

    return Response.json({
      status: "ok",
      data: updatedInvoice,
    });
  } catch {
    return Response.json(
      { status: "error", message: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────
// DELETE /api/invoices/[id] — Delete invoice with financial data protection
// ──────────────────────────────────────────────

export async function DELETE(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 },
      );
    }

    const { id } = await params;

    if (!isValidUUID(id)) {
      return Response.json(
        { status: "error", message: "Invalid invoice ID format." },
        { status: 400 },
      );
    }

    // Use service role client if available to manage payment links and payments safely without RLS blocking;
    // fallback to authenticated user client.
    let dbClient;
    if (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        dbClient = createSupabaseServerClient();
      } catch {
        dbClient = await createSupabaseAuthClient();
      }
    } else {
      dbClient = await createSupabaseAuthClient();
    }

    // Retrieve existing invoice to check ownership and state.
    // Strictly scoped to user_id = user.id (never trusts user ID from frontend).
    const { data: invoice, error: fetchError } = await dbClient
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !invoice) {
      return Response.json(
        { status: "error", message: "Invoice not found." },
        { status: 404 },
      );
    }

    // Retrieve associated payment records to evaluate financial integrity
    const { data: payments, error: paymentsError } = await dbClient
      .from("payments")
      .select("id, status, amount, currency, paypal_order_id, paypal_capture_id")
      .eq("invoice_id", id);

    if (paymentsError) {
      return Response.json(
        { status: "error", message: "Failed to verify invoice payment history." },
        { status: 500 },
      );
    }

    const paymentRecords = payments || [];

    // Financial Protection 1: Paid or partially refunded/settled invoices must NOT be deleted
    const hasSettledPayments = paymentRecords.some((p) =>
      ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes((p.status || "").toUpperCase())
    );

    if (invoice.status === "PAID" || hasSettledPayments) {
      return Response.json(
        {
          status: "error",
          message: "Paid invoices with captured payment records cannot be deleted to preserve financial audit history.",
          code: "INVOICE_PAID_PROTECTED",
        },
        { status: 409 },
      );
    }

    // Financial Protection 2: Active in-flight PayPal payment attempts must NOT be interrupted
    const hasInFlightPayments = paymentRecords.some((p) =>
      ["ORDER_CREATED", "APPROVED", "PROCESSING", "CAPTURING", "REFUND_PENDING"].includes((p.status || "").toUpperCase())
    );

    if (hasInFlightPayments) {
      return Response.json(
        {
          status: "error",
          message: "Cannot delete an invoice with an active payment checkout in progress.",
          code: "PAYMENT_IN_PROGRESS",
        },
        { status: 409 },
      );
    }

    // Financial Protection 3: Clean up non-financial attempt records (e.g. FAILED, CANCELLED, CREATED, INITIATED, PENDING)
    if (paymentRecords.length > 0) {
      const paymentIds = paymentRecords.map((p) => p.id);

      // Clean up audit logs for these non-completed attempts
      try {
        await dbClient
          .from("payment_audit_logs")
          .delete()
          .in("payment_id", paymentIds);
      } catch {
        // Non-fatal if table not present
      }

      // Delete non-settled payment attempts so foreign key on payments.invoice_id is satisfied
      const { error: payDeleteError } = await dbClient
        .from("payments")
        .delete()
        .in("id", paymentIds);

      if (payDeleteError) {
        return Response.json(
          { status: "error", message: "Failed to clean up associated payment attempts." },
          { status: 500 },
        );
      }
    }

    // Financial Protection 4: Clean up any invoice payment links so public checkout is instantly invalidated
    try {
      await dbClient
        .from("invoice_payment_links")
        .delete()
        .eq("invoice_id", id);
    } catch {
      // Non-fatal if table not present
    }

    // Permanent Deletion: Delete the authorized invoice record
    const { error: deleteError } = await dbClient
      .from("invoices")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      return Response.json(
        { status: "error", message: "Failed to delete invoice." },
        { status: 500 },
      );
    }

    return Response.json({
      status: "ok",
      message: "Invoice deleted permanently.",
      data: { id },
    });
  } catch {
    return Response.json(
      { status: "error", message: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
