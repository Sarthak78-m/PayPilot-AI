-- ============================================================================
-- PayPilot AI — Phase 7B Database Migration
-- Target: Supabase PostgreSQL (Postgres 15+ / Standard Edition)
-- Version: 20261105000000_phase7b_payment_migration.sql
-- Description: PayPal Sandbox payments schema upgrade, invoice_payment_links,
--              webhook_events, rate_limits, RLS hardening, and 5 secure RPCs.
-- ============================================================================

-- ============================================================================
-- 1. Upgrade public.payments Table
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 Canonical Payment Provider Reconciliation
-- Pre-existing column is 'gateway' (varchar(50) DEFAULT 'paypal').
-- Unify into single canonical column 'provider' (text NOT NULL DEFAULT 'paypal').
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'gateway'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'provider'
  ) THEN
    ALTER TABLE public.payments RENAME COLUMN gateway TO provider;
  END IF;
END $$;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider text;
UPDATE public.payments SET provider = 'paypal' WHERE provider IS NULL;
ALTER TABLE public.payments ALTER COLUMN provider SET DEFAULT 'paypal';
ALTER TABLE public.payments ALTER COLUMN provider SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'gateway'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'provider'
  ) THEN
    UPDATE public.payments SET provider = COALESCE(provider, gateway, 'paypal') WHERE provider IS NULL;
    ALTER TABLE public.payments DROP COLUMN gateway;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1.2 Historical Currency Backfill & Integrity Guard
-- Currency did not exist on payments. Backfill from invoices BEFORE adding NOT NULL.
-- Fails safely and aborts migration if orphaned records or unsupported currencies exist.
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS currency text;

UPDATE public.payments p
SET currency = i.currency
FROM public.invoices i
WHERE p.invoice_id = i.id
  AND p.currency IS NULL;

-- Strict Validation Guard: Verify currency reconciliation integrity before proceeding
DO $$
DECLARE
    v_orphaned_count integer;
    v_null_currency_count integer;
    v_unsupported_currency_count integer;
    v_sample_id text;
BEGIN
    -- Guard 1: Verify each payment has a valid associated invoice
    SELECT count(*), max(p.id::text) INTO v_orphaned_count, v_sample_id
    FROM public.payments p
    LEFT JOIN public.invoices i ON p.invoice_id = i.id
    WHERE i.id IS NULL;

    IF v_orphaned_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % orphaned payment(s) without matching invoice (e.g. payment_id: %). Cannot safely infer currency.', 
            v_orphaned_count, v_sample_id;
    END IF;

    -- Guard 2: Verify zero remaining NULL currency values
    SELECT count(*), max(p.id::text) INTO v_null_currency_count, v_sample_id
    FROM public.payments p
    WHERE p.currency IS NULL;

    IF v_null_currency_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % payment(s) with NULL currency after backfill (e.g. payment_id: %). Invoice currency is NULL or missing.',
            v_null_currency_count, v_sample_id;
    END IF;

    -- Guard 3: Verify all backfilled currencies are supported ISO codes
    SELECT count(*), max(p.currency) INTO v_unsupported_currency_count, v_sample_id
    FROM public.payments p
    WHERE p.currency NOT IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR');

    IF v_unsupported_currency_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % payment(s) with unsupported currency "%". Must be USD, EUR, GBP, CAD, AUD, or INR.',
            v_unsupported_currency_count, v_sample_id;
    END IF;
END $$;

-- Apply NOT NULL and currency CHECK constraint only after validation passes (NO column default!)
ALTER TABLE public.payments ALTER COLUMN currency SET NOT NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_currency_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_currency_check CHECK (
  currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR')
);

-- ----------------------------------------------------------------------------
-- 1.3 Pre-existing PayPal Identifier Columns (paypal_order_id & paypal_capture_id)
-- Both columns pre-existed in base schema as varchar(100) UNIQUE NULL.
-- Preserving original varchar(100) type avoids unnecessary type alteration and
-- eliminates rollback truncation risks (PayPal Order/Capture IDs are 17 chars).
-- ----------------------------------------------------------------------------
-- Column data types preserved as varchar(100) to protect database integrity.

-- ----------------------------------------------------------------------------
-- 1.4 Newly Introduced Operational & Idempotency Columns
-- Note: create_request_id is deliberately added without a default so historical
-- payments retain NULL, distinguishing them from post-migration attempts.
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paypal_order_id varchar(100),
  ADD COLUMN IF NOT EXISTS paypal_capture_id varchar(100),
  ADD COLUMN IF NOT EXISTS captured_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS create_request_id uuid,
  ADD COLUMN IF NOT EXISTS capture_request_id uuid,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Note on captured_at: Historical payments retain captured_at = NULL because the
