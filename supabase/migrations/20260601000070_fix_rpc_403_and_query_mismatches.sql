BEGIN;

-- ----------------------------------------------------------------
-- 1. Ensure subscription_status column exists on organizations
-- ----------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'ACTIVE';

-- ----------------------------------------------------------------
-- 2. Rebuild admin_create_organization with:
--    a) correct activity-log INSERT (uses actor_id column that now exists)
--    b) seeds default org permissions after creation
--    c) re-grants EXECUTE to authenticated (revoked by migration _0050)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_organization(
  org_name           text,
  admin_email        text,
  org_plan           text    DEFAULT 'STANDARD',
  send_invite_email  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  new_org_id    uuid;
  new_user_id   uuid;
  temp_password text;
  result        jsonb;
  actor_email   text;
BEGIN
  -- Guard: platform admin only
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can create organizations.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate inputs
  IF trim(org_name) = '' THEN
    RAISE EXCEPTION 'Organization name is required.' USING ERRCODE = '22023';
  END IF;

  IF trim(admin_email) = '' OR admin_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'A valid admin email is required.' USING ERRCODE = '22023';
  END IF;

  -- Check for duplicate
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = lower(trim(admin_email))
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A user with email % already exists.', admin_email
      USING ERRCODE = '23505';
  END IF;

  -- Generate secure temporary password (12 chars + !)
  temp_password := left(encode(gen_random_bytes(16), 'base64'), 12) || '!';

  -- Create the organization
  INSERT INTO public.organizations (
    name,
    status,
    subscription_status,
    is_demo,
    requested_owner_email,
    created_by_superadmin,
    approved_at,
    approved_by
  )
  VALUES (
    trim(org_name),
    'ACTIVE',
    CASE WHEN upper(trim(org_plan)) = 'DEMO' THEN 'TRIAL' ELSE 'ACTIVE' END,
    false,
    lower(trim(admin_email)),
    true,
    now(),
    auth.uid()
  )
  RETURNING id INTO new_org_id;

  -- Create auth.users entry
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
    now(),
    jsonb_build_object(
      'role',                'ADMIN',
      'organization',        trim(org_name),
      'organization_id',     new_org_id::text,
      'must_reset_password', true
    ),
    now(),
    now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated'
  )
  RETURNING id INTO new_user_id;

  -- Create public.users row
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
    '',
    'ADMIN',
    'ACTIVE',
    new_org_id,
    true,
    now()
  );

  -- Seed default org permissions (if table exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organization_permissions'
  ) THEN
    INSERT INTO public.organization_permissions (organization_id, section, enabled, updated_at)
    SELECT
      new_org_id,
      section_name,
      true,
      now()
    FROM unnest(ARRAY[
      'dashboard', 'clients', 'cases', 'payments',
      'documents', 'hearings', 'tasks', 'settings', 'team'
    ]) AS section_name
    ON CONFLICT (organization_id, section) DO NOTHING;
  END IF;

  -- Log the action (uses actor_id column added in _0060)
  SELECT public.current_admin_actor_email() INTO actor_email;

  INSERT INTO public.admin_activity_log (
    actor_id,
    actor_email,
    action,
    target_type,
    target_id,
    target_label,
    details
  )
  VALUES (
    auth.uid(),
    coalesce(actor_email, 'platform-admin'),
    'CREATE_ORGANIZATION',
    'organization',
    new_org_id::text,
    trim(org_name) || ' (' || lower(trim(admin_email)) || ')',
    jsonb_build_object(
      'org_plan', org_plan,
      'admin_email', lower(trim(admin_email)),
      'org_name', trim(org_name)
    )
  );

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

-- Re-grant execute (was revoked by migration 20240501000050)
GRANT EXECUTE ON FUNCTION public.admin_create_organization(text, text, text, boolean) TO authenticated;

