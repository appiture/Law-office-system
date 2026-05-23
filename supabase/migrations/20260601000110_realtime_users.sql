-- Add public.users to the supabase_realtime publication to enable
-- frontend listeners to invalidate session cache immediately upon role changes.

DO $$
BEGIN
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
    and n.nspname = 'public'
    and c.relname = 'users'
  ) then
    alter publication supabase_realtime add table public.users;
  end if;
END
$$;
