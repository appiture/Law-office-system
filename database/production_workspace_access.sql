
begin;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.organization_invites enable row level security;

alter table public.organizations add column if not exists requested_owner_email text;
alter table public.organizations add column if not exists status text not null default 'PENDING_APPROVAL';
alter table public.organizations add column if not exists is_demo boolean not null default false;
alter table public.organizations add column if not exists approved_by uuid;
alter table public.organizations add column if not exists approved_at timestamptz;
alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check
  check (status in ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED'));

alter table public.users add column if not exists status text not null default 'ACTIVE';
alter table public.users drop constraint if exists users_status_check;
alter table public.users
  add constraint users_status_check
  check (status in ('ACTIVE', 'INACTIVE', 'INVITED', 'PENDING_APPROVAL'));

create or replace function public.normalize_email(value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(value, '')))
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.platform_admins admins
    where admins.user_id = auth.uid()
       or lower(admins.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

create or replace function app_private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select users.organization_id
  from public.users users
  join public.organizations organizations on organizations.id = users.organization_id
  where users.id = auth.uid()
    and users.status = 'ACTIVE'
    and organizations.status = 'ACTIVE'
  limit 1
$$;

create or replace function app_private.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select users.role
  from public.users users
  join public.organizations organizations on organizations.id = users.organization_id
  where users.id = auth.uid()
    and users.status = 'ACTIVE'
    and organizations.status = 'ACTIVE'
  limit 1
$$;

-- Compatibility wrappers for existing SQL that may still call public helpers.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, app_private
as $$
  select app_private.current_organization_id()
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, auth, app_private
as $$
  select app_private.current_user_role()
$$;

grant execute on function app_private.current_organization_id() to authenticated;
grant execute on function app_private.current_user_role() to authenticated;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.get_workspace_context()
returns table (
  user_id uuid,
  email text,
  role text,
  organization_id uuid,
  organization_name text,
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
      null::uuid,
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
    users.role,
    users.organization_id,
    users.status as user_status,
    organizations.name as organization_name,
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
      'LAWYER'::text,
      null::uuid,
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
    profile.role::text,
    profile.organization_id::uuid,
    coalesce(profile.organization_name, '')::text,
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

revoke all on function public.get_workspace_context() from public;
grant execute on function public.get_workspace_context() to authenticated;

create or replace function public.sync_auth_user_membership()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := public.normalize_email(new.email);
  demo_org_id uuid;
  invited_org_id uuid;
  invited_role text;
  trusted_org_id uuid;
  trusted_role text;
  resolved_org_id uuid;
  resolved_role text;
  resolved_status text;
begin
  select id
  into demo_org_id
  from public.organizations
  where is_demo = true
  order by created_at asc
  limit 1;

  select organization_id, role
  into invited_org_id, invited_role
  from public.organization_invites
  where public.normalize_email(email) = normalized_email
    and status = 'PENDING'
  order by created_at desc
  limit 1;

  trusted_org_id := nullif(new.raw_app_meta_data ->> 'organization_id', '')::uuid;
  trusted_role := upper(coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'LAWYER'));

  if normalized_email = 'demo@lawoffice.local' then
    resolved_org_id := demo_org_id;
    resolved_role := 'ADMIN';
  elsif invited_org_id is not null then
    resolved_org_id := invited_org_id;
    resolved_role := invited_role;
  elsif trusted_org_id is not null then
    resolved_org_id := trusted_org_id;
    resolved_role := trusted_role;
  else
    resolved_org_id := null;
    resolved_role := 'LAWYER';
  end if;

  if resolved_role not in ('ADMIN', 'LAWYER', 'STAFF') then
    resolved_role := 'LAWYER';
  end if;

  resolved_status := case when resolved_org_id is null then 'PENDING_APPROVAL' else 'ACTIVE' end;

  insert into public.users (id, email, role, organization_id, status)
  values (new.id, normalized_email, resolved_role, resolved_org_id, resolved_status)
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role,
        organization_id = coalesce(excluded.organization_id, public.users.organization_id),
        status = case
          when coalesce(excluded.organization_id, public.users.organization_id) is null then 'PENDING_APPROVAL'
          when public.users.status = 'INACTIVE' then 'INACTIVE'
          else excluded.status
        end;

  if invited_org_id is not null then
    update public.organization_invites
    set
      status = 'ACCEPTED',
      accepted_by = new.id,
      accepted_at = now()
    where organization_id = invited_org_id
      and public.normalize_email(email) = normalized_email
      and status = 'PENDING';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_synced on auth.users;
create trigger on_auth_user_synced
after insert or update on auth.users
for each row execute function public.sync_auth_user_membership();

drop policy if exists organizations_tenant_read on public.organizations;
create policy organizations_tenant_read on public.organizations
for select
to authenticated
using (
  auth.uid() is not null
  and (
    id = app_private.current_organization_id()
    or created_by = auth.uid()
    or public.is_platform_admin()
  )
);

drop policy if exists organizations_self_create on public.organizations;
create policy organizations_self_create on public.organizations
for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and status = 'PENDING_APPROVAL'
);

drop policy if exists users_tenant_read on public.users;
create policy users_tenant_read on public.users
for select
to authenticated
using (
  auth.uid() is not null
  and (
    id = auth.uid()
    or organization_id = app_private.current_organization_id()
    or public.is_platform_admin()
  )
);

drop policy if exists users_self_bootstrap on public.users;
drop policy if exists users_self_update on public.users;
drop policy if exists users_admin_update on public.users;

create policy users_admin_update on public.users
for update
to authenticated
using (
  organization_id = app_private.current_organization_id()
  and app_private.current_user_role() = 'ADMIN'
)
with check (
  organization_id = app_private.current_organization_id()
);

drop policy if exists invites_tenant_access on public.organization_invites;
create policy invites_tenant_access on public.organization_invites
for select
to authenticated
using (
  organization_id = app_private.current_organization_id()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_platform_admin()
);

drop policy if exists invites_admin_insert on public.organization_invites;
create policy invites_admin_insert on public.organization_invites
for insert
to authenticated
with check (
  app_private.current_user_role() = 'ADMIN'
  and organization_id = app_private.current_organization_id()
);

drop policy if exists invites_admin_update on public.organization_invites;
create policy invites_admin_update on public.organization_invites
for update
to authenticated
using (
  organization_id = app_private.current_organization_id()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  organization_id = app_private.current_organization_id()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients',
    'cases',
    'payments',
    'payment_charges',
    'payment_history',
    'followups',
    'documents'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_all', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (organization_id = app_private.current_organization_id()) with check (organization_id = app_private.current_organization_id())',
      table_name || '_tenant_all',
      table_name
    );
  end loop;
end $$;

commit;
