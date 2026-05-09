-- Make all current users an ADMIN so they can access Organization Branding settings
UPDATE public.users SET role = 'ADMIN';

-- ALSO update the Supabase Auth metadata so the next JWT issued reflects the new role.
-- This ensures RLS policies that check auth.jwt() -> 'role' work correctly.
UPDATE auth.users 
SET raw_app_meta_data = raw_app_meta_data || '{"role":"ADMIN"}'::jsonb;
