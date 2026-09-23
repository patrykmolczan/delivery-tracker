-- Migration 004: repoint notifications.user_id and project_messages.sender_id
-- FKs from the dead legacy Supabase "auth.users" table to profiles(id).
--
-- Root cause found while fixing the chat-notification regression:
-- auth.users is a frozen leftover table from before the AWS/Cognito migration
-- (last row created 2026-05-07, only 3 rows total). Both FKs still pointed at
-- it. Result: ANY insert into notifications, or ANY chat message sent, for
-- one of the 69 of 72 profiles NOT in that dead table throws a foreign key
-- violation (23503) and silently fails wherever the caller catches errors —
-- which is most of the app's notification call sites. This is the real,
-- full-scope reason notifications have been broken for the vast majority of
-- users, independent of the separate PR #83 regression that removed the
-- client-side notification calls.
--
-- Pre-verified against live data before running: zero existing
-- notifications.user_id or project_messages.sender_id values are missing
-- from profiles(id), so this is a safe, non-destructive repoint — no rows
-- change, only the constraint target.

ALTER TABLE notifications
  DROP CONSTRAINT notifications_user_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE project_messages
  DROP CONSTRAINT project_messages_sender_id_fkey;
ALTER TABLE project_messages
  ADD CONSTRAINT project_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Rollback (restores the old, broken behavior — not recommended):
-- ALTER TABLE notifications DROP CONSTRAINT notifications_user_id_fkey;
-- ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
--   FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- ALTER TABLE project_messages DROP CONSTRAINT project_messages_sender_id_fkey;
-- ALTER TABLE project_messages ADD CONSTRAINT project_messages_sender_id_fkey
--   FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
