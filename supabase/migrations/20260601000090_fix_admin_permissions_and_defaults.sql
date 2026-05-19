BEGIN;

-- ================================================================
-- PATCH: Fix permissions for ADMIN role + org-permission defaults
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Rebuild get_my_permissions()
--    CRITICAL BUG: ADMIN users have no permission rows → canAccess()
--    returns false for all sections → they see nothing.
--    FIX: ADMIN role always gets full access (all sections = true).
--    Non-admin users get org-level perms merged with their personal
--    overrides (user-level wins where defined).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_org_id   uuid;
  v_role     text;
  v_sections text[] := ARRAY[
    'dashboard','clients','cases','payments',
    'documents','hearings','tasks','settings','team'
  ];
  v_org_perms  jsonb;
  v_user_perms jsonb;
  v_full_perms jsonb;
  s            text;
BEGIN
  -- Get role + org
  SELECT organization_id, role
  INTO v_org_id, v_role
  FROM public.users
  WHERE id = v_user_id;

  -- ADMIN: full access to everything, no need to check perm tables
  IF v_role = 'ADMIN' OR v_role = 'SUPER_ADMIN' THEN
    v_full_perms := '{}'::jsonb;
    FOREACH s IN ARRAY v_sections LOOP
      v_full_perms := v_full_perms || jsonb_build_object(s, true);
    END LOOP;
    RETURN v_full_perms;
  END IF;

  -- Platform admins also get full access
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_user_id) THEN
    v_full_perms := '{}'::jsonb;
    FOREACH s IN ARRAY v_sections LOOP
      v_full_perms := v_full_perms || jsonb_build_object(s, true);
    END LOOP;
    RETURN v_full_perms;
  END IF;

  -- Start with org-level defaults (seed if missing)
  IF v_org_id IS NOT NULL THEN
    -- Auto-seed org permissions if this org has never had any set
    INSERT INTO public.organization_permissions (organization_id, section, enabled, updated_at)
    SELECT v_org_id, sec, true, now()
    FROM unnest(v_sections) AS sec
    ON CONFLICT (organization_id, section) DO NOTHING;

    SELECT jsonb_object_agg(section, enabled)
    INTO v_org_perms
    FROM public.organization_permissions
    WHERE organization_id = v_org_id;
  END IF;

  -- User-level overrides (if set by admin — user-level wins)
  SELECT jsonb_object_agg(section, enabled)
  INTO v_user_perms
  FROM public.user_permissions
  WHERE user_id = v_user_id;

  -- Merge: org baseline + user overrides
  RETURN
    COALESCE(v_org_perms, '{}'::jsonb)
    ||
    COALESCE(v_user_perms, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- ----------------------------------------------------------------
-- 2. Rebuild get_user_permissions() to seed defaults if empty
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_permissions(
  target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_target_org uuid;
  v_role       text;
  v_sections   text[] := ARRAY[
    'dashboard','clients','cases','payments',
    'documents','hearings','tasks','settings','team'
  ];
  v_result jsonb;
BEGIN
  SELECT organization_id, role
  INTO v_target_org, v_role
  FROM public.users
  WHERE id = target_user_id;

  -- Authorization: platform admin OR same-org admin
  IF NOT (
    EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_caller)
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = v_caller
        AND u.organization_id = v_target_org
        AND u.role = 'ADMIN'
        AND u.deleted_at IS NULL
    )
    OR v_caller = target_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to view permissions for this user.'
      USING ERRCODE = '42501';
  END IF;

  -- ADMIN role: always full access
  IF v_role = 'ADMIN' THEN
    v_result := '{}'::jsonb;
    FOR i IN 1..array_length(v_sections, 1) LOOP
      v_result := v_result || jsonb_build_object(v_sections[i], true);
    END LOOP;
    RETURN v_result;
  END IF;

  -- Get user-level permissions, falling back to org-level
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(section, enabled) FROM public.organization_permissions WHERE organization_id = v_target_org),
      '{}'::jsonb
    )
    ||
    COALESCE(
      (SELECT jsonb_object_agg(section, enabled) FROM public.user_permissions WHERE user_id = target_user_id),
      '{}'::jsonb
    )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 3. Rebuild admin_set_user_permissions() to handle cascade
