BEGIN;

-- ================================================================
-- PATCH: Fix all mismatches between SuperAdminDashboard.jsx and DB
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Add missing `demo_expires_at` column to organizations
--    (UI reads/writes org.demo_expires_at but it was never defined
--     in the baseline schema)
-- ----------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;

-- ----------------------------------------------------------------
-- 2. Rebuild admin_list_organizations to:
--    a) Return `user_count` (UI uses org.user_count, not member_count)
--    b) Return `demo_expires_at` for the DEMO badge
--    c) Handle filter_status = 'ALL' correctly (was breaking filter)
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_organizations(text);

CREATE OR REPLACE FUNCTION public.admin_list_organizations(
  filter_status text DEFAULT NULL
)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  status                text,
  subscription_status   text,
  billing_status        text,
  is_demo               boolean,
  demo_expires_at       timestamptz,
  created_at            timestamptz,
  requested_owner_email text,
  user_count            bigint,   -- UI reads this field name
  member_count          bigint,   -- keep for compat
  case_count            bigint
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
    coalesce(o.billing_status,      'TRIAL')  AS billing_status,
    o.is_demo,
    o.demo_expires_at,
    o.created_at,
    o.requested_owner_email,
    (SELECT count(*) FROM public.users u  WHERE u.organization_id = o.id AND u.deleted_at IS NULL) AS user_count,
    (SELECT count(*) FROM public.users u  WHERE u.organization_id = o.id AND u.deleted_at IS NULL) AS member_count,
    (SELECT count(*) FROM public.cases c  WHERE c.organization_id = o.id AND c.deleted_at IS NULL) AS case_count
  FROM public.organizations o
  WHERE o.deleted_at IS NULL
    AND (filter_status IS NULL OR filter_status = 'ALL' OR o.status = filter_status)
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_organizations(text) TO authenticated;

-- ----------------------------------------------------------------
-- 3. Re-grant EXECUTE on all permissions RPCs defined in migration
--    20240501000210 — they exist but may be missing grants
-- ----------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_org_permissions(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_org_permissions(uuid, jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_permissions(uuid, jsonb)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id()                 TO authenticated;

-- ----------------------------------------------------------------
-- 4. Ensure RLS allows platform admins to UPDATE organizations
--    (needed for SubscriptionModal -> adminUpdateOrganization)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS org_admin_update ON public.organizations;
CREATE POLICY org_admin_update ON public.organizations
  FOR UPDATE
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = organizations.id
        AND u.role = 'ADMIN'
        AND u.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = organizations.id
        AND u.role = 'ADMIN'
        AND u.deleted_at IS NULL
    )
  );

-- ----------------------------------------------------------------
-- 5. Ensure current_admin_actor_email() helper exists
--    (used inside admin_create_organization from _0070)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_admin_actor_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT coalesce(
    (SELECT email FROM public.users WHERE id = auth.uid() LIMIT 1),
    auth.jwt() ->> 'email',
    'platform-admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_admin_actor_email() TO authenticated;

-- ----------------------------------------------------------------
-- 6. Force PostgREST schema reload
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
