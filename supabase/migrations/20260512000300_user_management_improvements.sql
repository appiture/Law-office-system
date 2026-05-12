-- User Management Improvements Migration
-- Adds soft delete, invite status, and other user management enhancements

-- Add soft delete column
alter table public.users
add column if not exists deleted_at timestamptz;

-- Add invite status column
alter table public.users
add column if not exists invite_status text
default 'ACTIVE';

-- Create unique index for active emails (prevents duplicates)
create unique index if not exists unique_active_user_email
on public.users(lower(email))
where deleted_at is null;