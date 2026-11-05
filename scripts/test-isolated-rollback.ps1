# ============================================================================
# PayPilot AI — Phase 7B Isolated Database Rollback Test Runner
# Engine: PostgreSQL 17 (Isolated Test Instance on Port 54329)
# ============================================================================

$ErrorActionPreference = "Continue"

$workspaceRoot = "D:\Projects\PayPilot-AI"
$testDir = Join-Path $env:TEMP "paypilot_isolated_pg"
$logFile = Join-Path $env:TEMP "paypilot_isolated_pg.log"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$pgctl = "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe"
$port = 54329

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Starting Isolated PostgreSQL 17 Instance for Rollback Validation..." -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$pidFile = Join-Path $testDir "postmaster.pid"
if (Test-Path $pidFile) {
    & $pgctl -D $testDir -m immediate stop
    Start-Sleep -Seconds 1
}

& $pgctl -D $testDir -o "-p $port" -l $logFile start
Start-Sleep -Seconds 2

try {
    Write-Host "`n[STEP 1] Re-seeding and applying migration..." -ForegroundColor Yellow
    $initSql = Join-Path $workspaceRoot "scripts\isolated-migration-test-init.sql"
    & $psql -h 127.0.0.1 -p $port -U postgres -v ON_ERROR_STOP=1 -f $initSql

    $migrationSql = Join-Path $workspaceRoot "supabase\migrations\20261105000000_phase7b_payment_migration.sql"
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $migrationSql

    $rollbackSql = Join-Path $workspaceRoot "supabase\migrations\20261105000000_phase7b_payment_migration_rollback.sql"

    # Test 1: Verify Historical COMPLETED payment retains NULL create_request_id and NULL captured_at
    Write-Host "`n[TEST 1] Verifying historical payment timestamp and request ID integrity..." -ForegroundColor Yellow
    $histCheckSql = @"
    DO `$do`$
    DECLARE
        v_hist_pay public.payments%ROWTYPE;
    BEGIN
        SELECT * INTO v_hist_pay FROM public.payments WHERE id = '99999999-9999-9999-9999-999999999991';
        ASSERT v_hist_pay.create_request_id IS NULL, 'FAIL: Historical payment received non-null create_request_id';
        ASSERT v_hist_pay.captured_at IS NULL, 'FAIL: Historical payment captured_at was fabricated';
        ASSERT v_hist_pay.status = 'COMPLETED', 'FAIL: Historical payment status not COMPLETED';
    END
    `$do`$;
"@
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -c $histCheckSql
    if ($LASTEXITCODE -ne 0) { throw "Test 1 failed" }
    Write-Host "  -> [PASS 1] Historical payments retain NULL create_request_id and NULL captured_at." -ForegroundColor Green

    # Test 2: Newly reserved payment with create_request_id blocks rollback
    Write-Host "`n[TEST 2] Testing Safety Gate: Newly reserved payment blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.payments (id, invoice_id, amount, currency, status, provider, create_request_id) VALUES ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500.00, 'USD', 'CREATED', 'paypal', gen_random_uuid());"
    $out2 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out2 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 2" }
    Write-Host "  -> [PASS 2] Newly reserved payment blocked rollback." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.payments WHERE id = 'aaaaaaaa-1111-0000-0000-000000000002';"

    # Test 3: New payment with a PayPal order ID blocks rollback
    Write-Host "`n[TEST 3] Testing Safety Gate: New payment with PayPal order ID blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.payments (id, invoice_id, amount, currency, status, provider, create_request_id, paypal_order_id) VALUES ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500.00, 'USD', 'ORDER_CREATED', 'paypal', gen_random_uuid(), 'ORDER-TEST-GATE-3');"
    $out3 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out3 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 3" }
    Write-Host "  -> [PASS 3] New payment with PayPal order ID blocked rollback." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.payments WHERE id = 'aaaaaaaa-1111-0000-0000-000000000003';"

    # Test 4: New payment with capture metadata blocks rollback
    Write-Host "`n[TEST 4] Testing Safety Gate: New payment with capture metadata blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.payments (id, invoice_id, amount, currency, status, provider, create_request_id, capture_request_id) VALUES ('aaaaaaaa-1111-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500.00, 'USD', 'CAPTURING', 'paypal', gen_random_uuid(), gen_random_uuid());"
    $out4 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out4 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 4" }
    Write-Host "  -> [PASS 4] New payment with capture metadata blocked rollback." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.payments WHERE id = 'aaaaaaaa-1111-0000-0000-000000000004';"

    # Test 5: New COMPLETED payment blocks rollback (even when captured_at is NULL)
    Write-Host "`n[TEST 5] Testing Safety Gate: New COMPLETED payment blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.payments (id, invoice_id, amount, currency, status, provider, create_request_id, captured_at) VALUES ('aaaaaaaa-1111-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500.00, 'USD', 'COMPLETED', 'paypal', gen_random_uuid(), NULL);"
    $out5 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out5 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 5" }
    Write-Host "  -> [PASS 5] New COMPLETED payment blocked rollback (even with NULL captured_at)." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.payments WHERE id = 'aaaaaaaa-1111-0000-0000-000000000005';"

    # Test 6: New FAILED payment blocks rollback
    Write-Host "`n[TEST 6] Testing Safety Gate: New FAILED payment blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.payments (id, invoice_id, amount, currency, status, provider, create_request_id, failure_reason) VALUES ('aaaaaaaa-1111-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500.00, 'USD', 'FAILED', 'paypal', gen_random_uuid(), 'INSTRUMENT_DECLINED');"
    $out6 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out6 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 6" }
    Write-Host "  -> [PASS 6] New FAILED payment blocked rollback." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.payments WHERE id = 'aaaaaaaa-1111-0000-0000-000000000006';"

    # Test 7: New DENIED payment blocks rollback
    Write-Host "`n[TEST 7] Testing Safety Gate: New DENIED payment blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.payments (id, invoice_id, amount, currency, status, provider, create_request_id) VALUES ('aaaaaaaa-1111-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500.00, 'USD', 'DENIED', 'paypal', gen_random_uuid());"
    $out7 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out7 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 7" }
    Write-Host "  -> [PASS 7] New DENIED payment blocked rollback." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.payments WHERE id = 'aaaaaaaa-1111-0000-0000-000000000007';"

    # Test 8: New CANCELLED payment blocks rollback
    Write-Host "`n[TEST 8] Testing Safety Gate: New CANCELLED payment blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.payments (id, invoice_id, amount, currency, status, provider, create_request_id) VALUES ('aaaaaaaa-1111-0000-0000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500.00, 'USD', 'CANCELLED', 'paypal', gen_random_uuid());"
    $out8 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out8 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 8" }
    Write-Host "  -> [PASS 8] New CANCELLED payment blocked rollback." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.payments WHERE id = 'aaaaaaaa-1111-0000-0000-000000000008';"

    # Test 9: New payment link blocks rollback
    Write-Host "`n[TEST 9] Testing Safety Gate: New payment link blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.invoice_payment_links (invoice_id, token_hash, expires_at) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '9999999999999999999999999999999999999999999999999999999999990009', now() + interval '7 days');"
    $out9 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out9 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 9" }
    Write-Host "  -> [PASS 9] New payment link blocked rollback." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.invoice_payment_links WHERE token_hash = '9999999999999999999999999999999999999999999999999999999999990009';"

    # Test 10: New webhook event blocks rollback
    Write-Host "`n[TEST 10] Testing Safety Gate: New webhook event blocks rollback..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "INSERT INTO public.webhook_events (event_id, event_type, resource_type, resource_id, payload) VALUES ('EVT-TEST-10', 'PAYMENT.CAPTURE.COMPLETED', 'capture', 'CAP-10', '{}'::jsonb);"
    $out10 = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql 2>&1 | Out-String
    if ($out10 -notmatch "ROLLBACK ABORTED BY SAFETY GATE") { throw "Safety Gate failed for Test 10" }
    Write-Host "  -> [PASS 10] New webhook event blocked rollback." -ForegroundColor Green
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "DELETE FROM public.webhook_events WHERE event_id = 'EVT-TEST-10';"

    # Test 11: Clean pre-activation state permits rollback
    Write-Host "`n[TEST 11] Executing Clean Rollback on Pre-Activation Database State..." -ForegroundColor Yellow
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $rollbackSql
    if ($LASTEXITCODE -ne 0) { throw "Test 11 failed with exit code $LASTEXITCODE" }
    Write-Host "  -> [PASS 11] Clean pre-activation rollback executed cleanly." -ForegroundColor Green

    # Test 12: Rollback preserves every pre-existing payment and invoice record
    Write-Host "`n[TEST 12] Verifying Post-Rollback Data Preservation & Schema Restoration..." -ForegroundColor Yellow
    $verifySql = @"
    DO `$do`$
    DECLARE
        v_inv_count integer;
        v_pay_count integer;
    BEGIN
        -- 1. Check data preservation
        SELECT count(*) INTO v_inv_count FROM public.invoices;
        ASSERT v_inv_count = 8, 'FAIL: Expected 8 invoices post-rollback, found ' || v_inv_count;

        SELECT count(*) INTO v_pay_count FROM public.payments;
        ASSERT v_pay_count = 2, 'FAIL: Expected 2 payments post-rollback, found ' || v_pay_count;

        -- 2. Verify pre-existing columns intact and provider reverted to gateway
        ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'gateway'), 'FAIL: pre-existing gateway column was not restored';
        ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'provider'), 'FAIL: provider column still exists';
        ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'paypal_order_id'), 'FAIL: pre-existing paypal_order_id was dropped';
        ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'paypal_capture_id'), 'FAIL: pre-existing paypal_capture_id was dropped';

        -- 3. Verify newly created tables are dropped
        ASSERT NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_payment_links'), 'FAIL: table invoice_payment_links still exists';
        ASSERT NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webhook_events'), 'FAIL: table webhook_events still exists';
        ASSERT NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limits'), 'FAIL: table rate_limits still exists';

        -- 4. Verify newly created functions are dropped
        ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reserve_payment_attempt'), 'FAIL: function reserve_payment_attempt still exists';
        ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reserve_payment_capture'), 'FAIL: function reserve_payment_capture still exists';
        ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'settle_invoice_payment'), 'FAIL: function settle_invoice_payment still exists';
        ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_or_regenerate_payment_link'), 'FAIL: function create_or_regenerate_payment_link still exists';
        ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_rate_limit'), 'FAIL: function check_rate_limit still exists';
        ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_expired_rate_limits'), 'FAIL: function cleanup_expired_rate_limits still exists';

        RAISE NOTICE 'ROLLBACK VERIFICATION PASS: Pre-existing gateway and PayPal columns preserved, all new objects dropped, existing invoices/payments preserved.';
    END
    `$do`$;
"@
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -c $verifySql
    if ($LASTEXITCODE -ne 0) { throw "Rollback verification failed with code $LASTEXITCODE" }
    Write-Host "[STEP 3 SUCCESS] Post-rollback state confirmed." -ForegroundColor Green

} finally {
    Write-Host "`nShutting down isolated PostgreSQL 17 test server..." -ForegroundColor Cyan
    & $pgctl -D $testDir -m immediate stop
    Write-Host "Isolated test server stopped." -ForegroundColor Green
}
