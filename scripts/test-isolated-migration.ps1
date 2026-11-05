# ============================================================================
# PayPilot AI — Phase 7B Isolated Database Migration & Concurrency Test Runner
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
Write-Host "Starting Isolated PostgreSQL 17 Instance on Port $port..." -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# Ensure previous server stopped cleanly if PID file exists
$pidFile = Join-Path $testDir "postmaster.pid"
if (Test-Path $pidFile) {
    & $pgctl -D $testDir -m immediate stop
    Start-Sleep -Seconds 1
}

# Start isolated cluster
& $pgctl -D $testDir -o "-p $port" -l $logFile start
Start-Sleep -Seconds 2

try {
    Write-Host "`n[STEP 1] Initializing Base Pre-Migration Schema & Seed Data..." -ForegroundColor Yellow
    $initSql = Join-Path $workspaceRoot "scripts\isolated-migration-test-init.sql"
    & $psql -h 127.0.0.1 -p $port -U postgres -f $initSql
    if ($LASTEXITCODE -ne 0) { throw "Base schema initialization failed with code $LASTEXITCODE" }
    Write-Host "[STEP 1 SUCCESS] Base schema seeded." -ForegroundColor Green

    Write-Host "`n[STEP 2] Applying Migration: 20261105000000_phase7b_payment_migration.sql..." -ForegroundColor Yellow
    $migrationSql = Join-Path $workspaceRoot "supabase\migrations\20261105000000_phase7b_payment_migration.sql"
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $migrationSql
    if ($LASTEXITCODE -ne 0) { throw "Migration execution failed with code $LASTEXITCODE" }
    Write-Host "[STEP 2 SUCCESS] Migration applied cleanly." -ForegroundColor Green

    Write-Host "`n[STEP 3] Running Automated Functional & Security Test Suite..." -ForegroundColor Yellow
    $runnerSql = Join-Path $workspaceRoot "scripts\isolated-migration-test-runner.sql"
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $runnerSql
    if ($LASTEXITCODE -ne 0) { throw "Automated test suite failed with code $LASTEXITCODE" }
    Write-Host "[STEP 3 SUCCESS] Functional, security, and rate limit tests passed." -ForegroundColor Green

    Write-Host "`n[STEP 3.5] Running Migration & Rollback Abort Guard Tests..." -ForegroundColor Yellow
    $guardsSql = Join-Path $workspaceRoot "scripts\test-migration-abort-guards.sql"
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -v ON_ERROR_STOP=1 -f $guardsSql
    if ($LASTEXITCODE -ne 0) { throw "Abort guard test suite failed with code $LASTEXITCODE" }
    Write-Host "[STEP 3.5 SUCCESS] All 5 abort guards verified." -ForegroundColor Green

    Write-Host "`n[STEP 4] Running Concurrency & Race-Condition Tests..." -ForegroundColor Yellow
    
    # Setup test invoice for concurrency tests
    $setupSql = @"
    INSERT INTO public.invoices (id, user_id, customer_name, customer_email, description, amount, currency, status)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', 'Concurrent Corp', 'conc@corp.com', 'Concurrency Benchmark', 990.00, 'USD', 'PENDING')
    ON CONFLICT (id) DO NOTHING;
"@
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c $setupSql

    # Concurrency Test A: 5 Concurrent Payment Attempt Reservations
    Write-Host "  -> Concurrency Test A: 5 Concurrent reserve_payment_attempt requests..." -ForegroundColor Cyan
    $jobs = @()
    1..5 | ForEach-Object {
        $jobs += Start-Job -ScriptBlock {
            param($psqlPath, $p)
            & $psqlPath -h 127.0.0.1 -p $p -U postgres -d paypilot_isolated_test -t -A -c "SELECT public.reserve_payment_attempt('ffffffff-ffff-ffff-ffff-ffffffffffff');"
        } -ArgumentList $psql, $port
    }

    $resultsA = $jobs | ForEach-Object { Wait-Job $_ | Receive-Job }
    $jobs | Remove-Job

    Write-Host "     Results from 5 concurrent reservation attempts:" -ForegroundColor Gray
    $resultsA | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }

    # Verify exactly 1 payment record created for this invoice
    $countA = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -t -A -c "SELECT count(*) FROM public.payments WHERE invoice_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';"
    $countA = $countA.Trim()
    if ($countA -ne "1") {
        throw "CONCURRENCY FAILURE: Expected 1 payment attempt record, found $countA"
    }
    Write-Host "  -> [PASS] Concurrent reservation produced exactly 1 payment record. Idempotency verified." -ForegroundColor Green

    # Prepare for Concurrency Test B: Update payment to ORDER_CREATED with PayPal order ID
    $concPayId = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -t -A -c "SELECT id FROM public.payments WHERE invoice_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';"
    $concPayId = $concPayId.Trim()
    & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -c "UPDATE public.payments SET status = 'ORDER_CREATED', paypal_order_id = 'ORDER-CONC-123' WHERE id = '$concPayId';"

    # Concurrency Test B: 5 Concurrent Capture Reservations
    Write-Host "  -> Concurrency Test B: 5 Concurrent reserve_payment_capture requests..." -ForegroundColor Cyan
    $jobs = @()
    1..5 | ForEach-Object {
        $jobs += Start-Job -ScriptBlock {
            param($psqlPath, $p, $payId)
            & $psqlPath -h 127.0.0.1 -p $p -U postgres -d paypilot_isolated_test -t -A -c "SELECT public.reserve_payment_capture('$payId', 'ORDER-CONC-123');"
        } -ArgumentList $psql, $port, $concPayId
    }

    $resultsB = $jobs | ForEach-Object { Wait-Job $_ | Receive-Job }
    $jobs | Remove-Job

    Write-Host "     Results from 5 concurrent capture attempts:" -ForegroundColor Gray
    $resultsB | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }

    # Parse capture_request_ids
    $captureIds = $resultsB | ForEach-Object {
        if ($_ -match '"capture_request_id":\s*"([^"]+)"') { $matches[1] }
    } | Select-Object -Unique

    if ($captureIds.Count -ne 1) {
        throw "CONCURRENCY FAILURE: Multiple different capture_request_ids generated: $($captureIds -join ', ')"
    }
    Write-Host "  -> [PASS] All 5 concurrent captures returned identical capture_request_id: $($captureIds[0])" -ForegroundColor Green

    # Concurrency Test C: 5 Concurrent Payment Link Regenerations
    Write-Host "  -> Concurrency Test C: 5 Concurrent create_or_regenerate_payment_link requests..." -ForegroundColor Cyan
    $jobs = @()
    1..5 | ForEach-Object {
        $tokenHash = "hash_conc_" + [System.Guid]::NewGuid().ToString()
        $jobs += Start-Job -ScriptBlock {
            param($psqlPath, $p, $tHash)
            & $psqlPath -h 127.0.0.1 -p $p -U postgres -d paypilot_isolated_test -t -A -c "SELECT public.create_or_regenerate_payment_link('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', '$tHash', now() + interval '7 days');"
        } -ArgumentList $psql, $port, $tokenHash
    }

    $resultsC = $jobs | ForEach-Object { Wait-Job $_ | Receive-Job }
    $jobs | Remove-Job

    Write-Host "     Results from 5 concurrent link generations:" -ForegroundColor Gray
    $resultsC | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }

    # Verify that exactly ONE active link remains
    $activeLinksCount = & $psql -h 127.0.0.1 -p $port -U postgres -d paypilot_isolated_test -t -A -c "SELECT count(*) FROM public.invoice_payment_links WHERE invoice_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' AND revoked_at IS NULL;"
    $activeLinksCount = $activeLinksCount.Trim()
    if ($activeLinksCount -ne "1") {
        throw "CONCURRENCY FAILURE: Expected 1 active payment link, found $activeLinksCount"
    }
    Write-Host "  -> [PASS] Exactly 1 non-revoked active payment link remains. Partial unique constraint intact." -ForegroundColor Green

    Write-Host "`n================================================================================" -ForegroundColor Green
    Write-Host "ALL 7 ISOLATED TEST SUITES + 3 CONCURRENCY SUITES PASSED WITH ZERO ERRORS!" -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Green

} finally {
    Write-Host "`nShutting down isolated PostgreSQL 17 test server..." -ForegroundColor Cyan
    & $pgctl -D $testDir -m immediate stop
    Write-Host "Isolated test server stopped." -ForegroundColor Green
}
