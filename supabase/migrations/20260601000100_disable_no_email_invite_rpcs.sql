BEGIN;

-- These RPCs create accounts inside Postgres but cannot send setup email.
-- Keep account creation on Edge Functions so stale browser bundles either:
-- 1) call invite-admin/invite-user directly, or
-- 2) hit a missing RPC and fall back to the email-capable Edge Function.
DROP FUNCTION IF EXISTS public.admin_create_organization(text, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_invite_team_member(text, text);

NOTIFY pgrst, 'reload schema';

COMMIT;
