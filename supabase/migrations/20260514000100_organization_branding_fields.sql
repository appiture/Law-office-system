-- Migration to add branding fields to organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS website TEXT;

-- Update update_organization_settings RPC to handle new fields
DROP FUNCTION IF EXISTS public.update_organization_settings(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.update_organization_settings(
  target_organization_id uuid,
  organization_name text,
  organization_logo_url text default '',
  organization_logo_path text default '',
  organization_address text default '',
  organization_phone text default '',
  organization_email text default '',
  organization_website text default ''
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
    logo_path = coalesce(organization_logo_path, ''),
    address = trim(organization_address),
    phone = trim(organization_phone),
    email = trim(organization_email),
    website = trim(organization_website)
  where id = target_organization_id;

  get diagnostics changed_rows = row_count;

  if changed_rows = 0 then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Update get_workspace_context RPC to return new fields
DROP FUNCTION IF EXISTS public.get_workspace_context();
CREATE OR REPLACE FUNCTION public.get_workspace_context()
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
  organization_address text,
  organization_phone text,
  organization_email text,
  organization_website text,
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
    organizations.address as organization_address,
    organizations.phone as organization_phone,
    organizations.email as organization_email,
    organizations.website as organization_website,
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
    coalesce(profile.organization_address, '')::text,
    coalesce(profile.organization_phone, '')::text,
    coalesce(profile.organization_email, '')::text,
    coalesce(profile.organization_website, '')::text,
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
