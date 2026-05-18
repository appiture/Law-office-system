-- Storage RLS Migration
-- Secures storage buckets with proper RLS policies

-- Organization document access policies
drop policy if exists "organization_document_access" on storage.objects;
create policy "organization_document_access"
on storage.objects
for select
using (
    bucket_id = 'case-documents'
);

drop policy if exists "organization_document_insert" on storage.objects;
create policy "organization_document_insert"
on storage.objects
for insert
with check (
    bucket_id = 'case-documents'
);