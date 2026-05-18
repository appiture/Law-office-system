-- =====================================================
-- FIX: Auth login 500 and post-baseline database contract drift
--
-- The hosted project has already applied 20260601000000_baseline_2026,
-- so this repair must run after that baseline.
-- =====================================================

BEGIN;

-- Basic helpers used by auth triggers and workspace lookups.
CREATE OR REPLACE FUNCTION public.normalize_email(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(value, '')))
$$;

-- Columns required by auth-utils, the dashboard, and user management.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invite_status text DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Ensure the invite table exists with the full Edge Function contract.
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email                         text NOT NULL,
  role                          text NOT NULL DEFAULT 'LAWYER',
  status                        text NOT NULL DEFAULT 'PENDING',
  invited_by                    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_by                   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at                   timestamptz,
  auth_user_id                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_type                   text NOT NULL DEFAULT 'USER',
  sent_at                       timestamptz,
  last_sent_at                  timestamptz,
  send_count                    integer NOT NULL DEFAULT 0,
  delivery_status               text NOT NULL DEFAULT 'PENDING',
  provider_message_id           text,
  temporary_password_expires_at timestamptz,
  metadata                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz DEFAULT now()
);

ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_type text NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS temporary_password_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.organization_invites DROP CONSTRAINT IF EXISTS organization_invites_role_check;
ALTER TABLE public.organization_invites
  ADD CONSTRAINT organization_invites_role_check
  CHECK (role IN ('ADMIN', 'LAWYER', 'STAFF', 'USER'));

ALTER TABLE public.organization_invites DROP CONSTRAINT IF EXISTS organization_invites_status_check;
ALTER TABLE public.organization_invites
  ADD CONSTRAINT organization_invites_status_check
  CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'));

CREATE UNIQUE INDEX IF NOT EXISTS organization_invites_org_email_unique_idx
  ON public.organization_invites (organization_id, email);

CREATE INDEX IF NOT EXISTS idx_organization_invites_auth_user
  ON public.organization_invites(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_organization_invites_open_email
  ON public.organization_invites(organization_id, lower(email))
  WHERE status = 'PENDING';

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invites_tenant_access ON public.organization_invites;
CREATE POLICY invites_tenant_access ON public.organization_invites
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS invites_admin_insert ON public.organization_invites;
CREATE POLICY invites_admin_insert ON public.organization_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND organization_id = public.current_organization_id()
  );

DROP POLICY IF EXISTS invites_admin_update ON public.organization_invites;
CREATE POLICY invites_admin_update ON public.organization_invites
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR public.is_platform_admin()
  )
  WITH CHECK (true);

-- Auth should never fail because our profile sync hit an app-table problem.
CREATE OR REPLACE FUNCTION public.sync_auth_user_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_email text;
  metadata_org_id_text text;
  demo_org_id uuid;
  invited_org_id uuid;
  invited_role text;
  trusted_org_id uuid;
  trusted_role text;
  resolved_org_id uuid;
  resolved_role text;
  resolved_status text;
BEGIN
  BEGIN
    normalized_email := public.normalize_email(new.email);

    SELECT id
    INTO demo_org_id
    FROM public.organizations
    WHERE is_demo = true
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT organization_id, role
    INTO invited_org_id, invited_role
    FROM public.organization_invites
    WHERE public.normalize_email(email) = normalized_email
      AND status = 'PENDING'
    ORDER BY created_at DESC
    LIMIT 1;

    metadata_org_id_text := coalesce(
      nullif(new.raw_app_meta_data ->> 'organization_id', ''),
      nullif(new.raw_user_meta_data ->> 'organization_id', '')
    );

    IF metadata_org_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      trusted_org_id := metadata_org_id_text::uuid;
    ELSE
      trusted_org_id := NULL;
    END IF;

    trusted_role := upper(coalesce(
      nullif(new.raw_app_meta_data ->> 'role', ''),
      nullif(new.raw_user_meta_data ->> 'role', ''),
      'LAWYER'
    ));

    IF normalized_email = 'demo@lawoffice.local' THEN
      resolved_org_id := demo_org_id;
      resolved_role := 'ADMIN';
    ELSIF invited_org_id IS NOT NULL THEN
      resolved_org_id := invited_org_id;
      resolved_role := invited_role;
    ELSIF trusted_org_id IS NOT NULL THEN
      resolved_org_id := trusted_org_id;
      resolved_role := trusted_role;
    ELSE
      resolved_org_id := NULL;
      resolved_role := 'LAWYER';
    END IF;

    IF resolved_role NOT IN ('ADMIN', 'LAWYER', 'STAFF', 'USER') THEN
      resolved_role := 'LAWYER';
    END IF;

    resolved_status := CASE
      WHEN resolved_org_id IS NULL THEN 'PENDING_APPROVAL'
      ELSE 'ACTIVE'
    END;

    INSERT INTO public.users (id, email, role, organization_id, status)
    VALUES (new.id, normalized_email, resolved_role, resolved_org_id, resolved_status)
    ON CONFLICT (id) DO UPDATE
      SET
        email = excluded.email,
        role = CASE
          WHEN public.users.role IN ('ADMIN', 'LAWYER', 'STAFF', 'USER') THEN public.users.role
          ELSE excluded.role
        END,
        organization_id = coalesce(public.users.organization_id, excluded.organization_id),
        status = CASE
          WHEN public.users.status = 'INACTIVE' THEN 'INACTIVE'
          WHEN public.users.status = 'ACTIVE' THEN 'ACTIVE'
          WHEN coalesce(public.users.organization_id, excluded.organization_id) IS NULL THEN 'PENDING_APPROVAL'
          ELSE excluded.status
        END;

    IF invited_org_id IS NOT NULL THEN
      UPDATE public.organization_invites
      SET
        status = 'ACCEPTED',
        accepted_by = new.id,
        accepted_at = now(),
        updated_at = now()
      WHERE organization_id = invited_org_id
        AND public.normalize_email(email) = normalized_email
        AND status = 'PENDING';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[sync_auth_user_membership] non-fatal error for user %: %', new.id, SQLERRM;
  END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_synced ON auth.users;
