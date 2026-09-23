-- ============================================================
-- MIGRATION: project_countries — per-country analyst assignment
--            & completion, plus the non-destructive-sync constraint
-- Build plan ref: §3.2 (prerequisite), §3.3 (schema)
--
-- REVISED 2026-09-22: assignment is scoped to the `analysts` reference
-- table (active analysts only, currently 6), not `profiles`/login users.
-- Analysts have no login of their own, so assigned_analyst_id references
-- public.analysts(id) rather than public.profiles(id). assigned_by and
-- completed_by still reference public.profiles(id) — those record which
-- logged-in admin performed the action, not who the analyst is.
--
-- Re-checked directly against Aurora on 2026-09-22: a unique constraint on
-- (project_id, country_id) already exists — project_countries_project_id_country_id_key
-- (not created by this migration, pre-existing). Zero duplicate rows either
-- way. The diff-based syncCountries (routes/projects.js) upserts by
-- ON CONFLICT (project_id, country_id), which resolves against that
-- existing constraint by column list, not by name, so no new constraint is
-- needed here.
-- ============================================================

-- ── Assignment & completion columns ──────────────────────────────────────
-- Note: no stored assigned_analyst_name column — it's computed at read time
-- via a LEFT JOIN gated on analysts.is_active, so a deactivated analyst
-- automatically reads back as NULL (UI shows "Unassigned") with zero
-- additional cleanup logic required.
ALTER TABLE public.project_countries
  ADD COLUMN IF NOT EXISTS assigned_analyst_id    INTEGER REFERENCES public.analysts(id),
  ADD COLUMN IF NOT EXISTS assigned_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by            UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS completed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by           UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS completed_by_name      TEXT;

CREATE INDEX IF NOT EXISTS idx_project_countries_assigned_analyst
  ON public.project_countries (assigned_analyst_id) WHERE assigned_analyst_id IS NOT NULL;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_project_countries_assigned_analyst;
-- ALTER TABLE public.project_countries
--   DROP COLUMN IF EXISTS assigned_analyst_id,
--   DROP COLUMN IF EXISTS assigned_at,
--   DROP COLUMN IF EXISTS assigned_by,
--   DROP COLUMN IF EXISTS completed_at,
--   DROP COLUMN IF EXISTS completed_by,
--   DROP COLUMN IF EXISTS completed_by_name;
