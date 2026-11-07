import crypto from "node:crypto";

/**
 * Creates an in-memory mock database that faithfully reproduces the Supabase client
 * query interface and PostgreSQL Phase 7B and Phase 8 migrations for isolated testing.
 */
export function createMockDatabase() {
  const invoices = new Map();
  const invoicePaymentLinks = new Map();
  const payments = new Map();
  const rateLimits = new Map();
  const paymentRefunds = new Map();
  const paypalWebhookEvents = new Map();
  const paymentAuditLogs = new Map();
  const profiles = new Map();

  function reset() {
    invoices.clear();
    invoicePaymentLinks.clear();
    payments.clear();
    rateLimits.clear();
    paymentRefunds.clear();
    paypalWebhookEvents.clear();
    paymentAuditLogs.clear();
    profiles.clear();
  }

  // Pre-seed sample invoice
  function seedInvoice(invoice) {
    invoices.set(invoice.id, {
      user_id: "user-merchant-123",
      customer_name: "Acme Corp",
      customer_email: "billing@acmecorp.com",
      description: "Consulting Services",
      amount: 500.0,
      currency: "USD",
      due_date: "2026-12-01",
      status: "PENDING",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...invoice,
    });
    return invoices.get(invoice.id);
  }

  // Pre-seed payment link
  function seedPaymentLink(link) {
    const id = link.id || crypto.randomUUID();
    invoicePaymentLinks.set(id, {
      id,
      invoice_id: link.invoice_id,
      token_hash: link.token_hash,
      expires_at: link.expires_at || new Date(Date.now() + 7 * 86400000).toISOString(),
      revoked_at: link.revoked_at || null,
      created_at: link.created_at || new Date().toISOString(),
      last_accessed_at: null,
      ...link,
    });
    return invoicePaymentLinks.get(id);
  }

  // Pre-seed payment
  function seedPayment(payment) {
    const id = payment.id || crypto.randomUUID();
    payments.set(id, {
      id,
      invoice_id: payment.invoice_id || null,
      user_id: payment.user_id || "user-merchant-123",
      internal_transaction_id: payment.internal_transaction_id || `PP-TXN-${Date.now()}-${id.slice(0, 4)}`,
      amount: payment.amount || 500.0,
      transaction_fee: payment.transaction_fee || 0.0,
      total_amount: payment.total_amount || payment.amount || 500.0,
      currency: payment.currency || "USD",
      status: payment.status || "CREATED",
      provider: payment.provider || "paypal",
      payment_method: payment.payment_method || "PayPal Sandbox",
      payer_email: payment.payer_email || null,
      payer_name: payment.payer_name || null,
      recipient_email: payment.recipient_email || null,
      recipient_name: payment.recipient_name || null,
      category: payment.category || "Payment",
      description: payment.description || null,
      paypal_order_id: payment.paypal_order_id || null,
      paypal_capture_id: payment.paypal_capture_id || null,
      create_request_id: payment.create_request_id || crypto.randomUUID(),
      capture_request_id: payment.capture_request_id || null,
      captured_at: payment.captured_at || null,
      created_at: payment.created_at || new Date().toISOString(),
      updated_at: payment.updated_at || new Date().toISOString(),
      ...payment,
    });
    return payments.get(id);
  }

  function seedRefund(refund) {
    const id = refund.id || crypto.randomUUID();
    paymentRefunds.set(id, {
      id,
      payment_id: refund.payment_id,
      paypal_refund_id: refund.paypal_refund_id || `9${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
      refund_amount: refund.refund_amount || 100.0,
      currency: refund.currency || "USD",
      refund_reason: refund.refund_reason || null,
      refund_status: refund.refund_status || "COMPLETED",
      initiated_by: refund.initiated_by || null,
      created_at: refund.created_at || new Date().toISOString(),
      updated_at: refund.updated_at || new Date().toISOString(),
      ...refund,
    });
    return paymentRefunds.get(id);
  }

  function seedProfile(profile) {
    profiles.set(profile.id, {
      id: profile.id,
      name: profile.name || "Test User",
      email: profile.email || "user@example.com",
      role: profile.role || "user",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...profile,
    });
    return profiles.get(profile.id);
  }

  const client = {
    from(table) {
      let conditions = [];
      let orConditions = null;
      let updatePayload = null;
      let insertPayload = null;
      let isSingle = false;
      let isMaybeSingle = false;
      let limitCount = null;

      function getStore() {
        if (table === "invoices") return invoices;
        if (table === "invoice_payment_links") return invoicePaymentLinks;
        if (table === "payments") return payments;
        if (table === "rate_limits") return rateLimits;
        if (table === "payment_refunds") return paymentRefunds;
        if (table === "paypal_webhook_events") return paypalWebhookEvents;
        if (table === "payment_audit_logs") return paymentAuditLogs;
        if (table === "profiles") return profiles;
        return new Map();
      }

      const queryBuilder = {
        select() {
          return queryBuilder;
        },
        eq(col, val) {
          conditions.push((row) => row[col] === val);
          return queryBuilder;
        },
        is(col, val) {
          conditions.push((row) => row[col] === val);
          return queryBuilder;
        },
        in(col, vals) {
          const valSet = new Set(Array.isArray(vals) ? vals : [vals]);
          conditions.push((row) => valSet.has(row[col]));
          return queryBuilder;
        },
        or(expr) {
          // Parse simple .or() expressions like user_id.eq.X,invoice_id.in.(Y,Z)
          orConditions = (row) => {
            const clauses = expr.split(",");
            return clauses.some((clause) => {
              const trimmed = clause.trim();
              if (trimmed.includes(".eq.")) {
                const [col, val] = trimmed.split(".eq.");
                return row[col] === val;
              }
              return false;
            });
          };
          return queryBuilder;
        },
        order() {
          return queryBuilder;
        },
        limit(n) {
          limitCount = n;
          return queryBuilder;
        },
        single() {
          isSingle = true;
          return execute();
        },
        maybeSingle() {
          isMaybeSingle = true;
          return execute();
        },
        update(payload) {
          updatePayload = payload;
          return queryBuilder;
        },
        insert(payload) {
          insertPayload = payload;
          return queryBuilder;
        },
        upsert(payload, opts) {
          insertPayload = payload;
          return queryBuilder;
        },
        then(resolve, reject) {
          return execute().then(resolve, reject);
        },
      };

      async function execute() {
        const store = getStore();

        // Handle INSERT / UPSERT
        if (insertPayload) {
          const items = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
          const inserted = [];

          for (const item of items) {
            const id = item.id || crypto.randomUUID();
            const fullRecord = { id, ...item };
            store.set(id, fullRecord);
            inserted.push(fullRecord);
          }

          if (isSingle || isMaybeSingle) {
            return { data: inserted[0], error: null };
          }
          return { data: Array.isArray(insertPayload) ? inserted : inserted[0], error: null };
        }

        // 1. Filter matching rows
        const matched = [];
        for (const [id, row] of store.entries()) {
          const passesAnd = conditions.every((fn) => fn(row));
          const passesOr = orConditions ? orConditions(row) : true;
          if (passesAnd && passesOr) {
            matched.push({ id, row });
          }
        }

        // 2. Perform UPDATE if requested
        if (updatePayload) {
          if (matched.length === 0) {
            if (isSingle) {
              return { data: null, error: { message: "Row not found", code: "PGRST116" } };
            }
            return { data: isMaybeSingle ? null : [], error: null };
          }

          const updatedRows = matched.map(({ id, row }) => {
            const updated = { ...row, ...updatePayload };
            store.set(id, updated);
            return updated;
          });

          return {
            data: isSingle || isMaybeSingle ? updatedRows[0] : updatedRows,
            error: null,
          };
        }

        // 3. Perform SELECT
        let formattedRows = matched.map(({ row }) => {
          if (table === "invoice_payment_links" && row.invoice_id) {
            const inv = invoices.get(row.invoice_id);
            return { ...row, invoices: inv || null };
          }
          if (table === "payments") {
            const inv = row.invoice_id ? invoices.get(row.invoice_id) : null;
            // attach refunds if queried
            const refundsForPayment = [];
            for (const r of paymentRefunds.values()) {
              if (r.payment_id === row.id) refundsForPayment.push(r);
            }
            return { ...row, invoices: inv || null, payment_refunds: refundsForPayment };
          }
          return { ...row };
        });

        if (limitCount !== null && limitCount > 0) {
          formattedRows = formattedRows.slice(0, limitCount);
        }

        if (isSingle) {
          if (formattedRows.length === 0) {
            return { data: null, error: { message: "Row not found", code: "PGRST116" } };
          }
          return { data: formattedRows[0], error: null };
        }

        if (isMaybeSingle) {
          return { data: formattedRows.length > 0 ? formattedRows[0] : null, error: null };
        }

        return { data: formattedRows, error: null };
      }

      return queryBuilder;
    },

    async rpc(name, params) {
      // 1. RPC: create_or_regenerate_payment_link
      if (name === "create_or_regenerate_payment_link") {
        const {
          p_invoice_id,
          p_user_id,
          p_token_hash,
          p_expires_at,
          p_allow_draft_transition,
        } = params;

        if (!p_invoice_id || !p_user_id) {
          return { data: { success: false, code: "INVALID_ARGUMENTS", message: "IDs required" } };
        }

        if (!p_token_hash || !/^[0-9a-f]{64}$/.test(p_token_hash)) {
          return { data: { success: false, code: "INVALID_TOKEN_HASH", message: "Invalid hash" } };
        }

        const invoice = invoices.get(p_invoice_id);
        if (!invoice) {
          return { data: { success: false, code: "INVOICE_NOT_FOUND", message: "Invoice not found" } };
        }

        if (invoice.user_id !== p_user_id) {
          return { data: { success: false, code: "FORBIDDEN", message: "Access denied" } };
        }

        if (invoice.status === "DRAFT") {
          if (p_allow_draft_transition) {
            invoice.status = "PENDING";
            invoice.updated_at = new Date().toISOString();
          } else {
            return { data: { success: false, code: "DRAFT_INVOICE_NOT_ISSUED", message: "Draft not issued" } };
          }
        }

        if (invoice.status !== "PENDING" && invoice.status !== "OVERDUE") {
          return { data: { success: false, code: "INVALID_INVOICE_STATUS", message: `Invalid status ${invoice.status}` } };
        }

        // Revoke active links for invoice
        for (const [id, link] of invoicePaymentLinks.entries()) {
          if (link.invoice_id === p_invoice_id && link.revoked_at === null) {
            link.revoked_at = new Date().toISOString();
          }
        }

        const linkId = crypto.randomUUID();
        invoicePaymentLinks.set(linkId, {
          id: linkId,
          invoice_id: p_invoice_id,
          token_hash: p_token_hash,
          expires_at: p_expires_at,
          revoked_at: null,
          created_at: new Date().toISOString(),
          last_accessed_at: null,
        });

        return {
          data: {
            success: true,
            link_id: linkId,
            invoice_id: p_invoice_id,
            invoice_status: invoice.status,
            expires_at: p_expires_at,
          },
        };
      }

      // 2. RPC: reserve_payment_attempt
      if (name === "reserve_payment_attempt") {
        const { p_invoice_id } = params;
        const invoice = invoices.get(p_invoice_id);

        if (!invoice) {
          return { data: { success: false, code: "INVOICE_NOT_FOUND", message: "Invoice not found" } };
        }

        if (invoice.status === "PAID") {
          return { data: { success: false, code: "INVOICE_ALREADY_PAID", message: "Invoice is already paid" } };
        }

        if (invoice.status !== "PENDING" && invoice.status !== "OVERDUE") {
          return { data: { success: false, code: "INVALID_INVOICE_STATUS", message: `Invoice status ${invoice.status}` } };
        }

        // Check active payment attempt
        for (const payment of payments.values()) {
          if (
            payment.invoice_id === p_invoice_id &&
            ["CREATED", "ORDER_CREATED", "APPROVED", "CAPTURING", "PENDING"].includes(payment.status)
          ) {
            return {
              data: {
                success: true,
                is_new: false,
                payment_id: payment.id,
                status: payment.status,
                create_request_id: payment.create_request_id,
                paypal_order_id: payment.paypal_order_id,
                amount: payment.amount,
                currency: payment.currency,
              },
            };
          }
        }

        // Create new attempt
        const paymentId = crypto.randomUUID();
        const createRequestId = crypto.randomUUID();
        const newPayment = {
          id: paymentId,
          invoice_id: p_invoice_id,
          amount: invoice.amount,
          currency: invoice.currency,
          status: "CREATED",
          provider: "paypal",
          paypal_order_id: null,
          paypal_capture_id: null,
          create_request_id: createRequestId,
          capture_request_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        payments.set(paymentId, newPayment);

        return {
          data: {
            success: true,
            is_new: true,
            payment_id: paymentId,
            status: "CREATED",
            create_request_id: createRequestId,
            paypal_order_id: null,
            amount: invoice.amount,
            currency: invoice.currency,
          },
        };
      }

      // 3. RPC: reserve_payment_capture
      if (name === "reserve_payment_capture") {
        const { p_payment_id, p_paypal_order_id } = params;
        const payment = payments.get(p_payment_id);

        if (!payment) {
          return { data: { success: false, code: "PAYMENT_NOT_FOUND", message: "Payment not found" } };
        }

        if (payment.paypal_order_id !== p_paypal_order_id) {
          return { data: { success: false, code: "ORDER_ID_MISMATCH", message: "Order mismatch" } };
        }

        if (payment.status === "COMPLETED") {
          return {
            data: {
              success: true,
              already_completed: true,
              is_pending_clearance: false,
              payment_id: payment.id,
              paypal_capture_id: payment.paypal_capture_id,
              amount: payment.amount,
              currency: payment.currency,
            },
          };
        }

        if (payment.status === "PENDING") {
          return {
            data: {
              success: true,
              already_completed: false,
              is_pending_clearance: true,
              payment_id: payment.id,
              paypal_capture_id: payment.paypal_capture_id,
              amount: payment.amount,
              currency: payment.currency,
              message: "Payment is pending gateway clearance.",
            },
          };
        }

        if (["FAILED", "DENIED", "CANCELLED", "REFUNDED"].includes(payment.status)) {
          return { data: { success: false, code: "TERMINAL_PAYMENT_STATE", message: "Terminal state" } };
        }

        const invoice = invoices.get(payment.invoice_id);
        if (invoice && invoice.status === "PAID") {
          return { data: { success: false, code: "INVOICE_ALREADY_PAID", message: "Invoice settled" } };
        }

        if (!["ORDER_CREATED", "APPROVED", "CAPTURING"].includes(payment.status)) {
          return { data: { success: false, code: "INVALID_PAYMENT_STATUS", message: "Invalid status" } };
        }

        if (!payment.capture_request_id) {
          payment.capture_request_id = crypto.randomUUID();
        }
        payment.status = "CAPTURING";
        payment.updated_at = new Date().toISOString();

        return {
          data: {
            success: true,
            already_completed: false,
            is_pending_clearance: false,
            payment_id: payment.id,
            capture_request_id: payment.capture_request_id,
            paypal_order_id: payment.paypal_order_id,
            amount: payment.amount,
            currency: payment.currency,
          },
        };
      }

      // 4. RPC: settle_invoice_payment
      if (name === "settle_invoice_payment") {
        const {
          p_payment_id,
          p_paypal_order_id,
          p_paypal_capture_id,
          p_verified_amount,
          p_verified_currency,
          p_captured_at,
          p_provider = "paypal",
        } = params;

        const payment = payments.get(p_payment_id);
        if (!payment) {
          return { data: { success: false, code: "PAYMENT_NOT_FOUND", message: "Payment not found" } };
        }

        const invoice = invoices.get(payment.invoice_id);
        if (!invoice) {
          return { data: { success: false, code: "INVOICE_NOT_FOUND", message: "Invoice not found" } };
        }

        if (payment.paypal_order_id !== p_paypal_order_id) {
          return { data: { success: false, code: "ORDER_ID_MISMATCH", message: "Order ID mismatch" } };
        }

        if (Number(payment.amount) !== Number(p_verified_amount) || Number(invoice.amount) !== Number(p_verified_amount)) {
          return { data: { success: false, code: "AMOUNT_MISMATCH", message: "Amount mismatch" } };
        }

        if (payment.currency.toUpperCase() !== p_verified_currency.toUpperCase()) {
          return { data: { success: false, code: "CURRENCY_MISMATCH", message: "Currency mismatch" } };
        }

        // Idempotency check if already COMPLETED
        if (payment.status === "COMPLETED") {
          if (payment.paypal_capture_id === p_paypal_capture_id) {
            return {
              data: {
                success: true,
                already_settled: true,
                invoice_id: invoice.id,
                payment_id: payment.id,
                capture_id: p_paypal_capture_id,
                amount: payment.amount,
                currency: payment.currency,
                captured_at: payment.captured_at,
              },
            };
          }
          return { data: { success: false, code: "CONFLICTING_CAPTURE_ID", message: "Conflicting capture ID" } };
        }

        if (!["CAPTURING", "PENDING"].includes(payment.status)) {
          return { data: { success: false, code: "INVALID_PAYMENT_STATUS", message: "Invalid status for settlement" } };
        }

        // Commit settlement
        payment.status = "COMPLETED";
        payment.paypal_capture_id = p_paypal_capture_id;
        payment.captured_at = p_captured_at;
        payment.provider = p_provider;
        payment.updated_at = new Date().toISOString();

        invoice.status = "PAID";
        invoice.updated_at = new Date().toISOString();

        // Revoke links
        for (const link of invoicePaymentLinks.values()) {
          if (link.invoice_id === invoice.id) {
            link.revoked_at = new Date().toISOString();
          }
        }

        return {
          data: {
            success: true,
            already_settled: false,
            invoice_id: invoice.id,
            payment_id: payment.id,
            capture_id: p_paypal_capture_id,
            amount: p_verified_amount,
            currency: p_verified_currency,
            captured_at: p_captured_at,
          },
        };
      }

      // 5. RPC: check_rate_limit
      if (name === "check_rate_limit") {
        const { p_key, p_limit, p_window_seconds } = params;
        const now = Date.now();
        const entry = rateLimits.get(p_key);

        if (entry && now < entry.resetAt) {
          entry.points += 1;
          const allowed = entry.points <= p_limit;
          const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
          return {
            data: {
              allowed,
              current_points: entry.points,
              limit: p_limit,
              retry_after: retryAfter,
            },
          };
        }

        const resetAt = now + p_window_seconds * 1000;
        rateLimits.set(p_key, { points: 1, resetAt });
        return {
          data: {
            allowed: true,
            current_points: 1,
            limit: p_limit,
            retry_after: 0,
          },
        };
      }

      return { data: null, error: { message: `Unknown RPC function ${name}` } };
    },
  };

  return {
    client,
    invoices,
    invoicePaymentLinks,
    payments,
    rateLimits,
    paymentRefunds,
    paypalWebhookEvents,
    paymentAuditLogs,
    profiles,
    seedInvoice,
    seedPaymentLink,
    seedPayment,
    seedRefund,
    seedProfile,
    reset,
  };
}
