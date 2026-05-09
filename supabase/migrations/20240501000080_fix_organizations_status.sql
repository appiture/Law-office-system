ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING_APPROVAL';

-- Add check constraint for status values
ALTER TABLE organizations
DROP CONSTRAINT IF EXISTS organizations_status_check;

ALTER TABLE organizations
ADD CONSTRAINT organizations_status_check 
CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED'));

-- Update existing organizations to ACTIVE (assuming they should be active)
UPDATE organizations 
SET status = 'ACTIVE' 
WHERE status = 'PENDING_APPROVAL';

-- Recreate the functions to ensure they work correctly
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT organization_id
  FROM public.users users
  JOIN public.organizations organizations ON organizations.id = users.organization_id
  WHERE users.id = auth.uid()
    AND users.status = 'ACTIVE'
    AND organizations.status = 'ACTIVE'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT role
  FROM public.users users
  JOIN public.organizations organizations ON organizations.id = users.organization_id
  WHERE users.id = auth.uid()
    AND users.status = 'ACTIVE'
    AND organizations.status = 'ACTIVE'
  LIMIT 1
$$;