-- true PayPal capture timestamp is unavailable for pre-migration records. Database
-- row creation time (created_at) is never substituted for financial capture time.

-- Backfill updated_at timestamp for historical records (database record modification time)
UPDATE public.payments 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- Normalize existing payment statuses to uppercase before constraint enforcement
UPDATE public.payments
SET status = pg_catalog.upper(status)
WHERE status IS NOT NULL
  AND status <> pg_catalog.upper(status);

-- Set status column default to 'CREATED'
ALTER TABLE public.payments
  ALTER COLUMN status SET DEFAULT 'CREATED';

-- Update payments status check constraint supporting the full payment lifecycle
ALTER TABLE public.payments 
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments 
  ADD CONSTRAINT payments_status_check CHECK (
    status IN (
      'CREATED',        -- Attempt reserved in DB; stable create_request_id assigned
      'ORDER_CREATED',  -- PayPal Orders v2 created; orderId attached
      'APPROVED',       -- Buyer approved payment in PayPal modal
      'CAPTURING',      -- Capture reserved and in-flight; capture_request_id locked
      'PENDING',        -- Gateway async hold (eCheck, high-risk review; uncompleted)
      'COMPLETED',      -- Funds captured, verified, and settled; terminal success
      'FAILED',         -- Technical gateway or persistence failure
      'DENIED',         -- PayPal explicitly rejected instrument (declined, NSF)
      'CANCELLED',      -- Buyer dismissed popup or merchant revoked order
      'REFUNDED'        -- Full settlement reversed post-capture (Phase 8)
    )
  );

-- Uniqueness & Idempotency Indexes on payments
-- Note: paypal_order_id and paypal_capture_id were declared UNIQUE in base schema.
-- Ensure partial unique index exists without duplicate redundant index creation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'payments' AND indexdef LIKE '%(paypal_order_id)%'
  ) THEN
    CREATE UNIQUE INDEX idx_payments_paypal_order_id_unique
      ON public.payments (paypal_order_id)
      WHERE paypal_order_id IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'payments' AND indexdef LIKE '%(paypal_capture_id)%'
  ) THEN
    CREATE UNIQUE INDEX idx_payments_paypal_capture_id_unique
      ON public.payments (paypal_capture_id)
      WHERE paypal_capture_id IS NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_create_request_id_unique
  ON public.payments (create_request_id)
  WHERE create_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_capture_request_id_unique
  ON public.payments (capture_request_id)
  WHERE capture_request_id IS NOT NULL;

-- Strict Concurrency Guarantee 1: Exactly ONE COMPLETED payment per invoice
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_single_completed_per_invoice
  ON public.payments (invoice_id)
  WHERE status = 'COMPLETED';

-- Strict Concurrency Guarantee 2: At most ONE ACTIVE payment attempt per invoice
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_single_active_attempt
  ON public.payments (invoice_id)
  WHERE status IN ('CREATED', 'ORDER_CREATED', 'APPROVED', 'CAPTURING', 'PENDING');

-- Lookup index for invoice payments filtering
CREATE INDEX IF NOT EXISTS idx_payments_invoice_lookup
  ON public.payments (invoice_id, status);


-- ============================================================================
-- 2. Create public.invoice_payment_links Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invoice_payment_links (
    id                uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id        uuid                     NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    token_hash        text                     NOT NULL,
    created_at        timestamp with time zone NOT NULL DEFAULT now(),
    expires_at        timestamp with time zone NOT NULL,
    revoked_at        timestamp with time zone NULL,
    last_accessed_at  timestamp with time zone NULL,
    CONSTRAINT invoice_payment_links_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

-- Idempotent constraint check for existing installations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'invoice_payment_links_token_hash_check'
          AND conrelid = 'public.invoice_payment_links'::regclass
    ) THEN
        ALTER TABLE public.invoice_payment_links
            ADD CONSTRAINT invoice_payment_links_token_hash_check
            CHECK (token_hash ~ '^[0-9a-f]{64}$');
    END IF;
END $$;

-- Unique index on token hash (raw token is never stored)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_links_token_hash_unique
  ON public.invoice_payment_links (token_hash);

-- Fast lookup by invoice
CREATE INDEX IF NOT EXISTS idx_payment_links_invoice_id
  ON public.invoice_payment_links (invoice_id);

-- Strict Concurrency Guarantee 3: At most ONE active (non-revoked) link per invoice
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_links_single_active
  ON public.invoice_payment_links (invoice_id)
  WHERE revoked_at IS NULL;


