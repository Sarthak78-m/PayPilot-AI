import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient } from "@/lib/supabase/server";
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
// DELETE /api/invoices/[id] — Delete or cancel invoice
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

    const supabase = await createSupabaseAuthClient();

    // Retrieve existing invoice to check ownership and state.
    const { data: invoice, error: fetchError } = await supabase
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

    // PAID invoices must not be deleted or cancelled through this endpoint.
    if (invoice.status === "PAID") {
      return Response.json(
        { status: "error", message: "Cannot delete or cancel a PAID invoice." },
        { status: 409 },
      );
    }

    // CANCELLED invoices should not be repeatedly modified/cancelled.
    if (invoice.status === "CANCELLED") {
      return Response.json(
        { status: "error", message: "Invoice is already cancelled." },
        { status: 409 },
      );
    }

    // DRAFT invoices: permanent deletion if no payment records exist.
    if (invoice.status === "DRAFT") {
      const { data: payments } = await supabase
        .from("payments")
        .select("id")
        .eq("invoice_id", id)
        .limit(1);

      if (payments && payments.length > 0) {
        // Cancel instead if dependent records exist.
        const { data: cancelled, error: cancelError } = await supabase
          .from("invoices")
          .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (cancelError) {
          return Response.json(
            { status: "error", message: "Failed to cancel invoice." },
            { status: 500 },
          );
        }

        return Response.json({
          status: "ok",
          message: "Invoice cancelled.",
          data: cancelled,
        });
      }

      const { error: deleteError } = await supabase
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
      });
    }

    // PENDING or OVERDUE invoices: Cancel instead of deleting to preserve audit trail.
    if (invoice.status === "PENDING" || invoice.status === "OVERDUE") {
      const { data: cancelled, error: cancelError } = await supabase
        .from("invoices")
        .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (cancelError) {
        return Response.json(
          { status: "error", message: "Failed to cancel invoice." },
          { status: 500 },
        );
      }

      return Response.json({
        status: "ok",
        message: "Invoice cancelled successfully.",
        data: cancelled,
      });
    }

    return Response.json(
      { status: "error", message: "Unsupported invoice status for deletion." },
      { status: 400 },
    );
  } catch {
    return Response.json(
      { status: "error", message: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
