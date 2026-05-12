-- Calendar Events Table Migration
-- Creates the calendar_events table for dashboard notes and events

create table if not exists public.calendar_events (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    created_by uuid
        references auth.users(id)
        on delete set null,

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

    color text not null default '#3A5BA0',

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

-- Indexes for performance
create index if not exists idx_calendar_events_org
on public.calendar_events(organization_id);

create index if not exists idx_calendar_events_date
on public.calendar_events(event_date);

create index if not exists idx_calendar_events_org_date
on public.calendar_events(
    organization_id,
    event_date
);

-- Enable RLS
alter table public.calendar_events
enable row level security;

-- RLS Policies
create policy "calendar_events_select"
on public.calendar_events
for select
using (
    organization_id = public.get_user_organization_id()
);

create policy "calendar_events_insert"
on public.calendar_events
for insert
with check (
    organization_id = public.get_user_organization_id()
);

create policy "calendar_events_update"
on public.calendar_events
for update
using (
    organization_id = public.get_user_organization_id()
);

create policy "calendar_events_delete"
on public.calendar_events
for delete
using (
    organization_id = public.get_user_organization_id()
);

-- Updated at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_calendar_events_updated_at
on public.calendar_events;

create trigger trg_calendar_events_updated_at
before update
on public.calendar_events
for each row
execute function public.set_updated_at();