-- ============================================================================
-- 3. Create public.webhook_events Table (Phase 8 Webhook Support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
    id                      uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                text                     NOT NULL UNIQUE,
    event_type              text                     NOT NULL,
    resource_type           text                     NOT NULL,
    resource_id             text                     NOT NULL,
    payload                 jsonb                    NOT NULL,
    status                  text                     NOT NULL DEFAULT 'RECEIVED',
    attempt_count           integer                  NOT NULL DEFAULT 0,
    processing_started_at   timestamp with time zone NULL,
    processing_lease_until  timestamp with time zone NULL,
    last_error              text                     NULL,
    processed_at            timestamp with time zone NULL,
    created_at              timestamp with time zone NOT NULL DEFAULT now()
);

-- Fast lookup for deduplication and resource reconciliation
CREATE INDEX IF NOT EXISTS idx_webhook_events_resource
  ON public.webhook_events (resource_id, event_type);

-- Worker lease query optimization
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON public.webhook_events (status, processing_lease_until);


-- ============================================================================
-- 4. Create public.rate_limits Table (Distributed Fixed-Window Rate Limiter)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key               text                     PRIMARY KEY,
    points            integer                  NOT NULL DEFAULT 1,
    expire_at         timestamp with time zone NOT NULL
);

-- Index for TTL expiration lookups and garbage collection
CREATE INDEX IF NOT EXISTS idx_rate_limits_expire_at 
  ON public.rate_limits (expire_at);


-- ============================================================================
-- 5. Row Level Security (RLS) & Engine Permissions Configuration
-- ============================================================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Clean up any legacy or overlapping policies
DROP POLICY IF EXISTS "Users can view payments for own invoices" ON public.payments;
DROP POLICY IF EXISTS "Users can view payments for their own invoices" ON public.payments;
DROP POLICY IF EXISTS "Users can view payment links for their own invoices" ON public.invoice_payment_links;
DROP POLICY IF EXISTS "Deny all client access to invoice_payment_links" ON public.invoice_payment_links;
DROP POLICY IF EXISTS "Deny all client access to webhook_events" ON public.webhook_events;
DROP POLICY IF EXISTS "Deny all client access to rate_limits" ON public.rate_limits;

-- Payments: Authenticated merchants may SELECT payments belonging to their own invoices only
CREATE POLICY "Users can view payments for their own invoices"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payments.invoice_id
      AND invoices.user_id = auth.uid()
    )
  );

-- Payment Links: Deny all direct client access (all reads and mutations occur via service_role)
CREATE POLICY "Deny all client access to invoice_payment_links"
  ON public.invoice_payment_links FOR ALL TO authenticated, anon
  USING (false);

-- Webhook Events: Deny all direct client access
CREATE POLICY "Deny all client access to webhook_events"
  ON public.webhook_events FOR ALL TO authenticated, anon
  USING (false);

-- Rate Limits: Deny all direct client access
CREATE POLICY "Deny all client access to rate_limits"
  ON public.rate_limits FOR ALL TO authenticated, anon
  USING (false);

-- Table-Level Engine Privileges
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.invoice_payment_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC, anon, authenticated;

-- Authenticated merchants may only SELECT payments (enforced by RLS above)
GRANT SELECT ON TABLE public.payments TO authenticated;

-- Service role has full table privileges (used strictly by trusted backend API routes)
GRANT ALL ON TABLE public.payments TO service_role;
GRANT ALL ON TABLE public.invoice_payment_links TO service_role;
GRANT ALL ON TABLE public.webhook_events TO service_role;
GRANT ALL ON TABLE public.rate_limits TO service_role;

