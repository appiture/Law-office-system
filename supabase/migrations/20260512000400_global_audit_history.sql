create table if not exists public.system_audit_logs (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid
    references public.organizations(id)
    on delete cascade,

    actor_id uuid,

    actor_email text,

    actor_role text,

    entity_type text not null,

    entity_id uuid,

    entity_name text,

    action_type text not null,

    module text not null,

    description text,

    metadata jsonb default '{}'::jsonb,

    ip_address text,

    user_agent text,

    created_at timestamptz
    default timezone('utc', now())
);

create index if not exists idx_audit_org
on public.system_audit_logs(organization_id);

create index if not exists idx_audit_actor
on public.system_audit_logs(actor_id);

create index if not exists idx_audit_module
on public.system_audit_logs(module);

create index if not exists idx_audit_action
on public.system_audit_logs(action_type);

create index if not exists idx_audit_created
on public.system_audit_logs(created_at desc);

alter table public.system_audit_logs
enable row level security;

drop policy if exists superadmin_audit_access
on public.system_audit_logs;

drop policy if exists orgadmin_audit_access
on public.system_audit_logs;

create policy superadmin_audit_access
on public.system_audit_logs
for select
using (
  exists (
    select 1
    from platform_admins
    where user_id = auth.uid()
  )
);

create policy orgadmin_audit_access
on public.system_audit_logs
for select
using (
  organization_id in (
    select organization_id
    from users
    where
      id = auth.uid()
      and role = 'ADMIN'
      and status = 'ACTIVE'
  )
);

create or replace function public.log_system_event(
    p_organization_id uuid,
    p_actor_id uuid,
    p_actor_email text,
    p_actor_role text,
    p_entity_type text,
    p_entity_id uuid,
    p_entity_name text,
    p_action_type text,
    p_module text,
    p_description text,
    p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
begin

    insert into public.system_audit_logs(
        organization_id,
        actor_id,
        actor_email,
        actor_role,
        entity_type,
        entity_id,
        entity_name,
        action_type,
        module,
        description,
        metadata
    )
    values (
        p_organization_id,
        p_actor_id,
        p_actor_email,
        p_actor_role,
        p_entity_type,
        p_entity_id,
        p_entity_name,
        p_action_type,
        p_module,
        p_description,
        p_metadata
    );

end;
$$;
