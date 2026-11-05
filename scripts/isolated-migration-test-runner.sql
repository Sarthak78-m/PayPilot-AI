-- ============================================================================
-- PayPilot AI — Phase 7B Automated Verification Test Suite
-- Database: PostgreSQL 17 (Isolated Test Instance on Port 54329)
-- ============================================================================

\set ON_ERROR_STOP on
\c paypilot_isolated_test

-- ----------------------------------------------------------------------------
-- TEST SUITE 1: Migration Verification & Data Preservation
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_inv_count integer;
    v_pay_count integer;
    v_hist_pay_usd public.payments%ROWTYPE;
    v_hist_pay_eur public.payments%ROWTYPE;
BEGIN
    RAISE NOTICE '=== SUITE 1: Migration Verification & Data Preservation ===';

    -- 1. Verify invoice count preserved
    SELECT count(*) INTO v_inv_count FROM public.invoices;
    ASSERT v_inv_count = 8, 'FAIL: Expected 8 invoices, found ' || v_inv_count;

    -- 2. Verify payments count preserved
    SELECT count(*) INTO v_pay_count FROM public.payments;
    ASSERT v_pay_count = 2, 'FAIL: Expected 2 payments, found ' || v_pay_count;

    -- 3. Verify historical payment status normalized to uppercase COMPLETED
    SELECT * INTO v_hist_pay_usd FROM public.payments WHERE id = '99999999-9999-9999-9999-999999999991';
    ASSERT v_hist_pay_usd.status = 'COMPLETED', 'FAIL: Historical payment status not normalized to COMPLETED: ' || v_hist_pay_usd.status;
    ASSERT v_hist_pay_usd.provider = 'paypal', 'FAIL: Historical payment provider default failed';
    ASSERT v_hist_pay_usd.currency = 'USD', 'FAIL: Historical payment currency backfill failed for USD';

    -- 4. Verify historical EUR payment correctly backfilled to EUR (not blindly stamped with USD!)
    SELECT * INTO v_hist_pay_eur FROM public.payments WHERE id = '99999999-9999-9999-9999-999999999992';
    ASSERT v_hist_pay_eur.status = 'COMPLETED', 'FAIL: EUR payment status not normalized to COMPLETED';
    ASSERT v_hist_pay_eur.provider = 'paypal', 'FAIL: EUR payment provider mismatch';
    ASSERT v_hist_pay_eur.currency = 'EUR', 'FAIL: EUR payment was incorrectly stamped with USD instead of EUR: ' || v_hist_pay_eur.currency;

    -- 4b. Verify historical payments retain captured_at = NULL (not fabricated with created_at) and create_request_id = NULL
    ASSERT v_hist_pay_usd.captured_at IS NULL, 'FAIL: Historical USD payment captured_at was falsely backfilled';
    ASSERT v_hist_pay_eur.captured_at IS NULL, 'FAIL: Historical EUR payment captured_at was falsely backfilled';
    ASSERT v_hist_pay_usd.create_request_id IS NULL, 'FAIL: Historical USD payment received non-null create_request_id';
    ASSERT v_hist_pay_eur.create_request_id IS NULL, 'FAIL: Historical EUR payment received non-null create_request_id';

    -- 5. Verify single canonical provider column (gateway removed, provider retained)
    ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'gateway'), 'FAIL: competing gateway column still exists';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'provider'), 'FAIL: canonical provider column missing';

    -- 6. Verify all expected tables exist
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_payment_links'), 'FAIL: table invoice_payment_links missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webhook_events'), 'FAIL: table webhook_events missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limits'), 'FAIL: table rate_limits missing';

    -- 7. Verify all expected operational and idempotency columns on payments exist
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'create_request_id'), 'FAIL: column create_request_id missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'capture_request_id'), 'FAIL: column capture_request_id missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'provider'), 'FAIL: column provider missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'paypal_order_id'), 'FAIL: column paypal_order_id missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'paypal_capture_id'), 'FAIL: column paypal_capture_id missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'currency'), 'FAIL: column currency missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'captured_at'), 'FAIL: column captured_at missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'failure_reason'), 'FAIL: column failure_reason missing';
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'updated_at'), 'FAIL: column updated_at missing';

    -- 8. Verify unique and partial indexes exist
    ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payments_single_completed_per_invoice'), 'FAIL: idx_payments_single_completed_per_invoice missing';
    ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payments_single_active_attempt'), 'FAIL: idx_payments_single_active_attempt missing';
    ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payment_links_single_active'), 'FAIL: idx_payment_links_single_active missing';
    ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payment_links_token_hash_unique'), 'FAIL: idx_payment_links_token_hash_unique missing';
    ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payments_create_request_id_unique'), 'FAIL: idx_payments_create_request_id_unique missing';
    ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payments_capture_request_id_unique'), 'FAIL: idx_payments_capture_request_id_unique missing';

    RAISE NOTICE 'SUITE 1 PASS: All objects, columns, indexes, canonical provider, and multi-currency records verified.';
END
$$;

-- ----------------------------------------------------------------------------
-- TEST SUITE 2: Payment Reservation Tests (reserve_payment_attempt)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_res1 jsonb;
    v_res2 jsonb;
    v_res_paid jsonb;
    v_res_draft jsonb;
    v_payment_id uuid;
    v_req_id uuid;
    v_pay_record public.payments%ROWTYPE;
