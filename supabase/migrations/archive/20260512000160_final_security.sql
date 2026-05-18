-- Final Security Hardening Migration
-- Applies final security measures and revokes public access

-- Revoke public access from sensitive tables
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'system_audit_logs') then
    revoke all on public.system_audit_logs from anon;
    alter table public.system_audit_logs force row level security;
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'calendar_events') then
    revoke all on public.calendar_events from anon;
    alter table public.calendar_events force row level security;
  end if;
end $$;