-- ----------------------------------------------------------------
-- 3. Rebuild admin_invite_team_member with re-grant
--    (also revoked by migration _0050, frontend falls back to Edge
--    Function but the RPC path is preferred to avoid cold-start lag)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_invite_team_member(
  invite_email text,
  invite_role  text DEFAULT 'LAWYER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  current_org_id  uuid;
  caller_role     text;
  actor_email     text;
  new_user_id     uuid;
  temp_password   text;
  normalized_role text;
BEGIN
  -- Resolve caller context
  SELECT u.organization_id, u.role, u.email
  INTO current_org_id, caller_role, actor_email
  FROM public.users u
  WHERE u.id = auth.uid();

  IF current_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user.' USING ERRCODE = 'P0001';
  END IF;

  IF caller_role <> 'ADMIN' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only organization admins can invite team members.' USING ERRCODE = '42501';
  END IF;

  normalized_role := upper(trim(coalesce(invite_role, 'LAWYER')));
  IF normalized_role NOT IN ('ADMIN', 'LAWYER', 'STAFF', 'USER') THEN
    normalized_role := 'LAWYER';
  END IF;

  -- Prevent duplicate
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = lower(trim(invite_email))
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A user with email % already exists.', invite_email
      USING ERRCODE = '23505';
  END IF;

  temp_password := left(encode(gen_random_bytes(16), 'base64'), 12) || '!';

  -- Create auth.users
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at,
    instance_id, aud, role
  )
  VALUES (
    gen_random_uuid(),
    lower(trim(invite_email)),
    crypt(temp_password, gen_salt('bf')),
    now(),
    jsonb_build_object(
      'role', normalized_role,
      'organization_id', current_org_id::text,
      'must_reset_password', true
    ),
    now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  )
  RETURNING id INTO new_user_id;

  -- Create public.users row
  INSERT INTO public.users (
    id, email, role, status, organization_id, must_reset_password, created_at
  )
  VALUES (
    new_user_id,
    lower(trim(invite_email)),
    normalized_role,
    'ACTIVE',
    current_org_id,
    true,
    now()
  );

  RETURN jsonb_build_object(
    'success',       true,
    'message',       'Team member invited successfully.',
    'user_id',       new_user_id,
    'email',         lower(trim(invite_email)),
    'role',          normalized_role,
    'temp_password', temp_password,
    'note',          'Share the temporary password securely. The user must reset it on first login.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_invite_team_member(text, text) TO authenticated;

-- ----------------------------------------------------------------
-- 4. Ensure admin_get_activity_log uses param name `row_limit`
--    (already done in _0060 but idempotent here)
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_activity_log(integer);

CREATE OR REPLACE FUNCTION public.admin_get_activity_log(
  row_limit integer DEFAULT 100
)
RETURNS TABLE (
  id          uuid,
  actor_email text,
  action      text,
  target_type text,
  target_id   text,
  target_label text,
  details     jsonb,
  created_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can view activity logs.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.actor_email,
    l.action,
    l.target_type,
    l.target_id,
    l.target_label,
    coalesce(l.details, '{}'::jsonb) AS details,
    l.created_at
  FROM public.admin_activity_log l
  ORDER BY l.created_at DESC
  LIMIT greatest(1, least(coalesce(row_limit, 100), 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_activity_log(integer) TO authenticated;

-- ----------------------------------------------------------------
-- 5. Fix get_workspace_context to include subscription_status
--    in the returned row (frontend reads it from organizations)
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_workspace_context();

CREATE OR REPLACE FUNCTION public.get_workspace_context()
RETURNS TABLE (
  user_id                uuid,
  email                  text,
  full_name              text,
  avatar_url             text,
  avatar_path            text,
  role                   text,
  organization_id        uuid,
  organization_name      text,
  organization_logo_url  text,
  organization_logo_path text,
  organization_address   text,
  organization_phone     text,
  organization_email     text,
  organization_website   text,
  organization_status    text,
  status                 text,
  can_access_workspace   boolean,
  is_demo_workspace      boolean,
  access_message         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  signed_in_user_id uuid := auth.uid();
  jwt_email         text := lower(coalesce(auth.jwt() ->> 'email', ''));
  profile           record;
BEGIN
  IF signed_in_user_id IS NULL THEN
    RETURN QUERY SELECT
      NULL::uuid, ''::text, ''::text, ''::text, ''::text, ''::text,
      NULL::uuid, ''::text, ''::text, ''::text, ''::text, ''::text,
      ''::text,   ''::text, ''::text, ''::text,
      false, false, 'No authenticated Supabase session.'::text;
    RETURN;
  END IF;

  SELECT
    u.id,
    u.email,
    u.full_name,
    u.avatar_url,
    u.avatar_path,
    u.role,
    u.organization_id,
    u.status AS user_status,
    o.name AS organization_name,
    coalesce(o.logo_url,  '')  AS organization_logo_url,
    coalesce(o.logo_path, '')  AS organization_logo_path,
    coalesce(o.address,   '')  AS organization_address,
    coalesce(o.phone,     '')  AS organization_phone,
    coalesce(o.email,     '')  AS organization_email,
    coalesce(o.website,   '')  AS organization_website,
    o.status AS organization_status,
    o.is_demo AS is_demo_workspace
  INTO profile
  FROM public.users u
  LEFT JOIN public.organizations o ON o.id = u.organization_id
  WHERE u.id = signed_in_user_id
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF profile.id IS NULL THEN
    RETURN QUERY SELECT
      signed_in_user_id, jwt_email,
      ''::text, ''::text, ''::text, 'LAWYER'::text,
      NULL::uuid, ''::text, ''::text, ''::text, ''::text, ''::text,
      ''::text, ''::text, ''::text, 'PENDING_APPROVAL'::text,
      false, false,
      'Your login exists but no workspace membership row was found in public.users. Ask an admin to invite or approve your account.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    profile.id::uuid,
    lower(profile.email)::text,
    coalesce(profile.full_name,              '')::text,
    coalesce(profile.avatar_url,             '')::text,
    coalesce(profile.avatar_path,            '')::text,
    profile.role::text,
    profile.organization_id::uuid,
    coalesce(profile.organization_name,      '')::text,
    coalesce(profile.organization_logo_url,  '')::text,
    coalesce(profile.organization_logo_path, '')::text,
    coalesce(profile.organization_address,   '')::text,
    coalesce(profile.organization_phone,     '')::text,
    coalesce(profile.organization_email,     '')::text,
    coalesce(profile.organization_website,   '')::text,
    coalesce(profile.organization_status,    '')::text,
    profile.user_status::text,
    (
      profile.organization_id IS NOT NULL
      AND profile.user_status       = 'ACTIVE'
      AND profile.organization_status = 'ACTIVE'
    )::boolean,
    coalesce(profile.is_demo_workspace, false)::boolean,
    CASE
      WHEN profile.user_status <> 'ACTIVE'
        THEN 'Your user profile is ' || profile.user_status || '. An admin must set your status to ACTIVE.'
      WHEN profile.organization_id IS NULL
        THEN 'Your user profile has no organization. Contact a platform admin.'
      WHEN profile.organization_status IS NULL
        THEN 'Your organization record is missing. Contact a platform admin.'
      WHEN profile.organization_status <> 'ACTIVE'
        THEN 'Your organization is ' || profile.organization_status || '. A platform admin must approve it.'
      ELSE ''
    END::text;
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_context() FROM public;
GRANT EXECUTE ON FUNCTION public.get_workspace_context() TO authenticated;

-- ----------------------------------------------------------------
-- 6. Ensure admin_list_organizations exists and is accessible
--    (called by SuperAdminDashboard.jsx)
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_organizations(text);

CREATE OR REPLACE FUNCTION public.admin_list_organizations(
  filter_status text DEFAULT NULL
)
RETURNS TABLE (
  id                  uuid,
  name                text,
  status              text,
  subscription_status text,
  billing_status      text,
  is_demo             boolean,
  created_at          timestamptz,
  requested_owner_email text,
  member_count        bigint,
  case_count          bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can list organizations.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.status,
    coalesce(o.subscription_status, 'ACTIVE') AS subscription_status,
    coalesce(o.billing_status, 'TRIAL')       AS billing_status,
    o.is_demo,
    o.created_at,
    o.requested_owner_email,
    (SELECT count(*) FROM public.users u   WHERE u.organization_id = o.id AND u.deleted_at IS NULL) AS member_count,
    (SELECT count(*) FROM public.cases c   WHERE c.organization_id = o.id AND c.deleted_at IS NULL) AS case_count
  FROM public.organizations o
  WHERE o.deleted_at IS NULL
    AND (filter_status IS NULL OR o.status = filter_status)
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_organizations(text) TO authenticated;

-- ----------------------------------------------------------------
-- 7. Force PostgREST schema reload so all above changes are visible
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
