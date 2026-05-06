ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO organizations (id, name, status, is_demo)
SELECT 2, 'Law Office Demo Workspace', 'ACTIVE', TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM organizations
    WHERE id = 2
);

UPDATE organizations
SET
    name = 'Law Office Demo Workspace',
    status = 'ACTIVE',
    is_demo = TRUE
WHERE id = 2;

ALTER TABLE case_documents
ADD COLUMN IF NOT EXISTS organization_id BIGINT;

ALTER TABLE case_charge_items
ADD COLUMN IF NOT EXISTS organization_id BIGINT;

ALTER TABLE payment_history
ADD COLUMN IF NOT EXISTS organization_id BIGINT;

ALTER TABLE case_followups
ADD COLUMN IF NOT EXISTS organization_id BIGINT;

UPDATE case_documents document_record
SET organization_id = (
    SELECT legal_case.organization_id
    FROM cases legal_case
    WHERE legal_case.id = document_record.case_id
)
WHERE organization_id IS NULL;

UPDATE case_charge_items charge_item
SET organization_id = (
    SELECT legal_case.organization_id
    FROM cases legal_case
    WHERE legal_case.id = charge_item.case_id
)
WHERE organization_id IS NULL;

UPDATE payment_history payment_record
SET organization_id = (
    SELECT legal_case.organization_id
    FROM cases legal_case
    WHERE legal_case.id = payment_record.case_id
)
WHERE organization_id IS NULL;

UPDATE case_followups follow_up
SET organization_id = (
    SELECT legal_case.organization_id
    FROM cases legal_case
    WHERE legal_case.id = follow_up.case_id
)
WHERE organization_id IS NULL;

UPDATE clients
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE cases
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE case_documents
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE case_charge_items
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE payment_history
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE case_followups
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE shared_tasks
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE contacts
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE lobbying_records
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE put_up_dates
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE notifications
SET organization_id = 2
WHERE id BETWEEN 1 AND 9;

UPDATE local_users
SET organization_id = 2
WHERE LOWER(email) = 'demo@lawoffice.local';

ALTER TABLE case_documents
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE case_charge_items
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE payment_history
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE case_followups
ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_case_documents_org ON case_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_case_charge_items_org ON case_charge_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_org ON payment_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_case_followups_org ON case_followups(organization_id);