BEGIN
    RAISE NOTICE '=== SUITE 2: Payment Reservation Tests ===';

    -- Test 2.1: New payment attempt created for pending invoice
    v_res1 := public.reserve_payment_attempt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    ASSERT (v_res1->>'success')::boolean = true, 'FAIL 2.1: Success was false';
    ASSERT (v_res1->>'is_new')::boolean = true, 'FAIL 2.1: is_new was false';
    ASSERT (v_res1->>'status') = 'CREATED', 'FAIL 2.1: status was not CREATED';
    ASSERT (v_res1->>'amount')::numeric = 500.00, 'FAIL 2.1: amount mismatch';
    ASSERT (v_res1->>'currency') = 'USD', 'FAIL 2.1: currency mismatch';
    v_payment_id := (v_res1->>'payment_id')::uuid;
    v_req_id := (v_res1->>'create_request_id')::uuid;
    ASSERT v_req_id IS NOT NULL, 'FAIL 2.1: create_request_id is null';

    -- Verify capture_request_id is NOT prematurely generated during payment creation
    SELECT * INTO v_pay_record FROM public.payments WHERE id = v_payment_id;
    ASSERT v_pay_record.capture_request_id IS NULL, 'FAIL 2.1: capture_request_id was prematurely generated on payment creation';

    -- Test 2.2: Repeated reservation returns existing active attempt (Idempotency)
    v_res2 := public.reserve_payment_attempt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    ASSERT (v_res2->>'success')::boolean = true, 'FAIL 2.2: Success was false';
    ASSERT (v_res2->>'is_new')::boolean = false, 'FAIL 2.2: is_new was true on retry';
    ASSERT (v_res2->>'payment_id')::uuid = v_payment_id, 'FAIL 2.2: payment_id changed';
    ASSERT (v_res2->>'create_request_id')::uuid = v_req_id, 'FAIL 2.2: create_request_id changed';

    -- Test 2.3: Paid invoice rejects new payment attempt
    v_res_paid := public.reserve_payment_attempt('dddddddd-dddd-dddd-dddd-dddddddddddd');
    ASSERT (v_res_paid->>'success')::boolean = false, 'FAIL 2.3: Succeeded on paid invoice';
    ASSERT (v_res_paid->>'code') = 'INVOICE_ALREADY_PAID', 'FAIL 2.3: Wrong error code: ' || (v_res_paid->>'code');

    -- Test 2.4: Draft invoice rejects payment attempt
    v_res_draft := public.reserve_payment_attempt('cccccccc-cccc-cccc-cccc-cccccccccccc');
    ASSERT (v_res_draft->>'success')::boolean = false, 'FAIL 2.4: Succeeded on draft invoice';
    ASSERT (v_res_draft->>'code') = 'INVALID_INVOICE_STATUS', 'FAIL 2.4: Wrong error code: ' || (v_res_draft->>'code');

    -- Test 2.5: EUR invoice produces EUR payment (currency derived from invoice, no USD default)
    DECLARE
        v_res_eur jsonb;
        v_pay_eur public.payments%ROWTYPE;
    BEGIN
        v_res_eur := public.reserve_payment_attempt('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
        ASSERT (v_res_eur->>'success')::boolean = true, 'FAIL 2.5: EUR payment reservation failed';
        ASSERT (v_res_eur->>'currency') = 'EUR', 'FAIL 2.5: Currency was not EUR: ' || (v_res_eur->>'currency');
        SELECT * INTO v_pay_eur FROM public.payments WHERE id = (v_res_eur->>'payment_id')::uuid;
        ASSERT v_pay_eur.currency = 'EUR', 'FAIL 2.5: Stored payment currency was not EUR';
        DELETE FROM public.payments WHERE id = (v_res_eur->>'payment_id')::uuid;
    END;

    -- Test 2.6: INR invoice produces INR payment
    DECLARE
        v_res_inr jsonb;
        v_pay_inr public.payments%ROWTYPE;
    BEGIN
        v_res_inr := public.reserve_payment_attempt('33333333-3333-3333-3333-333333333333');
        ASSERT (v_res_inr->>'success')::boolean = true, 'FAIL 2.6: INR payment reservation failed';
        ASSERT (v_res_inr->>'currency') = 'INR', 'FAIL 2.6: Currency was not INR: ' || (v_res_inr->>'currency');
        SELECT * INTO v_pay_inr FROM public.payments WHERE id = (v_res_inr->>'payment_id')::uuid;
        ASSERT v_pay_inr.currency = 'INR', 'FAIL 2.6: Stored payment currency was not INR';
        DELETE FROM public.payments WHERE id = (v_res_inr->>'payment_id')::uuid;
    END;

    -- Test 2.7: GBP invoice produces GBP payment
    DECLARE
        v_res_gbp jsonb;
        v_pay_gbp public.payments%ROWTYPE;
    BEGIN
        v_res_gbp := public.reserve_payment_attempt('44444444-4444-4444-4444-444444444444');
        ASSERT (v_res_gbp->>'success')::boolean = true, 'FAIL 2.7: GBP payment reservation failed';
        ASSERT (v_res_gbp->>'currency') = 'GBP', 'FAIL 2.7: Currency was not GBP: ' || (v_res_gbp->>'currency');
        SELECT * INTO v_pay_gbp FROM public.payments WHERE id = (v_res_gbp->>'payment_id')::uuid;
        ASSERT v_pay_gbp.currency = 'GBP', 'FAIL 2.7: Stored payment currency was not GBP';
        DELETE FROM public.payments WHERE id = (v_res_gbp->>'payment_id')::uuid;
    END;

    -- Test 2.8: Unsupported currency invoice fails safely
    DECLARE
        v_res_bad jsonb;
    BEGIN
        ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_currency_check;
        INSERT INTO public.invoices (id, user_id, customer_name, customer_email, description, amount, currency, status)
        VALUES ('98989898-9898-9898-9898-989898989898', '11111111-1111-1111-1111-111111111111', 'JPY Client', 'jpy@corp.jp', 'Tokyo Ops', 50000, 'JPY', 'PENDING');
        
        v_res_bad := public.reserve_payment_attempt('98989898-9898-9898-9898-989898989898');
        ASSERT (v_res_bad->>'success')::boolean = false, 'FAIL 2.8: Succeeded on unsupported JPY currency';
        ASSERT (v_res_bad->>'code') = 'UNSUPPORTED_INVOICE_CURRENCY', 'FAIL 2.8: Code was ' || (v_res_bad->>'code');
        
        DELETE FROM public.invoices WHERE id = '98989898-9898-9898-9898-989898989898';
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_currency_check CHECK (currency IN ('USD','EUR','GBP','CAD','AUD','INR'));
    END;

    RAISE NOTICE 'SUITE 2 PASS: Payment reservation logic verified.';
END
$$;

-- ----------------------------------------------------------------------------
-- TEST SUITE 3: Capture Reservation Tests (reserve_payment_capture)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_payment_id uuid;
    v_cap1 jsonb;
    v_cap2 jsonb;
    v_cap_order_mismatch jsonb;
    v_cap_req_id uuid;
    v_pending_pay_id uuid;
    v_pending_res jsonb;
    v_failed_pay_id uuid;
    v_failed_res jsonb;
BEGIN
    RAISE NOTICE '=== SUITE 3: Capture Reservation Tests ===';

    SELECT id INTO v_payment_id FROM public.payments WHERE invoice_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    -- Simulate server updating payment to ORDER_CREATED with paypal_order_id
    UPDATE public.payments 
    SET status = 'ORDER_CREATED', paypal_order_id = 'ORDER-ALICE-1001'
    WHERE id = v_payment_id;

    -- Test 3.1: Order ID mismatch is rejected
    v_cap_order_mismatch := public.reserve_payment_capture(v_payment_id, 'ORDER-WRONG-999');
    ASSERT (v_cap_order_mismatch->>'success')::boolean = false, 'FAIL 3.1: Order mismatch succeeded';
    ASSERT (v_cap_order_mismatch->>'code') = 'ORDER_ID_MISMATCH', 'FAIL 3.1: Code was ' || (v_cap_order_mismatch->>'code');

    -- Test 3.2: First capture reservation generates stable capture_request_id and status CAPTURING
    v_cap1 := public.reserve_payment_capture(v_payment_id, 'ORDER-ALICE-1001');
    ASSERT (v_cap1->>'success')::boolean = true, 'FAIL 3.2: Capture reservation failed';
    ASSERT (v_cap1->>'already_completed')::boolean = false, 'FAIL 3.2: Marked already completed';
    ASSERT (v_cap1->>'is_pending_clearance')::boolean = false, 'FAIL 3.2: Marked pending clearance';
    v_cap_req_id := (v_cap1->>'capture_request_id')::uuid;
    ASSERT v_cap_req_id IS NOT NULL, 'FAIL 3.2: capture_request_id was null';

    -- Verify capture_request_id is stored on payment attempt
    SELECT capture_request_id INTO v_cap_req_id FROM public.payments WHERE id = v_payment_id;
    ASSERT v_cap_req_id IS NOT NULL, 'FAIL 3.2: capture_request_id not stored in payments table';

    -- Test 3.3: Repeated capture reservation reuses same capture_request_id
    v_cap2 := public.reserve_payment_capture(v_payment_id, 'ORDER-ALICE-1001');
    ASSERT (v_cap2->>'success')::boolean = true, 'FAIL 3.3: Repeated capture failed';
    ASSERT (v_cap2->>'capture_request_id')::uuid = v_cap_req_id, 'FAIL 3.3: capture_request_id changed';

    -- Test 3.4: PENDING attempt returns pending clearance hold without calling capture again
    INSERT INTO public.payments (invoice_id, amount, currency, status, provider, paypal_order_id, paypal_capture_id)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1200.50, 'USD', 'PENDING', 'paypal', 'ORDER-PENDING-HOLD', 'CAPTURE-PENDING-HOLD')
    RETURNING id INTO v_pending_pay_id;

    v_pending_res := public.reserve_payment_capture(v_pending_pay_id, 'ORDER-PENDING-HOLD');
    ASSERT (v_pending_res->>'success')::boolean = true, 'FAIL 3.4: Pending check failed';
    ASSERT (v_pending_res->>'is_pending_clearance')::boolean = true, 'FAIL 3.4: is_pending_clearance false';
    ASSERT (v_pending_res->>'code') = 'CAPTURE_PENDING_GATEWAY_CLEARANCE', 'FAIL 3.4: Code mismatch: ' || (v_pending_res->>'code');

    -- Test 3.5: Terminal state rejects capture
    INSERT INTO public.payments (invoice_id, amount, currency, status, provider, paypal_order_id)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 450.00, 'EUR', 'FAILED', 'paypal', 'ORDER-FAILED-1')
    RETURNING id INTO v_failed_pay_id;

    v_failed_res := public.reserve_payment_capture(v_failed_pay_id, 'ORDER-FAILED-1');
    ASSERT (v_failed_res->>'success')::boolean = false, 'FAIL 3.5: Failed attempt allowed capture';
    ASSERT (v_failed_res->>'code') = 'TERMINAL_PAYMENT_STATE', 'FAIL 3.5: Code mismatch: ' || (v_failed_res->>'code');

    RAISE NOTICE 'SUITE 3 PASS: Capture reservation logic verified.';
