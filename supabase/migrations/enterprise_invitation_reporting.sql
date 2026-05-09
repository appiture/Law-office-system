-- ============================================================
-- Enterprise invitation, audit, email, and monthly reporting
-- Run after the existing multi-tenant/admin SQL patches.
-- ============================================================

begin;

create extension if not exists "pgcrypto";

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

-- Existing role vocabulary is ADMIN/LAWYER/STAFF. Add USER as a
-- compatibility alias for future non-legal staff accounts without
-- breaking existing LAWYER/STAFF records.
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role in ('ADMIN', 'LAWYER', 'STAFF', 'USER'));

alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists avatar_path text;
alter table public.users add column if not exists must_reset_password boolean not null default false;
alter table public.users add column if not exists invited_by uuid references public.users(id);
alter table public.users add column if not exists last_password_reset_at timestamptz;
alter table public.users add column if not exists deleted_at timestamptz;

alter table public.organizations add column if not exists logo_url text;
alter table public.organizations add column if not exists logo_path text;
alter table public.organizations add column if not exists created_by_superadmin boolean not null default false;
alter table public.organizations add column if not exists billing_status text not null default 'TRIAL';
alter table public.organizations add column if not exists monthly_revenue numeric(12,2) not null default 0;
alter table public.organizations add column if not exists deleted_at timestamptz;

-- Widen invite role/status constraints safely across earlier migrations.
alter table public.organization_invites drop constraint if exists organization_invites_role_check;
alter table public.organization_invites
  add constraint organization_invites_role_check
  check (role in ('ADMIN', 'LAWYER', 'STAFF', 'USER'));

alter table public.organization_invites drop constraint if exists organization_invites_status_check;
alter table public.organization_invites
  add constraint organization_invites_status_check
  check (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'));

alter table public.organization_invites add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.organization_invites add column if not exists invite_type text not null default 'USER';
alter table public.organization_invites add column if not exists sent_at timestamptz;
alter table public.organization_invites add column if not exists last_sent_at timestamptz;
alter table public.organization_invites add column if not exists send_count integer not null default 0;
alter table public.organization_invites add column if not exists delivery_status text not null default 'PENDING';
alter table public.organization_invites add column if not exists provider_message_id text;
alter table public.organization_invites add column if not exists temporary_password_expires_at timestamptz;
alter table public.organization_invites add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_organization_invites_auth_user
  on public.organization_invites(auth_user_id);

create index if not exists idx_organization_invites_open_email
  on public.organization_invites(organization_id, lower(email))
  where status = 'PENDING';

create unique index if not exists organization_invites_org_email_unique_idx
  on public.organization_invites(organization_id, email);

-- Retire earlier browser-callable invite/account creation RPCs. The
-- Edge Functions replace them and keep service-role and email handling
-- server-side.
do $$
begin
  if to_regprocedure('public.admin_create_organization(text,text,text,boolean)') is not null then
    revoke execute on function public.admin_create_organization(text, text, text, boolean) from public;
    revoke execute on function public.admin_create_organization(text, text, text, boolean) from authenticated;
  end if;

  if to_regprocedure('public.admin_invite_team_member(text,text)') is not null then
    revoke execute on function public.admin_invite_team_member(text, text) from public;
    revoke execute on function public.admin_invite_team_member(text, text) from authenticated;
  end if;

  if to_regprocedure('public.invite_user_to_organization(text,text)') is not null then
    revoke execute on function public.invite_user_to_organization(text, text) from public;
    revoke execute on function public.invite_user_to_organization(text, text) from authenticated;
  end if;
end $$;

-- General audit stream used by Edge Functions and monthly reports.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  target_email text,
  severity text not null default 'INFO' check (severity in ('INFO', 'WARN', 'ERROR', 'SECURITY')),
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

drop policy if exists audit_events_platform_read on public.audit_events;
create policy audit_events_platform_read on public.audit_events
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists audit_events_org_admin_read on public.audit_events;
create policy audit_events_org_admin_read on public.audit_events
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and public.current_user_role() = 'ADMIN'
);

create index if not exists idx_audit_events_org_time on public.audit_events(organization_id, created_at desc);
create index if not exists idx_audit_events_actor_time on public.audit_events(actor_id, created_at desc);
create index if not exists idx_audit_events_action_time on public.audit_events(action, created_at desc);

-- Email delivery ledger keeps Resend/API details server-side.
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  invite_id uuid references public.organization_invites(id) on delete set null,
  recipient_email text not null,
  email_type text not null,
  subject text not null,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.email_events enable row level security;

