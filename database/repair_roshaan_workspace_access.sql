-- Run this in the Supabase SQL editor to allow the pasted auth user to enter
-- the app workspace after email/password login.
--
-- Auth user:
--   ea1288c5-220c-490d-9f04-f3a38ec95bcd / roshaanpeeris@gmail.com
-- Organization metadata:
--   fb4b79a4-c24a-401f-b4c7-1f1a2594dc7e

begin;

insert into public.organizations (
  id,
  name,
  created_by,
  requested_owner_email,
  status,
  approved_by,
  approved_at
)
values (
  'fb4b79a4-c24a-401f-b4c7-1f1a2594dc7e',
  'Roshaan Law Office',
  'ea1288c5-220c-490d-9f04-f3a38ec95bcd',
  'roshaanpeeris@gmail.com',
  'ACTIVE',
  'ea1288c5-220c-490d-9f04-f3a38ec95bcd',
  now()
)
on conflict (id) do update
set
  status = 'ACTIVE',
  created_by = coalesce(public.organizations.created_by, excluded.created_by),
  requested_owner_email = coalesce(public.organizations.requested_owner_email, excluded.requested_owner_email),
  approved_by = coalesce(public.organizations.approved_by, excluded.approved_by),
  approved_at = coalesce(public.organizations.approved_at, now());

insert into public.users (
  id,
  email,
  role,
  organization_id,
  status
)
values (
  'ea1288c5-220c-490d-9f04-f3a38ec95bcd',
  'roshaanpeeris@gmail.com',
  'ADMIN',
  'fb4b79a4-c24a-401f-b4c7-1f1a2594dc7e',
  'ACTIVE'
)
on conflict (id) do update
set
  email = excluded.email,
  role = excluded.role,
  organization_id = excluded.organization_id,
  status = 'ACTIVE';

update auth.users
set
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'email_verified', true,
      'organization_id', 'fb4b79a4-c24a-401f-b4c7-1f1a2594dc7e'
    ),
  raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'organization_id', 'fb4b79a4-c24a-401f-b4c7-1f1a2594dc7e'
    )
where id = 'ea1288c5-220c-490d-9f04-f3a38ec95bcd';

commit;

select
  users.id,
  users.email,
  users.role,
  users.status as user_status,
  users.organization_id,
  organizations.name as organization_name,
  organizations.status as organization_status
from public.users users
left join public.organizations organizations on organizations.id = users.organization_id
where users.id = 'ea1288c5-220c-490d-9f04-f3a38ec95bcd';
