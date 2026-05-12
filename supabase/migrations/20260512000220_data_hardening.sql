-- Data Hardening Migration
-- Adds NOT NULL constraints to ensure data integrity

-- Clients
alter table public.clients
alter column name set not null;

alter table public.clients
alter column phone set not null;

-- Cases
alter table public.cases
alter column case_number set not null;

alter table public.cases
alter column status set not null;

-- Payments
alter table public.payments
alter column total_amount set not null;

-- Followups
alter table public.followups
alter column date set not null;

-- Documents
alter table public.documents
alter column file_url set not null;