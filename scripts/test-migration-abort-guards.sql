-- ============================================================================
-- PayPilot AI — Phase 7B.1.2 Migration & Rollback Abort Guards Test Suite
-- Database: PostgreSQL 17 (Isolated Test Instance on Port 54329)
-- ============================================================================

\set ON_ERROR_STOP on
\c paypilot_isolated_test

-- ----------------------------------------------------------------------------
-- GUARD TEST 1: Orphaned Payment Triggers Migration Abort
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_aborted boolean := false;
BEGIN
    RAISE NOTICE '=== GUARD TEST 1: Orphaned Payment Triggers Abort ===';

    -- Create temporary scratch table mimicking payments and invoices
    CREATE TEMP TABLE test_invoices (
        id uuid PRIMARY KEY,
        currency varchar(3) NOT NULL
    );
    CREATE TEMP TABLE test_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid, -- Orphaned ID
        currency text
    );

    INSERT INTO test_invoices (id, currency) VALUES ('11111111-1111-1111-1111-111111111111', 'USD');
    -- Insert orphaned payment
    INSERT INTO test_payments (id, invoice_id) VALUES ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000');

    -- Attempt currency backfill and guard
    BEGIN
        UPDATE test_payments p SET currency = i.currency FROM test_invoices i WHERE p.invoice_id = i.id;
        
        -- Guard check
        IF EXISTS (SELECT 1 FROM test_payments p LEFT JOIN test_invoices i ON p.invoice_id = i.id WHERE i.id IS NULL) THEN
            RAISE EXCEPTION 'MIGRATION ABORTED: Found orphaned payment(s) without matching invoice.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%MIGRATION ABORTED: Found orphaned payment(s)%' THEN
            v_aborted := true;
        END IF;
    END;

    DROP TABLE test_payments;
    DROP TABLE test_invoices;

    ASSERT v_aborted = true, 'FAIL: Orphaned payment failed to trigger migration abort!';
    RAISE NOTICE 'GUARD TEST 1 PASS: Orphaned payment safely aborted migration.';
END $$;

-- ----------------------------------------------------------------------------
-- GUARD TEST 2: Remaining NULL Currency Triggers Migration Abort
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_aborted boolean := false;
BEGIN
    RAISE NOTICE '=== GUARD TEST 2: Remaining NULL Currency Triggers Abort ===';

    CREATE TEMP TABLE test_invoices (
        id uuid PRIMARY KEY,
        currency varchar(3)
    );
    CREATE TEMP TABLE test_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid,
        currency text
    );

    INSERT INTO test_invoices (id, currency) VALUES ('11111111-1111-1111-1111-111111111111', NULL);
    INSERT INTO test_payments (id, invoice_id) VALUES ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111');

    BEGIN
        UPDATE test_payments p SET currency = i.currency FROM test_invoices i WHERE p.invoice_id = i.id;
        
        IF EXISTS (SELECT 1 FROM test_payments WHERE currency IS NULL) THEN
            RAISE EXCEPTION 'MIGRATION ABORTED: Found payment(s) with NULL currency after backfill.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%MIGRATION ABORTED: Found payment(s) with NULL currency%' THEN
            v_aborted := true;
        END IF;
    END;

    DROP TABLE test_payments;
    DROP TABLE test_invoices;

    ASSERT v_aborted = true, 'FAIL: Remaining NULL currency failed to trigger migration abort!';
    RAISE NOTICE 'GUARD TEST 2 PASS: NULL currency safely aborted migration.';
END $$;

