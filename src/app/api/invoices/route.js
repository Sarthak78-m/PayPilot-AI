import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAuthClient } from "@/lib/supabase/server";
import { validateCreateInvoiceInput } from "@/lib/invoices/validation";

// ──────────────────────────────────────────────
// POST /api/invoices — Create a new invoice
// ──────────────────────────────────────────────

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 },
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

    // Reject client-controlled status — new invoices are always DRAFT.
    if (input?.status !== undefined) {
      return Response.json(
        { status: "error", message: "Cannot set invoice status during creation." },
        { status: 400 },
      );
    }

    // Reject client-controlled ownership fields.
    if (input?.user_id !== undefined || input?.id !== undefined) {
      return Response.json(
        { status: "error", message: "Cannot set id or user_id." },
        { status: 400 },
      );
    }

    const validation = validateCreateInvoiceInput(input);
    if (!validation.valid) {
      return Response.json(
        { status: "error", message: "Invalid invoice details.", errors: validation.errors },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseAuthClient();

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        user_id: user.id,
        customer_name: validation.data.customer_name,
        customer_email: validation.data.customer_email,
        description: validation.data.description,
        amount: validation.data.amount,
        currency: validation.data.currency,
        due_date: validation.data.due_date,
        status: "DRAFT",
      })
      .select()
      .single();

    if (error) {
      return Response.json(
        { status: "error", message: "Failed to create invoice." },
        { status: 500 },
      );
    }

    return Response.json(
      { status: "ok", data },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { status: "error", message: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

/**
 * Safely sanitizes and escapes customer search terms for PostgREST .or() filter expressions.
 * Prevents PostgREST syntax injection without silently stripping legitimate characters.
 *
 * @param {string} rawSearch - Unsanitized search input.
 * @returns {string} Sanitized string safe for PostgREST double-quoted expression.
 */
export function sanitizePostgrestSearchTerm(rawSearch) {
  if (typeof rawSearch !== "string") return "";
  const trimmed = rawSearch.trim();
  if (!trimmed) return "";

  // 1. Cap maximum search length to 100 characters to prevent query buffer overflow
  const truncated = trimmed.slice(0, 100);

  // 2. Escape backslashes first to prevent escape sequence hijacking
  // 3. Escape double quotes to ensure string cannot break out of PostgREST double-quoted literal
  // 4. Escape SQL ILIKE wildcards (% and _) to ensure exact literal matching
  return truncated
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

// ──────────────────────────────────────────────
// GET /api/invoices — List authenticated user's invoices
// ──────────────────────────────────────────────

const ALLOWED_SORT_FIELDS = new Set([
  "created_at", "updated_at", "due_date", "amount", "status", "customer_name",
]);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 },
      );
    }

    const url = request.nextUrl;

    // Parse and validate pagination.
    let page = parseInt(url.searchParams.get("page") ?? "1", 10);
    let limit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);

    if (!Number.isFinite(page) || page < 1) {
      return Response.json(
        { status: "error", message: "Page must be a positive integer." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
      return Response.json(
        { status: "error", message: `Limit must be between 1 and ${MAX_LIMIT}.` },
        { status: 400 },
      );
    }

    // Sort field.
    const sort = url.searchParams.get("sort") ?? "created_at";
    if (!ALLOWED_SORT_FIELDS.has(sort)) {
      return Response.json(
        { status: "error", message: `Sort must be one of: ${[...ALLOWED_SORT_FIELDS].join(", ")}.` },
        { status: 400 },
      );
    }

    // Sort order.
    const orderParam = (url.searchParams.get("order") ?? "desc").toLowerCase();
    if (orderParam !== "asc" && orderParam !== "desc") {
      return Response.json(
        { status: "error", message: "Order must be asc or desc." },
        { status: 400 },
      );
    }
    const ascending = orderParam === "asc";

    // Optional status filter.
    const statusFilter = url.searchParams.get("status");
    let normalisedStatus = null;
    if (statusFilter !== null && statusFilter !== "") {
      normalisedStatus = statusFilter.toUpperCase();
      const validStatuses = ["DRAFT", "PENDING", "PAID", "OVERDUE", "CANCELLED"];
      if (!validStatuses.includes(normalisedStatus)) {
        return Response.json(
          { status: "error", message: `Status filter must be one of: ${validStatuses.join(", ")}.` },
          { status: 400 },
        );
      }
    }

    // Optional search by customer name or email.
    const rawSearch = url.searchParams.get("search") ?? "";
    const search = sanitizePostgrestSearchTerm(rawSearch);

    const supabase = await createSupabaseAuthClient();

    // Build count query (for pagination metadata).
    let countQuery = supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (normalisedStatus) {
      countQuery = countQuery.eq("status", normalisedStatus);
    }
    if (search.length > 0) {
      countQuery = countQuery.or(
        `customer_name.ilike."%${search}%",customer_email.ilike."%${search}%"`,
      );
    }

    // Build data query.
    const offset = (page - 1) * limit;

    let dataQuery = supabase
      .from("invoices")
      .select("*")
      .eq("user_id", user.id)
      .order(sort, { ascending })
      .range(offset, offset + limit - 1);

    // Secondary sort for deterministic ordering.
    if (sort !== "created_at") {
      dataQuery = dataQuery.order("created_at", { ascending: false });
    }

    if (normalisedStatus) {
      dataQuery = dataQuery.eq("status", normalisedStatus);
    }
    if (search.length > 0) {
      dataQuery = dataQuery.or(
        `customer_name.ilike."%${search}%",customer_email.ilike."%${search}%"`,
      );
    }

    // Execute count and paginated query in parallel
    const [{ count, error: countError }, { data, error }] = await Promise.all([
      countQuery,
      dataQuery,
    ]);

    if (countError || error) {
      return Response.json(
        { status: "error", message: "Failed to retrieve invoices." },
        { status: 500 },
      );
    }

    return Response.json({
      status: "ok",
      data: {
        invoices: data,
        pagination: {
          page,
          limit,
          total: count ?? 0,
        },
      },
    });
  } catch {
    return Response.json(
      { status: "error", message: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
