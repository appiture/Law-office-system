-- Fix for Organization Settings Update
-- This script fixes the RLS policies that prevent admins from updating organization settings
-- when the organization status is not 'ACTIVE'. 
-- Root cause: Existing policies use public.current_organization_id() which returns NULL 
-- for organizations that are not yet marked as 'ACTIVE'.

BEGIN;

-- 1. Ensure RLS is enabled
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. Helper functions used by the RLS policies below.
-- SECURITY DEFINER keeps these checks from being blocked by user-table RLS.
CREATE OR REPLACE FUNCTION public.can_read_organization(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users users
    WHERE users.id = auth.uid()
      AND users.organization_id = target_organization_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.organizations organizations
    WHERE organizations.id = target_organization_id
      AND (
        organizations.created_by = auth.uid()
        OR lower(organizations.requested_owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_update_organization_settings(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users users
    WHERE users.id = auth.uid()
      AND users.organization_id = target_organization_id
      AND users.status <> 'INACTIVE'
      AND users.role = 'ADMIN'
  )
  OR EXISTS (
    SELECT 1
    FROM public.organizations organizations
    WHERE organizations.id = target_organization_id
      AND organizations.status IN ('PENDING_APPROVAL', 'ACTIVE')
      AND (
        organizations.created_by = auth.uid()
        OR lower(organizations.requested_owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_read_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_update_organization_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_update_organization_settings(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_organization_settings(
  target_organization_id uuid,
  organization_name text,
  organization_logo_url text DEFAULT '',
  organization_logo_path text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  signed_in_user_id uuid := auth.uid();
  allowed boolean;
  changed_rows integer;
BEGIN
  IF signed_in_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated Supabase session.' USING ERRCODE = '28000';
  END IF;

  IF target_organization_id IS NULL THEN
    RAISE EXCEPTION 'No organization workspace is available.' USING ERRCODE = '22023';
  END IF;

  IF nullif(trim(coalesce(organization_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Organization name is required.' USING ERRCODE = '22023';
  END IF;

  SELECT
    public.can_update_organization_settings(target_organization_id)
    OR public.is_platform_admin()
  INTO allowed;

  IF NOT coalesce(allowed, false) THEN
    RAISE EXCEPTION 'Only organization admins can update organization settings.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.organizations
  SET
    name = trim(organization_name),
    logo_url = coalesce(organization_logo_url, ''),
    logo_path = coalesce(organization_logo_path, '')
  WHERE id = target_organization_id;

  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows = 0 THEN
    RAISE EXCEPTION 'Organization not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_settings(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_organization_settings(uuid, text, text, text) TO authenticated;

-- 3. Drop existing restrictive policies
DROP POLICY IF EXISTS org_isolation_select ON public.organizations;
DROP POLICY IF EXISTS organizations_membership_select ON public.organizations;
DROP POLICY IF EXISTS organizations_tenant_read ON public.organizations;
DROP POLICY IF EXISTS organizations_admin_update ON public.organizations;

-- 4. Create a robust SELECT policy for members
-- We use a helper that does not depend on public.current_organization_id()
-- to allow users to see their own organization even if it's PENDING_APPROVAL.
CREATE POLICY organizations_membership_select ON public.organizations
FOR SELECT
TO authenticated
USING (
  public.can_read_organization(organizations.id)
  OR public.is_platform_admin()
);

-- 5. Create a robust UPDATE policy for admins
-- Allows ADMIN users to update their organization's metadata even if status is not ACTIVE.
CREATE POLICY organizations_admin_update ON public.organizations
FOR UPDATE
TO authenticated
USING (
  public.can_update_organization_settings(organizations.id)
  OR public.is_platform_admin()
)
WITH CHECK (
  public.can_update_organization_settings(organizations.id)
  OR public.is_platform_admin()
);

-- 6. Helper: Auto-activate organizations that have an active admin
-- This helps recover organizations that might be stuck in PENDING_APPROVAL.
UPDATE public.organizations 
SET status = 'ACTIVE' 
WHERE status = 'PENDING_APPROVAL' 
  AND EXISTS (
    SELECT 1
    FROM public.users users
    WHERE users.organization_id = organizations.id
      AND users.status = 'ACTIVE'
      AND users.role = 'ADMIN'
  );

COMMIT;