-- Clean up potential obsolete overloads before defining authoritative canonical functions
DROP FUNCTION IF EXISTS public.reserve_payment_attempt(uuid);
DROP FUNCTION IF EXISTS public.reserve_payment_capture(uuid, text);
DROP FUNCTION IF EXISTS public.settle_invoice_payment(uuid, text, text, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.settle_invoice_payment(uuid, text, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.settle_invoice_payment(uuid, text, text, numeric, text, timestamp with time zone, text);
DROP FUNCTION IF EXISTS public.settle_invoice_payment(uuid, text, text, numeric, text, timestamp with time zone);
DROP FUNCTION IF EXISTS public.create_or_regenerate_payment_link(uuid, text, timestamp with time zone);
DROP FUNCTION IF EXISTS public.create_or_regenerate_payment_link(uuid, uuid, text, timestamp with time zone, boolean);
DROP FUNCTION IF EXISTS public.check_rate_limit(text, integer, integer);
DROP FUNCTION IF EXISTS public.cleanup_expired_rate_limits(integer);


-- ============================================================================
-- 6. RPC 1: reserve_payment_attempt
-- Purpose: Atomically reserve or reuse an active payment attempt for an invoice.
-- Canonical Lock Order: public.invoices FOR UPDATE first, public.payments FOR UPDATE second.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_payment_attempt(
    p_invoice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_invoice public.invoices%ROWTYPE;
    v_payment public.payments%ROWTYPE;
    v_new_request_id uuid;
BEGIN
    -- 1. Validate Input
    IF p_invoice_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_INVOICE_ID',
            'message', 'Invoice ID must not be null.'
        );
    END IF;

    -- 2. CANONICAL LOCK ORDER: Lock invoice row FIRST
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVOICE_NOT_FOUND',
            'message', 'Invoice not found.'
        );
    END IF;

    -- 3. Verify Invoice Status
    IF v_invoice.status = 'PAID' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVOICE_ALREADY_PAID',
            'message', 'Invoice is already settled.'
        );
    END IF;

    IF v_invoice.status NOT IN ('PENDING', 'OVERDUE') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_INVOICE_STATUS',
            'message', 'Invoice is not in payable state (status: ' || v_invoice.status || ').'
        );
    END IF;

    -- 3b. Verify Invoice Currency Validity (fail safely if missing or unsupported)
    IF v_invoice.currency IS NULL OR v_invoice.currency NOT IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'UNSUPPORTED_INVOICE_CURRENCY',
            'message', 'Invoice currency (' || COALESCE(v_invoice.currency, 'NULL') || ') is not supported for payments.'
        );
    END IF;

    -- 4. CANONICAL LOCK ORDER: Check existing active payment attempt SECOND
    SELECT * INTO v_payment
    FROM public.payments
    WHERE invoice_id = p_invoice_id
      AND status IN ('CREATED', 'ORDER_CREATED', 'APPROVED', 'CAPTURING', 'PENDING')
    FOR UPDATE;

    -- 5. If Active Attempt Exists: Return existing attempt and stable create_request_id
    IF FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'is_new', false,
            'payment_id', v_payment.id,
            'status', v_payment.status,
            'create_request_id', v_payment.create_request_id,
            'paypal_order_id', v_payment.paypal_order_id,
            'amount', v_payment.amount,
            'currency', v_payment.currency
        );
    END IF;

    -- 6. No Active Attempt: Generate stable create_request_id and reserve new attempt
    v_new_request_id := pg_catalog.gen_random_uuid();

    INSERT INTO public.payments (
        invoice_id,
        amount,
        currency,
        status,
        provider,
        create_request_id,
        created_at,
        updated_at
    )
    VALUES (
        v_invoice.id,
        v_invoice.amount,
        v_invoice.currency,
        'CREATED',
        'paypal',
        v_new_request_id,
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING * INTO v_payment;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'is_new', true,
        'payment_id', v_payment.id,
        'status', v_payment.status,
        'create_request_id', v_payment.create_request_id,
        'paypal_order_id', null,
        'amount', v_payment.amount,
        'currency', v_payment.currency
    );
END;
$$;

