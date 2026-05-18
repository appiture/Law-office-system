-- Lawyer RLS Hardening Migration
-- Restricts lawyer access to assigned cases only at the DB level

-- 1. Drop old permissive policies
drop policy if exists cases_tenant_all on public.cases;
drop policy if exists followups_tenant_all on public.followups;
drop policy if exists documents_tenant_all on public.documents;
drop policy if exists payments_tenant_all on public.payments;

-- 2. Hardened Cases Policies
drop policy if exists cases_tenant_read on public.cases;
create policy cases_tenant_read on public.cases
for select using (
  public.is_platform_admin()
  or (
    organization_id = public.current_organization_id()
    and (
      public.current_user_role() in ('ADMIN', 'STAFF')
      or (public.current_user_role() = 'LAWYER' and assigned_lawyer_id = auth.uid())
    )
  )
);

drop policy if exists cases_tenant_insert on public.cases;
create policy cases_tenant_insert on public.cases
for insert with check (
  organization_id = public.current_organization_id()
  and public.current_user_role() in ('ADMIN', 'STAFF')
);

drop policy if exists cases_tenant_update on public.cases;
create policy cases_tenant_update on public.cases
for update using (
  organization_id = public.current_organization_id()
  and public.current_user_role() in ('ADMIN', 'STAFF')
)
with check (
  organization_id = public.current_organization_id()
);

drop policy if exists cases_tenant_delete on public.cases;
create policy cases_tenant_delete on public.cases
for delete using (
  organization_id = public.current_organization_id()
  and public.current_user_role() = 'ADMIN'
);

-- 3. Hardened FollowUps Policies (Linked to Cases)
drop policy if exists followups_tenant_read on public.followups;
create policy followups_tenant_read on public.followups
for select using (
  public.is_platform_admin()
  or exists (
    select 1 from public.cases c
    where c.id = case_id
      and c.organization_id = public.current_organization_id()
      and (
        public.current_user_role() in ('ADMIN', 'STAFF')
        or (public.current_user_role() = 'LAWYER' and c.assigned_lawyer_id = auth.uid())
      )
  )
);

drop policy if exists followups_tenant_write on public.followups;
create policy followups_tenant_write on public.followups
for all using (
  organization_id = public.current_organization_id()
  and public.current_user_role() in ('ADMIN', 'STAFF', 'LAWYER')
)
with check (
  organization_id = public.current_organization_id()
);

-- 4. Hardened Documents Policies
drop policy if exists documents_tenant_read on public.documents;
create policy documents_tenant_read on public.documents
for select using (
  public.is_platform_admin()
  or exists (
    select 1 from public.cases c
    where c.id = case_id
      and c.organization_id = public.current_organization_id()
      and (
        public.current_user_role() in ('ADMIN', 'STAFF')
        or (public.current_user_role() = 'LAWYER' and c.assigned_lawyer_id = auth.uid())
      )
  )
);

drop policy if exists documents_tenant_write on public.documents;
create policy documents_tenant_write on public.documents
for all using (
  organization_id = public.current_organization_id()
  and public.current_user_role() in ('ADMIN', 'STAFF', 'LAWYER')
)
with check (
  organization_id = public.current_organization_id()
);

-- 5. Hardened Payments Policies
drop policy if exists payments_tenant_read on public.payments;
create policy payments_tenant_read on public.payments
for select using (
  public.is_platform_admin()
  or exists (
    select 1 from public.cases c
    where c.id = case_id
      and c.organization_id = public.current_organization_id()
      and (
        public.current_user_role() in ('ADMIN', 'STAFF')
        or (public.current_user_role() = 'LAWYER' and c.assigned_lawyer_id = auth.uid())
      )
  )
);

drop policy if exists payments_tenant_write on public.payments;
create policy payments_tenant_write on public.payments
for all using (
  organization_id = public.current_organization_id()
  and public.current_user_role() in ('ADMIN', 'STAFF')
)
with check (
  organization_id = public.current_organization_id()
);
