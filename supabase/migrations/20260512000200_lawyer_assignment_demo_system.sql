-- Lawyer Assignment and Demo System Migration
-- Adds lawyer assignment fields to cases and demo system fields to organizations

alter table public.cases
add column if not exists assigned_lawyer_id uuid references auth.users(id);

alter table public.cases
add column if not exists assigned_by text;

alter table public.cases
add column if not exists assigned_at timestamptz;

alter table public.organizations
add column if not exists is_demo boolean default false;

alter table public.organizations
add column if not exists demo_started_at timestamptz;

alter table public.organizations
add column if not exists demo_expires_at timestamptz;

alter table public.organizations
add column if not exists converted_to_paid_at timestamptz;

alter table public.organizations
add column if not exists subscription_status text
default 'ACTIVE';