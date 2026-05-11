-- Org-level feature flags (super admin controls)
CREATE TABLE organization_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section text NOT NULL, -- 'clients','cases','payments','documents','followups','team','settings'
  enabled boolean NOT NULL DEFAULT true,
  updated_by text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, section)
);

-- User-level feature flags (super admin + org admin controls)
CREATE TABLE user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  section text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, section)
);

-- RLS: super admin can do all, org admin can manage their own org users only
ALTER TABLE organization_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Super admin full access
CREATE POLICY "superadmin_org_perms" ON organization_permissions
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid() OR email = (SELECT email FROM users WHERE id = auth.uid())));

CREATE POLICY "superadmin_user_perms" ON user_permissions
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid() OR email = (SELECT email FROM users WHERE id = auth.uid())));

-- Org admin read/write their org
CREATE POLICY "orgadmin_org_perms_rw" ON organization_permissions
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
    )
  );

CREATE POLICY "orgadmin_user_perms_rw" ON user_permissions
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
    )
  );

-- Any user can read their own permissions
CREATE POLICY "user_read_own_perms" ON user_permissions
  FOR SELECT USING (user_id = auth.uid());
  -- Get effective permissions for current user (merges org + user flags)
CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_org_perms jsonb;
  v_user_perms jsonb;
BEGIN
  SELECT organization_id INTO v_org_id FROM users WHERE id = v_user_id;

  SELECT jsonb_object_agg(section, enabled) INTO v_org_perms
  FROM organization_permissions WHERE organization_id = v_org_id;

  SELECT jsonb_object_agg(section, enabled) INTO v_user_perms
  FROM user_permissions WHERE user_id = v_user_id;

  -- Merge: user overrides org, missing = true (default allowed)
  RETURN COALESCE(v_org_perms, '{}'::jsonb) || COALESCE(v_user_perms, '{}'::jsonb);
END;
$$;

-- Super admin: upsert org permissions
CREATE OR REPLACE FUNCTION admin_set_org_permissions(
  target_org_id uuid,
  sections_json jsonb -- {"clients": true, "payments": false, ...}
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  kv record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not a platform admin';
  END IF;
  FOR kv IN SELECT * FROM jsonb_each_text(sections_json) LOOP
    INSERT INTO organization_permissions(organization_id, section, enabled, updated_by)
    VALUES (target_org_id, kv.key, kv.value::boolean, (SELECT email FROM users WHERE id = auth.uid()))
    ON CONFLICT(organization_id, section) DO UPDATE SET enabled = kv.value::boolean, updated_at = now();
  END LOOP;
END;
$$;

-- Super admin OR org admin: upsert user permissions
CREATE OR REPLACE FUNCTION admin_set_user_permissions(
  target_user_id uuid,
  sections_json jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  kv record;
  v_caller_id uuid := auth.uid();
  v_target_org uuid;
  v_caller_role text;
BEGIN
  SELECT organization_id INTO v_target_org FROM users WHERE id = target_user_id;
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id AND organization_id = v_target_org AND status = 'ACTIVE';

  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = v_caller_id)
     AND v_caller_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR kv IN SELECT * FROM jsonb_each_text(sections_json) LOOP
    INSERT INTO user_permissions(user_id, organization_id, section, enabled, updated_by)
    VALUES (target_user_id, v_target_org, kv.key, kv.value::boolean, (SELECT email FROM users WHERE id = v_caller_id))
    ON CONFLICT(user_id, section) DO UPDATE SET enabled = kv.value::boolean, updated_at = now();
  END LOOP;
END;
$$;

-- Read permissions for any org (super admin) or own org (admin)
CREATE OR REPLACE FUNCTION get_org_permissions(target_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = v_caller)
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = v_caller AND organization_id = target_org_id AND role = 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (SELECT COALESCE(jsonb_object_agg(section, enabled), '{}') FROM organization_permissions WHERE organization_id = target_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION get_user_permissions(target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target_org uuid;
BEGIN
  SELECT organization_id INTO v_target_org FROM users WHERE id = target_user_id;
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = v_caller)
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = v_caller AND organization_id = v_target_org AND role = 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (SELECT COALESCE(jsonb_object_agg(section, enabled), '{}') FROM user_permissions WHERE user_id = target_user_id);
END;
$$;