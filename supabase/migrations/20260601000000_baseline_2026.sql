-- =====================================================
-- BASELINE 2026 (FINAL RECONSOLIDATED)
-- Enterprise Law Office Management System
-- Matching Frontend Repository logic
-- =====================================================

BEGIN;

-- =====================================================
-- EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- PLATFORM ADMINS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- ORGANIZATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT UNIQUE,
    email TEXT,
    phone TEXT,
    address TEXT,
    website TEXT,
    logo_url TEXT,
    logo_path TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    is_demo BOOLEAN NOT NULL DEFAULT false,
    billing_status TEXT NOT NULL DEFAULT 'TRIAL',
    monthly_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_by UUID,
    requested_owner_email TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_by_superadmin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- USERS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    avatar_path TEXT,
    role TEXT NOT NULL DEFAULT 'LAWYER',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    must_reset_password BOOLEAN NOT NULL DEFAULT false,
    invited_by UUID REFERENCES public.users(id),
    last_password_reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'LAWYER', 'STAFF', 'USER')),
    CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'INVITED', 'PENDING_APPROVAL'))
);

-- =====================================================
-- CLIENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- Frontend uses 'name'
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    occupation TEXT,
    status TEXT DEFAULT 'ACTIVE',
    photo_url TEXT,
    photo_path TEXT,
    notes TEXT,
    id_proof JSONB NOT NULL DEFAULT '{}'::jsonb,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- CASES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    case_number TEXT NOT NULL,
    title TEXT NOT NULL,
    case_type TEXT,
    court_name TEXT,
    judge_name TEXT,
    lawyer_name TEXT,
    next_hearing_date DATE,
    filing_date DATE,
    status TEXT NOT NULL DEFAULT 'OPEN',
    case_description TEXT,
    opponent_name TEXT,
    opponent_lawyer TEXT,
    assigned_lawyer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_by UUID,
    assigned_at TIMESTAMPTZ,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- PAYMENTS (MASTER)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
    total_amount NUMERIC(12,2) DEFAULT 0,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- PAYMENT CHARGES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.payment_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    total NUMERIC(12,2) DEFAULT 0,
    paid NUMERIC(12,2) DEFAULT 0,
    balance NUMERIC(12,2) DEFAULT 0,
    due_date DATE,
    status TEXT DEFAULT 'PENDING',
    display_order INTEGER DEFAULT 0,
    description TEXT,
    is_lawyer_fee BOOLEAN DEFAULT false,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- PAYMENT HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS public.payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
    payment_charge_id UUID REFERENCES public.payment_charges(id) ON DELETE CASCADE,
    charge_name TEXT,
    amount_paid NUMERIC(12,2) DEFAULT 0,
    payment_mode TEXT,
    payment_reference TEXT,
    payment_date DATE, -- Used by generator
    timestamp TIMESTAMPTZ DEFAULT now(), -- Used by repository
    status TEXT DEFAULT 'COMPLETED',
    recorded_by UUID,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- HEARINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.hearings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
    type TEXT,
    title TEXT,
    date DATE, -- Frontend Repository uses 'date'
    scheduled_at TIMESTAMPTZ, -- Generator uses 'scheduled_at'
    notes TEXT,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'SCHEDULED',
    postponed_to DATE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- TASKS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'MEDIUM',
    status TEXT NOT NULL DEFAULT 'PENDING',
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT tasks_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    CONSTRAINT tasks_status_check CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
);

-- =====================================================
-- DOCUMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT,
    file_path TEXT,
    file_type TEXT,
    file_size BIGINT,
    category TEXT,
    description TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    uploaded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- EXPORT LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.export_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    format TEXT NOT NULL,
    export_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    filters JSONB DEFAULT '{}'::jsonb,
    file_name TEXT,
    status TEXT DEFAULT 'PENDING',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- SYSTEM AUDIT LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    actor_id UUID,
    actor_email TEXT,
    actor_role TEXT,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    entity_name TEXT,
    action_type TEXT NOT NULL,
    module TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- =====================================================
