create extension if not exists "pgcrypto";

create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid,
  requested_owner_email text,
  status text not null default 'PENDING_APPROVAL' check (status in ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED')),
  is_demo boolean not null default false,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.organizations add column if not exists requested_owner_email text;
alter table public.organizations add column if not exists status text not null default 'PENDING_APPROVAL';
alter table public.organizations add column if not exists is_demo boolean not null default false;
alter table public.organizations add column if not exists approved_by uuid;
alter table public.organizations add column if not exists approved_at timestamptz;
alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check
  check (status in ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED'));

create table if not exists public.users (
  id uuid primary key,
  email text not null unique,
  role text not null check (role in ('ADMIN', 'LAWYER', 'STAFF')),
  organization_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'INVITED', 'PENDING_APPROVAL')),
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists status text not null default 'ACTIVE';
alter table public.users drop constraint if exists users_status_check;
alter table public.users
  add constraint users_status_check
  check (status in ('ACTIVE', 'INACTIVE', 'INVITED', 'PENDING_APPROVAL'));

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('ADMIN', 'LAWYER', 'STAFF')),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'CANCELLED')),
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists organization_invites_pending_unique_idx
  on public.organization_invites (organization_id, lower(email))
  where status = 'PENDING';

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  photo_url text,
  photo_path text,
  address text,
  notes text,
  id_proof jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text,
  legacy_id bigint
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  case_number text not null,
  case_type text not null,
  court_name text,
  lawyer_name text,
  status text not null default 'OPEN',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  legacy_id bigint
);

alter table public.cases drop constraint if exists cases_case_number_key;
create unique index if not exists cases_org_case_number_unique_idx
  on public.cases (organization_id, lower(case_number));

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_charges (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  total numeric(12,2) not null,
  paid numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  due_date date,
  status text not null default 'UNPAID',
  display_order integer not null default 0,
  description text,
  is_lawyer_fee boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_charge_id uuid references public.payment_charges(id) on delete set null,
  charge_name text not null,
  amount_paid numeric(12,2) not null,
  payment_mode text not null,
  payment_reference text,
  "timestamp" timestamptz not null default now(),
  updated_by text
);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,
  title text not null,
  date timestamptz not null,
  notes text,
  status text not null,
  postponed_to timestamptz,
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_url text,
  file_path text,
  file_name text not null,
  file_type text,
  file_size bigint,
  category text not null,
  description text,
  created_at timestamptz not null default now(),
  uploaded_by text
);

-- ============================================================
-- Performance indexes for multi-tenant RLS queries
-- ============================================================

create index if not exists idx_clients_organization
  on public.clients (organization_id);

create index if not exists idx_cases_organization
  on public.cases (organization_id);

create index if not exists idx_cases_client
  on public.cases (client_id);

create index if not exists idx_payments_organization
  on public.payments (organization_id);

create index if not exists idx_payments_case
  on public.payments (case_id);

create index if not exists idx_payment_charges_organization
  on public.payment_charges (organization_id);

create index if not exists idx_payment_charges_case
  on public.payment_charges (case_id);

create index if not exists idx_payment_history_organization
  on public.payment_history (organization_id);

create index if not exists idx_payment_history_case
  on public.payment_history (case_id);

create index if not exists idx_followups_organization
  on public.followups (organization_id);

create index if not exists idx_followups_case
  on public.followups (case_id);

create index if not exists idx_followups_date
  on public.followups (date);

create index if not exists idx_documents_organization
  on public.documents (organization_id);

create index if not exists idx_documents_case
  on public.documents (case_id);

create index if not exists idx_users_organization
  on public.users (organization_id);

insert into public.organizations (name, status, is_demo)
select 'Law Office Demo Workspace', 'ACTIVE', true
where not exists (
  select 1
  from public.organizations
  where lower(name) = lower('Law Office Demo Workspace')
);

create or replace function public.normalize_email(value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(value, '')))
$$;

create or replace function public.sync_auth_user_membership()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := public.normalize_email(new.email);
  demo_org_id uuid;
  invited_org_id uuid;
  invited_role text;
  resolved_org_id uuid;
  resolved_role text;
  resolved_status text;
