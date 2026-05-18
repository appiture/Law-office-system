BEGIN;

-- Keep the storage bucket names aligned with the frontend constants.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('client-assets', 'client-assets', false),
  ('case-documents', 'case-documents', false),
  ('exports', 'exports', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

CREATE OR REPLACE FUNCTION public.current_storage_prefix()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'org-' || public.current_organization_id()::text || '/%'
$$;

DROP POLICY IF EXISTS client_assets_tenant_select ON storage.objects;
DROP POLICY IF EXISTS client_assets_tenant_insert ON storage.objects;
DROP POLICY IF EXISTS client_assets_tenant_update ON storage.objects;
DROP POLICY IF EXISTS client_assets_tenant_delete ON storage.objects;
DROP POLICY IF EXISTS case_documents_tenant_select ON storage.objects;
DROP POLICY IF EXISTS case_documents_tenant_insert ON storage.objects;
DROP POLICY IF EXISTS case_documents_tenant_update ON storage.objects;
DROP POLICY IF EXISTS case_documents_tenant_delete ON storage.objects;

CREATE POLICY client_assets_tenant_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-assets'
  AND (public.is_platform_admin() OR name LIKE public.current_storage_prefix())
);

CREATE POLICY client_assets_tenant_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND name LIKE public.current_storage_prefix()
);

CREATE POLICY client_assets_tenant_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-assets'
  AND (public.is_platform_admin() OR name LIKE public.current_storage_prefix())
)
WITH CHECK (
  bucket_id = 'client-assets'
  AND name LIKE public.current_storage_prefix()
);

CREATE POLICY client_assets_tenant_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-assets'
  AND (public.is_platform_admin() OR name LIKE public.current_storage_prefix())
);

CREATE POLICY case_documents_tenant_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND (public.is_platform_admin() OR name LIKE public.current_storage_prefix())
);

CREATE POLICY case_documents_tenant_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-documents'
  AND name LIKE public.current_storage_prefix()
);

CREATE POLICY case_documents_tenant_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND (public.is_platform_admin() OR name LIKE public.current_storage_prefix())
)
WITH CHECK (
  bucket_id = 'case-documents'
  AND name LIKE public.current_storage_prefix()
);

CREATE POLICY case_documents_tenant_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND (public.is_platform_admin() OR name LIKE public.current_storage_prefix())
);

CREATE TABLE IF NOT EXISTS public.organization_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, section)
);

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, section)
);

ALTER TABLE public.organization_permissions
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.user_permissions up
SET organization_id = u.organization_id
FROM public.users u
WHERE up.user_id = u.id
  AND up.organization_id IS NULL;

DELETE FROM public.user_permissions
WHERE organization_id IS NULL;

ALTER TABLE public.user_permissions
  ALTER COLUMN organization_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_permissions_organization_id_fkey'
      AND conrelid = 'public.user_permissions'::regclass
  ) THEN
    ALTER TABLE public.user_permissions
      ADD CONSTRAINT user_permissions_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organization_permissions_org
ON public.organization_permissions(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user
ON public.user_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_permissions_org
ON public.user_permissions(organization_id);

ALTER TABLE public.organization_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS superadmin_org_perms ON public.organization_permissions;
DROP POLICY IF EXISTS superadmin_user_perms ON public.user_permissions;
DROP POLICY IF EXISTS orgadmin_org_perms_rw ON public.organization_permissions;
DROP POLICY IF EXISTS orgadmin_user_perms_rw ON public.user_permissions;
DROP POLICY IF EXISTS user_read_own_perms ON public.user_permissions;

CREATE POLICY superadmin_org_perms
ON public.organization_permissions
FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY superadmin_user_perms
ON public.user_permissions
FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY orgadmin_org_perms_rw
ON public.organization_permissions
FOR ALL
TO authenticated
USING (
  organization_id = public.current_organization_id()
  AND public.current_user_role() = 'ADMIN'
)
WITH CHECK (
  organization_id = public.current_organization_id()
  AND public.current_user_role() = 'ADMIN'
);

CREATE POLICY orgadmin_user_perms_rw
ON public.user_permissions
FOR ALL
TO authenticated
USING (
  organization_id = public.current_organization_id()
  AND public.current_user_role() = 'ADMIN'
)
WITH CHECK (
  organization_id = public.current_organization_id()
  AND public.current_user_role() = 'ADMIN'
);

CREATE POLICY user_read_own_perms
ON public.user_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.default_permissions_jsonb()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'dashboard', true,
    'clients', true,
    'cases', true,
    'payments', true,
    'documents', true,
    'hearings', true,
    'tasks', true,
    'settings', true,
    'team', true
  )
$$;

