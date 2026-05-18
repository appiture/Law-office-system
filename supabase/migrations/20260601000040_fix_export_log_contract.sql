-- =====================================================
-- FIX: export-report Edge Function database contract
-- =====================================================

BEGIN;

ALTER TABLE public.export_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text;

UPDATE public.export_logs
SET updated_at = coalesce(updated_at, created_at)
WHERE updated_at IS NULL;

COMMIT;