CREATE TRIGGER on_auth_user_synced
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_membership();

CREATE OR REPLACE FUNCTION public.sync_auth_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    BEGIN
      UPDATE public.users
      SET email = public.normalize_email(new.email)
      WHERE id = new.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[sync_auth_user_email] failed for user %: %', new.id, SQLERRM;
    END;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_synced ON auth.users;
CREATE TRIGGER on_auth_user_email_synced
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_email();

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
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  profile record;
BEGIN
  IF signed_in_user_id IS NULL THEN
    RETURN QUERY SELECT
      NULL::uuid, ''::text, ''::text, ''::text, ''::text, ''::text,
      NULL::uuid, ''::text, ''::text, ''::text, ''::text, ''::text,
      ''::text, ''::text, ''::text, ''::text,
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
    coalesce(o.logo_url, '') AS organization_logo_url,
    coalesce(o.logo_path, '') AS organization_logo_path,
    coalesce(o.address, '') AS organization_address,
    coalesce(o.phone, '') AS organization_phone,
    coalesce(o.email, '') AS organization_email,
    coalesce(o.website, '') AS organization_website,
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
    coalesce(profile.full_name, '')::text,
    coalesce(profile.avatar_url, '')::text,
    coalesce(profile.avatar_path, '')::text,
    profile.role::text,
    profile.organization_id::uuid,
    coalesce(profile.organization_name, '')::text,
    coalesce(profile.organization_logo_url, '')::text,
    coalesce(profile.organization_logo_path, '')::text,
    coalesce(profile.organization_address, '')::text,
    coalesce(profile.organization_phone, '')::text,
    coalesce(profile.organization_email, '')::text,
    coalesce(profile.organization_website, '')::text,
    coalesce(profile.organization_status, '')::text,
    profile.user_status::text,
    (
      profile.organization_id IS NOT NULL
      AND profile.user_status = 'ACTIVE'
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

-- Frontend audit calls use log_observability_event(payload jsonb). Keep it
-- available even when the baseline only defines log_system_event.
DROP FUNCTION IF EXISTS public.log_observability_event(jsonb);
CREATE OR REPLACE FUNCTION public.log_observability_event(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', payload ->> 'userEmail', ''));
  actor_role text;
  payload_org_id_text text;
  org_id uuid;
  event_id uuid;
BEGIN
  SELECT u.organization_id, u.role
  INTO org_id, actor_role
  FROM public.users u
  WHERE u.id = actor_id
  LIMIT 1;

  payload_org_id_text := nullif(payload #>> '{detail,orgId}', '');
  IF payload_org_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    org_id := coalesce(payload_org_id_text::uuid, org_id);
  END IF;

  INSERT INTO public.system_audit_logs (
    organization_id,
    actor_id,
    actor_email,
    actor_role,
    entity_type,
    entity_id,
    entity_name,
    action_type,
    module,
    description,
    metadata
  )
  VALUES (
    org_id,
    actor_id,
    actor_email,
    actor_role,
    coalesce(payload ->> 'category', 'application'),
    NULL,
    NULL,
    coalesce(payload ->> 'message', payload ->> 'action', 'observability_event'),
    coalesce(payload ->> 'category', 'application'),
    coalesce(payload ->> 'message', 'Application event'),
    coalesce(payload, '{}'::jsonb)
  )
  RETURNING id INTO event_id;

  RETURN event_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[log_observability_event] non-fatal error: %', SQLERRM;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_observability_event(jsonb) TO authenticated;

COMMIT;
