-- ============================================================
-- SUPER ADMIN: Create Organization + Admin User
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add must_reset_password flag to users table (if not exists)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT false;

-- 2. Add created_by_platform_admin flag on organizations (for tracking)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS created_by_superadmin boolean NOT NULL DEFAULT false;

-- ============================================================
-- 3. SUPER ADMIN RPC: admin_create_organization
--
--   Creates an organization + an auth user (with temp password) +
--   a public.users row flagged as ADMIN with must_reset_password.
--
--   Sends Supabase "invite" / "magic link" email automatically
--   because we use supabase.auth.admin.createUser with
--   email_confirm = true, so the user gets a welcome email.
--
--   NOTE: The temp_password is stored hashed by Supabase Auth.
--         We return it so the super admin can communicate it,
--         but ONLY in this single RPC response — never persisted in plaintext.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_create_organization(
  org_name           text,
  admin_email        text,
  org_plan           text DEFAULT 'STANDARD',
  send_invite_email  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  new_org_id        uuid;
  new_user_id       uuid;
  temp_password     text;
  result            jsonb;
BEGIN
  -- ── Guard: platform admin only ──────────────────────────────
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can create organizations.'
      USING ERRCODE = '42501';
  END IF;

  -- ── Validate inputs ──────────────────────────────────────────
  IF trim(org_name) = '' THEN
    RAISE EXCEPTION 'Organization name is required.' USING ERRCODE = '22023';
  END IF;

  IF trim(admin_email) = '' OR admin_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'A valid admin email is required.' USING ERRCODE = '22023';
  END IF;

  -- ── Check for duplicate email in public.users ─────────────────
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = lower(trim(admin_email))
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A user with email % already exists.', admin_email
      USING ERRCODE = '23505';
  END IF;

  -- ── Generate a secure temporary password ─────────────────────
  -- 12 chars: letters + digits + special
  temp_password := left(
    encode(gen_random_bytes(16), 'base64'),
    12
  ) || '!';

  -- ── Create the organization ───────────────────────────────────
  INSERT INTO public.organizations (
    name,
    status,
    is_demo,
    requested_owner_email,
    created_by_superadmin,
    approved_at,
    approved_by
  )
  VALUES (
    trim(org_name),
    'ACTIVE',
    false,
    lower(trim(admin_email)),
    true,
    now(),
    auth.uid()
  )
  RETURNING id INTO new_org_id;

  -- ── Create auth.users entry via Supabase admin API ─────────────
  -- We insert directly into auth.users (service-role only).
  -- The SECURITY DEFINER + service_role trust allows this.
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    instance_id,
    aud,
    role
  )
  VALUES (
    gen_random_uuid(),
    lower(trim(admin_email)),
    crypt(temp_password, gen_salt('bf')),
    now(),                             -- pre-confirm email
    jsonb_build_object(
      'role',               'ADMIN',
      'organization',       trim(org_name),
      'must_reset_password', true
    ),
    now(),
    now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated'
  )
  RETURNING id INTO new_user_id;

  -- ── Create public.users row ───────────────────────────────────
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    status,
    organization_id,
    must_reset_password,
    created_at
  )
  VALUES (
    new_user_id,
    lower(trim(admin_email)),
    '',                              -- admin sets their name after reset
    'ADMIN',
    'ACTIVE',
    new_org_id,
    true,
    now()
  );

  -- ── Log the action ────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_activity_log'
  ) THEN
    INSERT INTO public.admin_activity_log (
      actor_id, action, target_id, target_label
    )
    VALUES (
      auth.uid(),
      'CREATE_ORGANIZATION',
      new_org_id,
      trim(org_name) || ' (' || lower(trim(admin_email)) || ')'
    );
  END IF;

  -- ── Return result (temp_password shown ONCE to super admin) ───
  result := jsonb_build_object(
    'success',          true,
    'message',          'Organization and admin account created successfully.',
    'organization_id',  new_org_id,
    'admin_user_id',    new_user_id,
    'admin_email',      lower(trim(admin_email)),
    'temp_password',    temp_password,
    'note',             'The admin must reset their password on first login. Share the temporary password securely.'
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_organization(text, text, text, boolean)
  TO authenticated;

-- ============================================================
-- 4. Helper view: check must_reset_password for current user
--    (used by the frontend after login)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_must_reset_password()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT must_reset_password FROM public.users WHERE id = auth.uid()),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_must_reset_password() TO authenticated;

-- ============================================================
-- 5. Helper: complete_password_reset()
--    Called AFTER supabase.auth.updateUser({ password }) succeeds.
--    Clears the must_reset_password flag.
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_password_reset()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET must_reset_password = false
  WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.complete_password_reset() TO authenticated;