drop policy if exists email_events_platform_read on public.email_events;
create policy email_events_platform_read on public.email_events
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists email_events_org_admin_read on public.email_events;
create policy email_events_org_admin_read on public.email_events
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and public.current_user_role() = 'ADMIN'
);

create index if not exists idx_email_events_org_time on public.email_events(organization_id, created_at desc);
create index if not exists idx_email_events_recipient_time on public.email_events(lower(recipient_email), created_at desc);

create table if not exists public.monthly_report_runs (
  id uuid primary key default gen_random_uuid(),
  report_month date not null,
  organization_id uuid references public.organizations(id) on delete set null,
  recipient_email text not null,
  recipient_role text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  provider_message_id text,
  error_message text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (report_month, organization_id, recipient_email)
);

alter table public.monthly_report_runs enable row level security;

drop policy if exists monthly_report_runs_platform_read on public.monthly_report_runs;
create policy monthly_report_runs_platform_read on public.monthly_report_runs
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists monthly_report_runs_org_admin_read on public.monthly_report_runs;
create policy monthly_report_runs_org_admin_read on public.monthly_report_runs
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and public.current_user_role() = 'ADMIN'
);

create table if not exists public.request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  action_key text not null,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_request_logs_user_action_time
  on public.request_logs(user_id, action_key, created_at desc);