-- ORGANIZATION PERMISSIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.organization_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    section TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, section)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_org ON public.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_org ON public.clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_org ON public.cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_hearings_case ON public.hearings(case_id);
CREATE INDEX IF NOT EXISTS idx_hearings_org ON public.hearings(organization_id);
CREATE INDEX IF NOT EXISTS idx_hearings_date ON public.hearings(date);
CREATE INDEX IF NOT EXISTS idx_payments_org ON public.payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_org ON public.documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_org ON public.export_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON public.system_audit_logs(organization_id);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_organization_context()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        NEW.organization_id := (SELECT organization_id FROM public.users WHERE id = auth.uid());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS hearings_enforce_org ON public.hearings;
CREATE TRIGGER hearings_enforce_org
BEFORE INSERT ON public.hearings
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_context();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- RLS POLICIES (Hardened)
-- =====================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hearings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS hearings_tenant_all ON public.hearings;
CREATE POLICY hearings_tenant_all ON public.hearings
    FOR ALL USING (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION public.current_organization_id() RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Organizations
DROP POLICY IF EXISTS org_read ON public.organizations;
CREATE POLICY org_read ON public.organizations FOR SELECT USING (id = public.current_organization_id() OR public.is_platform_admin());

-- Users
DROP POLICY IF EXISTS users_tenant_all ON public.users;
CREATE POLICY users_tenant_all ON public.users FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- Clients
DROP POLICY IF EXISTS clients_tenant_all ON public.clients;
CREATE POLICY clients_tenant_all ON public.clients FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- Cases
DROP POLICY IF EXISTS cases_tenant_read ON public.cases;
CREATE POLICY cases_tenant_read ON public.cases FOR SELECT USING (
  public.is_platform_admin() OR (
    organization_id = public.current_organization_id() AND (
      public.current_user_role() IN ('ADMIN', 'STAFF') OR 
      (public.current_user_role() = 'LAWYER' AND assigned_lawyer_id = auth.uid())
    )
  )
);
DROP POLICY IF EXISTS cases_tenant_write ON public.cases;
CREATE POLICY cases_tenant_write ON public.cases FOR ALL USING (organization_id = public.current_organization_id() AND public.current_user_role() IN ('ADMIN', 'STAFF', 'LAWYER'));

-- Tasks
DROP POLICY IF EXISTS tasks_tenant_all ON public.tasks;
CREATE POLICY tasks_tenant_all ON public.tasks FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- Payments & Finance
DROP POLICY IF EXISTS payments_tenant_all ON public.payments;
CREATE POLICY payments_tenant_all ON public.payments FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());
DROP POLICY IF EXISTS payment_charges_tenant_all ON public.payment_charges;
CREATE POLICY payment_charges_tenant_all ON public.payment_charges FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());
DROP POLICY IF EXISTS payment_history_tenant_all ON public.payment_history;
CREATE POLICY payment_history_tenant_all ON public.payment_history FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- Documents
DROP POLICY IF EXISTS docs_tenant_all ON public.documents;
CREATE POLICY docs_tenant_all ON public.documents FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- System & Audit
DROP POLICY IF EXISTS audit_tenant_read ON public.system_audit_logs;
CREATE POLICY audit_tenant_read ON public.system_audit_logs FOR SELECT USING (organization_id = public.current_organization_id() OR public.is_platform_admin());
DROP POLICY IF EXISTS export_logs_tenant_all ON public.export_logs;
CREATE POLICY export_logs_tenant_all ON public.export_logs FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());
DROP POLICY IF EXISTS notifications_tenant_all ON public.notifications;
CREATE POLICY notifications_tenant_all ON public.notifications FOR ALL USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('exports', 'exports', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('clients', 'clients', false) ON CONFLICT DO NOTHING;

COMMIT;
