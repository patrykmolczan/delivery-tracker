-- ============================================================
-- MIGRATION: super_admin role
-- Direction:  UP (apply changes)
-- Created:    2026-05-03
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================
-- SAFE TO RUN: All statements use CREATE OR REPLACE or
-- IF NOT EXISTS so they are idempotent (safe to run twice).
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1: Update is_admin() to include super_admin
-- Previously only returned true for role = 'admin'.
-- Now returns true for 'admin' OR 'super_admin' so that ALL
-- existing RLS policies that call is_admin() continue to work
-- with zero changes to those policies.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT role IN ('admin', 'super_admin')
  FROM profiles
  WHERE id = auth.uid();
$$;


-- ------------------------------------------------------------
-- STEP 2: Add is_super_admin() function
-- Used for gating the admin panel and protecting super_admin
-- rows from being modified by regular admins.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT role = 'super_admin'
  FROM profiles
  WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION is_super_admin() TO anon, authenticated;


-- ------------------------------------------------------------
-- STEP 3: Add RLS policy protecting super_admin profiles
-- Prevents any non-super_admin from updating a super_admin
-- row in profiles (can't deactivate or change their role).
-- ------------------------------------------------------------
-- Drop the policy first if it already exists (idempotent)
DROP POLICY IF EXISTS "protect_super_admin_profiles" ON profiles;

CREATE POLICY "protect_super_admin_profiles"
ON profiles
FOR UPDATE
USING (
  -- You can only update a super_admin row if YOU are a super_admin
  CASE
    WHEN (SELECT role FROM profiles WHERE id = profiles.id) = 'super_admin'
    THEN is_super_admin()
    ELSE true
  END
);


-- ------------------------------------------------------------
-- STEP 4: Update admin_create_user to accept 'super_admin'
-- The existing function accepts p_role text with no constraint
-- so it already works — this is a comment/documentation step.
-- No SQL change needed unless your function has a CHECK on role.
-- Verify by running: \df admin_create_user in psql
-- ------------------------------------------------------------
-- (no SQL needed — p_role is plain text, accepts any value)


-- ============================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================
-- SELECT proname, prosrc FROM pg_proc WHERE proname IN ('is_admin', 'is_super_admin');
-- SELECT rolname FROM pg_roles WHERE rolname = 'authenticated';
-- ============================================================
