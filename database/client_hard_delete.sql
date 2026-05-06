-- Permanently removes a client and all linked workspace records.
-- Run this in Supabase SQL editor before using the client hard-delete button.

begin;

create or replace function public.hard_delete_client(target_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  signed_in_user_id uuid := auth.uid();
  target_organization_id uuid;
  allowed boolean;
begin
  if signed_in_user_id is null then
    raise exception 'No authenticated Supabase session.' using errcode = '28000';
  end if;

  select clients.organization_id
  into target_organization_id
  from public.clients clients
  where clients.id = target_client_id;

  if target_organization_id is null then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.users users
    where users.id = signed_in_user_id
      and users.organization_id = target_organization_id
      and users.status = 'ACTIVE'
      and users.role in ('ADMIN', 'LAWYER')
  )
  or public.is_platform_admin()
  into allowed;

  if not coalesce(allowed, false) then
    raise exception 'You do not have permission to permanently delete this client.' using errcode = '42501';
  end if;

  delete from public.payment_history
  where organization_id = target_organization_id
    and case_id in (
      select id from public.cases
      where client_id = target_client_id
        and organization_id = target_organization_id
    );

  delete from public.documents
  where organization_id = target_organization_id
    and case_id in (
      select id from public.cases
      where client_id = target_client_id
        and organization_id = target_organization_id
    );

  delete from public.followups
  where organization_id = target_organization_id
    and case_id in (
      select id from public.cases
      where client_id = target_client_id
        and organization_id = target_organization_id
    );

  delete from public.payment_charges
  where organization_id = target_organization_id
    and case_id in (
      select id from public.cases
      where client_id = target_client_id
        and organization_id = target_organization_id
    );

  delete from public.payments
  where organization_id = target_organization_id
    and case_id in (
      select id from public.cases
      where client_id = target_client_id
        and organization_id = target_organization_id
    );

  delete from public.cases
  where organization_id = target_organization_id
    and client_id = target_client_id;

  delete from public.clients
  where organization_id = target_organization_id
    and id = target_client_id;
end;
$$;

revoke all on function public.hard_delete_client(uuid) from public;
grant execute on function public.hard_delete_client(uuid) to authenticated;

commit;