--    to PermissionsContext by storing correct values
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_permissions(
  target_user_id uuid,
  sections_json  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id  uuid := auth.uid();
  v_target_org uuid;
  v_caller_role text;
  kv           record;
BEGIN
  SELECT organization_id INTO v_target_org
  FROM public.users WHERE id = target_user_id;

  SELECT role INTO v_caller_role
  FROM public.users
  WHERE id = v_caller_id
    AND organization_id = v_target_org
    AND deleted_at IS NULL;

  IF NOT (
    EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_caller_id)
    OR v_caller_role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Not authorized to set permissions.'
      USING ERRCODE = '42501';
  END IF;

  FOR kv IN SELECT * FROM jsonb_each_text(sections_json) LOOP
    INSERT INTO public.user_permissions (
      user_id, organization_id, section, enabled, updated_by, updated_at
    )
    VALUES (
      target_user_id, v_target_org,
      kv.key, kv.value::boolean,
      (SELECT email FROM public.users WHERE id = v_caller_id LIMIT 1),
      now()
    )
    ON CONFLICT (user_id, section) DO UPDATE SET
      enabled    = EXCLUDED.enabled,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_permissions(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------
-- 4. Rebuild admin_create_organization to return structured conflicts
--    instead of raising SQLSTATE 23505, which PostgREST exposes as HTTP 409.
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
  new_org_id       uuid;
  new_user_id      uuid;
  temp_password    text;
  actor_email      text;
  normalized_org   text := trim(coalesce(org_name, ''));
  normalized_email text := lower(trim(coalesce(admin_email, '')));
BEGIN
  -- Guard: platform admin only
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can create organizations.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate inputs
  IF normalized_org = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_ORGANIZATION_NAME',
      'message', 'Organization name is required.'
    );
  END IF;

  IF normalized_email = '' OR normalized_email NOT LIKE '%@%' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_ADMIN_EMAIL',
      'message', 'A valid admin email is required.'
    );
  END IF;

  -- Check both profile and auth tables. A deleted/incomplete profile can
  -- leave an auth.users row behind, and that still blocks account creation.
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = normalized_email
      AND deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = normalized_email
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_ADMIN_EMAIL',
      'message', 'A user with email ' || normalized_email || ' already exists.'
    );
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
    normalized_org,
    'ACTIVE',
    CASE WHEN upper(trim(coalesce(org_plan, 'STANDARD'))) = 'DEMO' THEN 'TRIAL' ELSE 'ACTIVE' END,
    false,
    normalized_email,
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
    normalized_email,
    crypt(temp_password, gen_salt('bf')),
    now(),
    jsonb_build_object(
      'role',                'ADMIN',
      'organization',        normalized_org,
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
    normalized_email,
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

  -- Log the action
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
    normalized_org || ' (' || normalized_email || ')',
    jsonb_build_object(
      'org_plan', coalesce(org_plan, 'STANDARD'),
      'admin_email', normalized_email,
      'org_name', normalized_org,
      'send_invite_email', coalesce(send_invite_email, true)
    )
  );

  RETURN jsonb_build_object(
    'success',          true,
    'message',          'Organization and admin account created successfully.',
    'organization_id',  new_org_id,
    'admin_user_id',    new_user_id,
    'admin_email',      normalized_email,
    'temp_password',    temp_password,
    'note',             'The admin must reset their password on first login. Share the temporary password securely.'
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_ADMIN_EMAIL',
      'message', 'A user with email ' || normalized_email || ' already exists.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_organization(text, text, text, boolean) TO authenticated;

-- ----------------------------------------------------------------
-- 5. Force schema reload
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
