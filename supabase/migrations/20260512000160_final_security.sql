-- Final Security Hardening Migration
-- Applies final security measures and revokes public access

-- Revoke public access from sensitive tables
revoke all on public.audit_logs from anon;
revoke all on public.calendar_events from anon;

-- Force RLS on critical tables
alter table public.calendar_events force row level security;
alter table public.audit_logs force row level security;