-- Migration 003: chat_presence table
-- Purpose: track which profile last polled the chat for a given project, so
-- server-side notification logic (routes/chat.js) can skip notifying a user
-- who is currently viewing the chat window (their poll loop hits
-- POST /api/chat/:projectId/read every 3s while the window is open).
--
-- Additive only — no existing tables/columns touched. Safe to run multiple
-- times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS chat_presence (
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, profile_id)
);

-- Rollback:
-- DROP TABLE IF EXISTS chat_presence;