-- Exact Function Privileges
REVOKE ALL ON FUNCTION public.reserve_payment_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_payment_attempt(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_payment_attempt(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_payment_attempt(uuid) TO service_role;


-- ============================================================================
-- 7. RPC 2: reserve_payment_capture
-- Purpose: Atomically lock invoice and payment, assign a stable capture_request_id,
--          and transition payment attempt to CAPTURING.
-- Canonical Lock Order: public.invoices FOR UPDATE first, public.payments FOR UPDATE second.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_payment_capture(
    p_payment_id       uuid,
    p_paypal_order_id  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_payment public.payments%ROWTYPE;
    v_invoice public.invoices%ROWTYPE;
    v_invoice_id uuid;
    v_capture_request_id uuid;
BEGIN
    -- 1. Validate Input Parameters
    IF p_payment_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_PAYMENT_ID',
            'message', 'Payment ID must not be null.'
        );
    END IF;

    IF p_paypal_order_id IS NULL OR pg_catalog.btrim(p_paypal_order_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_ORDER_ID',
            'message', 'PayPal order ID must not be null or empty.'
        );
    END IF;

    -- 2. Lookup invoice_id to establish canonical locking sequence
    SELECT invoice_id INTO v_invoice_id
    FROM public.payments
    WHERE id = p_payment_id;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'PAYMENT_NOT_FOUND',
            'message', 'Payment attempt record not found.'
        );
    END IF;

    -- 3. CANONICAL LOCK ORDER: Lock invoice row FIRST
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = v_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVOICE_NOT_FOUND',
            'message', 'Associated invoice not found.'
        );
    END IF;

    -- 4. CANONICAL LOCK ORDER: Lock payment attempt row SECOND
    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;

    -- 5. Order ID Verification
    IF v_payment.paypal_order_id IS NULL OR v_payment.paypal_order_id <> p_paypal_order_id THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'ORDER_ID_MISMATCH',
            'message', 'Supplied PayPal order ID does not match the payment attempt record.'
        );
    END IF;

    -- 6. Check if Already Completed (Idempotent receipt)
    IF v_payment.status = 'COMPLETED' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'already_completed', true,
            'is_pending_clearance', false,
            'payment_id', v_payment.id,
            'paypal_capture_id', v_payment.paypal_capture_id,
            'amount', v_payment.amount,
            'currency', v_payment.currency
        );
    END IF;

    -- 7. PENDING Gateway Clearance Hold Check: NEVER call capture again!
    IF v_payment.status = 'PENDING' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'already_completed', false,
            'is_pending_clearance', true,
            'code', 'CAPTURE_PENDING_GATEWAY_CLEARANCE',
            'message', 'Capture is pending gateway clearance. Do not initiate capture again.',
            'payment_id', v_payment.id,
            'paypal_capture_id', v_payment.paypal_capture_id,
            'amount', v_payment.amount,
            'currency', v_payment.currency
        );
    END IF;

    -- 8. Reject Terminal States
    IF v_payment.status IN ('FAILED', 'DENIED', 'CANCELLED', 'REFUNDED') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'TERMINAL_PAYMENT_STATE',
            'message', 'Payment attempt is in terminal state ' || v_payment.status || ' and cannot be captured.'
        );
    END IF;

    -- 9. Verify Invoice Status
    IF v_invoice.status = 'PAID' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVOICE_ALREADY_PAID',
            'message', 'Associated invoice is already settled.'
        );
    END IF;

    IF v_invoice.status NOT IN ('PENDING', 'OVERDUE') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_INVOICE_STATUS',
            'message', 'Invoice is not payable (status: ' || v_invoice.status || ').'
        );
    END IF;

    -- 10. Status Eligibility for Capture (ORDER_CREATED, APPROVED, or in-flight CAPTURING)
    IF v_payment.status NOT IN ('ORDER_CREATED', 'APPROVED', 'CAPTURING') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_PAYMENT_STATUS',
            'message', 'Payment status ' || v_payment.status || ' is not eligible for capture.'
        );
    END IF;

    -- 11. Assign Stable capture_request_id (Reusing existing if already in CAPTURING)
    IF v_payment.capture_request_id IS NOT NULL THEN
        v_capture_request_id := v_payment.capture_request_id;
    ELSE
        v_capture_request_id := pg_catalog.gen_random_uuid();
    END IF;

    -- 12. Transition to CAPTURING and persist capture_request_id
    UPDATE public.payments
    SET status = 'CAPTURING',
        capture_request_id = v_capture_request_id,
        updated_at = pg_catalog.now()
    WHERE id = p_payment_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'already_completed', false,
        'is_pending_clearance', false,
        'payment_id', v_payment.id,
        'capture_request_id', v_capture_request_id,
        'paypal_order_id', v_payment.paypal_order_id,
        'amount', v_payment.amount,
        'currency', v_payment.currency
    );
END;
$$;

