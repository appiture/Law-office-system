-- Performance Optimizations for Law Office Demo System

-- 1. Add indexes for faster organization and case-based lookups
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_case ON payments(case_id);
CREATE INDEX IF NOT EXISTS idx_followups_case ON followups(case_id);

-- 2. Create dashboard summary RPC for lightweight aggregation
CREATE OR REPLACE FUNCTION get_dashboard_summary(org_id uuid)
RETURNS json AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'total_clients', COUNT(DISTINCT c.id),
      'total_cases', COUNT(DISTINCT cs.id)
    )
    FROM clients c
    LEFT JOIN cases cs ON cs.client_id = c.id
    WHERE c.organization_id = org_id
  );
END;
$$ LANGUAGE plpgsql;
