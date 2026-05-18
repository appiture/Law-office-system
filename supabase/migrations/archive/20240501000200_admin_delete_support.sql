-- Support platform-admin hard deletion from the admin-delete Edge Function.

alter table public.platform_admins
  add column if not exists created_by uuid references auth.users(id) on delete set null;
