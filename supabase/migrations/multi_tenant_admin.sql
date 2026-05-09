-- ============================================================
-- MULTI-TENANT ADMIN SYSTEM MIGRATION
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1. PLATFORM ADMINS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admins_self_read ON public.platform_admins;
CREATE POLICY platform_admins_self_read ON public.platform_admins
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

CREATE INDEX IF NOT EXISTS idx_platform_admins_user  ON public.platform_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON public.platform_admins(email);

-- ------------------------------------------------------------
-- 2. ORGANIZATION INVITES TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'LAWYER', 'STAFF')),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  invited_by uuid REFERENCES public.users(id),
  accepted_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  UNIQUE(organization_id, email)
);

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- Org admins can see invites for their org
DROP POLICY IF EXISTS org_invites_admin_read ON public.organization_invites;
CREATE POLICY org_invites_admin_read ON public.organization_invites
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

CREATE INDEX IF NOT EXISTS idx_invites_org   ON public.organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON public.organization_invites(email);

-- ------------------------------------------------------------
-- 3. HELPER: is_platform_admin()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid()
       OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- ------------------------------------------------------------
-- 4. SUPER ADMIN: admin_list_organizations()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_organizations(
  filter_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  status text,
  is_demo boolean,
  created_at timestamptz,
  approved_at timestamptz,
  requested_owner_email text,
  user_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can list all organizations.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.status,
    o.is_demo,
    o.created_at,
    o.approved_at,
    o.requested_owner_email,
    COUNT(u.id) AS user_count
  FROM public.organizations o
  LEFT JOIN public.users u ON u.organization_id = o.id
  WHERE filter_status IS NULL OR o.status = filter_status
  GROUP BY o.id
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_organizations(text) TO authenticated;

-- ------------------------------------------------------------
-- 5. SUPER ADMIN: admin_review_organization()
-- ------------------------------------------------------------
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
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can review organizations.'
      USING ERRCODE = '42501';
  END IF;

  IF action = 'APPROVE' THEN
    UPDATE public.organizations
    SET
      status = 'ACTIVE',
      approved_by = auth.uid(),
      approved_at = now()
    WHERE id = target_org_id AND status = 'PENDING_APPROVAL';

    IF assigned_admin_email IS NOT NULL THEN
      UPDATE public.users
      SET status = 'ACTIVE', role = 'ADMIN'
      WHERE organization_id = target_org_id
        AND lower(email) = lower(assigned_admin_email);
    END IF;

    result := jsonb_build_object(
      'success', true,
      'message', 'Organization approved successfully',
      'organization_id', target_org_id,
      'status', 'ACTIVE'
    );

  ELSIF action = 'REJECT' THEN
    UPDATE public.organizations
    SET
      status = 'REJECTED',
      approved_by = auth.uid(),
      approved_at = now()
    WHERE id = target_org_id AND status = 'PENDING_APPROVAL';

    result := jsonb_build_object(
      'success', true,
      'message', 'Organization rejected',
      'organization_id', target_org_id,
      'status', 'REJECTED'
    );

  ELSE
    RAISE EXCEPTION 'Invalid action. Use APPROVE or REJECT.'
      USING ERRCODE = '22023';
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_organization(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 6. ORG ADMIN: list_organization_members()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_organization_members()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  role text,
  status text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, app_private
AS $$
DECLARE
  current_org_id uuid;
  caller_role text;
BEGIN
  SELECT u.organization_id, u.role
  INTO current_org_id, caller_role
  FROM public.users u
  WHERE u.id = auth.uid();

  IF current_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user.' USING ERRCODE = 'P0001';
  END IF;

  -- Allow platform admins and org admins to list members
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

-- ------------------------------------------------------------
-- 7. ORG ADMIN: invite_user_to_organization()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  invite_email text,
  invite_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_org_id uuid;
  caller_role text;
  invite_id uuid;
  result jsonb;
BEGIN
  SELECT u.organization_id, u.role
  INTO current_org_id, caller_role
  FROM public.users u
  WHERE u.id = auth.uid();

  IF current_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user.' USING ERRCODE = 'P0001';
  END IF;

  IF caller_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only organization admins can invite users.' USING ERRCODE = '42501';
  END IF;

  IF invite_role NOT IN ('ADMIN', 'LAWYER', 'STAFF') THEN
    RAISE EXCEPTION 'Invalid role. Must be ADMIN, LAWYER, or STAFF.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organization_invites (
    organization_id, email, role, invited_by, status
  )
  VALUES (
    current_org_id,
    lower(trim(invite_email)),
    invite_role,
    auth.uid(),
    'PENDING'
  )
  ON CONFLICT (organization_id, email)
  DO UPDATE SET
    role       = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by,
    created_at = now(),
    expires_at = now() + interval '7 days',
    status     = 'PENDING'
  RETURNING id INTO invite_id;

  result := jsonb_build_object(
    'success', true,
    'message', 'User invited successfully',
    'invite_id', invite_id,
    'email', invite_email,
    'role', invite_role
  );
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_user_to_organization(text, text) TO authenticated;

-- ------------------------------------------------------------
-- 8. ORG ADMIN: update_organization_member()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_organization_member(
  target_user_id uuid,
  new_role   text DEFAULT NULL,
  new_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_org_id uuid;
  caller_role text;
  target_org_id uuid;
BEGIN
  SELECT u.organization_id, u.role
  INTO current_org_id, caller_role
  FROM public.users u
  WHERE u.id = auth.uid();

  IF caller_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only organization admins can update members.' USING ERRCODE = '42501';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot modify your own account.' USING ERRCODE = '22023';
  END IF;

  SELECT organization_id INTO target_org_id
  FROM public.users WHERE id = target_user_id;

  IF target_org_id != current_org_id THEN
    RAISE EXCEPTION 'User not found in your organization.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.users
  SET
    role   = COALESCE(new_role, role),
    status = COALESCE(new_status, status)
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User updated successfully',
    'user_id', target_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_organization_member(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 9. ORG ADMIN: remove_organization_member()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_organization_member(
  target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_org_id uuid;
  caller_role text;
  target_org_id uuid;
BEGIN
  SELECT u.organization_id, u.role
  INTO current_org_id, caller_role
  FROM public.users u
  WHERE u.id = auth.uid();

  IF caller_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only organization admins can remove members.' USING ERRCODE = '42501';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself.' USING ERRCODE = '22023';
  END IF;

  SELECT organization_id INTO target_org_id
  FROM public.users WHERE id = target_user_id;

  IF target_org_id != current_org_id THEN
    RAISE EXCEPTION 'User not found in your organization.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.users
  SET status = 'INACTIVE', deleted_at = now()
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User removed successfully',
    'user_id', target_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_organization_member(uuid) TO authenticated;

-- ============================================================
-- HOW TO ADD YOUR FIRST SUPER ADMIN
-- Replace the email below and run in SQL editor:
--
-- INSERT INTO public.platform_admins (email, user_id)
-- VALUES ('superadmin@yourdomain.com', NULL)
-- ON CONFLICT (email) DO NOTHING;
--
-- UPDATE public.platform_admins
-- SET user_id = (SELECT id FROM auth.users WHERE email = 'superadmin@yourdomain.com')
-- WHERE email = 'superadmin@yourdomain.com';
-- ============================================================
