-- ============================================================
-- MIGRATION: super-admin on/off switch for the AI Delivery Estimate
--
-- Seeds the app_settings row read by the frontend (useAiEstimateEnabled) and
-- written by the Admin Panel toggle (PATCH /api/settings/ai_estimate_enabled,
-- super admins only). The feature shows only when the value is exactly 'true'.
--
-- Default is 'false' (hidden for everyone) so nothing is shown to requesters
-- until a super admin switches it on. Change 'false' to 'true' below if the
-- estimate should stay visible right after this migration.
--
-- Idempotent: an existing row (and its current value) is never overwritten.
--
-- PREREQUISITE (run first, also idempotent): 001_client_types_min_role.sql —
-- the Pay Intel gate in this release reads client_types.min_role.
-- ============================================================

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('ai_estimate_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- DELETE FROM public.app_settings WHERE key = 'ai_estimate_enabled';
