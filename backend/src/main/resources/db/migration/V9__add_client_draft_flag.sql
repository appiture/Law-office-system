-- Migration: Add draft flag to clients table
-- Adds support for multi-step client creation with save-as-draft functionality

ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- Ensure all existing clients are marked as non-draft
UPDATE clients SET is_draft = false WHERE is_draft IS NULL;

-- Add index for query performance
CREATE INDEX IF NOT EXISTS idx_clients_is_draft ON clients(is_draft);