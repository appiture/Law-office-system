-- Fix for Organization RLS Update Policy

begin;

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

drop policy if exists org_isolation_select on public.organizations;
drop policy if exists organizations_membership_select on public.organizations;
drop policy if exists organizations_tenant_read on public.organizations;
drop policy if exists organizations_admin_update on public.organizations;

create policy organizations_membership_select on public.organizations
for select
to authenticated
using (
  public.can_read_organization(organizations.id)
  or public.is_platform_admin()
);

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

commit;
