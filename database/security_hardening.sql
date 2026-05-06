CREATE OR REPLACE FUNCTION public.require_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _result uuid;
  _user_status text;
  _org_status text;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'SECURITY_ERROR: No authenticated session. Sign in to continue.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT u.organization_id, u.status, o.status
  INTO _result, _user_status, _org_status
  FROM public.users u
  LEFT JOIN public.organizations o ON o.id = u.organization_id
  WHERE u.id = _uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SECURITY_ERROR: User profile not found. Contact your administrator.'
      USING ERRCODE = 'P0001';
  END IF;

  IF _user_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'SECURITY_ERROR: User account is not active (%). Contact your administrator.', COALESCE(_user_status, 'UNKNOWN')
      USING ERRCODE = 'P0001';
  END IF;

  IF _result IS NULL THEN
    RAISE EXCEPTION 'SECURITY_ERROR: No organization assigned. Contact your administrator.'
      USING ERRCODE = 'P0001';
  END IF;

  IF _org_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'SECURITY_ERROR: Organization is not active (%). Contact your administrator.', COALESCE(_org_status, 'UNKNOWN')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN _result;
END;
$$;


ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS updated_by text;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.payment_charges ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.payment_charges ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.payment_charges ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.payment_history ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-set updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_clients_updated_at ON public.clients;
CREATE TRIGGER set_clients_updated_at BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_cases_updated_at ON public.cases;
CREATE TRIGGER set_cases_updated_at BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_payments_updated_at ON public.payments;
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_charges_updated_at ON public.payment_charges;
CREATE TRIGGER set_charges_updated_at BEFORE UPDATE ON public.payment_charges
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_followups_updated_at ON public.followups;
CREATE TRIGGER set_followups_updated_at BEFORE UPDATE ON public.followups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_documents_updated_at ON public.documents;
CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. SOFT DELETE
-- ============================================================

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.payment_charges ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial indexes for fast non-deleted queries
CREATE INDEX IF NOT EXISTS idx_clients_active ON public.clients (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cases_active ON public.cases (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_active ON public.payments (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_charges_active ON public.payment_charges (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_followups_active ON public.followups (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_active ON public.documents (organization_id) WHERE deleted_at IS NULL;

-- ============================================================
-- 4. SERVER-SIDE FINANCIAL ENFORCEMENT
--    Never trust frontend balance/status calculations.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_payment_charge_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.paid, 0) < 0 THEN
    RAISE EXCEPTION 'Paid amount cannot be negative.';
  END IF;

  IF COALESCE(NEW.total, 0) < 0 THEN
    RAISE EXCEPTION 'Total amount cannot be negative.';
  END IF;

  IF COALESCE(NEW.paid, 0) > COALESCE(NEW.total, 0) THEN
    RAISE EXCEPTION 'Paid amount (%) cannot exceed total amount (%).', NEW.paid, NEW.total;
  END IF;

  -- Recompute balance and status server-side
  NEW.balance := GREATEST(0, COALESCE(NEW.total, 0) - COALESCE(NEW.paid, 0));

  NEW.status := CASE
    WHEN NEW.balance <= 0 THEN 'PAID'
    WHEN COALESCE(NEW.paid, 0) > 0 AND NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN 'OVERDUE'
    WHEN COALESCE(NEW.paid, 0) > 0 THEN 'PARTIAL'
    WHEN NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN 'OVERDUE'
    ELSE 'UNPAID'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_charge_balance ON public.payment_charges;
CREATE TRIGGER enforce_charge_balance
BEFORE INSERT OR UPDATE ON public.payment_charges
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_charge_balance();

-- ============================================================
-- 5. ADDITIONAL INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_clients_created_at ON public.clients (created_at);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON public.cases (created_at);
CREATE INDEX IF NOT EXISTS idx_cases_org_status ON public.cases (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments (created_at);
CREATE INDEX IF NOT EXISTS idx_charges_created_at ON public.payment_charges (created_at);
CREATE INDEX IF NOT EXISTS idx_charges_payment ON public.payment_charges (payment_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON public.payment_history ("timestamp");
CREATE INDEX IF NOT EXISTS idx_history_charge ON public.payment_history (payment_charge_id);
CREATE INDEX IF NOT EXISTS idx_followups_created_at ON public.followups (created_at);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents (created_at);

-- ============================================================
-- 6. UPDATED RLS POLICIES
--    USING  → current_organization_id() + soft delete filter (reads)
--    WITH CHECK → require_organization_id() (writes fail explicitly)
-- ============================================================

-- clients
DROP POLICY IF EXISTS clients_tenant_all ON public.clients;
CREATE POLICY clients_tenant_all ON public.clients
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id());

-- cases
DROP POLICY IF EXISTS cases_tenant_all ON public.cases;
CREATE POLICY cases_tenant_all ON public.cases
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id());

-- payments
DROP POLICY IF EXISTS payments_tenant_all ON public.payments;
CREATE POLICY payments_tenant_all ON public.payments
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id());

-- payment_charges
DROP POLICY IF EXISTS payment_charges_tenant_all ON public.payment_charges;
CREATE POLICY payment_charges_tenant_all ON public.payment_charges
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id());

-- payment_history (no soft delete — immutable audit log)
DROP POLICY IF EXISTS payment_history_tenant_all ON public.payment_history;
CREATE POLICY payment_history_tenant_all ON public.payment_history
FOR ALL
USING (organization_id = public.current_organization_id())
WITH CHECK (organization_id = public.require_organization_id());

-- followups
DROP POLICY IF EXISTS followups_tenant_all ON public.followups;
CREATE POLICY followups_tenant_all ON public.followups
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id());

-- documents
DROP POLICY IF EXISTS documents_tenant_all ON public.documents;
CREATE POLICY documents_tenant_all ON public.documents
FOR ALL
USING (organization_id = public.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = public.require_organization_id());

-- ============================================================
-- 7. STORAGE PATH VALIDATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_storage_org_path(file_path text, expected_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF file_path IS NULL OR file_path = '' THEN
    RETURN true;
  END IF;
  RETURN file_path LIKE ('org-' || expected_org_id::text || '/%');
END;
$$;
