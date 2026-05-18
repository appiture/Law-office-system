BEGIN;

ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  target_type text,
  target_id text,
  target_label text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  actor_id uuid
);

ALTER TABLE public.admin_activity_log
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ALTER COLUMN actor_email SET DEFAULT 'system';

UPDATE public.admin_activity_log
SET actor_email = 'system'
WHERE actor_email IS NULL OR trim(actor_email) = '';

ALTER TABLE public.admin_activity_log
  ALTER COLUMN actor_email SET NOT NULL;

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_log_read ON public.admin_activity_log;
CREATE POLICY admin_log_read
ON public.admin_activity_log
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

CREATE INDEX IF NOT EXISTS idx_admin_log_created
ON public.admin_activity_log(created_at DESC);

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    LEFT JOIN public.users u
      ON u.id = auth.uid()
    WHERE pa.user_id = auth.uid()
       OR lower(pa.email) = lower(coalesce(auth.jwt() ->> 'email', u.email, ''))
  )
$$;

UPDATE public.platform_admins pa
SET user_id = u.id
FROM public.users u
WHERE pa.user_id IS NULL
  AND lower(pa.email) = lower(u.email);

UPDATE public.users u
SET
  role = 'ADMIN',
  status = 'ACTIVE',
  organization_id = NULL
FROM public.platform_admins pa
WHERE (pa.user_id = u.id OR lower(pa.email) = lower(u.email))
  AND (
    u.role <> 'ADMIN'
    OR u.status <> 'ACTIVE'
    OR u.organization_id IS NOT NULL
  );

UPDATE auth.users au
SET raw_user_meta_data = coalesce(au.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'ADMIN')
FROM public.platform_admins pa
WHERE pa.user_id = au.id
   OR lower(pa.email) = lower(au.email);

CREATE OR REPLACE FUNCTION public.current_admin_actor_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT coalesce(
    (SELECT u.email FROM public.users u WHERE u.id = auth.uid() LIMIT 1),
    (SELECT pa.email
     FROM public.platform_admins pa
     WHERE pa.user_id = auth.uid()
        OR lower(pa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     LIMIT 1),
    auth.jwt() ->> 'email',
    'platform-admin'
  )
$$;

DROP FUNCTION IF EXISTS public.admin_get_activity_log(integer);

CREATE OR REPLACE FUNCTION public.admin_get_activity_log(
  row_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  target_label text,
  details jsonb,
  created_at timestamptz
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

CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id uuid,
  new_role text DEFAULT NULL,
  new_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  actor_email text;
  target_email text;
  normalized_role text := nullif(upper(trim(coalesce(new_role, ''))), '');
  normalized_status text := nullif(upper(trim(coalesce(new_status, ''))), '');
  updated_user public.users%rowtype;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can use this function.'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_role IS NOT NULL
     AND normalized_role NOT IN ('ADMIN', 'LAWYER', 'STAFF', 'USER') THEN
    RAISE EXCEPTION 'Invalid role %. Allowed values: ADMIN, LAWYER, STAFF, USER.', normalized_role
      USING ERRCODE = '22023';
  END IF;

  IF normalized_status IS NOT NULL
     AND normalized_status NOT IN ('ACTIVE', 'INACTIVE', 'INVITED', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'Invalid status %. Allowed values: ACTIVE, INACTIVE, INVITED, PENDING_APPROVAL.', normalized_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
  SET
    role = coalesce(normalized_role, role),
    status = coalesce(normalized_status, status),
    updated_at = now()
  WHERE id = target_user_id
    AND deleted_at IS NULL
  RETURNING * INTO updated_user;

  IF updated_user.id IS NULL THEN
    RAISE EXCEPTION 'Target user not found.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT public.current_admin_actor_email()
  INTO actor_email;

  target_email := coalesce(updated_user.email, target_user_id::text);

  UPDATE auth.users au
  SET raw_user_meta_data = coalesce(au.raw_user_meta_data, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'role', updated_user.role,
      'status', updated_user.status
    ))
  WHERE au.id = updated_user.id;

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
    'UPDATE_USER',
    'user',
    target_user_id::text,
    target_email,
    jsonb_build_object(
      'role', updated_user.role,
      'status', updated_user.status,
      'organizationId', updated_user.organization_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', updated_user.id,
    'email', updated_user.email,
    'role', updated_user.role,
    'status', updated_user.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_all_users(
  filter_org_id uuid DEFAULT NULL,
  filter_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  role text,
  status text,
  organization_id uuid,
  organization_name text,
  created_at timestamptz,
  is_platform_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can list all users.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.status,
    u.organization_id,
    o.name AS organization_name,
    u.created_at,
    (pa.id IS NOT NULL) AS is_platform_admin
  FROM public.users u
  LEFT JOIN public.organizations o
    ON o.id = u.organization_id
  LEFT JOIN public.platform_admins pa
    ON pa.user_id = u.id
    OR lower(pa.email) = lower(u.email)
  WHERE (filter_org_id IS NULL OR u.organization_id = filter_org_id)
    AND (filter_status IS NULL OR u.status = upper(filter_status))
    AND u.deleted_at IS NULL
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_platform_admins()
RETURNS TABLE (
  id uuid,
  email text,
  user_id uuid,
  full_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can list platform admins.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pa.id,
    pa.email,
    coalesce(pa.user_id, u.id) AS user_id,
    u.full_name,
    pa.created_at
  FROM public.platform_admins pa
  LEFT JOIN public.users u
    ON u.id = pa.user_id
    OR lower(u.email) = lower(pa.email)
  ORDER BY pa.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_platform_admin(
  target_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id uuid;
  actor_email text;
  normalized_email text := lower(trim(target_email));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can add platform admins.'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_email = '' OR normalized_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'A valid email is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO target_user_id
  FROM public.users
  WHERE lower(email) = normalized_email
  LIMIT 1;

  INSERT INTO public.platform_admins (email, user_id, created_by)
  VALUES (normalized_email, target_user_id, auth.uid())
  ON CONFLICT (email)
  DO UPDATE SET user_id = coalesce(EXCLUDED.user_id, public.platform_admins.user_id);

  IF target_user_id IS NOT NULL THEN
    UPDATE public.users
    SET role = 'ADMIN', status = 'ACTIVE', organization_id = NULL, updated_at = now()
    WHERE id = target_user_id;

    UPDATE auth.users
    SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'ADMIN')
    WHERE id = target_user_id;
  END IF;

  SELECT public.current_admin_actor_email() INTO actor_email;

  INSERT INTO public.admin_activity_log (actor_id, actor_email, action, target_type, target_label)
  VALUES (auth.uid(), coalesce(actor_email, 'platform-admin'), 'ADD_PLATFORM_ADMIN', 'platform_admin', normalized_email);

  RETURN jsonb_build_object('success', true, 'message', 'Platform admin added', 'email', normalized_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_admin_actor_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_activity_log(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_platform_admin(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
