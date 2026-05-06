-- Drop old version to allow parameter name changes
DROP FUNCTION IF EXISTS public.check_rate_limit(text, int, int);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _action_key text, 
  _max_requests_per_window int DEFAULT 10, 
  _window_seconds int DEFAULT 60
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _request_count int;
  _uid uuid;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN RETURN; END IF;

  -- 1. Check Burst (last 5 seconds)
  SELECT count(*) INTO _request_count
  FROM public.request_logs
  WHERE user_id = _uid
    AND created_at > now() - interval '5 seconds';
  
  IF _request_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT: Burst protection triggered. Slow down.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Check Window (per minute default)
  SELECT count(*) INTO _request_count
  FROM public.request_logs
  WHERE user_id = _uid
    AND action_key = _action_key
    AND created_at > now() - (_window_seconds || ' seconds')::interval;

  IF _request_count >= _max_requests_per_window THEN
    RAISE EXCEPTION 'RATE_LIMIT: Too many requests for %. Limit is % per %s.', _action_key, _max_requests_per_window, _window_seconds
      USING ERRCODE = 'P0001';
  END IF;

  -- Log the request
  INSERT INTO public.request_logs (user_id, action_key)
  VALUES (_uid, _action_key);
END;
$$;

-- ============================================================
-- 2. FOREIGN KEY INTEGRITY: PREVENT ORPHANS
-- ============================================================

-- cases -> clients
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_client_id_fkey;
ALTER TABLE public.cases ADD CONSTRAINT cases_client_id_fkey 
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

-- payments -> cases
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_case_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_case_id_fkey 
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- payment_charges -> payments
ALTER TABLE public.payment_charges DROP CONSTRAINT IF EXISTS payment_charges_payment_id_fkey;
ALTER TABLE public.payment_charges ADD CONSTRAINT payment_charges_payment_id_fkey 
  FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;

-- payment_history -> payment_charges
ALTER TABLE public.payment_history DROP CONSTRAINT IF EXISTS payment_history_payment_charge_id_fkey;
ALTER TABLE public.payment_history ADD CONSTRAINT payment_history_payment_charge_id_fkey 
  FOREIGN KEY (payment_charge_id) REFERENCES public.payment_charges(id) ON DELETE CASCADE;

-- followups -> cases
ALTER TABLE public.followups DROP CONSTRAINT IF EXISTS followups_case_id_fkey;
ALTER TABLE public.followups ADD CONSTRAINT followups_case_id_fkey 
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- documents -> cases
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_case_id_fkey;
ALTER TABLE public.documents ADD CONSTRAINT documents_case_id_fkey 
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- ============================================================
-- 3. FINAL SECURITY: RE-VERIFY RLS
-- ============================================================

-- Ensure organizations table is also protected
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_select ON public.organizations;
CREATE POLICY org_isolation_select ON public.organizations
FOR SELECT
USING (id = public.current_organization_id());

-- Disable direct deletion for users (force soft-delete)
DROP POLICY IF EXISTS users_delete_own_org ON public.users;
CREATE POLICY users_delete_own_org ON public.users
FOR DELETE
USING (false); -- No one can hard-delete users via API

-- ============================================================
-- 4. CLEANUP TRIGGERS (MAINTENANCE)
-- ============================================================

-- Periodically prune old request logs
CREATE OR REPLACE FUNCTION public.prune_old_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.request_logs WHERE created_at < now() - interval '24 hours';
$$;
