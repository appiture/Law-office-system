

create extension if not exists pgcrypto;

-- =========================================================
-- TASKS TABLE
-- =========================================================

create table if not exists public.tasks (

    id uuid primary key
    default gen_random_uuid(),

    organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

    case_id uuid
    references public.cases(id)
    on delete set null,

    assigned_to uuid
    references public.users(id)
    on delete set null,

    created_by uuid
    references public.users(id)
    on delete set null,

    title text not null,

    description text,

    priority text not null
    default 'MEDIUM'
    check (
        priority in (
            'LOW',
            'MEDIUM',
            'HIGH',
            'URGENT'
        )
    ),

    status text not null
    default 'PENDING'
    check (
        status in (
            'PENDING',
            'IN_PROGRESS',
            'COMPLETED',
            'CANCELLED'
        )
    ),

    due_date timestamptz,

    completed_at timestamptz,

    deleted_at timestamptz,

    created_at timestamptz not null
    default timezone('utc', now()),

    updated_at timestamptz not null
    default timezone('utc', now())
);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists idx_tasks_org
on public.tasks(organization_id);

create index if not exists idx_tasks_case
on public.tasks(case_id);

create index if not exists idx_tasks_assigned
on public.tasks(assigned_to);

create index if not exists idx_tasks_status
on public.tasks(status);

create index if not exists idx_tasks_priority
on public.tasks(priority);

create index if not exists idx_tasks_due
on public.tasks(due_date);

create index if not exists idx_tasks_deleted
on public.tasks(deleted_at);

create index if not exists idx_tasks_created
on public.tasks(created_at desc);

-- =========================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =========================================================

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

-- =========================================================
-- DROP OLD TRIGGER IF EXISTS
-- =========================================================

drop trigger if exists trg_tasks_updated_at
on public.tasks;

-- =========================================================
-- CREATE UPDATED_AT TRIGGER
-- =========================================================

create trigger trg_tasks_updated_at
before update
on public.tasks
for each row
execute function public.update_updated_at_column();

-- =========================================================
-- ENABLE ROW LEVEL SECURITY
-- =========================================================

alter table public.tasks
enable row level security;

-- =========================================================
-- DROP OLD POLICIES IF THEY EXIST
-- =========================================================

drop policy if exists "organization isolated tasks"
on public.tasks;

drop policy if exists "tasks_select_policy"
on public.tasks;

drop policy if exists "tasks_insert_policy"
on public.tasks;

drop policy if exists "tasks_update_policy"
on public.tasks;

drop policy if exists "tasks_delete_policy"
on public.tasks;

-- =========================================================
-- MAIN MULTI-TENANT POLICY
-- =========================================================

create policy "organization isolated tasks"
on public.tasks
for all
to authenticated
using (
    organization_id in (
        select organization_id
        from public.users
        where id = auth.uid()
          and deleted_at is null
    )
)
with check (
    organization_id in (
        select organization_id
        from public.users
        where id = auth.uid()
          and deleted_at is null
    )
);

-- =========================================================
-- TASKS PERMISSION SEED
-- =========================================================

insert into public.organization_permissions (
    organization_id,
    section,
    enabled,
    updated_at
)
select
    org.id,
    'tasks',
    true,
    now()
from public.organizations org
where not exists (
    select 1
    from public.organization_permissions op
    where op.organization_id = org.id
      and op.section = 'tasks'
);

-- =========================================================
-- OPTIONAL: REALTIME SUPPORT
-- =========================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
    and n.nspname = 'public'
    and c.relname = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

-- =========================================================
-- GRANTS
-- =========================================================

grant all on public.tasks to authenticated;

grant all on public.tasks to service_role;

-- =========================================================
-- REFRESH POSTGREST SCHEMA CACHE
-- =========================================================

notify pgrst, 'reload schema';

-- =========================================================
-- COMMENTS
-- =========================================================

comment on table public.tasks is
'Organization based task management system for legal workflow tracking';

comment on column public.tasks.priority is
'LOW | MEDIUM | HIGH | URGENT';

comment on column public.tasks.status is
'PENDING | IN_PROGRESS | COMPLETED | CANCELLED';

comment on column public.tasks.deleted_at is
'Soft delete timestamp';

-- =========================================================
-- DONE
-- =========================================================