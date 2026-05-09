
-- database/organization_settings.sql
-- Adds logo and profile fields to organizations and users, and updates workspace context RPC.

begin;

-- 1. Update organizations table
alter table public.organizations add column if not exists logo_url text;
alter table public.organizations add column if not exists logo_path text;

-- 2. Update users table
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists avatar_path text;

-- 3. Update get_workspace_context RPC
drop function if exists public.get_workspace_context();

create or replace function public.get_workspace_context()
returns table (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  avatar_path text,
  role text,
  organization_id uuid,
  organization_name text,
  organization_logo_url text,
  organization_logo_path text,
  organization_status text,
  status text,
  can_access_workspace boolean,
  is_demo_workspace boolean,
  access_message text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  signed_in_user_id uuid := auth.uid();
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  profile record;
begin
  if signed_in_user_id is null then
    return query select
      null::uuid,
      ''::text,
      ''::text,
      ''::text,
      ''::text,
      ''::text,
      null::uuid,
      ''::text,
      ''::text,
      ''::text,
      ''::text,
      ''::text,
      false,
      false,
      'No authenticated Supabase session.'::text;
    return;
  end if;

  select
    users.id,
    users.email,
    users.full_name,
    users.avatar_url,
    users.avatar_path,
    users.role,
    users.organization_id,
    users.status as user_status,
    organizations.name as organization_name,
    organizations.logo_url as organization_logo_url,
    organizations.logo_path as organization_logo_path,
    organizations.status as organization_status,
    organizations.is_demo as is_demo_workspace
  into profile
  from public.users users
  left join public.organizations organizations on organizations.id = users.organization_id
  where users.id = signed_in_user_id
  limit 1;

  if profile.id is null then
    return query select
      signed_in_user_id,
      jwt_email,
      ''::text,
      ''::text,
      ''::text,
      'LAWYER'::text,
      null::uuid,
      ''::text,
      ''::text,
      ''::text,
      ''::text,
      'PENDING_APPROVAL'::text,
      false,
      false,
      'Your login exists, but no workspace membership row exists in public.users. Ask an admin to invite or approve this user.'::text;
    return;
  end if;

  return query select
    profile.id::uuid,
    lower(profile.email)::text,
    coalesce(profile.full_name, '')::text,
    coalesce(profile.avatar_url, '')::text,
    coalesce(profile.avatar_path, '')::text,
    profile.role::text,
    profile.organization_id::uuid,
    coalesce(profile.organization_name, '')::text,
    coalesce(profile.organization_logo_url, '')::text,
    coalesce(profile.organization_logo_path, '')::text,
    coalesce(profile.organization_status, '')::text,
    profile.user_status::text,
    (
      profile.organization_id is not null
      and profile.user_status = 'ACTIVE'
      and profile.organization_status = 'ACTIVE'
    )::boolean,
    coalesce(profile.is_demo_workspace, false)::boolean,
    case
      when profile.user_status <> 'ACTIVE'
        then 'Your user profile is ' || profile.user_status || '. An admin must set public.users.status to ACTIVE.'
      when profile.organization_id is null
        then 'Your user profile is missing organization_id. Join or create an approved organization.'
      when profile.organization_status is null
        then 'Your organization row is missing. An admin must create public.organizations for this organization_id.'
      when profile.organization_status <> 'ACTIVE'
        then 'Your organization is ' || profile.organization_status || '. A platform admin must approve it.'
      else ''
    end::text;
end;
$$;

-- 4. Add policies for updating organization and user profile
-- Helper functions used by the RLS policies below.
-- SECURITY DEFINER keeps these checks from being blocked by user-table RLS.
create or replace function public.can_read_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.users users
    where users.id = auth.uid()
      and users.organization_id = target_organization_id
  )
  or exists (
    select 1
    from public.organizations organizations
    where organizations.id = target_organization_id
      and (
        organizations.created_by = auth.uid()
        or lower(organizations.requested_owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
$$;

create or replace function public.can_update_organization_settings(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.users users
    where users.id = auth.uid()
      and users.organization_id = target_organization_id
      and users.status <> 'INACTIVE'
      and users.role = 'ADMIN'
  )
  or exists (
    select 1
    from public.organizations organizations
    where organizations.id = target_organization_id
      and organizations.status in ('PENDING_APPROVAL', 'ACTIVE')
      and (
        organizations.created_by = auth.uid()
        or lower(organizations.requested_owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
$$;

revoke all on function public.can_read_organization(uuid) from public;
revoke all on function public.can_update_organization_settings(uuid) from public;
grant execute on function public.can_read_organization(uuid) to authenticated;
grant execute on function public.can_update_organization_settings(uuid) to authenticated;

create or replace function public.update_organization_settings(
  target_organization_id uuid,
  organization_name text,
  organization_logo_url text default '',
  organization_logo_path text default ''
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  signed_in_user_id uuid := auth.uid();
  allowed boolean;
  changed_rows integer;
begin
  if signed_in_user_id is null then
    raise exception 'No authenticated Supabase session.' using errcode = '28000';
  end if;

  if target_organization_id is null then
    raise exception 'No organization workspace is available.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(organization_name, '')), '') is null then
    raise exception 'Organization name is required.' using errcode = '22023';
  end if;

  select
    public.can_update_organization_settings(target_organization_id)
    or public.is_platform_admin()
  into allowed;

  if not coalesce(allowed, false) then
    raise exception 'Only organization admins can update organization settings.' using errcode = '42501';
  end if;

  update public.organizations
  set
    name = trim(organization_name),
    logo_url = coalesce(organization_logo_url, ''),
    logo_path = coalesce(organization_logo_path, '')
  where id = target_organization_id;

  get diagnostics changed_rows = row_count;

  if changed_rows = 0 then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_organization_settings(uuid, text, text, text) from public;
grant execute on function public.update_organization_settings(uuid, text, text, text) to authenticated;

create or replace function public.update_user_profile(
  user_full_name text default '',
  user_avatar_url text default '',
  user_avatar_path text default ''
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  signed_in_user_id uuid := auth.uid();
  changed_rows integer;
begin
  if signed_in_user_id is null then
    raise exception 'No authenticated Supabase session.' using errcode = '28000';
  end if;

  update public.users
  set
    full_name = nullif(trim(coalesce(user_full_name, '')), ''),
    avatar_url = coalesce(user_avatar_url, ''),
    avatar_path = coalesce(user_avatar_path, '')
  where id = signed_in_user_id;

  get diagnostics changed_rows = row_count;

  if changed_rows = 0 then
    raise exception 'User profile not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_user_profile(text, text, text) from public;
grant execute on function public.update_user_profile(text, text, text) to authenticated;

-- Members can read their own organization even before it is marked ACTIVE.
-- This keeps .update(...).select() from returning an empty result after RLS.
drop policy if exists org_isolation_select on public.organizations;
drop policy if exists organizations_membership_select on public.organizations;
drop policy if exists organizations_tenant_read on public.organizations;
create policy organizations_membership_select on public.organizations
for select
to authenticated
using (
  public.can_read_organization(organizations.id)
  or public.is_platform_admin()
);

-- Admins can update their own organization settings
drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update on public.organizations
for update
to authenticated
using (
  public.can_update_organization_settings(organizations.id)
  or public.is_platform_admin()
)
with check (
  public.can_update_organization_settings(organizations.id)
  or public.is_platform_admin()
);

-- Users can update their own profile fields
drop policy if exists users_self_update_profile on public.users;
create policy users_self_update_profile on public.users
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
  -- Ensure they don't change their role or organization through this policy
  and (
    (role = (select role from public.users where id = auth.uid()))
    or (public.current_user_role() = 'ADMIN')
  )
);

commit;
