-- 005_login_attempts.sql
-- Adds a passive audit trail for login attempts (SSO + password) so super
-- admins can debug sign-in failures (e.g. IdP-side rejections that never
-- reach any other part of the app) without touching Cognito billing tier
-- or any existing auth/SSO code path.
--
-- This table is purely additive: nothing reads from it except the new
-- /api/login-attempts GET route, and nothing in the login/SSO flow
-- depends on it (a failed insert here never blocks or alters a login).

CREATE TABLE IF NOT EXISTS login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'sso',   -- 'sso' | 'password'
  success     BOOLEAN NOT NULL,
  reason      TEXT,                           -- e.g. Cognito error/error_description, or NULL on success
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_lower ON login_attempts (lower(email));
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts (created_at DESC);
