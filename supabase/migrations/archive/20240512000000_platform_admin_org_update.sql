-- Add update policy for platform admins to manage organizations
drop policy if exists organizations_platform_admin_update on public.organizations;
create policy organizations_platform_admin_update on public.organizations
for update
to authenticated
using (
  public.is_platform_admin()
)
with check (
  public.is_platform_admin()
);
