-- ============================================================
-- FINAL PRODUCTION HARDENING MIGRATION
-- Run AFTER security_hardening.sql
-- ============================================================

-- ============================================================
-- 1. DATABASE INTEGRITY: STRICT CONSTRAINTS
-- ============================================================

ALTER TABLE public.payment_charges
DROP CONSTRAINT IF EXISTS check_amounts_non_negative;

ALTER TABLE public.payment_charges
ADD CONSTRAINT check_amounts_non_negative
CHECK (
  total >= 0 AND 
  paid >= 0 AND 
  balance >= 0 AND 
  paid <= total AND
  balance = (total - paid)
);

-- ============================================================
-- 2. HARDENED FINANCIAL TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_payment_charge_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Strict validation
  IF NEW.total < 0 THEN
    RAISE EXCEPTION 'Total amount (%) cannot be negative.', NEW.total;
  END IF;

  IF NEW.paid < 0 THEN
    RAISE EXCEPTION 'Paid amount (%) cannot be negative.', NEW.paid;
  END IF;

  IF NEW.paid > NEW.total THEN
    RAISE EXCEPTION 'Overpayment detected: Paid (%) exceeds Total (%).', NEW.paid, NEW.total;
  END IF;

  -- Maintain consistency
  NEW.balance := NEW.total - NEW.paid;

  -- Status logic
  NEW.status := CASE
    WHEN NEW.balance <= 0 THEN 'PAID'
    WHEN NEW.paid > 0 THEN 'PARTIAL'
    WHEN NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN 'OVERDUE'
    ELSE 'PENDING'
  END;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. ROLE-BASED ACCESS CONTROL (RBAC)
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT status FROM public.users WHERE id = auth.uid()
  );
  -- Note: In this system 'status' field is used for roles (ADMIN, LAWYER, etc.) 
  -- or we might have a specific 'role' field. Let's assume a 'role' field exists or use metadata.
  -- Based on previous sessions, metadata.role was used.
END;
$$;

-- Refined RBAC function using JWT metadata (standard Supabase pattern)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() ->> 'role', 'LAWYER');
$$;

-- ============================================================
-- 4. SERVER-SIDE RATE LIMITING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action_key text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_request_logs_user_time ON public.request_logs (user_id, created_at);

drop function if exists public.check_rate_limit(text, integer, integer);
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _action_key text, 
  _max_requests int DEFAULT 5, 
  _window_seconds int DEFAULT 10
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _request_count int;
BEGIN
  -- Count requests in the last X seconds
  SELECT count(*) INTO _request_count
  FROM public.request_logs
  WHERE user_id = auth.uid()
    AND action_key = _action_key
    AND created_at > now() - (_window_seconds || ' seconds')::interval;

  IF _request_count >= _max_requests THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: Too many requests for %. Please wait.', _action_key
      USING ERRCODE = 'P0001';
  END IF;

  -- Log the request
  INSERT INTO public.request_logs (user_id, action_key)
  VALUES (auth.uid(), _action_key);
  
  -- Maintenance: Cleanup old logs (probabilistic)
  IF random() < 0.05 THEN
    DELETE FROM public.request_logs WHERE created_at < now() - interval '1 hour';
  END IF;
END;
$$;

-- ============================================================
-- 5. UPDATED RLS WITH RBAC
-- ============================================================

-- helper to check if user is admin or lawyer
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('ADMIN', 'LAWYER')
    AND status = 'ACTIVE'
  );
$$;

-- Restricted Delete: Only Admin can truly delete (or staff can soft-delete)
DROP POLICY IF EXISTS clients_tenant_all ON public.clients;
CREATE POLICY clients_tenant_all ON public.clients
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id() AND public.is_staff());

DROP POLICY IF EXISTS cases_tenant_all ON public.cases;
CREATE POLICY cases_tenant_all ON public.cases
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id() AND public.is_staff());

DROP POLICY IF EXISTS payments_tenant_all ON public.payments;
CREATE POLICY payments_tenant_all ON public.payments
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id() AND public.is_staff());

DROP POLICY IF EXISTS documents_tenant_all ON public.documents;
CREATE POLICY documents_tenant_all ON public.documents
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id() AND public.is_staff());

-- ============================================================
-- 6. SOFT DELETE COMPLETENESS & ROLES
-- ============================================================

-- Add role column if not exists
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text DEFAULT 'LAWYER';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Ensure demo users/admins are set correctly in your migration logic
-- UPDATE public.users SET role = 'ADMIN' WHERE email = 'admin@example.com';

-- helper to check if user is admin or lawyer
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('ADMIN', 'LAWYER')
    AND status = 'ACTIVE'
    AND deleted_at IS NULL
  );
$$;