create or replace function public.edge_check_rate_limit(
  actor_id uuid,
  action_key text,
  max_requests integer default 5,
  window_seconds integer default 60,
  ip_address text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_count integer;
begin
  if actor_id is null then
    raise exception 'Missing actor for rate limit.' using errcode = '28000';
  end if;

  select count(*)
  into request_count
  from public.request_logs logs
  where logs.user_id = actor_id
    and logs.action_key = edge_check_rate_limit.action_key
    and logs.created_at > now() - make_interval(secs => window_seconds);

  if request_count >= max_requests then
    raise exception 'RATE_LIMIT: Too many requests. Please wait before trying again.'
      using errcode = 'P0001';
  end if;

  insert into public.request_logs(user_id, action_key, ip_address)
  values (actor_id, action_key, ip_address);

  if random() < 0.05 then
    delete from public.request_logs
    where created_at < now() - interval '24 hours';
  end if;
end;
$$;

revoke all on function public.edge_check_rate_limit(uuid, text, integer, integer, text) from public;
grant execute on function public.edge_check_rate_limit(uuid, text, integer, integer, text) to service_role;

create or replace function public.record_audit_event(
  organization_id uuid,
  actor_id uuid,
  actor_email text,
  action text,
  target_type text default null,
  target_id text default null,
  target_email text default null,
  severity text default 'INFO',
  ip_address text default null,
  user_agent text default null,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
begin
  insert into public.audit_events (
    organization_id, actor_id, actor_email, action, target_type,
    target_id, target_email, severity, ip_address, user_agent, metadata
  )
  values (
    organization_id, actor_id, lower(actor_email), action, target_type,
    target_id, lower(target_email), severity, ip_address, user_agent,
    coalesce(metadata, '{}'::jsonb)
  )
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.record_audit_event(uuid, uuid, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.record_audit_event(uuid, uuid, text, text, text, text, text, text, text, text, jsonb) to service_role;

-- Preserve the current first-login reset flow and additionally mark
-- the corresponding invite accepted when the user sets a real password.
create or replace function public.check_must_reset_password()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    (select users.must_reset_password from public.users users where users.id = auth.uid()),
    false
  );
$$;

revoke all on function public.check_must_reset_password() from public;
grant execute on function public.check_must_reset_password() to authenticated;

create or replace function public.complete_password_reset()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  signed_in_user_id uuid := auth.uid();
  signed_in_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if signed_in_user_id is null then
    raise exception 'No authenticated Supabase session.' using errcode = '28000';
  end if;

  update public.users
  set
    must_reset_password = false,
    last_password_reset_at = now()
  where id = signed_in_user_id;

  update public.organization_invites
  set
    status = 'ACCEPTED',
    accepted_by = signed_in_user_id,
    accepted_at = now()
  where status = 'PENDING'
    and (
      auth_user_id = signed_in_user_id
      or lower(email) = signed_in_email
    );

  perform public.record_audit_event(
    (select organization_id from public.users where id = signed_in_user_id),
    signed_in_user_id,
    signed_in_email,
    'PASSWORD_RESET_COMPLETED',
    'user',
    signed_in_user_id::text,
    signed_in_email,
    'INFO',
    null,
    null,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.complete_password_reset() from public;
grant execute on function public.complete_password_reset() to authenticated;

-- Org-admin member operations stay RPC based; direct table updates should
-- not be the privilege boundary for role/status changes.
drop policy if exists users_admin_update on public.users;

create or replace function public.list_organization_members()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  status text,
  avatar_url text,
  must_reset_password boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_org_id uuid;
  caller_role text;
begin
  select u.organization_id, u.role
  into current_org_id, caller_role
  from public.users u
  where u.id = auth.uid();

  if current_org_id is null then
    raise exception 'No organization found for current user.' using errcode = 'P0001';
  end if;

  if caller_role <> 'ADMIN' and not public.is_platform_admin() then
    raise exception 'Only organization admins can list members.' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    lower(u.email),
    coalesce(u.full_name, ''),
    u.role,
    u.status,
    coalesce(u.avatar_url, ''),
    coalesce(u.must_reset_password, false),
    u.created_at
  from public.users u
  where u.organization_id = current_org_id
    and u.deleted_at is null
  order by
    case u.role
      when 'ADMIN' then 1
      when 'LAWYER' then 2
      when 'STAFF' then 3
      else 4
    end,
    u.created_at asc;
end;
$$;

revoke all on function public.list_organization_members() from public;
grant execute on function public.list_organization_members() to authenticated;

create or replace function public.update_organization_member(
  target_user_id uuid,
  new_role text default null,
  new_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_org_id uuid;
  caller_role text;
  caller_email text;
  target_org_id uuid;
begin
  select u.organization_id, u.role, u.email
  into current_org_id, caller_role, caller_email
  from public.users u
  where u.id = auth.uid();

  if caller_role <> 'ADMIN' then
    raise exception 'Only organization admins can update members.' using errcode = '42501';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot modify your own account.' using errcode = '22023';
  end if;

  if new_role is not null and new_role not in ('LAWYER', 'STAFF', 'USER') then
    raise exception 'Organization admins can only assign user-level roles.' using errcode = '42501';
  end if;

  if new_status is not null and new_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'Invalid member status.' using errcode = '22023';
  end if;

  select organization_id
  into target_org_id
  from public.users
  where id = target_user_id
    and deleted_at is null;

  if target_org_id is distinct from current_org_id then
    raise exception 'User not found in your organization.' using errcode = 'P0002';
  end if;

  update public.users
  set
    role = coalesce(new_role, role),
    status = coalesce(new_status, status)
  where id = target_user_id
    and organization_id = current_org_id
    and role <> 'ADMIN';

  if not found then
    raise exception 'Admins cannot modify other admin accounts from Team Management.' using errcode = '42501';
  end if;

  perform public.record_audit_event(
    current_org_id,
    auth.uid(),
    caller_email,
    'ORG_MEMBER_UPDATED',
    'user',
    target_user_id::text,
    (select email from public.users where id = target_user_id),
    'INFO',
    null,
    null,
    jsonb_build_object('new_role', new_role, 'new_status', new_status)
  );

  return jsonb_build_object('success', true, 'user_id', target_user_id);
end;
$$;

revoke all on function public.update_organization_member(uuid, text, text) from public;
grant execute on function public.update_organization_member(uuid, text, text) to authenticated;

create or replace function public.remove_organization_member(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_org_id uuid;
  caller_role text;
  caller_email text;
  target_org_id uuid;
begin
  select u.organization_id, u.role, u.email
  into current_org_id, caller_role, caller_email
  from public.users u
  where u.id = auth.uid();

  if caller_role <> 'ADMIN' then
    raise exception 'Only organization admins can remove members.' using errcode = '42501';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot remove yourself.' using errcode = '22023';
  end if;

  select organization_id
  into target_org_id
  from public.users
  where id = target_user_id
    and deleted_at is null;

  if target_org_id is distinct from current_org_id then
    raise exception 'User not found in your organization.' using errcode = 'P0002';
  end if;

  update public.users
  set status = 'INACTIVE', deleted_at = now()
  where id = target_user_id
    and organization_id = current_org_id
    and role <> 'ADMIN';

  if not found then
    raise exception 'Admins cannot remove other admin accounts from Team Management.' using errcode = '42501';
  end if;

  perform public.record_audit_event(
    current_org_id,
    auth.uid(),
    caller_email,
    'ORG_MEMBER_REMOVED',
    'user',
    target_user_id::text,
    (select email from public.users where id = target_user_id),
    'WARN',
    null,
    null,
    '{}'::jsonb
  );

  return jsonb_build_object('success', true, 'user_id', target_user_id);
end;
$$;

revoke all on function public.remove_organization_member(uuid) from public;
grant execute on function public.remove_organization_member(uuid) to authenticated;

commit;