begin
  select id
  into demo_org_id
  from public.organizations
  where is_demo = true
  order by created_at asc
  limit 1;

  select organization_id, role
  into invited_org_id, invited_role
  from public.organization_invites
  where public.normalize_email(email) = normalized_email
    and status = 'PENDING'
  order by created_at desc
  limit 1;

  if normalized_email = 'demo@lawoffice.local' then
    resolved_org_id := demo_org_id;
    resolved_role := 'ADMIN';
  elsif invited_org_id is not null then
    resolved_org_id := invited_org_id;
    resolved_role := invited_role;
  else
    resolved_org_id := coalesce(
      nullif(new.raw_user_meta_data ->> 'organization_id', '')::uuid,
      nullif(new.raw_app_meta_data ->> 'organization_id', '')::uuid
    );
    resolved_role := upper(coalesce(
      nullif(new.raw_user_meta_data ->> 'role', ''),
      nullif(new.raw_app_meta_data ->> 'role', ''),
      'LAWYER'
    ));
  end if;

  if resolved_role not in ('ADMIN', 'LAWYER', 'STAFF') then
    resolved_role := 'LAWYER';
  end if;

  resolved_status := case when resolved_org_id is null then 'PENDING_APPROVAL' else 'ACTIVE' end;

  insert into public.users (id, email, role, organization_id, status)
  values (new.id, normalized_email, resolved_role, resolved_org_id, resolved_status)
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role,
        organization_id = coalesce(excluded.organization_id, public.users.organization_id),
        status = case
          when coalesce(excluded.organization_id, public.users.organization_id) is null then 'PENDING_APPROVAL'
          else excluded.status
        end;

  if invited_org_id is not null then
    update public.organization_invites
    set
      status = 'ACCEPTED',
      accepted_by = new.id,
      accepted_at = now()
    where organization_id = invited_org_id
      and public.normalize_email(email) = normalized_email
      and status = 'PENDING';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_synced on auth.users;
create trigger on_auth_user_synced
after insert or update on auth.users
for each row execute function public.sync_auth_user_membership();

create or replace function public.enforce_case_client_organization()
returns trigger
language plpgsql
as $$
declare
  client_org_id uuid;
begin
  select organization_id into client_org_id
  from public.clients
  where id = new.client_id;

  if client_org_id is null then
    raise exception 'Client does not exist';
  end if;

  if client_org_id <> new.organization_id then
    raise exception 'Case organization must match the selected client organization';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_case_payment_organization()
returns trigger
language plpgsql
as $$
declare
  case_org_id uuid;
begin
  select organization_id into case_org_id
  from public.cases
  where id = new.case_id;

  if case_org_id is null then
    raise exception 'Case does not exist';
  end if;

  if case_org_id <> new.organization_id then
    raise exception 'Payment organization must match the case organization';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_charge_organization()
returns trigger
language plpgsql
as $$
declare
  case_org_id uuid;
  payment_org_id uuid;
  payment_case_id uuid;
begin
  select organization_id into case_org_id
  from public.cases
  where id = new.case_id;

  select organization_id, case_id into payment_org_id, payment_case_id
  from public.payments
  where id = new.payment_id;

  if case_org_id is null then
    raise exception 'Case does not exist';
  end if;

  if payment_org_id is null then
    raise exception 'Payment shell does not exist';
  end if;

  if case_org_id <> new.organization_id
     or payment_org_id <> new.organization_id
     or payment_case_id <> new.case_id then
    raise exception 'Charge item organization and case references must stay within the same organization';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_payment_history_organization()
returns trigger
language plpgsql
as $$
declare
  case_org_id uuid;
  charge_org_id uuid;
  charge_case_id uuid;
begin
  select organization_id into case_org_id
  from public.cases
  where id = new.case_id;

  select organization_id, case_id into charge_org_id, charge_case_id
  from public.payment_charges
  where id = new.payment_charge_id;

  if case_org_id is null then
    raise exception 'Case does not exist';
  end if;

  if charge_org_id is null then
    raise exception 'Charge item does not exist';
  end if;

  if case_org_id <> new.organization_id
     or charge_org_id <> new.organization_id
     or charge_case_id <> new.case_id then
    raise exception 'Payment history must stay linked to the same case and organization';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_case_child_organization()
returns trigger
language plpgsql
as $$
declare
  case_org_id uuid;
begin
  select organization_id into case_org_id
  from public.cases
  where id = new.case_id;

  if case_org_id is null then
    raise exception 'Case does not exist';
  end if;

  if case_org_id <> new.organization_id then
    raise exception 'Child record organization must match the case organization';
  end if;

  return new;
end;
$$;

drop trigger if exists cases_enforce_client_org on public.cases;
create trigger cases_enforce_client_org
before insert or update on public.cases
for each row execute function public.enforce_case_client_organization();

drop trigger if exists payments_enforce_case_org on public.payments;
create trigger payments_enforce_case_org
before insert or update on public.payments
for each row execute function public.enforce_case_payment_organization();

drop trigger if exists charges_enforce_org on public.payment_charges;
create trigger charges_enforce_org
before insert or update on public.payment_charges
for each row execute function public.enforce_charge_organization();

drop trigger if exists payment_history_enforce_org on public.payment_history;
create trigger payment_history_enforce_org
before insert or update on public.payment_history
for each row execute function public.enforce_payment_history_organization();

drop trigger if exists followups_enforce_org on public.followups;
create trigger followups_enforce_org
before insert or update on public.followups
for each row execute function public.enforce_case_child_organization();

drop trigger if exists documents_enforce_org on public.documents;
create trigger documents_enforce_org
before insert or update on public.documents
for each row execute function public.enforce_case_child_organization();

create or replace function public.current_organization_id()
returns uuid
language sql
stable
as $$
  select organization_id
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
as $$
  select role
  from public.users users
  join public.organizations organizations on organizations.id = users.organization_id
  where users.id = auth.uid()
    and users.status = 'ACTIVE'
    and organizations.status = 'ACTIVE'
  limit 1
$$;

