BEGIN;
DROP FUNCTION IF EXISTS public.admin_create_organization(text, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_invite_team_member(text, text);

NOTIFY pgrst, 'reload schema';

COMMIT;
