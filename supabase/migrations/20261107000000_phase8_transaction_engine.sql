-- ============================================================================
-- PayPilot AI — Phase 8 Database Migration: Transaction Engine & PayPal Sandbox
-- Target: Supabase PostgreSQL (Postgres 15+ / Standard Edition)
-- Version: 20261107000000_phase8_transaction_engine.sql
-- Description: Extends payments table with transaction engine fields, creates
--              payment_refunds, paypal_webhook_events, payment_audit_logs,
--              updates status constraints for complete payment state machine,
--              configures RLS and access permissions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend public.payments Table
-- ----------------------------------------------------------------------------

-- 1.1 Allow payments to exist independently of invoices (optional invoice_id)
ALTER TABLE public.payments ALTER COLUMN invoice_id DROP NOT NULL;

-- 1.2 Add Transaction Engine & Metadata Columns
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS internal_transaction_id text,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_fee numeric(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS payer_email text,
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'Payment',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'PayPal Sandbox';

-- Backfill total_amount for historical records where NULL
UPDATE public.payments
SET total_amount = amount + COALESCE(transaction_fee, 0.00)
WHERE total_amount IS NULL;

-- Backfill user_id from associated invoice if present
UPDATE public.payments p
SET user_id = i.user_id
FROM public.invoices i
WHERE p.invoice_id = i.id
  AND p.user_id IS NULL;

-- Unique constraint on internal_transaction_id (nullable for legacy records)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'payments' AND indexdef LIKE '%(internal_transaction_id)%'
  ) THEN
    CREATE UNIQUE INDEX idx_payments_internal_transaction_id_unique
      ON public.payments (internal_transaction_id)
      WHERE internal_transaction_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments (user_id);

-- 1.3 Update Payment State Machine Status Constraint
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check CHECK (
    status IN (
      'INITIATED',         -- Transaction initiated in PayPilot; internal ref assigned
      'PENDING',           -- Async hold or awaiting checkout initialization
      'CREATED',           -- Attempt reserved in database
      'ORDER_CREATED',     -- PayPal Orders v2 resource created; orderId attached
      'APPROVED',          -- Buyer approved payment in PayPal modal
      'PROCESSING',        -- Server-side capture in-flight
      'CAPTURING',         -- Capture lock active (Phase 7 compatibility)
      'COMPLETED',         -- Funds verified and captured; terminal success
      'FAILED',            -- Gateway or verification failure
      'DENIED',            -- Gateway rejected payment instrument
      'CANCELLED',         -- Buyer cancelled PayPal checkout
      'REFUND_PENDING',    -- Refund request submitted and in-flight
      'PARTIALLY_REFUNDED',-- Partial settlement amount refunded
      'REFUNDED'           -- Full settlement reversed
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Create public.payment_refunds Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_refunds (
    id                  uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id          uuid                     NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    paypal_refund_id    text                     NOT NULL UNIQUE,
    refund_amount       numeric(12,2)            NOT NULL CHECK (refund_amount > 0),
    currency            text                     NOT NULL,
    refund_reason       text                     NULL,
    refund_status       text                     NOT NULL DEFAULT 'COMPLETED',
    initiated_by        uuid                     NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          timestamp with time zone NOT NULL DEFAULT now(),
    updated_at          timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON public.payment_refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_paypal_refund_id ON public.payment_refunds (paypal_refund_id);

-- ----------------------------------------------------------------------------
-- 3. Create public.paypal_webhook_events Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
    id                      uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
    paypal_event_id         text                     NOT NULL UNIQUE,
    event_type              text                     NOT NULL,
    resource_type           text                     NULL,
    resource_id             text                     NULL,
    related_order_id        text                     NULL,
    related_capture_id      text                     NULL,
    payload                 jsonb                    NOT NULL,
    verification_status     text                     NOT NULL DEFAULT 'PENDING',
    processing_status       text                     NOT NULL DEFAULT 'RECEIVED',
    error_message           text                     NULL,
    received_at             timestamp with time zone NOT NULL DEFAULT now(),
    processed_at            timestamp with time zone NULL
);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_order_id ON public.paypal_webhook_events (related_order_id);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_capture_id ON public.paypal_webhook_events (related_capture_id);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_event_type ON public.paypal_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_processing_status ON public.paypal_webhook_events (processing_status);

-- ----------------------------------------------------------------------------
-- 4. Create public.payment_audit_logs Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
    id                  uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id          uuid                     NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    user_id             uuid                     NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type          text                     NOT NULL,
    details             jsonb                    NULL,
    ip_address          text                     NULL,
    created_at          timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_payment_id ON public.payment_audit_logs (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_user_id ON public.payment_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_event_type ON public.payment_audit_logs (event_type);

-- ----------------------------------------------------------------------------
-- 5. Row Level Security & Access Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 Payments RLS: Allow users to view their own payments (direct or invoice-linked)
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view payments for their own invoices" ON public.payments;
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payments.invoice_id
      AND invoices.user_id = auth.uid()
    ))
  );

-- 5.2 Payment Refunds RLS: Users can view refunds for payments they own
DROP POLICY IF EXISTS "Users can view refunds for own payments" ON public.payment_refunds;
CREATE POLICY "Users can view refunds for own payments"
  ON public.payment_refunds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payments
      WHERE payments.id = payment_refunds.payment_id
      AND (
        payments.user_id = auth.uid() OR
        (payments.invoice_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.invoices
          WHERE invoices.id = payments.invoice_id
          AND invoices.user_id = auth.uid()
        ))
      )
    )
  );

-- 5.3 Webhook Events: Deny direct client access
DROP POLICY IF EXISTS "Deny all client access to paypal_webhook_events" ON public.paypal_webhook_events;
CREATE POLICY "Deny all client access to paypal_webhook_events"
  ON public.paypal_webhook_events FOR ALL TO authenticated, anon
  USING (false);

-- 5.4 Payment Audit Logs: Users can view audit logs for their own payments
DROP POLICY IF EXISTS "Users can view audit logs for own payments" ON public.payment_audit_logs;
CREATE POLICY "Users can view audit logs for own payments"
  ON public.payment_audit_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    (payment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.payments
      WHERE payments.id = payment_audit_logs.payment_id
      AND payments.user_id = auth.uid()
    ))
  );

-- ----------------------------------------------------------------------------
-- 6. Engine Privileges & Service Role Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.payment_refunds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.paypal_webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payment_audit_logs FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.payment_refunds TO authenticated;
GRANT SELECT ON TABLE public.payment_audit_logs TO authenticated;

GRANT ALL ON TABLE public.payments TO service_role;
GRANT ALL ON TABLE public.payment_refunds TO service_role;
GRANT ALL ON TABLE public.paypal_webhook_events TO service_role;
GRANT ALL ON TABLE public.payment_audit_logs TO service_role;
