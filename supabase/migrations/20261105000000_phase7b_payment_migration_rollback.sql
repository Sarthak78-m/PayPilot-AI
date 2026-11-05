-- ============================================================================
-- PayPilot AI — Phase 7B Database Migration Rollback Plan
-- Target: Supabase PostgreSQL (Postgres 15+ / Standard Edition)
-- Reference: 20261105000000_phase7b_payment_migration_rollback.sql
-- Status: PRE-ACTIVATION ROLLBACK PLAN ONLY (DO NOT EXECUTE IN PRODUCTION)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. PRECONDITION SAFETY GATE: Prevent Destructive Post-Activation Rollback
-- This script is strictly a PRE-ACTIVATION rollback plan.
-- Once the payment gateway is live and operational data (captured payments,
-- customer payment links, webhook audits) has been recorded, running this
-- script would destroy production financial metadata. In an operational state,
-- FORWARD-FIX MIGRATIONS MUST BE USED INSTEAD OF DESTRUCTIVE ROLLBACK.
-- If operational data exists, this script ABORTS unless explicitly overridden.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_operational_payments integer := 0;
    v_active_links integer := 0;
    v_webhook_events integer := 0;
    v_allow_destructive text;
BEGIN
    v_allow_destructive := pg_catalog.current_setting('paypilot.allow_destructive_rollback', true);

    -- Check for any post-migration operational payment activity
    -- Discriminating factor: Every newly reserved payment attempt receives a stable, non-null create_request_id.
    -- Historical payments strictly retain create_request_id IS NULL and captured_at IS NULL.
    -- We NEVER depend on captured_at > created_at to detect operational payments.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'create_request_id'
    ) THEN
        SELECT count(*) INTO v_operational_payments 
        FROM public.payments 
        WHERE create_request_id IS NOT NULL
           OR capture_request_id IS NOT NULL
           OR failure_reason IS NOT NULL
           OR status IN ('CREATED', 'ORDER_CREATED', 'APPROVED', 'CAPTURING', 'FAILED', 'DENIED', 'CANCELLED', 'REFUNDED');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoice_payment_links'
    ) THEN
        SELECT count(*) INTO v_active_links 
        FROM public.invoice_payment_links;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'webhook_events'
    ) THEN
        SELECT count(*) INTO v_webhook_events 
        FROM public.webhook_events;
    END IF;

    IF (v_operational_payments > 0 OR v_active_links > 0 OR v_webhook_events > 0)
       AND (v_allow_destructive IS DISTINCT FROM 'true') THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED BY SAFETY GATE: Operational payments (%), payment links (%), or webhook events (%) detected. Dropping these objects would permanently destroy financial audit records. In production, use forward-fix migrations instead of rollback. To force rollback for testing/pre-activation reset, execute: SET paypilot.allow_destructive_rollback = ''true'';',
            v_operational_payments, v_active_links, v_webhook_events;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Drop Newly Created RPC Functions
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cleanup_expired_rate_limits(integer);
DROP FUNCTION IF EXISTS public.check_rate_limit(text, integer, integer);
DROP FUNCTION IF EXISTS public.create_or_regenerate_payment_link(uuid, text, timestamp with time zone);
DROP FUNCTION IF EXISTS public.create_or_regenerate_payment_link(uuid, uuid, text, timestamp with time zone, boolean);
DROP FUNCTION IF EXISTS public.settle_invoice_payment(uuid, text, text, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.settle_invoice_payment(uuid, text, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.settle_invoice_payment(uuid, text, text, numeric, text, timestamp with time zone, text);
DROP FUNCTION IF EXISTS public.settle_invoice_payment(uuid, text, text, numeric, text, timestamp with time zone);
DROP FUNCTION IF EXISTS public.reserve_payment_capture(uuid, text);
DROP FUNCTION IF EXISTS public.reserve_payment_attempt(uuid);

-- ----------------------------------------------------------------------------
-- 2. Drop Newly Created Tables (Policies dropped automatically with CASCADE)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.rate_limits CASCADE;
DROP TABLE IF EXISTS public.webhook_events CASCADE;
DROP TABLE IF EXISTS public.invoice_payment_links CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Drop Newly Added Indexes on public.payments
-- Note: Pre-existing UNIQUE constraints on paypal_order_id and paypal_capture_id
-- are never dropped.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_payments_paypal_order_id_unique;
DROP INDEX IF EXISTS public.idx_payments_paypal_capture_id_unique;
DROP INDEX IF EXISTS public.idx_payments_create_request_id_unique;
DROP INDEX IF EXISTS public.idx_payments_capture_request_id_unique;
DROP INDEX IF EXISTS public.idx_payments_single_completed_per_invoice;
DROP INDEX IF EXISTS public.idx_payments_single_active_attempt;
DROP INDEX IF EXISTS public.idx_payments_invoice_lookup;

-- ----------------------------------------------------------------------------
-- 4. Drop Payments Check Constraint
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments 
  DROP CONSTRAINT IF EXISTS payments_status_check;

-- ----------------------------------------------------------------------------
-- 5. Restore Payments Status Default
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments
  ALTER COLUMN status SET DEFAULT 'pending';

-- ----------------------------------------------------------------------------
-- 6. Revert Canonical Provider Field to Pre-Existing Gateway Column
-- NEVER drop the pre-existing gateway column. Revert rename back to gateway.
-- Verifies no data values exceed varchar(50) before type alteration.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_overflow_count integer := 0;
    v_sample_val text;
BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'provider'
    ) THEN
      SELECT count(*), max(provider) INTO v_overflow_count, v_sample_val
      FROM public.payments
      WHERE pg_catalog.char_length(provider) > 50;

      IF v_overflow_count > 0 THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED: Found % provider value(s) exceeding varchar(50) (e.g. "%"). Cannot safely revert without data truncation.',
          v_overflow_count, v_sample_val;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'gateway'
      ) THEN
        ALTER TABLE public.payments RENAME COLUMN provider TO gateway;
        ALTER TABLE public.payments ALTER COLUMN gateway SET DATA TYPE varchar(50);
        ALTER TABLE public.payments ALTER COLUMN gateway DROP NOT NULL;
        ALTER TABLE public.payments ALTER COLUMN gateway SET DEFAULT 'paypal';
      END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 7. Drop Currency Constraint and Column on payments
-- Currency constraint on payments is dropped.
-- Note: invoices.currency is pre-existing and remains completely untouched.
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_currency_check;

ALTER TABLE public.payments
  DROP COLUMN IF EXISTS currency;

-- ----------------------------------------------------------------------------
-- 8. Clean Up Newly Added Operational & Idempotency Columns on payments
-- CAUTION: Dropping these newly added columns permanently discards values recorded
-- in them since migration application (create_request_id, capture_request_id,
-- failure_reason, captured_at, updated_at).
-- PRE-EXISTING COLUMNS (id, invoice_id, amount, status, gateway,
-- paypal_order_id, paypal_capture_id, created_at) ARE NEVER DROPPED.
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments
  DROP COLUMN IF EXISTS create_request_id,
  DROP COLUMN IF EXISTS capture_request_id,
  DROP COLUMN IF EXISTS failure_reason,
  DROP COLUMN IF EXISTS captured_at,
  DROP COLUMN IF EXISTS updated_at;
