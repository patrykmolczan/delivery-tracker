-- ============================================================
-- MIGRATION: project_countries — per-country analyst assignment
--            & completion, plus the non-destructive-sync constraint
-- Build plan ref: §3.2 (prerequisite), §3.3 (schema)
--
-- WARNING: no migrations directory exists in the backend bundle this was
-- generated against. Confirm the right process with whoever owns the
-- database before running this (see build plan §8.3). Proposal, not a
-- verified-against-prod script.
--
-- Run 001_client_types_min_role.sql first if not already applied (unrelated
-- table, no ordering dependency, just keeping numbering sequential).
-- ============================================================

-- ── Prerequisite: unique constraint the new upsert-based syncCountries
--    relies on (routes/projects.js). Confirm there are no existing
--    duplicate (project_id, country_id) rows before running — if there are,
--    this will fail and they need deduplicating first:
--
--      SELECT project_id, country_id, count(*)
--        FROM public.project_countries
--       GROUP BY project_id, country_id
--      HAVING count(*) > 1;
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_countries
  ADD CONSTRAINT project_countries_project_country_uniq
  UNIQUE (project_id, country_id);

-- ── Assignment & completion columns ──────────────────────────────────────
ALTER TABLE public.project_countries
  ADD COLUMN IF NOT EXISTS assigned_user_id       UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_analyst_name  TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by            UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS completed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by           UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS completed_by_name      TEXT;

CREATE INDEX IF NOT EXISTS idx_project_countries_assigned_user
  ON public.project_countries (assigned_user_id) WHERE assigned_user_id IS NOT NULL;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- ALTER TABLE public.project_countries DROP CONSTRAINT IF EXISTS project_countries_project_country_uniq;
-- DROP INDEX IF EXISTS idx_project_countries_assigned_user;
-- ALTER TABLE public.project_countries
--   DROP COLUMN IF EXISTS assigned_user_id,
--   DROP COLUMN IF EXISTS assigned_analyst_name,
--   DROP COLUMN IF EXISTS assigned_at,
--   DROP COLUMN IF EXISTS assigned_by,
--   DROP COLUMN IF EXISTS completed_at,
--   DROP COLUMN IF EXISTS completed_by,
--   DROP COLUMN IF EXISTS completed_by_name;
