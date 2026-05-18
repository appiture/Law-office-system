-- =====================================================
-- FIX: Remaining text overload of edge_check_rate_limit
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.edge_check_rate_limit(
  actor_id text,
  action_key text,
  max_requests integer DEFAULT 10,
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
  _actor_uuid uuid;
  _request_count integer;
BEGIN
  IF _actor_id IS NULL OR _actor_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Missing or invalid actor for rate limit.' USING errcode = '28000';
  END IF;

  _actor_uuid := _actor_id::uuid;

  SELECT count(*)
  INTO _request_count
  FROM public.request_logs AS logs
  WHERE logs.user_id = _actor_uuid
    AND logs.action_key = _action_key
    AND logs.created_at > now() - make_interval(secs => _window_seconds);

  IF _request_count >= _max_requests THEN
    RAISE EXCEPTION 'RATE_LIMIT: Too many requests. Please wait before trying again.'
      USING errcode = 'P0001';
  END IF;

  INSERT INTO public.request_logs(user_id, action_key, ip_address)
  VALUES (_actor_uuid, _action_key, _ip_address);

  IF random() < 0.05 THEN
    DELETE FROM public.request_logs
    WHERE created_at < now() - interval '24 hours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.edge_check_rate_limit(text, text, integer, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.edge_check_rate_limit(text, text, integer, integer, text) TO service_role;

COMMIT;
