-- Production Data Hardening Migration
-- Adds NOT NULL constraints to ensure data integrity

-- Client validations
alter table public.clients
alter column full_name set not null;

alter table public.clients
alter column phone set not null;

-- Case validations
alter table public.cases
alter column case_number set not null;

alter table public.cases
alter column status set not null;

-- Payment validations
alter table public.payments
alter column amount set not null;

alter table public.payments
alter column payment_date set not null;

-- Followups validations
alter table public.followups
alter column hearing_date set not null;

-- Documents validations
alter table public.documents
alter column document_url set not null;