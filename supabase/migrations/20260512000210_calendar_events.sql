-- Calendar Events Table Migration
-- Creates calendar_events table for dashboard notes and events

create table if not exists public.calendar_events (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

    created_by text,

    title text not null,

    description text,

    event_date date not null,

    event_type text not null default 'note'
    check (
        event_type in (
            'note',
            'hearing',
            'deadline',
            'meeting'
        )
    ),

    color text default '#3A5BA0',

    created_at timestamptz default timezone('utc', now()),

    updated_at timestamptz default timezone('utc', now())
);

-- Indexes for performance
create index if not exists idx_calendar_org
on public.calendar_events(organization_id);

create index if not exists idx_calendar_date
on public.calendar_events(event_date);

create index if not exists idx_calendar_org_date
on public.calendar_events(
    organization_id,
    event_date
);

-- Enable RLS
alter table public.calendar_events
enable row level security;

-- RLS Policies
create policy "calendar_select"
on public.calendar_events
for select
using (
    organization_id = public.get_user_organization_id()
);

create policy "calendar_insert"
on public.calendar_events
for insert
with check (
    organization_id = public.get_user_organization_id()
);

create policy "calendar_update"
on public.calendar_events
for update
using (
    organization_id = public.get_user_organization_id()
);

create policy "calendar_delete"
on public.calendar_events
for delete
using (
    organization_id = public.get_user_organization_id()
);