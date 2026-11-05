-- ============================================================================
-- PayPilot AI — Phase 7B Isolated Database Validation Test Suite
-- Database: PostgreSQL 17 (Isolated Test Instance on Port 54329)
-- Target: Complete validation of Phase 7B migration, RPCs, RLS, and security
-- ============================================================================

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- STEP 0: Reset Test Database Environment
-- ----------------------------------------------------------------------------
DROP DATABASE IF EXISTS paypilot_isolated_test;
CREATE DATABASE paypilot_isolated_test;

\c paypilot_isolated_test

-- ----------------------------------------------------------------------------
-- STEP 1: Emulate Supabase Infrastructure (Roles, Auth Schema, and auth.uid())
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
    END IF;
END
$$;

-- Create auth schema and users table
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Mock auth.uid() function simulating Supabase JWT context
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON TABLE auth.users TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- STEP 2: Seed Pre-Migration Base Schema (As Audited in Phase 7A / DATABASE_SCHEMA_REPORT.md)
-- ----------------------------------------------------------------------------
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name varchar(100),
    email varchar(255),
    business_name varchar(200),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_name varchar(200) NOT NULL,
    customer_email varchar(255),
    description text NOT NULL CHECK (char_length(description) <= 1000),
    amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 9999999999.99),
    currency varchar(3) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR','GBP','CAD','AUD','INR')),
    due_date date,
    status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING','PAID','OVERDUE','CANCELLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    status varchar(50) NOT NULL DEFAULT 'pending',
    gateway varchar(50) DEFAULT 'paypal',
    paypal_order_id varchar(100) UNIQUE,
    paypal_capture_id varchar(100) UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Base RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own invoices" ON public.invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own invoices" ON public.invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own invoices" ON public.invoices FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own draft invoices" ON public.invoices FOR DELETE USING (auth.uid() = user_id AND status = 'DRAFT');

CREATE POLICY "Users can view payments for own invoices" ON public.payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = payments.invoice_id AND invoices.user_id = auth.uid())
);

-- Grant standard Supabase table privileges on invoices and profiles
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- STEP 3: Insert Historical Seed Data Prior to Migration
-- ----------------------------------------------------------------------------
-- Test Users
INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'merchant_alice@example.com'),
    ('22222222-2222-2222-2222-222222222222', 'merchant_bob@example.com');

INSERT INTO public.profiles (id, name, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Alice Freelancer', 'merchant_alice@example.com'),
    ('22222222-2222-2222-2222-222222222222', 'Bob Consultant', 'merchant_bob@example.com');

-- Existing Invoices
INSERT INTO public.invoices (id, user_id, customer_name, customer_email, description, amount, currency, status) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Client Alpha', 'alpha@corp.com', 'Web Development', 500.00, 'USD', 'PENDING'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Client Beta', 'beta@corp.com', 'Brand Identity', 1200.50, 'USD', 'OVERDUE'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Client Gamma', 'gamma@corp.com', 'Draft Proposal', 300.00, 'USD', 'DRAFT'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Client Delta', 'delta@corp.com', 'Historical Paid Project', 750.00, 'USD', 'PAID'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 'Bob Client', 'bobsclient@corp.com', 'Marketing Review', 450.00, 'EUR', 'PENDING'),
    ('12121212-1212-1212-1212-121212121212', '22222222-2222-2222-2222-222222222222', 'Euro Corp', 'euro@corp.de', 'EU Consultation', 890.00, 'EUR', 'PAID'),
    ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'India Client', 'india@corp.in', 'India Consultation', 25000.00, 'INR', 'PENDING'),
    ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'UK Client', 'uk@corp.co.uk', 'London Consulting', 1500.00, 'GBP', 'PENDING');

-- Existing Historical Payments (Testing lowercase status, currency backfill for multiple currencies, and gateway rename)
INSERT INTO public.payments (id, invoice_id, amount, status, gateway, paypal_order_id, paypal_capture_id) VALUES
    ('99999999-9999-9999-9999-999999999991', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 750.00, 'completed', 'paypal', 'ORDER-HISTORICAL-1', 'CAPTURE-HISTORICAL-1'),
    ('99999999-9999-9999-9999-999999999992', '12121212-1212-1212-1212-121212121212', 890.00, 'completed', 'paypal', 'ORDER-HISTORICAL-EUR', 'CAPTURE-HISTORICAL-EUR');

-- Pre-migration counts
SELECT count(*) AS pre_migration_invoices_count FROM public.invoices;
SELECT count(*) AS pre_migration_payments_count FROM public.payments;
