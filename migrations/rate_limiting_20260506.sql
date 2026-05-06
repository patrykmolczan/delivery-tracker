-- ============================================================
-- MIGRATION: API Rate Limiting
-- Created: 2026-05-06
-- Run in: Supabase Dashboard -> SQL Editor
-- Safe to run twice (idempotent)
-- ============================================================
-- Creates a lightweight rate_limits table used by Vercel
-- serverless functions to enforce per-user and per-IP request
-- limits without any additional infrastructure.
--
-- Design:
--   - One row per (key, window_bucket).
--   - key format:  "chat:user:<uuid>"
--                  "analyze:user:<uuid>"
--                  "descriptions:user:<uuid>"
--                  "reset:ip:<sha256_prefix>"
--   - window_bucket: Unix epoch floored to the window size
--     e.g. a 60-second window starting at 1746543840
--   - Atomic increment via INSERT ... ON CONFLICT DO UPDATE
--     so concurrent requests from the same user are counted
--     correctly under load.
--   - Old rows are pruned automatically via the cleanup function.
-- ============================================================

-- Table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key            text    NOT NULL,
  window_start   bigint  NOT NULL,
  request_count  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Index for efficient cleanup of expired rows
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON public.rate_limits (window_start);

-- RLS: table is only accessed via service role key from serverless
-- functions — no client-side access needed.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No RLS policies needed: service role bypasses RLS entirely.
-- Authenticated/anon roles have zero access to this table.

-- ============================================================
-- increment_rate_limit(key, window_start)
-- Atomically increments the counter for (key, window) and
-- returns the new count. Safe under concurrent load.
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key          text,
  p_window_start bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rate_limits (key, window_start, request_count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count;
END;
$$;

-- Only service role can call this — no client exposure
REVOKE ALL ON FUNCTION public.increment_rate_limit(text, bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_rate_limit(text, bigint) TO service_role;

-- ============================================================
-- cleanup_rate_limits()
-- Deletes rows older than 1 hour. Called opportunistically
-- from the forgot-password endpoint (low-traffic, good fit).
-- Keeps the table small regardless of usage volume.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.rate_limits
  WHERE window_start < EXTRACT(EPOCH FROM now())::bigint - 3600;
$$;

REVOKE ALL ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;

-- ============================================================
-- VERIFICATION
-- After running, confirm with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'rate_limits';
--   -- should return one row
--
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('increment_rate_limit', 'cleanup_rate_limits');
--   -- should return two rows
-- ============================================================
