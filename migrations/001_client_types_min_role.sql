-- ============================================================
-- MIGRATION: client_types.min_role (Pay Intel admin gating)
-- Build plan ref: §2.4
--
-- WARNING: no migrations directory exists in the backend bundle this was
-- generated against — there's no visible convention for how schema changes
-- reach Aurora today. Confirm the right process with whoever owns the
-- database before running this (see build plan §8.3). This file is a
-- proposal, not a verified-against-prod script.
--
-- Idempotent: safe to run more than once.
-- ============================================================

ALTER TABLE public.client_types
  ADD COLUMN IF NOT EXISTS min_role TEXT NOT NULL DEFAULT 'user';

-- Optional but recommended: constrain to the three real roles so a typo in
-- an admin API call can't silently create an unreachable gate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_types_min_role_check'
  ) THEN
    ALTER TABLE public.client_types
      ADD CONSTRAINT client_types_min_role_check
      CHECK (min_role IN ('user', 'admin', 'super_admin'));
  END IF;
END $$;

-- Gate Pay Intel to admins and super_admins, per the announcement banner
-- copy ("Pay Intel restricted to Admins"). Adjust the name match if the
-- actual client_types row is named differently once §2 data entry lands.
UPDATE public.client_types
   SET min_role = 'admin'
 WHERE name = 'Pay Intel';

-- ── Rollback ──────────────────────────────────────────────────────────────
-- ALTER TABLE public.client_types DROP CONSTRAINT IF EXISTS client_types_min_role_check;
-- ALTER TABLE public.client_types DROP COLUMN IF EXISTS min_role;
