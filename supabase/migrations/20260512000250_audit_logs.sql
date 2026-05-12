-- Audit Logs Migration
-- Creates audit_logs table for tracking important actions

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid
    references public.organizations(id)
    on delete cascade,

    actor_id text,

    entity_type text not null,

    entity_id uuid,

    action text not null,

    metadata jsonb default '{}'::jsonb,

    created_at timestamptz
    default timezone('utc', now())
);

-- Indexes for audit log performance
create index if not exists idx_audit_org
on public.audit_logs(organization_id);

create index if not exists idx_audit_created
on public.audit_logs(created_at desc);

-- Enable RLS
alter table public.audit_logs
enable row level security;

-- RLS Policy
create policy "audit_select"
on public.audit_logs
for select
using (
    organization_id = public.get_user_organization_id()
);