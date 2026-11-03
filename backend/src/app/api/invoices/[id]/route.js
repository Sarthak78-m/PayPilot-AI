import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/invoices/validation";

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

    // params is a Promise in Next.js 16.
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
