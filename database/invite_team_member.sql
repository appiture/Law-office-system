-- ============================================================
-- ORG ADMIN: Invite Team Member (Staff / Lawyer)
-- Creates auth user + public.users with temp password.
-- Must be run AFTER create_organization_by_superadmin.sql
-- (which adds the must_reset_password column).
-- ============================================================

-- ============================================================
-- 1. RPC: admin_invite_team_member
--
--   Called by an ADMIN user to add a LAWYER or STAFF to their org.
--   Creates:
--     - auth.users entry (with temp password, email pre-confirmed)
--     - public.users row (role = invite_role, must_reset_password = true)
--   Returns:
--     { success, admin_email, temp_password, user_id, organization_id }
--   The temp_password is shown ONCE to the org admin who invited them.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_invite_team_member(
  invite_email  text,
  invite_role   text   -- 'LAWYER' or 'STAFF'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_org_id   uuid;
  caller_role     text;
  new_user_id     uuid;
  temp_password   text;
  result          jsonb;
BEGIN
  -- ── Identify caller ──────────────────────────────────────────
  SELECT u.organization_id, u.role
    INTO caller_org_id, caller_role
    FROM public.users u
   WHERE u.id = auth.uid();

  IF caller_org_id IS NULL THEN
    RAISE EXCEPTION 'You are not associated with any organization.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Guard: org admin or platform admin only ───────────────────
  IF caller_role != 'ADMIN' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only organization administrators can invite team members.'
      USING ERRCODE = '42501';
  END IF;

  -- ── Validate role ─────────────────────────────────────────────
  IF invite_role NOT IN ('LAWYER', 'STAFF') THEN
    RAISE EXCEPTION 'Invalid role. Must be LAWYER or STAFF.'
      USING ERRCODE = '22023';
  END IF;

  -- ── Validate email ────────────────────────────────────────────
  IF trim(invite_email) = '' OR invite_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'A valid email address is required.'
      USING ERRCODE = '22023';
  END IF;

  -- ── Check for duplicate in public.users ───────────────────────
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = lower(trim(invite_email))
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A user with email % already exists in the system.', invite_email
      USING ERRCODE = '23505';
  END IF;

  -- ── Generate secure temp password (12 chars + !) ─────────────
  temp_password := left(
    encode(gen_random_bytes(16), 'base64'),
    12
  ) || '!';

  -- ── Create auth.users entry ───────────────────────────────────
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
    lower(trim(invite_email)),
    crypt(temp_password, gen_salt('bf')),
    now(),                              -- pre-confirm so they can log in immediately
    jsonb_build_object(
      'role',                invite_role,
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
    lower(trim(invite_email)),
    '',
    invite_role,
    'ACTIVE',
    caller_org_id,
    true,
    now()
  );

  -- ── Optional: record invite in organization_invites ───────────
  INSERT INTO public.organization_invites (
    organization_id,
    email,
    role,
    invited_by,
    status,
    accepted_by,
    accepted_at
  )
  VALUES (
    caller_org_id,
    lower(trim(invite_email)),
    invite_role,
    auth.uid(),
    'ACCEPTED',          -- already accepted since we created the account directly
    new_user_id,
    now()
  )
  ON CONFLICT (organization_id, email) DO UPDATE
    SET status      = 'ACCEPTED',
        accepted_by = new_user_id,
        accepted_at = now();

  -- ── Return ────────────────────────────────────────────────────
  result := jsonb_build_object(
    'success',          true,
    'message',          'Team member added successfully. Share the temporary password securely.',
    'user_id',          new_user_id,
    'admin_email',      lower(trim(invite_email)),
    'role',             invite_role,
    'organization_id',  caller_org_id,
    'temp_password',    temp_password,
    'note',             'The member must reset their password on first login.'
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_invite_team_member(text, text)
  TO authenticated;