-- Exact Function Privileges
REVOKE ALL ON FUNCTION public.reserve_payment_capture(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_payment_capture(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_payment_capture(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_payment_capture(uuid, text) TO service_role;


-- ============================================================================
-- 8. RPC 3: settle_invoice_payment
-- Purpose: Atomically mark verified payment and invoice as COMPLETED / PAID.
-- Security Note: Merchant identity must be verified by the trusted server-side
--                gateway service prior to calling this RPC.
-- Canonical Lock Order: public.invoices FOR UPDATE first, public.payments FOR UPDATE second.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.settle_invoice_payment(
    p_payment_id         uuid,
    p_paypal_order_id    text,
    p_paypal_capture_id  text,
    p_verified_amount    numeric,
    p_verified_currency  text,
    p_captured_at        timestamp with time zone,
    p_provider           text DEFAULT 'paypal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_payment public.payments%ROWTYPE;
    v_invoice public.invoices%ROWTYPE;
    v_invoice_id uuid;
    v_conflicting_id uuid;
BEGIN
    -- 1. Reject Null or Empty Parameters
    IF p_payment_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_PAYMENT_ID',
            'message', 'Payment ID must not be null.'
        );
    END IF;

    IF p_paypal_order_id IS NULL OR pg_catalog.btrim(p_paypal_order_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_ORDER_ID',
            'message', 'PayPal order ID must not be null or empty.'
        );
    END IF;

    IF p_paypal_capture_id IS NULL OR pg_catalog.btrim(p_paypal_capture_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_CAPTURE_ID',
            'message', 'PayPal capture ID must not be null or empty.'
        );
    END IF;

    IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_AMOUNT',
            'message', 'Verified capture amount must be greater than zero.'
        );
    END IF;

    IF p_verified_currency IS NULL OR pg_catalog.btrim(p_verified_currency) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_CURRENCY',
            'message', 'Verified capture currency must not be null or empty.'
        );
    END IF;

    IF p_captured_at IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_CAPTURED_AT',
            'message', 'Verified PayPal capture timestamp must not be null.'
        );
    END IF;

    IF p_captured_at > (pg_catalog.now() + interval '5 minutes') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_CAPTURED_AT',
            'message', 'Verified PayPal capture timestamp cannot be in the future.'
        );
    END IF;

    IF p_provider IS NULL OR pg_catalog.btrim(p_provider) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_PROVIDER',
            'message', 'Provider must not be null or empty.'
        );
    END IF;

    -- 2. Lookup invoice_id to establish canonical locking sequence
    SELECT invoice_id INTO v_invoice_id
    FROM public.payments
    WHERE id = p_payment_id;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'PAYMENT_NOT_FOUND',
            'message', 'Payment attempt record not found.'
        );
    END IF;

    -- 3. CANONICAL LOCK ORDER: Lock invoice row FIRST
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = v_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVOICE_NOT_FOUND',
            'message', 'Associated invoice record not found.'
        );
    END IF;

    -- 4. CANONICAL LOCK ORDER: Lock payment attempt row SECOND
    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;

    -- 5. Stored Order ID and Provider Verification
    IF v_payment.paypal_order_id IS NULL OR v_payment.paypal_order_id <> p_paypal_order_id THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'ORDER_ID_MISMATCH',
            'message', 'Supplied PayPal order ID does not match the payment attempt.'
        );
    END IF;

    IF v_payment.provider IS NULL OR v_payment.provider <> p_provider THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'PROVIDER_MISMATCH',
            'message', 'Payment provider mismatch.'
        );
    END IF;

    -- 6. Financial Amount and Currency Anti-Tampering Verification
    IF v_payment.amount <> p_verified_amount OR v_invoice.amount <> p_verified_amount THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'AMOUNT_MISMATCH',
            'message', 'Verified capture amount (' || p_verified_amount || ') does not match invoice/payment amount.'
        );
    END IF;

    IF pg_catalog.upper(v_payment.currency) <> pg_catalog.upper(p_verified_currency) 
       OR pg_catalog.upper(v_invoice.currency) <> pg_catalog.upper(p_verified_currency) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'CURRENCY_MISMATCH',
            'message', 'Verified capture currency (' || p_verified_currency || ') does not match invoice/payment currency.'
        );
    END IF;

    -- 7. Idempotency Check: Executed only AFTER order, provider, amount, and currency are verified
    IF v_payment.status = 'COMPLETED' THEN
        IF v_payment.paypal_capture_id = p_paypal_capture_id THEN
            -- Verify capture timestamp is identical; reject conflicting capture timestamp
            IF v_payment.captured_at IS NOT NULL AND v_payment.captured_at <> p_captured_at THEN
                RETURN pg_catalog.jsonb_build_object(
                    'success', false,
                    'code', 'CONFLICTING_CAPTURED_AT',
                    'message', 'Payment attempt was already completed with a different capture timestamp.'
                );
            END IF;

            RETURN pg_catalog.jsonb_build_object(
                'success', true,
                'already_settled', true,
                'invoice_id', v_invoice.id,
                'payment_id', v_payment.id,
                'capture_id', p_paypal_capture_id,
                'amount', v_payment.amount,
                'currency', v_payment.currency,
                'captured_at', v_payment.captured_at
            );
        ELSE
            RETURN pg_catalog.jsonb_build_object(
                'success', false,
                'code', 'CONFLICTING_CAPTURE_ID',
                'message', 'Payment attempt was already completed under a different capture ID.'
            );
        END IF;
    END IF;

    -- 8. Capture ID Uniqueness Check across all payments
    SELECT id INTO v_conflicting_id
    FROM public.payments
    WHERE paypal_capture_id = p_paypal_capture_id
      AND id <> p_payment_id
    LIMIT 1;

    IF v_conflicting_id IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'CAPTURE_ALREADY_ASSOCIATED',
            'message', 'Capture ID is already associated with another payment attempt.'
        );
    END IF;

    -- 9. Invoice Eligibility Check
    IF v_invoice.status = 'PAID' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVOICE_ALREADY_PAID',
            'message', 'Associated invoice is already marked PAID by another transaction.'
        );
    END IF;

    IF v_invoice.status NOT IN ('PENDING', 'OVERDUE') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_INVOICE_STATUS',
            'message', 'Invoice is not in payable state (status: ' || v_invoice.status || ').'
        );
    END IF;

    -- 10. Payment Settlement Status Eligibility:
    -- Only allow settlement from CAPTURING or from PENDING (gateway clearance).
    -- Ordinary settlement from ORDER_CREATED or APPROVED is rejected.
    IF v_payment.status NOT IN ('CAPTURING', 'PENDING') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_PAYMENT_STATUS',
            'message', 'Payment status ' || v_payment.status || ' is not eligible for settlement. Attempt must be in CAPTURING or PENDING status.'
        );
    END IF;

    -- 11. Atomic Settlement Commit: Persist the verified PayPal capture timestamp
    UPDATE public.payments
    SET status = 'COMPLETED',
        paypal_capture_id = p_paypal_capture_id,
        provider = p_provider,
        captured_at = p_captured_at,
        updated_at = pg_catalog.now()
    WHERE id = p_payment_id;

    UPDATE public.invoices
    SET status = 'PAID',
        updated_at = pg_catalog.now()
    WHERE id = v_invoice.id;

    -- 12. Atomically revoke any active payment links for this settled invoice
    UPDATE public.invoice_payment_links
    SET revoked_at = pg_catalog.now()
    WHERE invoice_id = v_invoice.id
      AND revoked_at IS NULL;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'already_settled', false,
        'invoice_id', v_invoice.id,
        'payment_id', v_payment.id,
        'capture_id', p_paypal_capture_id,
        'amount', p_verified_amount,
        'currency', p_verified_currency,
        'captured_at', p_captured_at
    );
