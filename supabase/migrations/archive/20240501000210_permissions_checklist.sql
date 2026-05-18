
-- =========================================================
-- ORGANIZATION PERMISSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS organization_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,

  section text NOT NULL,

  enabled boolean NOT NULL DEFAULT true,

  updated_by text,

  updated_at timestamptz DEFAULT now(),

  UNIQUE(organization_id, section)
);

-- =========================================================
-- USER PERMISSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  organization_id uuid NOT NULL,

  section text NOT NULL,

  enabled boolean NOT NULL DEFAULT true,

  updated_by text,

  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, section)
);

-- =========================================================
-- ENABLE RLS
-- =========================================================

ALTER TABLE organization_permissions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE user_permissions
ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- DROP OLD POLICIES SAFELY
-- =========================================================

DROP POLICY IF EXISTS superadmin_org_perms
ON organization_permissions;

DROP POLICY IF EXISTS superadmin_user_perms
ON user_permissions;

DROP POLICY IF EXISTS orgadmin_org_perms_rw
ON organization_permissions;

DROP POLICY IF EXISTS orgadmin_user_perms_rw
ON user_permissions;

DROP POLICY IF EXISTS user_read_own_perms
ON user_permissions;

-- =========================================================
-- SUPER ADMIN ACCESS
-- =========================================================

CREATE POLICY superadmin_org_perms
ON organization_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE
      user_id = auth.uid()
      OR email = (
        SELECT email
        FROM users
        WHERE id = auth.uid()
      )
  )
);

CREATE POLICY superadmin_user_perms
ON user_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE
      user_id = auth.uid()
      OR email = (
        SELECT email
        FROM users
        WHERE id = auth.uid()
      )
  )
);

-- =========================================================
-- ORGANIZATION ADMIN ACCESS
-- =========================================================

CREATE POLICY orgadmin_org_perms_rw
ON organization_permissions
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id
    FROM users
    WHERE
      id = auth.uid()
      AND role = 'ADMIN'
      AND status = 'ACTIVE'
  )
);

CREATE POLICY orgadmin_user_perms_rw
ON user_permissions
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id
    FROM users
    WHERE
      id = auth.uid()
      AND role = 'ADMIN'
      AND status = 'ACTIVE'
  )
);

-- =========================================================
-- USER SELF READ
-- =========================================================

CREATE POLICY user_read_own_perms
ON user_permissions
FOR SELECT
USING (
  user_id = auth.uid()
);

-- =========================================================
-- GET USER ORGANIZATION
-- =========================================================

CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT organization_id
    FROM users
    WHERE id = auth.uid()
  );
END;
$$;

-- =========================================================
-- GET MY PERMISSIONS
-- =========================================================

CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;

  v_org_perms jsonb;
  v_user_perms jsonb;
BEGIN

  SELECT organization_id
  INTO v_org_id
  FROM users
  WHERE id = v_user_id;

  SELECT jsonb_object_agg(section, enabled)
  INTO v_org_perms
  FROM organization_permissions
  WHERE organization_id = v_org_id;

  SELECT jsonb_object_agg(section, enabled)
  INTO v_user_perms
  FROM user_permissions
  WHERE user_id = v_user_id;

  RETURN
    COALESCE(v_org_perms, '{}'::jsonb)
    ||
    COALESCE(v_user_perms, '{}'::jsonb);
END;
$$;

-- =========================================================
-- ADMIN SET ORG PERMISSIONS
-- =========================================================

CREATE OR REPLACE FUNCTION admin_set_org_permissions(
  target_org_id uuid,
  sections_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  kv record;
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a platform admin';
  END IF;

  FOR kv IN
    SELECT *
    FROM jsonb_each_text(sections_json)
  LOOP

    INSERT INTO organization_permissions(
      organization_id,
      section,
      enabled,
      updated_by
    )
    VALUES (
      target_org_id,
      kv.key,
      kv.value::boolean,
      (
        SELECT email
        FROM users
        WHERE id = auth.uid()
      )
    )

    ON CONFLICT(organization_id, section)
    DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = now();

  END LOOP;
END;
$$;

-- =========================================================
-- ADMIN SET USER PERMISSIONS
-- =========================================================

CREATE OR REPLACE FUNCTION admin_set_user_permissions(
  target_user_id uuid,
  sections_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  kv record;

  v_caller_id uuid := auth.uid();

  v_target_org uuid;

  v_caller_role text;
BEGIN

  SELECT organization_id
  INTO v_target_org
  FROM users
  WHERE id = target_user_id;

  SELECT role
  INTO v_caller_role
  FROM users
  WHERE
    id = v_caller_id
    AND organization_id = v_target_org
    AND status = 'ACTIVE';

  IF NOT EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE user_id = v_caller_id
  )
  AND v_caller_role != 'ADMIN'
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR kv IN
    SELECT *
    FROM jsonb_each_text(sections_json)
  LOOP

    INSERT INTO user_permissions(
      user_id,
      organization_id,
      section,
      enabled,
      updated_by
    )
    VALUES (
      target_user_id,
      v_target_org,
      kv.key,
      kv.value::boolean,
      (
        SELECT email
        FROM users
        WHERE id = v_caller_id
      )
    )

    ON CONFLICT(user_id, section)
    DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = now();

  END LOOP;
END;
$$;

-- =========================================================
-- GET ORG PERMISSIONS
-- =========================================================

CREATE OR REPLACE FUNCTION get_org_permissions(
  target_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE user_id = v_caller
  )

  AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE
      id = v_caller
      AND organization_id = target_org_id
      AND role = 'ADMIN'
  )

  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_object_agg(section, enabled),
      '{}'
    )
    FROM organization_permissions
    WHERE organization_id = target_org_id
  );
END;
$$;

-- =========================================================
-- GET USER PERMISSIONS
-- =========================================================

CREATE OR REPLACE FUNCTION get_user_permissions(
  target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller uuid := auth.uid();

  v_target_org uuid;
BEGIN

  SELECT organization_id
  INTO v_target_org
  FROM users
  WHERE id = target_user_id;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE user_id = v_caller
  )

  AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE
      id = v_caller
      AND organization_id = v_target_org
      AND role = 'ADMIN'
  )

  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_object_agg(section, enabled),
      '{}'
    )
    FROM user_permissions
    WHERE user_id = target_user_id
  );
END;
$$;

-- =========================================================
-- CALENDAR EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,

  created_by text,

  title text NOT NULL,

  description text,

  event_date date NOT NULL,

  event_type text DEFAULT 'note',

  color text DEFAULT '#3A5BA0',

  created_at timestamptz DEFAULT now(),

  updated_at timestamptz DEFAULT now()
);

-- =========================================================
-- CALENDAR INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_calendar_events_org_date
ON calendar_events(
  organization_id,
  event_date
);

-- =========================================================
-- CALENDAR RLS
-- =========================================================

ALTER TABLE calendar_events
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access_calendar_events
ON calendar_events;

CREATE POLICY org_access_calendar_events
ON calendar_events
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id
    FROM users
    WHERE id = auth.uid()
  )
);

-- =========================================================
-- FINAL SECURITY
-- =========================================================

ALTER TABLE calendar_events
FORCE ROW LEVEL SECURITY;

ALTER TABLE organization_permissions
FORCE ROW LEVEL SECURITY;

ALTER TABLE user_permissions
FORCE ROW LEVEL SECURITY;