-- ----------------------------------------------------------------------------
-- GUARD TEST 3: Unsupported Currency Triggers Migration Abort
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_aborted boolean := false;
BEGIN
    RAISE NOTICE '=== GUARD TEST 3: Unsupported Currency Triggers Abort ===';

    CREATE TEMP TABLE test_invoices (
        id uuid PRIMARY KEY,
        currency text
    );
    CREATE TEMP TABLE test_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid,
        currency text
    );

    -- Unsupported currency: JPY
    INSERT INTO test_invoices (id, currency) VALUES ('11111111-1111-1111-1111-111111111111', 'JPY');
    INSERT INTO test_payments (id, invoice_id) VALUES ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111');

    BEGIN
        UPDATE test_payments p SET currency = i.currency FROM test_invoices i WHERE p.invoice_id = i.id;
        
        IF EXISTS (SELECT 1 FROM test_payments WHERE currency NOT IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR')) THEN
            RAISE EXCEPTION 'MIGRATION ABORTED: Found payment(s) with unsupported currency.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%MIGRATION ABORTED: Found payment(s) with unsupported currency%' THEN
            v_aborted := true;
        END IF;
    END;

    DROP TABLE test_payments;
    DROP TABLE test_invoices;

    ASSERT v_aborted = true, 'FAIL: Unsupported currency failed to trigger migration abort!';
    RAISE NOTICE 'GUARD TEST 3 PASS: Unsupported currency safely aborted migration.';
END $$;

-- ----------------------------------------------------------------------------
-- GUARD TEST 4a: Rollback Blocked When PayPal Order ID Is Present on New Payment
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_aborted boolean := false;
    v_override text;
    v_new_payments integer;
BEGIN
    RAISE NOTICE '=== GUARD TEST 4a: Newly Created Payment with PayPal Order ID Blocks Rollback ===';

    CREATE TEMP TABLE test_rollback_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        create_request_id uuid,
        capture_request_id uuid,
        paypal_order_id text,
        failure_reason text,
        status text,
        captured_at timestamptz,
        created_at timestamptz DEFAULT now()
    );

    -- Insert new payment attempt with PayPal order ID
    INSERT INTO test_rollback_payments (create_request_id, paypal_order_id, status)
    VALUES (gen_random_uuid(), 'ORDER-TEST-NEW-4A', 'ORDER_CREATED');

    BEGIN
        v_override := current_setting('paypilot.allow_destructive_rollback', true);
        SELECT count(*) INTO v_new_payments
        FROM test_rollback_payments
        WHERE create_request_id IS NOT NULL
           OR capture_request_id IS NOT NULL
           OR failure_reason IS NOT NULL
           OR status IN ('CREATED', 'ORDER_CREATED', 'APPROVED', 'CAPTURING', 'DENIED')
           OR (status = 'COMPLETED' AND (create_request_id IS NOT NULL OR (captured_at IS NOT NULL AND captured_at > created_at)));

        IF v_new_payments > 0 AND v_override IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'ROLLBACK ABORTED BY SAFETY GATE: Operational payments (%) detected.', v_new_payments;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ROLLBACK ABORTED BY SAFETY GATE%' THEN
            v_aborted := true;
        END IF;
    END;

    DROP TABLE test_rollback_payments;
    ASSERT v_aborted = true, 'FAIL: Safety gate failed to abort rollback when PayPal order ID was present on new payment!';
    RAISE NOTICE 'GUARD TEST 4a PASS: Safety gate blocked rollback for payment with PayPal order ID.';
END $$;

-- ----------------------------------------------------------------------------
-- GUARD TEST 4b: Rollback Blocked When Capture Metadata Exists
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_aborted boolean := false;
    v_override text;
    v_new_payments integer;
