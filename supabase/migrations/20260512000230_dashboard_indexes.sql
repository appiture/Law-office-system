-- Dashboard Performance Indexes Migration
-- Adds indexes to optimize dashboard queries and common lookups

create index if not exists idx_clients_org
on public.clients(organization_id);

create index if not exists idx_cases_org_status
on public.cases(
    organization_id,
    status
);

create index if not exists idx_cases_lawyer
on public.cases(
    assigned_lawyer_id
);

create index if not exists idx_payments_org
on public.payments(organization_id);

create index if not exists idx_followups_org_date
on public.followups(
    organization_id,
    date
);

create index if not exists idx_documents_org
on public.documents(organization_id);