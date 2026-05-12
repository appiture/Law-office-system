-- Final Security Hardening Migration
-- Applies final security measures

-- Force RLS on critical tables
alter table public.calendar_events
force row level security;

alter table public.audit_logs
force row level security;