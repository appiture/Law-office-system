
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

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, auth, app_private
as $$
  select app_private.current_user_role()
$$;

grant execute on function app_private.current_user_role() to authenticated;
grant execute on function public.current_user_role() to authenticated;
