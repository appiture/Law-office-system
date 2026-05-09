-- ============================================================
-- fix_superadmin_status.sql
--
-- Fixes: platform admin account stuck at PENDING_APPROVAL
-- because public.users has no organization_id and the
-- sync_auth_user_membership trigger defaulted status to
-- PENDING_APPROVAL.
--
-- Platform admins do NOT belong to any org, so their status
-- must be manually set to ACTIVE.
-- ============================================================

begin;

-- Step 1: Ensure the Supabase auth user has a public.users profile.
-- Replace the email below with the actual super admin email
-- if different from appiture.business@gmail.com.
INSERT INTO public.users (id, email, role, organization_id, status)
SELECT
  au.id,
  lower(au.email),
  'ADMIN',
  NULL,
  'ACTIVE'
FROM auth.users au
WHERE lower(au.email) = lower('appiture.business@gmail.com')
ON CONFLICT (id) DO UPDATE
SET
  email           = EXCLUDED.email,
  role            = 'ADMIN',
  organization_id = NULL,
  status          = 'ACTIVE';

-- Step 2: Confirm the platform_admins row exists for this user.
-- Upsert by email because some installs do not have a unique constraint
-- on platform_admins.user_id, so ON CONFLICT (user_id) can fail.
INSERT INTO public.platform_admins (user_id, email)
SELECT
  u.id,
  lower(u.email)
FROM public.users u
WHERE lower(u.email) = lower('appiture.business@gmail.com')
ON CONFLICT (email) DO UPDATE
SET user_id = EXCLUDED.user_id;

-- Verify: run this SELECT after the migration to confirm.
-- Expected: status = ACTIVE, is_platform_admin = true
SELECT
  u.id,
  u.email,
  u.status,
  u.role,
  u.organization_id,
  EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = u.id OR lower(pa.email) = lower(u.email)
  ) AS is_platform_admin
FROM public.users u
WHERE lower(u.email) = lower('appiture.business@gmail.com');

commit;
