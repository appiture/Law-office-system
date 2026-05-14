-- 20260514000000_export_logs.sql
-- Migration to add export_logs table for tracking report generation

CREATE TABLE IF NOT EXISTS public.export_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    format TEXT NOT NULL, -- pdf, xlsx, csv, docx
    export_type TEXT NOT NULL, -- dashboard, clients, cases, etc.
    scope TEXT NOT NULL, -- full, filtered, selected
    filters JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'COMPLETED',
    file_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their organization's export logs"
    ON public.export_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.organization_id = export_logs.organization_id
            AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'OWNER')
        )
    );

-- Add to audit functions if necessary, but table itself is an audit log
