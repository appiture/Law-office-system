-- Make all current users an ADMIN so they can access Organization Branding settings
UPDATE public.users SET role = 'ADMIN';
