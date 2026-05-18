-- =====================================================
-- FIX: Runtime database errors reported by supabase db lint
-- =====================================================

BEGIN;

-- Older invite RPC versions update expires_at; newer Edge Functions use
-- temporary_password_expires_at. Keep both columns available so legacy RPCs
-- do not fail if called.
ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- The service-role rate-limit helper accepts these exact parameter names via
-- PostgREST RPC calls, so keep the public signature stable and use aliases in
-- the function body to avoid column/parameter ambiguity.
ALTER TABLE public.request_logs
  ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS idx_request_logs_user_action_time
  ON public.request_logs(user_id, action_key, created_at DESC);

CREATE OR REPLACE FUNCTION public.edge_check_rate_limit(
  actor_id uuid,
  action_key text,
  max_requests integer DEFAULT 5,
  window_seconds integer DEFAULT 60,
  ip_address text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_id ALIAS FOR $1;
  _action_key ALIAS FOR $2;
  _max_requests ALIAS FOR $3;
  _window_seconds ALIAS FOR $4;
  _ip_address ALIAS FOR $5;
  _request_count integer;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Missing actor for rate limit.' USING errcode = '28000';
  END IF;

  SELECT count(*)
  INTO _request_count
  FROM public.request_logs AS logs
  WHERE logs.user_id = _actor_id
    AND logs.action_key = _action_key
    AND logs.created_at > now() - make_interval(secs => _window_seconds);

  IF _request_count >= _max_requests THEN
    RAISE EXCEPTION 'RATE_LIMIT: Too many requests. Please wait before trying again.'
      USING errcode = 'P0001';
  END IF;

  INSERT INTO public.request_logs(user_id, action_key, ip_address)
  VALUES (_actor_id, _action_key, _ip_address);

  IF random() < 0.05 THEN
    DELETE FROM public.request_logs
    WHERE created_at < now() - interval '24 hours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.edge_check_rate_limit(uuid, text, integer, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.edge_check_rate_limit(uuid, text, integer, integer, text) TO service_role;

COMMIT;
