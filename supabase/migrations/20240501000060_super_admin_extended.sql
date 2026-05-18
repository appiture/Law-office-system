-- ============================================================
-- SUPER ADMIN EXTENDED FUNCTIONS
-- Run this in Supabase SQL Editor AFTER multi_tenant_admin.sql
-- ============================================================

-- ------------------------------------------------------------
-- Activity log table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email text NOT NULL,
  action text NOT NULL,
  target_type text,      -- 'organization' | 'user' | 'platform_admin'
  target_id text,
  target_label text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_log_read ON public.admin_activity_log;
CREATE POLICY admin_log_read ON public.admin_activity_log
  FOR SELECT USING (public.is_platform_admin());

CREATE INDEX IF NOT EXISTS idx_admin_log_created
  ON public.admin_activity_log(created_at DESC);

-- ------------------------------------------------------------
-- List ALL users across all organizations (super admin only)
-- ------------------------------------------------------------
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
  LEFT JOIN public.organizations o ON o.id = u.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = u.id
  WHERE (filter_org_id IS NULL OR u.organization_id = filter_org_id)
    AND (filter_status IS NULL OR u.status = filter_status)
    AND u.deleted_at IS NULL
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_users(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- List all platform admins
-- ------------------------------------------------------------
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
    pa.user_id,
    u.full_name,
    pa.created_at
  FROM public.platform_admins pa
  LEFT JOIN public.users u ON u.id = pa.user_id
  ORDER BY pa.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_platform_admins() TO authenticated;

-- ------------------------------------------------------------
-- Add platform admin
-- ------------------------------------------------------------
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
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can add platform admins.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO target_user_id
  FROM public.users
  WHERE lower(email) = lower(trim(target_email))
  LIMIT 1;

  INSERT INTO public.platform_admins (email, user_id, created_by)
  VALUES (lower(trim(target_email)), target_user_id, auth.uid())
  ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id;

  -- Log it
  SELECT email INTO actor_email FROM public.users WHERE id = auth.uid();
  INSERT INTO public.admin_activity_log (actor_email, action, target_type, target_label)
  VALUES (actor_email, 'ADD_PLATFORM_ADMIN', 'platform_admin', lower(trim(target_email)));

  RETURN jsonb_build_object('success', true, 'message', 'Platform admin added', 'email', target_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_platform_admin(text) TO authenticated;

-- ------------------------------------------------------------
-- Remove platform admin
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_remove_platform_admin(
  target_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  actor_email text;
  caller_email text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can remove platform admins.'
      USING ERRCODE = '42501';
  END IF;

  SELECT email INTO caller_email FROM public.users WHERE id = auth.uid();

  IF lower(caller_email) = lower(trim(target_email)) THEN
    RAISE EXCEPTION 'You cannot remove your own platform admin access.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.platform_admins
  WHERE lower(email) = lower(trim(target_email));

  INSERT INTO public.admin_activity_log (actor_email, action, target_type, target_label)
  VALUES (caller_email, 'REMOVE_PLATFORM_ADMIN', 'platform_admin', lower(trim(target_email)));

  RETURN jsonb_build_object('success', true, 'message', 'Platform admin removed', 'email', target_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_remove_platform_admin(text) TO authenticated;

-- ------------------------------------------------------------
-- Admin update any user (super admin version — cross-org)
-- ------------------------------------------------------------
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
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can use this function.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.users
  SET
    role   = COALESCE(new_role,   role),
    status = COALESCE(new_status, status)
  WHERE id = target_user_id;

  SELECT email INTO actor_email FROM public.users WHERE id = auth.uid();
  INSERT INTO public.admin_activity_log (actor_email, action, target_type, target_id)
  VALUES (actor_email, 'UPDATE_USER', 'user', target_user_id::text);

  RETURN jsonb_build_object('success', true, 'user_id', target_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- Get activity log (super admin only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_activity_log(
  limit_rows int DEFAULT 100
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
    l.id, l.actor_email, l.action, l.target_type,
    l.target_id, l.target_label, l.details, l.created_at
  FROM public.admin_activity_log l
  ORDER BY l.created_at DESC
  LIMIT limit_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_activity_log(int) TO authenticated;

-- Log the review function too (update existing function to log)
CREATE OR REPLACE FUNCTION public.admin_review_organization(
  target_org_id uuid,
  action text,
  assigned_admin_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result jsonb;
  actor_email text;
  org_name text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can review organizations.'
      USING ERRCODE = '42501';
  END IF;

  SELECT email INTO actor_email FROM public.users WHERE id = auth.uid();
  SELECT name INTO org_name FROM public.organizations WHERE id = target_org_id;

  IF action = 'APPROVE' THEN
    UPDATE public.organizations
    SET status = 'ACTIVE', approved_by = auth.uid(), approved_at = now()
    WHERE id = target_org_id AND status = 'PENDING_APPROVAL';

    IF assigned_admin_email IS NOT NULL THEN
      UPDATE public.users
      SET status = 'ACTIVE', role = 'ADMIN'
      WHERE organization_id = target_org_id
        AND lower(email) = lower(assigned_admin_email);
    END IF;

    result := jsonb_build_object('success', true, 'message', 'Organization approved', 'status', 'ACTIVE');

  ELSIF action = 'REJECT' THEN
    UPDATE public.organizations
    SET status = 'REJECTED', approved_by = auth.uid(), approved_at = now()
    WHERE id = target_org_id AND status = 'PENDING_APPROVAL';

    result := jsonb_build_object('success', true, 'message', 'Organization rejected', 'status', 'REJECTED');
  ELSE
    RAISE EXCEPTION 'Invalid action.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_activity_log (actor_email, action, target_type, target_id, target_label)
  VALUES (actor_email, action || '_ORGANIZATION', 'organization', target_org_id::text, org_name);

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_organization(uuid, text, text) TO authenticated;