END
$$;

-- ----------------------------------------------------------------------------
-- TEST SUITE 4: Settlement Tests (settle_invoice_payment)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_payment_id uuid;
    v_inv_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_verified_time timestamptz := pg_catalog.clock_timestamp() - interval '1 minute';
    v_settle_res jsonb;
    v_settle_idem jsonb;
    v_err_order jsonb;
    v_err_provider jsonb;
    v_err_amount jsonb;
    v_err_curr jsonb;
    v_err_time jsonb;
    v_err_conflict jsonb;
    v_err_non_capturing jsonb;
    v_non_cap_pay_id uuid;
    v_inv_record public.invoices%ROWTYPE;
    v_pay_record public.payments%ROWTYPE;
BEGIN
    RAISE NOTICE '=== SUITE 4: Settlement Tests ===';

    SELECT id INTO v_payment_id FROM public.payments WHERE invoice_id = v_inv_id AND status = 'CAPTURING';

    -- Test 4.1: Reject order mismatch
    v_err_order := public.settle_invoice_payment(v_payment_id, 'ORDER-WRONG', 'CAPTURE-ALICE-1', 500.00, 'USD', v_verified_time, 'paypal');
    ASSERT (v_err_order->>'success')::boolean = false, 'FAIL 4.1: Wrong order allowed';
    ASSERT (v_err_order->>'code') = 'ORDER_ID_MISMATCH', 'FAIL 4.1: Code was ' || (v_err_order->>'code');

    -- Test 4.2: Reject provider mismatch
    v_err_provider := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-1', 500.00, 'USD', v_verified_time, 'stripe');
    ASSERT (v_err_provider->>'success')::boolean = false, 'FAIL 4.2: Wrong provider allowed';
    ASSERT (v_err_provider->>'code') = 'PROVIDER_MISMATCH', 'FAIL 4.2: Code was ' || (v_err_provider->>'code');

    -- Test 4.3: Reject amount tampering / mismatch
    v_err_amount := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-1', 499.00, 'USD', v_verified_time, 'paypal');
    ASSERT (v_err_amount->>'success')::boolean = false, 'FAIL 4.3: Amount mismatch allowed';
    ASSERT (v_err_amount->>'code') = 'AMOUNT_MISMATCH', 'FAIL 4.3: Code was ' || (v_err_amount->>'code');

    -- Test 4.4: Reject currency mismatch
    v_err_curr := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-1', 500.00, 'EUR', v_verified_time, 'paypal');
    ASSERT (v_err_curr->>'success')::boolean = false, 'FAIL 4.4: Currency mismatch allowed';
    ASSERT (v_err_curr->>'code') = 'CURRENCY_MISMATCH', 'FAIL 4.4: Code was ' || (v_err_curr->>'code');

    -- Test 4.4b: Reject null captured_at timestamp
    v_err_time := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-1', 500.00, 'USD', NULL, 'paypal');
    ASSERT (v_err_time->>'success')::boolean = false, 'FAIL 4.4b: Null captured_at allowed';
    ASSERT (v_err_time->>'code') = 'INVALID_CAPTURED_AT', 'FAIL 4.4b: Code was ' || (v_err_time->>'code');

    -- Test 4.4c: Reject future captured_at timestamp
    v_err_time := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-1', 500.00, 'USD', pg_catalog.clock_timestamp() + interval '1 hour', 'paypal');
    ASSERT (v_err_time->>'success')::boolean = false, 'FAIL 4.4c: Future captured_at allowed';
    ASSERT (v_err_time->>'code') = 'INVALID_CAPTURED_AT', 'FAIL 4.4c: Code was ' || (v_err_time->>'code');

    -- Test 4.5: Reject direct settlement from non-capturing/non-pending (e.g. ORDER_CREATED)
    INSERT INTO public.payments (invoice_id, amount, currency, status, provider, paypal_order_id)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 450.00, 'EUR', 'ORDER_CREATED', 'paypal', 'ORDER-BOB-EARLY')
    RETURNING id INTO v_non_cap_pay_id;

    v_err_non_capturing := public.settle_invoice_payment(v_non_cap_pay_id, 'ORDER-BOB-EARLY', 'CAPTURE-BOB-EARLY', 450.00, 'EUR', v_verified_time, 'paypal');
    ASSERT (v_err_non_capturing->>'success')::boolean = false, 'FAIL 4.5: Succeeded settlement from ORDER_CREATED';
    ASSERT (v_err_non_capturing->>'code') = 'INVALID_PAYMENT_STATUS', 'FAIL 4.5: Code was ' || (v_err_non_capturing->>'code');

    -- Test 4.6: Reject duplicate capture ID associated with another payment
    v_err_conflict := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-HISTORICAL-1', 500.00, 'USD', v_verified_time, 'paypal');
    ASSERT (v_err_conflict->>'success')::boolean = false, 'FAIL 4.6: Duplicate capture ID allowed';
    ASSERT (v_err_conflict->>'code') = 'CAPTURE_ALREADY_ASSOCIATED', 'FAIL 4.6: Code was ' || (v_err_conflict->>'code');

    -- Prepare active payment link to verify atomic revocation upon settlement
    INSERT INTO public.invoice_payment_links (invoice_id, token_hash, expires_at)
    VALUES (v_inv_id, 'hash_alice_valid_settle', now() + interval '7 days');

    -- Test 4.7: Valid settlement commits atomically and persists verified PayPal capture timestamp
    v_settle_res := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-VALID-1', 500.00, 'USD', v_verified_time, 'paypal');
    ASSERT (v_settle_res->>'success')::boolean = true, 'FAIL 4.7: Valid settlement failed: ' || (v_settle_res->>'message');
    ASSERT (v_settle_res->>'already_settled')::boolean = false, 'FAIL 4.7: Wrong already_settled flag';
    ASSERT (v_settle_res->>'capture_id') = 'CAPTURE-ALICE-VALID-1', 'FAIL 4.7: Wrong capture id in receipt';
    ASSERT (v_settle_res->>'captured_at')::timestamptz = v_verified_time, 'FAIL 4.7: Receipt captured_at mismatch';

    -- Verify atomic database state
    SELECT * INTO v_pay_record FROM public.payments WHERE id = v_payment_id;
    ASSERT v_pay_record.status = 'COMPLETED', 'FAIL 4.7: Payment status not COMPLETED';
    ASSERT v_pay_record.paypal_capture_id = 'CAPTURE-ALICE-VALID-1', 'FAIL 4.7: Payment capture ID not stored';
    ASSERT v_pay_record.captured_at = v_verified_time, 'FAIL 4.7: Payment captured_at timestamp did not match verified PayPal timestamp';
    ASSERT v_pay_record.create_request_id IS NOT NULL, 'FAIL 4.7: create_request_id missing on completed payment';
    ASSERT v_pay_record.capture_request_id IS NOT NULL, 'FAIL 4.7: capture_request_id missing on completed payment';

    SELECT * INTO v_inv_record FROM public.invoices WHERE id = v_inv_id;
    ASSERT v_inv_record.status = 'PAID', 'FAIL 4.7: Invoice status not PAID';

    -- Verify that active payment link for settled invoice was atomically revoked
    ASSERT EXISTS (
        SELECT 1 FROM public.invoice_payment_links
        WHERE invoice_id = v_inv_id AND token_hash = 'hash_alice_valid_settle' AND revoked_at IS NOT NULL
    ), 'FAIL 4.7: Active payment link was not revoked atomically upon settlement';

    ASSERT NOT EXISTS (
        SELECT 1 FROM public.invoice_payment_links
        WHERE invoice_id = v_inv_id AND revoked_at IS NULL
    ), 'FAIL 4.7: Found remaining un-revoked payment link for settled invoice';

    -- Clean up test link
    DELETE FROM public.invoice_payment_links WHERE invoice_id = v_inv_id;

    -- Test 4.8: Repeated identical settlement returns existing receipt (Idempotent success)
    v_settle_idem := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-VALID-1', 500.00, 'USD', v_verified_time, 'paypal');
    ASSERT (v_settle_idem->>'success')::boolean = true, 'FAIL 4.8: Idempotent settlement failed';
    ASSERT (v_settle_idem->>'already_settled')::boolean = true, 'FAIL 4.8: already_settled was not true';
    ASSERT (v_settle_idem->>'captured_at')::timestamptz = v_verified_time, 'FAIL 4.8: Idempotent captured_at mismatch';

    SELECT * INTO v_pay_record FROM public.payments WHERE id = v_payment_id;
    ASSERT v_pay_record.captured_at = v_verified_time, 'FAIL 4.8: Repeated settlement altered original captured_at';

    -- Test 4.9: Conflicting capture ID on settled payment is rejected
    v_err_conflict := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-CONFLICT', 500.00, 'USD', v_verified_time, 'paypal');
    ASSERT (v_err_conflict->>'success')::boolean = false, 'FAIL 4.9: Allowed conflicting capture ID';
    ASSERT (v_err_conflict->>'code') = 'CONFLICTING_CAPTURE_ID', 'FAIL 4.9: Code was ' || (v_err_conflict->>'code');

    -- Test 4.10: Conflicting capture timestamp on settled payment is rejected
    v_err_time := public.settle_invoice_payment(v_payment_id, 'ORDER-ALICE-1001', 'CAPTURE-ALICE-VALID-1', 500.00, 'USD', v_verified_time - interval '10 minutes', 'paypal');
    ASSERT (v_err_time->>'success')::boolean = false, 'FAIL 4.10: Conflicting capture timestamp allowed on settled payment';
    ASSERT (v_err_time->>'code') = 'CONFLICTING_CAPTURED_AT', 'FAIL 4.10: Code was ' || (v_err_time->>'code');

    -- Verify stored timestamp was NOT changed by the conflicting attempt
    SELECT * INTO v_pay_record FROM public.payments WHERE id = v_payment_id;
    ASSERT v_pay_record.captured_at = v_verified_time, 'FAIL 4.10: Conflicting settlement attempt overwritten stored captured_at';

    RAISE NOTICE 'SUITE 4 PASS: Settle invoice payment logic verified.';
