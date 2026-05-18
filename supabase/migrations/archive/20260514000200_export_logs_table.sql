-- 20260514000200_export_logs_table.sql
-- Task 14: Add Export History Logs

CREATE TABLE IF NOT EXISTS public.export_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    actor_email TEXT NOT NULL,
    format TEXT NOT NULL, -- pdf, xlsx, csv, docx
    export_type TEXT NOT NULL, -- cases, clients, payments, etc.
    scope TEXT NOT NULL, -- selected, filtered, all, large_batch
    filters JSONB DEFAULT '{}'::jsonb,
    file_name TEXT,
    status TEXT DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED, PROCESSING_QUEUED
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Policies: Only Admins can see export logs for their organization
CREATE POLICY "Admins can view organization export logs"
ON public.export_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND organization_id = export_logs.organization_id
    AND role = 'ADMIN'
  )
);

-- Policies: Users can view their own export logs
CREATE POLICY "Users can view their own export logs"
ON public.export_logs
FOR SELECT
TO authenticated
USING (actor_id = auth.uid());

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_export_logs_org_id ON public.export_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_actor_id ON public.export_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_created_at ON public.export_logs(created_at);

-- Add comment
COMMENT ON TABLE public.export_logs IS 'Audit-ready logs for all data exports across the platform.';
