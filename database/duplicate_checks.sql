-- Duplicate Check Queries
-- Run these BEFORE applying duplicate prevention migration

-- Check for duplicate case numbers across all organizations
select
    case_number,
    count(*)
from public.cases
group by case_number
having count(*) > 1;

-- Check for duplicate emails across all organizations
select
    email,
    count(*)
from public.clients
where email is not null
group by email
having count(*) > 1;