END
$$;

-- ----------------------------------------------------------------------------
-- TEST SUITE 5: Payment Link Tests (create_or_regenerate_payment_link)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_alice uuid := '11111111-1111-1111-1111-111111111111';
    v_user_bob uuid   := '22222222-2222-2222-2222-222222222222';
    v_draft_inv uuid  := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    v_overdue_inv uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_link1 jsonb;
    v_link2 jsonb;
    v_link1_id uuid;
    v_link2_id uuid;
    v_draft_reject jsonb;
    v_draft_transition jsonb;
    v_unauth jsonb;
    v_excess_expiry jsonb;
    v_active_links_count integer;
    v_old_link public.invoice_payment_links%ROWTYPE;
BEGIN
    RAISE NOTICE '=== SUITE 5: Payment Link Tests ===';

    -- Test 5.1: Non-owner cannot create payment link (Merchant Ownership validation rejects another user)
    v_unauth := public.create_or_regenerate_payment_link(v_overdue_inv, v_user_bob, 'hash_token_unauth', now() + interval '7 days');
    ASSERT (v_unauth->>'success')::boolean = false, 'FAIL 5.1: Unauthorized user created link';
    ASSERT (v_unauth->>'code') = 'FORBIDDEN', 'FAIL 5.1: Code was ' || (v_unauth->>'code');

    -- Test 5.1b: Non-existent invoice returns INVOICE_NOT_FOUND
    DECLARE
        v_notfound jsonb;
    BEGIN
        v_notfound := public.create_or_regenerate_payment_link('00000000-0000-0000-0000-000000000000', v_user_alice, 'hash_token_404', now() + interval '7 days');
        ASSERT (v_notfound->>'success')::boolean = false, 'FAIL 5.1b: Allowed non-existent invoice';
        ASSERT (v_notfound->>'code') = 'INVOICE_NOT_FOUND', 'FAIL 5.1b: Code was ' || (v_notfound->>'code');
    END;

    -- Test 5.2: Expiration exceeding 30 days is rejected
    v_excess_expiry := public.create_or_regenerate_payment_link(v_overdue_inv, v_user_alice, 'hash_token_long', now() + interval '31 days');
    ASSERT (v_excess_expiry->>'success')::boolean = false, 'FAIL 5.2: 31-day expiry allowed';
    ASSERT (v_excess_expiry->>'code') = 'EXPIRATION_EXCEEDS_MAXIMUM', 'FAIL 5.2: Code was ' || (v_excess_expiry->>'code');

    -- Test 5.3: Draft invoice without transition flag is rejected
    v_draft_reject := public.create_or_regenerate_payment_link(v_draft_inv, v_user_alice, 'hash_token_draft_1', now() + interval '7 days', false);
    ASSERT (v_draft_reject->>'success')::boolean = false, 'FAIL 5.3: Draft allowed without transition flag';
    ASSERT (v_draft_reject->>'code') = 'DRAFT_INVOICE_NOT_ISSUED', 'FAIL 5.3: Code was ' || (v_draft_reject->>'code');

    -- Test 5.4: Draft invoice with transition flag atomically transitions to PENDING and generates link
    v_draft_transition := public.create_or_regenerate_payment_link(v_draft_inv, v_user_alice, 'hash_token_draft_2', now() + interval '7 days', true);
    ASSERT (v_draft_transition->>'success')::boolean = true, 'FAIL 5.4: Draft transition failed';
    ASSERT (v_draft_transition->>'invoice_status') = 'PENDING', 'FAIL 5.4: Invoice status not PENDING';

    -- Test 5.5: Create link for overdue invoice
    v_link1 := public.create_or_regenerate_payment_link(v_overdue_inv, v_user_alice, 'hash_initial_link', now() + interval '7 days');
    ASSERT (v_link1->>'success')::boolean = true, 'FAIL 5.5: Link creation failed';
    v_link1_id := (v_link1->>'link_id')::uuid;

    -- Test 5.6: Regenerate link atomically revokes previous link
    v_link2 := public.create_or_regenerate_payment_link(v_overdue_inv, v_user_alice, 'hash_regenerated_link', now() + interval '14 days');
    ASSERT (v_link2->>'success')::boolean = true, 'FAIL 5.6: Regeneration failed';
    v_link2_id := (v_link2->>'link_id')::uuid;
    ASSERT v_link2_id <> v_link1_id, 'FAIL 5.6: Link ID did not change on regeneration';

    -- Check that previous link is revoked
    SELECT * INTO v_old_link FROM public.invoice_payment_links WHERE id = v_link1_id;
    ASSERT v_old_link.revoked_at IS NOT NULL, 'FAIL 5.6: Previous link was not revoked';

    -- Verify that exactly ONE active link exists for this invoice
    SELECT count(*) INTO v_active_links_count FROM public.invoice_payment_links WHERE invoice_id = v_overdue_inv AND revoked_at IS NULL;
    ASSERT v_active_links_count = 1, 'FAIL 5.6: Expected exactly 1 active link, found ' || v_active_links_count;

    -- Test 5.7: Regenerate link after previous link has expired
    DECLARE
        v_exp_inv uuid := '44444444-4444-4444-4444-444444444444'; -- UK Client PENDING invoice
        v_exp_link_id uuid;
        v_new_link_id uuid;
        v_exp_row public.invoice_payment_links%ROWTYPE;
        v_usable_count integer;
        v_paid_res jsonb;
    BEGIN
        -- Manually insert an expired link (created 2 days ago, expired 1 day ago, unrevoked)
        INSERT INTO public.invoice_payment_links (invoice_id, token_hash, created_at, expires_at, revoked_at)
        VALUES (v_exp_inv, 'hash_expired_unrevoked', now() - interval '2 days', now() - interval '1 day', NULL)
        RETURNING id INTO v_exp_link_id;

        -- Verify that this unrevoked expired link is NOT usable for public checkout
        SELECT count(*) INTO v_usable_count
        FROM public.invoice_payment_links l
        JOIN public.invoices i ON l.invoice_id = i.id
        WHERE l.token_hash = 'hash_expired_unrevoked'
          AND l.revoked_at IS NULL
          AND l.expires_at > pg_catalog.now()
          AND i.status IN ('PENDING', 'OVERDUE');
        ASSERT v_usable_count = 0, 'FAIL 5.7: Expired unrevoked link was deemed usable for checkout!';

        -- Regenerate link for this invoice
        v_link1 := public.create_or_regenerate_payment_link(v_exp_inv, v_user_alice, 'hash_replacement_after_expiry', now() + interval '7 days');
        ASSERT (v_link1->>'success')::boolean = true, 'FAIL 5.7: Failed to regenerate link after previous link expired: ' || (v_link1->>'message');
        v_new_link_id := (v_link1->>'link_id')::uuid;

        -- Verify previous expired link is now explicitly revoked
        SELECT * INTO v_exp_row FROM public.invoice_payment_links WHERE id = v_exp_link_id;
        ASSERT v_exp_row.revoked_at IS NOT NULL, 'FAIL 5.7: Expired link was not marked revoked upon regeneration';

        -- Verify audit trail preserved (both rows still exist)
        ASSERT EXISTS (SELECT 1 FROM public.invoice_payment_links WHERE id = v_exp_link_id), 'FAIL 5.7: Expired link audit history deleted';
        ASSERT EXISTS (SELECT 1 FROM public.invoice_payment_links WHERE id = v_new_link_id), 'FAIL 5.7: Replacement link missing';

        -- Verify exactly ONE unrevoked link remains for this invoice
        SELECT count(*) INTO v_active_links_count FROM public.invoice_payment_links WHERE invoice_id = v_exp_inv AND revoked_at IS NULL;
        ASSERT v_active_links_count = 1, 'FAIL 5.7: Expected exactly 1 active link after replacement, found ' || v_active_links_count;

        -- Test 5.8: Rejects regeneration for paid invoice
        v_paid_res := public.create_or_regenerate_payment_link('dddddddd-dddd-dddd-dddd-dddddddddddd', v_user_alice, 'hash_paid_inv', now() + interval '7 days');
        ASSERT (v_paid_res->>'success')::boolean = false, 'FAIL 5.8: Allowed regeneration for PAID invoice';
        ASSERT (v_paid_res->>'code') = 'INVALID_INVOICE_STATUS', 'FAIL 5.8: Code was ' || (v_paid_res->>'code');
        ASSERT (v_paid_res->>'message') LIKE '%PAID%', 'FAIL 5.8: Message did not mention PAID: ' || (v_paid_res->>'message');

        -- Test 5.9: Rejects link generation for CANCELLED invoice
        DECLARE
            v_canc_inv uuid := '55555555-5555-5555-5555-555555555555';
            v_canc_res jsonb;
        BEGIN
            INSERT INTO public.invoices (id, user_id, customer_name, customer_email, description, amount, currency, status)
            VALUES (v_canc_inv, v_user_alice, 'Cancelled Client', 'cancel@corp.com', 'Cancelled Service', 250.00, 'USD', 'CANCELLED');

            v_canc_res := public.create_or_regenerate_payment_link(v_canc_inv, v_user_alice, 'hash_canc_inv', now() + interval '7 days');
            ASSERT (v_canc_res->>'success')::boolean = false, 'FAIL 5.9: Allowed link generation for CANCELLED invoice';
            ASSERT (v_canc_res->>'code') = 'INVALID_INVOICE_STATUS', 'FAIL 5.9: Code was ' || (v_canc_res->>'code');
            ASSERT (v_canc_res->>'message') LIKE '%CANCELLED%', 'FAIL 5.9: Message did not mention CANCELLED: ' || (v_canc_res->>'message');

            DELETE FROM public.invoices WHERE id = v_canc_inv;
        END;

        -- Test 5.10: Atomic rollback of DRAFT transition if payment link insertion encounters an exception
        DECLARE
            v_atomic_draft_inv uuid := '66666666-6666-6666-6666-666666666666';
            v_collision_inv uuid := '33333333-3333-3333-3333-333333333333';
            v_collision_hash text := 'hash_preexisting_collision_for_atomic_test';
            v_err_caught boolean := false;
            v_reverted_status text;
            v_reverted_links integer;
        BEGIN
            -- Seed a temporary DRAFT invoice
            INSERT INTO public.invoices (id, user_id, customer_name, customer_email, description, amount, currency, status)
            VALUES (v_atomic_draft_inv, v_user_alice, 'Atomic Test Client', 'atomic@corp.com', 'Atomic Test Service', 150.00, 'USD', 'DRAFT');

            -- Seed an active link with collision hash on an invoice with no existing links
            INSERT INTO public.invoice_payment_links (invoice_id, token_hash, expires_at)
            VALUES (v_collision_inv, v_collision_hash, now() + interval '7 days');

            -- Attempt transition on DRAFT invoice with colliding token hash (using named parameter p_allow_draft_transition)
            BEGIN
                PERFORM public.create_or_regenerate_payment_link(
                    v_atomic_draft_inv,
                    v_user_alice,
                    v_collision_hash,
                    now() + interval '7 days',
                    p_allow_draft_transition => true
                );
            EXCEPTION
                WHEN unique_violation THEN
                    v_err_caught := true;
            END;

            ASSERT v_err_caught = true, 'FAIL 5.10: Unique violation was not raised on colliding token hash';

            -- Verify invoice status rolled back to DRAFT (not persisted as PENDING)
            SELECT status INTO v_reverted_status FROM public.invoices WHERE id = v_atomic_draft_inv;
            ASSERT v_reverted_status = 'DRAFT', 'FAIL 5.10: Invoice status was not rolled back to DRAFT, got ' || v_reverted_status;

            -- Verify no link was created for the atomic test invoice
            SELECT count(*) INTO v_reverted_links FROM public.invoice_payment_links WHERE invoice_id = v_atomic_draft_inv;
            ASSERT v_reverted_links = 0, 'FAIL 5.10: Payment link was created despite rollback';

            -- Cleanup test fixtures
            DELETE FROM public.invoice_payment_links WHERE token_hash = v_collision_hash;
            DELETE FROM public.invoices WHERE id = v_atomic_draft_inv;
        END;
    END;

    RAISE NOTICE 'SUITE 5 PASS: Payment link management logic verified.';
