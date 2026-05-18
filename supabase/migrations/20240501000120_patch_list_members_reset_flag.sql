-- ============================================================
-- PATCH: list_organization_members — expose must_reset_password
-- Run this in Supabase SQL Editor AFTER invite_team_member.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_organization_members()
RETURNS TABLE (
  id                  uuid,
  email               text,
  full_name           text,
  role                text,
  status              text,
  avatar_url          text,
  must_reset_password boolean,
  created_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_org_id uuid;
  caller_role    text;
BEGIN
  SELECT u.organization_id, u.role
    INTO current_org_id, caller_role
    FROM public.users u
   WHERE u.id = auth.uid();

  IF current_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user.' USING ERRCODE = 'P0001';
  END IF;

  IF caller_role != 'ADMIN' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only organization admins can list members.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.status,
    u.avatar_url,
    COALESCE(u.must_reset_password, false) AS must_reset_password,
    u.created_at
  FROM public.users u
  WHERE u.organization_id = current_org_id
    AND u.deleted_at IS NULL
  ORDER BY
    CASE u.role
      WHEN 'ADMIN'  THEN 1
      WHEN 'LAWYER' THEN 2
      WHEN 'STAFF'  THEN 3
    END,
    u.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_organization_members() TO authenticated;