create or replace function public.current_storage_prefix()
returns text
language sql
stable
as $$
  select 'org-' || public.current_organization_id()::text || '/%'
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.platform_admins
    where user_id = auth.uid()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.organization_invites enable row level security;
alter table public.clients enable row level security;
alter table public.cases enable row level security;
alter table public.payments enable row level security;
alter table public.payment_charges enable row level security;
alter table public.payment_history enable row level security;
alter table public.followups enable row level security;
alter table public.documents enable row level security;

drop policy if exists platform_admins_self_read on public.platform_admins;
create policy platform_admins_self_read on public.platform_admins
for select using (
  user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists organizations_tenant_read on public.organizations;
create policy organizations_tenant_read on public.organizations
for select using (
  id = public.current_organization_id()
  or created_by = auth.uid()
  or public.is_platform_admin()
);

drop policy if exists organizations_self_create on public.organizations;
create policy organizations_self_create on public.organizations
for insert with check (
  created_by = auth.uid()
  and status = 'PENDING_APPROVAL'
);

drop policy if exists users_self_bootstrap on public.users;
create policy users_self_bootstrap on public.users
for insert with check (
  id = auth.uid()
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', email))
);

drop policy if exists users_tenant_read on public.users;
create policy users_tenant_read on public.users
for select using (
  id = auth.uid()
  or organization_id = public.current_organization_id()
  or public.is_platform_admin()
);

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
for update using (
  id = auth.uid()
)
with check (
  id = auth.uid()
  and (
    organization_id = public.current_organization_id()
    or status = 'PENDING_APPROVAL'
  )
);

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users
for update using (
  organization_id = public.current_organization_id()
  and public.current_user_role() = 'ADMIN'
)
with check (
  organization_id = public.current_organization_id()
);

drop policy if exists invites_tenant_access on public.organization_invites;
create policy invites_tenant_access on public.organization_invites
for select using (
  organization_id = public.current_organization_id()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_platform_admin()
);

drop policy if exists invites_admin_insert on public.organization_invites;
create policy invites_admin_insert on public.organization_invites
for insert with check (
  public.current_user_role() = 'ADMIN'
  and organization_id = public.current_organization_id()
);

drop policy if exists invites_admin_update on public.organization_invites;
create policy invites_admin_update on public.organization_invites
for update using (
  organization_id = public.current_organization_id()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_platform_admin()
)
with check (true);

drop policy if exists clients_tenant_all on public.clients;
create policy clients_tenant_all on public.clients
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

drop policy if exists cases_tenant_all on public.cases;
create policy cases_tenant_all on public.cases
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

drop policy if exists payments_tenant_all on public.payments;
create policy payments_tenant_all on public.payments
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

drop policy if exists payment_charges_tenant_all on public.payment_charges;
create policy payment_charges_tenant_all on public.payment_charges
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

drop policy if exists payment_history_tenant_all on public.payment_history;
create policy payment_history_tenant_all on public.payment_history
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

drop policy if exists followups_tenant_all on public.followups;
create policy followups_tenant_all on public.followups
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

drop policy if exists documents_tenant_all on public.documents;
create policy documents_tenant_all on public.documents
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

insert into storage.buckets (id, name, public)
values ('client-assets', 'client-assets', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

drop policy if exists client_assets_tenant_select on storage.objects;
create policy client_assets_tenant_select on storage.objects
for select using (
  bucket_id = 'client-assets'
  and name like public.current_storage_prefix()
);

drop policy if exists client_assets_tenant_insert on storage.objects;
create policy client_assets_tenant_insert on storage.objects
for insert with check (
  bucket_id = 'client-assets'
  and name like public.current_storage_prefix()
);

drop policy if exists client_assets_tenant_update on storage.objects;
create policy client_assets_tenant_update on storage.objects
for update using (
  bucket_id = 'client-assets'
  and name like public.current_storage_prefix()
)
with check (
  bucket_id = 'client-assets'
  and name like public.current_storage_prefix()
);

drop policy if exists client_assets_tenant_delete on storage.objects;
create policy client_assets_tenant_delete on storage.objects
for delete using (
  bucket_id = 'client-assets'
  and name like public.current_storage_prefix()
);

drop policy if exists case_documents_tenant_select on storage.objects;
create policy case_documents_tenant_select on storage.objects
for select using (
  bucket_id = 'case-documents'
  and name like public.current_storage_prefix()
);

drop policy if exists case_documents_tenant_insert on storage.objects;
create policy case_documents_tenant_insert on storage.objects
for insert with check (
  bucket_id = 'case-documents'
  and name like public.current_storage_prefix()
);

drop policy if exists case_documents_tenant_update on storage.objects;
create policy case_documents_tenant_update on storage.objects
for update using (
  bucket_id = 'case-documents'
  and name like public.current_storage_prefix()
)
with check (
  bucket_id = 'case-documents'
  and name like public.current_storage_prefix()
);

drop policy if exists case_documents_tenant_delete on storage.objects;
create policy case_documents_tenant_delete on storage.objects
for delete using (
  bucket_id = 'case-documents'
  and name like public.current_storage_prefix()
);