END
$$;

-- ----------------------------------------------------------------------------
-- TEST SUITE 6: Security, Permissions, and RLS Tests
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_anon_pay_allowed boolean := false;
    v_auth_insert_allowed boolean := false;
    v_auth_link_allowed boolean := false;
    v_auth_rpc_allowed boolean := false;
    v_user_alice uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
    RAISE NOTICE '=== SUITE 6: Security, Permissions, and RLS Tests ===';

    -- Test 6.1: Anonymous user cannot access payments
    SET ROLE anon;
    BEGIN
        PERFORM * FROM public.payments;
        v_anon_pay_allowed := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_anon_pay_allowed := false;
    END;
    RESET ROLE;
    ASSERT v_anon_pay_allowed = false, 'FAIL 6.1: Anon read payments table';

    -- Test 6.2: Authenticated user cannot direct INSERT into payments
    SET ROLE authenticated;
    BEGIN
        INSERT INTO public.payments (invoice_id, amount, status) 
        VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10.00, 'CREATED');
        v_auth_insert_allowed := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_auth_insert_allowed := false;
    END;
    RESET ROLE;
    ASSERT v_auth_insert_allowed = false, 'FAIL 6.2: Authenticated user inserted into payments';

    -- Test 6.3: Authenticated user cannot SELECT or INSERT into invoice_payment_links
    SET ROLE authenticated;
    BEGIN
        PERFORM * FROM public.invoice_payment_links;
        v_auth_link_allowed := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_auth_link_allowed := false;
    END;
    RESET ROLE;
    ASSERT v_auth_link_allowed = false, 'FAIL 6.3: Authenticated user accessed invoice_payment_links';

    -- Test 6.4: Anonymous user cannot execute reserve_payment_attempt RPC
    DECLARE
        v_anon_rpc_allowed boolean := false;
    BEGIN
        SET ROLE anon;
        BEGIN
            PERFORM public.reserve_payment_attempt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
            v_anon_rpc_allowed := true;
        EXCEPTION WHEN insufficient_privilege THEN
            v_anon_rpc_allowed := false;
        END;
        RESET ROLE;
        ASSERT v_anon_rpc_allowed = false, 'FAIL 6.4: Anon user executed reserve_payment_attempt';
    END;

    -- Test 6.5: Authenticated user cannot execute reserve_payment_attempt RPC directly
    SET ROLE authenticated;
    BEGIN
        PERFORM public.reserve_payment_attempt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        v_auth_rpc_allowed := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_auth_rpc_allowed := false;
    END;
    RESET ROLE;
    ASSERT v_auth_rpc_allowed = false, 'FAIL 6.5: Authenticated user executed reserve_payment_attempt';

    -- Test 6.6: Authenticated user cannot execute reserve_payment_capture RPC directly
    DECLARE
        v_auth_cap_allowed boolean := false;
    BEGIN
        SET ROLE authenticated;
        BEGIN
            PERFORM public.reserve_payment_capture('99999999-9999-9999-9999-999999999991'::uuid, 'ORDER-123');
            v_auth_cap_allowed := true;
        EXCEPTION WHEN insufficient_privilege THEN
            v_auth_cap_allowed := false;
        END;
        RESET ROLE;
        ASSERT v_auth_cap_allowed = false, 'FAIL 6.6: Authenticated user executed reserve_payment_capture';
    END;

    -- Test 6.7: Authenticated user cannot execute settle_invoice_payment RPC directly
    DECLARE
        v_auth_settle_allowed boolean := false;
    BEGIN
        SET ROLE authenticated;
        BEGIN
            PERFORM public.settle_invoice_payment('99999999-9999-9999-9999-999999999991'::uuid, 'ORDER-123', 'CAP-123', 750.00, 'USD', now(), 'paypal');
            v_auth_settle_allowed := true;
        EXCEPTION WHEN insufficient_privilege THEN
            v_auth_settle_allowed := false;
        END;
        RESET ROLE;
        ASSERT v_auth_settle_allowed = false, 'FAIL 6.7: Authenticated user executed settle_invoice_payment';
    END;

    -- Test 6.8: Authenticated user cannot execute create_or_regenerate_payment_link RPC directly
    DECLARE
        v_auth_link_rpc_allowed boolean := false;
    BEGIN
        SET ROLE authenticated;
        BEGIN
            PERFORM public.create_or_regenerate_payment_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, v_user_alice, 'hash_test', now() + interval '7 days', false);
            v_auth_link_rpc_allowed := true;
        EXCEPTION WHEN insufficient_privilege THEN
            v_auth_link_rpc_allowed := false;
        END;
        RESET ROLE;
        ASSERT v_auth_link_rpc_allowed = false, 'FAIL 6.8: Authenticated user executed create_or_regenerate_payment_link';
    END;

    -- Test 6.9: Anonymous user cannot execute check_rate_limit
    DECLARE
        v_anon_rl_allowed boolean := false;
    BEGIN
        SET ROLE anon;
        BEGIN
            PERFORM public.check_rate_limit('test_key', 5, 60);
            v_anon_rl_allowed := true;
        EXCEPTION WHEN insufficient_privilege THEN
            v_anon_rl_allowed := false;
        END;
        RESET ROLE;
        ASSERT v_anon_rl_allowed = false, 'FAIL 6.9: Anon user executed check_rate_limit';
    END;

    -- Test 6.10: Authenticated user cannot execute check_rate_limit
    DECLARE
        v_auth_rl_allowed boolean := false;
    BEGIN
        SET ROLE authenticated;
        BEGIN
            PERFORM public.check_rate_limit('test_key', 5, 60);
            v_auth_rl_allowed := true;
        EXCEPTION WHEN insufficient_privilege THEN
            v_auth_rl_allowed := false;
        END;
        RESET ROLE;
        ASSERT v_auth_rl_allowed = false, 'FAIL 6.10: Authenticated user executed check_rate_limit';
    END;

    -- Test 6.11: Anonymous user cannot execute cleanup_expired_rate_limits
    DECLARE
        v_anon_clean_allowed boolean := false;
    BEGIN
        SET ROLE anon;
        BEGIN
            PERFORM public.cleanup_expired_rate_limits(100);
            v_anon_clean_allowed := true;
        EXCEPTION WHEN insufficient_privilege THEN
            v_anon_clean_allowed := false;
        END;
        RESET ROLE;
        ASSERT v_anon_clean_allowed = false, 'FAIL 6.11: Anon user executed cleanup_expired_rate_limits';
    END;

    -- Test 6.12: Authenticated user cannot execute cleanup_expired_rate_limits
    DECLARE
        v_auth_clean_allowed boolean := false;
    BEGIN
        SET ROLE authenticated;
        BEGIN
            PERFORM public.cleanup_expired_rate_limits(100);
            v_auth_clean_allowed := true;
        EXCEPTION WHEN insufficient_privilege THEN
            v_auth_clean_allowed := false;
        END;
        RESET ROLE;
        ASSERT v_auth_clean_allowed = false, 'FAIL 6.12: Authenticated user executed cleanup_expired_rate_limits';
    END;

    -- Test 6.13: Service role can invoke all 6 authorized functions
    DECLARE
        v_sr_pay_res jsonb;
        v_sr_rl_res jsonb;
        v_sr_clean_res integer;
    BEGIN
        SET ROLE service_role;
        v_sr_pay_res := public.reserve_payment_attempt('33333333-3333-3333-3333-333333333333'::uuid);
        ASSERT (v_sr_pay_res->>'success')::boolean = true, 'FAIL 6.13: Service role failed reserve_payment_attempt: ' || (v_sr_pay_res->>'message');
        DELETE FROM public.payments WHERE invoice_id = '33333333-3333-3333-3333-333333333333'::uuid;

        v_sr_rl_res := public.check_rate_limit('service_role_test_key', 10, 60);
        ASSERT (v_sr_rl_res->>'allowed')::boolean = true, 'FAIL 6.13: Service role failed check_rate_limit';

        v_sr_clean_res := public.cleanup_expired_rate_limits(10);
        ASSERT v_sr_clean_res >= 0, 'FAIL 6.13: Service role failed cleanup_expired_rate_limits';
        RESET ROLE;
    END;

    -- Test 6.14: Authenticated user CAN SELECT their own invoice payments via RLS
    SET ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_user_alice::text, true);
    PERFORM * FROM public.payments;
    RESET ROLE;

    RAISE NOTICE 'SUITE 6 PASS: Security, permissions, and RLS verified.';