END;
$$;

-- Exact Function Privileges
REVOKE ALL ON FUNCTION public.settle_invoice_payment(uuid, text, text, numeric, text, timestamp with time zone, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_invoice_payment(uuid, text, text, numeric, text, timestamp with time zone, text) FROM anon;
REVOKE ALL ON FUNCTION public.settle_invoice_payment(uuid, text, text, numeric, text, timestamp with time zone, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_invoice_payment(uuid, text, text, numeric, text, timestamp with time zone, text) TO service_role;


-- ============================================================================
-- 9. RPC 4: create_or_regenerate_payment_link
-- Purpose: Securely manage customer payment links with token hash storage.
-- Canonical Lock Order: public.invoices FOR UPDATE first, public.invoice_payment_links second.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_or_regenerate_payment_link(
    p_invoice_id              uuid,
    p_user_id                 uuid,
    p_token_hash              text,
    p_expires_at              timestamp with time zone,
    p_allow_draft_transition  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_invoice public.invoices%ROWTYPE;
    v_link_id uuid;
BEGIN
    -- 1. Validate Input Arguments
    IF p_invoice_id IS NULL OR p_user_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_ARGUMENTS',
            'message', 'Invoice ID and User ID must not be null.'
        );
    END IF;

    IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_TOKEN_HASH',
            'message', 'Token hash must be a 64-character lowercase hexadecimal SHA-256 digest.'
        );
    END IF;

    IF p_expires_at IS NULL OR p_expires_at <= pg_catalog.now() THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_EXPIRATION',
            'message', 'Expiration timestamp must be in the future.'
        );
    END IF;

    -- Enforce maximum validity of 30 days
    IF p_expires_at > (pg_catalog.now() + interval '30 days') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'EXPIRATION_EXCEEDS_MAXIMUM',
            'message', 'Payment link expiration cannot exceed 30 days.'
        );
    END IF;

    -- 2. CANONICAL LOCK ORDER: Lock invoice row FIRST and verify merchant ownership
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVOICE_NOT_FOUND',
            'message', 'Invoice not found.'
        );
    END IF;

    IF v_invoice.user_id <> p_user_id THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'message', 'Invoice does not belong to the authenticated user.'
        );
    END IF;

    -- 3. Support Explicit DRAFT-to-PENDING Transition
    IF v_invoice.status = 'DRAFT' THEN
        IF p_allow_draft_transition IS TRUE THEN
            UPDATE public.invoices
            SET status = 'PENDING',
                updated_at = pg_catalog.now()
            WHERE id = v_invoice.id;
            v_invoice.status := 'PENDING';
        ELSE
            RETURN pg_catalog.jsonb_build_object(
                'success', false,
                'code', 'DRAFT_INVOICE_NOT_ISSUED',
                'message', 'DRAFT invoices must be transitioned to PENDING before creating a payment link.'
            );
        END IF;
    END IF;

    -- 4. Check Status Eligibility
    IF v_invoice.status NOT IN ('PENDING', 'OVERDUE') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'code', 'INVALID_INVOICE_STATUS',
            'message', 'Cannot generate payment link for invoice with status ' || v_invoice.status || '.'
        );
    END IF;

    -- 5. CANONICAL LOCK ORDER: Atomically revoke any existing active links for this invoice SECOND
    UPDATE public.invoice_payment_links
    SET revoked_at = pg_catalog.now()
    WHERE invoice_id = p_invoice_id
      AND revoked_at IS NULL;

    -- 6. Insert New Active Payment Link (storing token hash only)
    INSERT INTO public.invoice_payment_links (
        invoice_id,
        token_hash,
        expires_at,
        created_at
    )
    VALUES (
        p_invoice_id,
        p_token_hash,
        p_expires_at,
        pg_catalog.now()
    )
    RETURNING id INTO v_link_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'link_id', v_link_id,
        'invoice_id', v_invoice.id,
        'invoice_status', v_invoice.status,
        'expires_at', p_expires_at
    );
