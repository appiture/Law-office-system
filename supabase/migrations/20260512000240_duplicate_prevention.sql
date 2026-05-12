-- Duplicate Prevention Migration
-- Adds unique constraints to prevent duplicate data

alter table public.cases
add constraint unique_case_number_per_org
unique (
    organization_id,
    case_number
);

-- Client email unique (safe version - only where not null)
create unique index if not exists unique_client_email_per_org
on public.clients(
    organization_id,
    lower(email)
)
where email is not null;