END
$$;

-- ----------------------------------------------------------------------------
-- TEST SUITE 7: Rate Limiting & TTL Cleanup Tests (check_rate_limit)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_r1 jsonb;
    v_r2 jsonb;
    v_r3 jsonb;
    v_r_other jsonb;
    v_cleaned integer;
    v_ip_key text := 'ip:192.168.1.100';
    v_token_key text := 'token:sha256_mock_hash_value';
BEGIN
    RAISE NOTICE '=== SUITE 7: Rate Limiting Tests ===';

    -- Test 7.1: First 2 requests within limit of 2 per 60 seconds are allowed
    v_r1 := public.check_rate_limit(v_ip_key, 2, 60);
    ASSERT (v_r1->>'allowed')::boolean = true, 'FAIL 7.1: Request 1 denied';
    ASSERT (v_r1->>'current_points')::integer = 1, 'FAIL 7.1: Points was ' || (v_r1->>'current_points');

    v_r2 := public.check_rate_limit(v_ip_key, 2, 60);
    ASSERT (v_r2->>'allowed')::boolean = true, 'FAIL 7.1: Request 2 denied';
    ASSERT (v_r2->>'current_points')::integer = 2, 'FAIL 7.1: Points was ' || (v_r2->>'current_points');

    -- Test 7.2: 3rd request exceeds limit and is denied with retry_after
    v_r3 := public.check_rate_limit(v_ip_key, 2, 60);
    ASSERT (v_r3->>'allowed')::boolean = false, 'FAIL 7.2: Request 3 allowed beyond limit';
    ASSERT (v_r3->>'retry_after')::numeric > 0, 'FAIL 7.2: retry_after missing or zero';

    -- Test 7.3: Independent key is isolated and allowed
    v_r_other := public.check_rate_limit(v_token_key, 2, 60);
    ASSERT (v_r_other->>'allowed')::boolean = true, 'FAIL 7.3: Independent key was limited';

    -- Test 7.4: Scheduled TTL batch cleanup function
    -- Manually insert an expired key
    INSERT INTO public.rate_limits (key, points, expire_at)
    VALUES ('expired_key_test', 5, now() - interval '10 seconds');

    v_cleaned := public.cleanup_expired_rate_limits(100);
    ASSERT v_cleaned >= 1, 'FAIL 7.4: cleanup_expired_rate_limits returned ' || v_cleaned;
    ASSERT NOT EXISTS (SELECT 1 FROM public.rate_limits WHERE key = 'expired_key_test'), 'FAIL 7.4: Expired key was not removed';

    RAISE NOTICE 'SUITE 7 PASS: Rate limiting and cleanup verified.';
END
$$;
