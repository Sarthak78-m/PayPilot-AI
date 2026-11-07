-- ============================================================================
-- PayPilot AI — Phase 8 Rollback Migration
-- Target: Supabase PostgreSQL (Postgres 15+ / Standard Edition)
-- Version: 20261107000000_phase8_transaction_engine_rollback.sql
-- Description: Reverts Phase 8 schema changes back to Phase 7B state safely.
-- ============================================================================

DROP TABLE IF EXISTS public.payment_audit_logs CASCADE;
DROP TABLE IF EXISTS public.paypal_webhook_events CASCADE;
DROP TABLE IF EXISTS public.payment_refunds CASCADE;

DROP INDEX IF EXISTS public.idx_payments_internal_transaction_id_unique;
DROP INDEX IF EXISTS public.idx_payments_user_id;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check CHECK (
    status IN (
      'CREATED',
      'ORDER_CREATED',
      'APPROVED',
      'CAPTURING',
      'PENDING',
      'COMPLETED',
      'FAILED',
      'DENIED',
      'CANCELLED',
      'REFUNDED'
    )
  );

ALTER TABLE public.payments
  DROP COLUMN IF EXISTS internal_transaction_id,
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS transaction_fee,
  DROP COLUMN IF EXISTS total_amount,
  DROP COLUMN IF EXISTS payer_email,
  DROP COLUMN IF EXISTS payer_name,
  DROP COLUMN IF EXISTS recipient_email,
  DROP COLUMN IF EXISTS recipient_name,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS payment_method;

-- Restore Phase 7B RLS policy
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view payments for their own invoices"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payments.invoice_id
      AND invoices.user_id = auth.uid()
    )
  );