CREATE OR REPLACE FUNCTION public.default_permission_sections()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'dashboard',
    'clients',
    'cases',
    'payments',
    'documents',
    'hearings',
    'tasks',
    'settings',
    'team'
  ]::text[]
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_org_perms jsonb := '{}'::jsonb;
  v_user_perms jsonb := '{}'::jsonb;
BEGIN
  SELECT organization_id
  INTO v_org_id
  FROM public.users
  WHERE id = v_user_id
    AND deleted_at IS NULL;

  IF v_org_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(section, enabled), '{}'::jsonb)
    INTO v_org_perms
    FROM public.organization_permissions
    WHERE organization_id = v_org_id;
  END IF;

  SELECT COALESCE(jsonb_object_agg(section, enabled), '{}'::jsonb)
  INTO v_user_perms
  FROM public.user_permissions
  WHERE user_id = v_user_id;

  RETURN public.default_permissions_jsonb() || v_org_perms || v_user_perms;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_permissions(target_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.users
       WHERE id = auth.uid()
         AND organization_id = target_org_id
         AND role = 'ADMIN'
         AND status = 'ACTIVE'
         AND deleted_at IS NULL
     )
  THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN public.default_permissions_jsonb() || COALESCE((
    SELECT jsonb_object_agg(section, enabled)
    FROM public.organization_permissions
    WHERE organization_id = target_org_id
  ), '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_permissions(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_target_org uuid;
BEGIN
  SELECT organization_id
  INTO v_target_org
  FROM public.users
  WHERE id = target_user_id
    AND deleted_at IS NULL;

  IF v_target_org IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.users
       WHERE id = auth.uid()
         AND organization_id = v_target_org
         AND role = 'ADMIN'
         AND status = 'ACTIVE'
         AND deleted_at IS NULL
     )
  THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN public.default_permissions_jsonb() || COALESCE((
    SELECT jsonb_object_agg(section, enabled)
    FROM public.user_permissions
    WHERE user_id = target_user_id
  ), '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_org_permissions(
  target_org_id uuid,
  sections_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  kv record;
  v_actor_email text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not a platform admin' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = target_org_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target organization not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT email INTO v_actor_email FROM public.users WHERE id = auth.uid();

  FOR kv IN SELECT * FROM jsonb_each_text(COALESCE(sections_json, '{}'::jsonb))
  LOOP
    IF kv.key = ANY(public.default_permission_sections()) THEN
      INSERT INTO public.organization_permissions(
        organization_id,
        section,
        enabled,
        updated_by,
        updated_at
      )
      VALUES (
        target_org_id,
        kv.key,
        kv.value::boolean,
        v_actor_email,
        now()
      )
      ON CONFLICT (organization_id, section)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_permissions(
  target_user_id uuid,
  sections_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  kv record;
  v_target_org uuid;
  v_actor_email text;
BEGIN
  SELECT organization_id
  INTO v_target_org
  FROM public.users
  WHERE id = target_user_id
    AND deleted_at IS NULL;

  IF v_target_org IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.users
       WHERE id = auth.uid()
         AND organization_id = v_target_org
         AND role = 'ADMIN'
         AND status = 'ACTIVE'
         AND deleted_at IS NULL
     )
  THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_actor_email FROM public.users WHERE id = auth.uid();

  FOR kv IN SELECT * FROM jsonb_each_text(COALESCE(sections_json, '{}'::jsonb))
  LOOP
    IF kv.key = ANY(public.default_permission_sections()) THEN
      INSERT INTO public.user_permissions(
        user_id,
        organization_id,
        section,
        enabled,
        updated_by,
        updated_at
      )
      VALUES (
        target_user_id,
        v_target_org,
        kv.key,
        kv.value::boolean,
        v_actor_email,
        now()
      )
      ON CONFLICT (user_id, section)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        enabled = EXCLUDED.enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    END IF;
  END LOOP;
END;
$$;

INSERT INTO public.organization_permissions (
  organization_id,
  section,
  enabled,
  updated_at
)
SELECT
  org.id,
  section_name,
  true,
  now()
FROM public.organizations org
CROSS JOIN unnest(public.default_permission_sections()) AS section_name
WHERE org.deleted_at IS NULL
ON CONFLICT (organization_id, section) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_org_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_permissions (
    organization_id,
    section,
    enabled,
    updated_at
  )
  SELECT
    NEW.id,
    section_name,
    true,
    now()
  FROM unnest(public.default_permission_sections()) AS section_name
  ON CONFLICT (organization_id, section) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_org_permissions ON public.organizations;
CREATE TRIGGER trg_seed_default_org_permissions
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_org_permissions();

GRANT EXECUTE ON FUNCTION public.default_permissions_jsonb() TO authenticated;
GRANT EXECUTE ON FUNCTION public.default_permission_sections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_org_permissions(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_permissions(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
