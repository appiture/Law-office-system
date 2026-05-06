# Enterprise Supabase Auth Architecture

## Current Compatibility Map

- `platform_admins` is the global SUPER_ADMIN authority.
- `public.users.role` is organization-local and keeps existing roles: `ADMIN`, `LAWYER`, `STAFF`, plus new `USER`.
- `public.users.organization_id` is the tenant boundary for workspace data.
- Existing login stays unchanged: Supabase Auth signs in, `get_workspace_context()` loads the membership, and `must_reset_password` redirects to `/reset-password`.
- Existing reset flow stays compatible: `supabase.auth.updateUser({ password })` runs first, then `complete_password_reset()` clears `must_reset_password`.

## Security Changes

- Account creation moved from browser-callable SQL RPCs to Supabase Edge Functions.
- The frontend never receives temporary passwords or service-role credentials.
- Edge Functions validate the caller JWT with `supabase.auth.getUser()` before every privileged request.
- `invite-admin` requires `platform_admins`.
- `invite-user` requires an active org-local `ADMIN`.
- Org admins can invite only user-level roles: `USER`, `LAWYER`, `STAFF`.
- Audit events, email delivery logs, invite metadata, and rate-limit logs are server-side.
- Direct org-admin table updates to `public.users` are removed; member changes go through hardened RPCs.

## Files Added

- `database/enterprise_invitation_reporting.sql`
- `supabase/functions/invite-admin/index.ts`
- `supabase/functions/invite-user/index.ts`
- `supabase/functions/send-email/index.ts`
- `supabase/functions/monthly-report/index.ts`
- `supabase/functions/auth-utils/index.ts`
- `supabase/functions/organization-utils/index.ts`
- `supabase/functions/_shared/*.ts`

## Required Secrets

Set these in Supabase Edge Function secrets:

```bash
supabase secrets set SUPABASE_URL="https://your-project.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="your-anon-key"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
supabase secrets set RESEND_API_KEY="re_your_key"
supabase secrets set EMAIL_FROM="Law Office Platform <noreply@yourdomain.com>"
supabase secrets set EMAIL_REPLY_TO="support@yourdomain.com"
supabase secrets set SUPPORT_EMAIL="support@yourdomain.com"
supabase secrets set APP_BASE_URL="https://your-app.vercel.app"
supabase secrets set MONTHLY_REPORT_SECRET="long-random-secret"
```

Do not add `SUPABASE_SERVICE_ROLE_KEY` to Vercel frontend variables.

## Deploy

Apply the database migration in Supabase SQL Editor:

```sql
\i database/enterprise_invitation_reporting.sql
```

Deploy functions:

```bash
supabase functions deploy invite-admin
supabase functions deploy invite-user
supabase functions deploy send-email
supabase functions deploy auth-utils
supabase functions deploy organization-utils
supabase functions deploy monthly-report --no-verify-jwt
```

## Monthly Reports

Schedule `monthly-report` monthly with Supabase Scheduled Edge Functions. Use a bearer token equal to either `SUPABASE_SERVICE_ROLE_KEY` or `MONTHLY_REPORT_SECRET`.

Example request body:

```json
{
  "reportMonth": "2026-05-01"
}
```

Omit `reportMonth` in production to report the previous month automatically.

Recipients:

- All `platform_admins` receive platform summaries.
- Active org `ADMIN` users receive only their organization summary.
- Normal users never receive monthly reports.

## Vercel Frontend

Only these frontend-safe variables belong in Vercel:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_REDIRECT_URL=https://your-app.vercel.app/reset-password
VITE_SUPABASE_CLIENT_BUCKET=client-assets
VITE_SUPABASE_DOCUMENT_BUCKET=case-documents
```

## Production Notes

- Prefer a verified sending domain in Resend before inviting real users.
- Keep Supabase Auth redirect URLs aligned with `APP_BASE_URL/reset-password`.
- Monitor `audit_events`, `email_events`, `organization_invites`, and `monthly_report_runs`.
- Retire the old browser-callable account creation RPCs after all deployments use Edge Functions.
- Rotate service-role and Resend keys if they were ever exposed outside server-side environments.