END;
$$;

-- Exact Function Privileges
REVOKE ALL ON FUNCTION public.create_or_regenerate_payment_link(uuid, uuid, text, timestamp with time zone, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_or_regenerate_payment_link(uuid, uuid, text, timestamp with time zone, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.create_or_regenerate_payment_link(uuid, uuid, text, timestamp with time zone, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_regenerate_payment_link(uuid, uuid, text, timestamp with time zone, boolean) TO service_role;


-- ============================================================================
-- 10. RPC 5: check_rate_limit & cleanup_expired_rate_limits
-- Purpose: Distributed atomic fixed-window rate limiter with lazy and scheduled TTL cleanup.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key             text,
    p_limit           integer,
    p_window_seconds  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_record public.rate_limits%ROWTYPE;
    v_now timestamp with time zone := pg_catalog.now();
BEGIN
    -- Validate positive limits and window durations
    IF p_limit IS NULL OR p_limit <= 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
            'allowed', false,
            'code', 'INVALID_RATE_LIMIT_PARAMETERS',
            'message', 'Limit and window seconds must be positive integers.'
        );
    END IF;

    IF p_key IS NULL OR pg_catalog.btrim(p_key) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'allowed', false,
            'code', 'INVALID_RATE_LIMIT_KEY',
            'message', 'Rate limit key must not be null or empty.'
        );
    END IF;

    -- 1. Lazy cleanup of expired entry for this key
    DELETE FROM public.rate_limits
    WHERE key = p_key
      AND expire_at <= v_now;

    -- 2. Lock or insert counter atomically
    INSERT INTO public.rate_limits (key, points, expire_at)
    VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::interval)
    ON CONFLICT (key) DO UPDATE
    SET points = public.rate_limits.points + 1
    RETURNING * INTO v_record;

    -- 3. Check threshold
    IF v_record.points > p_limit THEN
        RETURN pg_catalog.jsonb_build_object(
            'allowed', false,
            'current_points', v_record.points,
            'limit', p_limit,
            'retry_after', pg_catalog.ceil(pg_catalog.date_part('epoch', (v_record.expire_at - v_now)))
        );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'allowed', true,
        'current_points', v_record.points,
        'limit', p_limit
    );
END;
$$;

-- Scheduled/Batch Rate-Limit Garbage Collection Function
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits(
    p_batch_size integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deleted_count integer := 0;
BEGIN
    WITH deleted_rows AS (
        DELETE FROM public.rate_limits
        WHERE ctid IN (
            SELECT ctid FROM public.rate_limits
            WHERE expire_at <= pg_catalog.now()
            LIMIT CASE WHEN p_batch_size < 1 THEN 1 ELSE p_batch_size END
        )
        RETURNING 1
    )
    SELECT pg_catalog.count(*) INTO v_deleted_count FROM deleted_rows;

    RETURN v_deleted_count;
END;
$$;

-- Exact Function Privileges
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits(integer) FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(integer) TO service_role;
