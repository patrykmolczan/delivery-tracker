-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: entra_sso_full_down.sql
-- Purpose:   Roll back entra_sso_full_up.sql
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS cleanup_expired_sso_state();
DROP TABLE  IF EXISTS sso_state;

DELETE FROM app_settings
WHERE key IN (
  'sso_provider', 'entra_tenant_id', 'entra_client_id',
  'entra_client_secret_enc', 'entra_redirect_uri', 'entra_tenant_hint'
);

-- Optionally reset SSO to disabled
-- UPDATE app_settings SET value = 'false' WHERE key = 'sso_enabled';