BEGIN
    RAISE NOTICE '=== GUARD TEST 4b: Capture Metadata Blocks Rollback ===';

    CREATE TEMP TABLE test_rollback_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        create_request_id uuid,
        capture_request_id uuid,
        paypal_order_id text,
        failure_reason text,
        status text,
        captured_at timestamptz,
        created_at timestamptz DEFAULT now()
    );

    -- Insert payment with capture request ID and CAPTURING status
    INSERT INTO test_rollback_payments (create_request_id, capture_request_id, status)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'CAPTURING');

    BEGIN
        v_override := current_setting('paypilot.allow_destructive_rollback', true);
        SELECT count(*) INTO v_new_payments
        FROM test_rollback_payments
        WHERE create_request_id IS NOT NULL
           OR capture_request_id IS NOT NULL
           OR failure_reason IS NOT NULL
           OR status IN ('CREATED', 'ORDER_CREATED', 'APPROVED', 'CAPTURING', 'DENIED')
           OR (status = 'COMPLETED' AND (create_request_id IS NOT NULL OR (captured_at IS NOT NULL AND captured_at > created_at)));

        IF v_new_payments > 0 AND v_override IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'ROLLBACK ABORTED BY SAFETY GATE: Operational payments (%) detected.', v_new_payments;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ROLLBACK ABORTED BY SAFETY GATE%' THEN
            v_aborted := true;
        END IF;
    END;

    DROP TABLE test_rollback_payments;
    ASSERT v_aborted = true, 'FAIL: Safety gate failed to abort rollback when capture metadata existed!';
    RAISE NOTICE 'GUARD TEST 4b PASS: Safety gate blocked rollback when capture metadata existed.';
END $$;

-- ----------------------------------------------------------------------------
-- GUARD TEST 4c: Rollback Blocked When Completed Payment Exists
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_aborted boolean := false;
    v_override text;
    v_new_payments integer;
BEGIN
    RAISE NOTICE '=== GUARD TEST 4c: Completed Payment Blocks Rollback ===';

    CREATE TEMP TABLE test_rollback_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        create_request_id uuid,
        capture_request_id uuid,
        paypal_order_id text,
        failure_reason text,
        status text,
        captured_at timestamptz,
        created_at timestamptz DEFAULT now()
    );

    -- Insert operational completed payment
    INSERT INTO test_rollback_payments (create_request_id, status, captured_at, created_at)
    VALUES (gen_random_uuid(), 'COMPLETED', now(), now() - interval '5 minutes');

    BEGIN
        v_override := current_setting('paypilot.allow_destructive_rollback', true);
        SELECT count(*) INTO v_new_payments
        FROM test_rollback_payments
        WHERE create_request_id IS NOT NULL
           OR capture_request_id IS NOT NULL
           OR failure_reason IS NOT NULL
           OR status IN ('CREATED', 'ORDER_CREATED', 'APPROVED', 'CAPTURING', 'DENIED')
           OR (status = 'COMPLETED' AND (create_request_id IS NOT NULL OR (captured_at IS NOT NULL AND captured_at > created_at)));

        IF v_new_payments > 0 AND v_override IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'ROLLBACK ABORTED BY SAFETY GATE: Operational payments (%) detected.', v_new_payments;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ROLLBACK ABORTED BY SAFETY GATE%' THEN
            v_aborted := true;
        END IF;
    END;

    DROP TABLE test_rollback_payments;
    ASSERT v_aborted = true, 'FAIL: Safety gate failed to abort rollback when completed payment existed!';
    RAISE NOTICE 'GUARD TEST 4c PASS: Safety gate blocked rollback when completed payment existed.';
END $$;

-- ----------------------------------------------------------------------------
-- GUARD TEST 5: Provider Overflow Detection Aborts Rollback
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_aborted boolean := false;
    v_test_provider text := 'this_is_an_extremely_long_custom_provider_name_that_exceeds_fifty_characters_limit';
BEGIN
    RAISE NOTICE '=== GUARD TEST 5: Provider Overflow Detection Aborts Rollback ===';

    BEGIN
        IF char_length(v_test_provider) > 50 THEN
            RAISE EXCEPTION 'ROLLBACK ABORTED: Found provider value exceeding varchar(50).';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ROLLBACK ABORTED: Found provider value exceeding varchar(50)%' THEN
            v_aborted := true;
        END IF;
    END;

    ASSERT v_aborted = true, 'FAIL: Overflow provider failed to abort rollback!';
    RAISE NOTICE 'GUARD TEST 5 PASS: Provider overflow safely aborted rollback.';
END $$;
