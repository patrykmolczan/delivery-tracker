-- ============================================================
-- MIGRATION: super_admin role
-- Direction:  DOWN (rollback — undo everything in up.sql)
-- Created:    2026-05-03
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================
-- WARNING: Run this ONLY to fully revert to the state before
-- the super_admin feature was added.
-- After running this, redeploy from backup/pre-super-admin
-- branch in Vercel to restore the old frontend code.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1 ROLLBACK: Restore is_admin() to original
-- Reverts to only checking role = 'admin'
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT role = 'admin'
  FROM profiles
  WHERE id = auth.uid();
$$;


-- ------------------------------------------------------------
-- STEP 2 ROLLBACK: Drop is_super_admin() function
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS is_super_admin();


-- ------------------------------------------------------------
-- STEP 3 ROLLBACK: Drop the super_admin protection policy
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "protect_super_admin_profiles" ON profiles;


-- ------------------------------------------------------------
-- STEP 4 ROLLBACK: Demote any super_admin users back to admin
-- So no one is left with a role value the old code
-- doesn't understand.
-- ------------------------------------------------------------
UPDATE profiles
SET role = 'admin', updated_at = NOW()
WHERE role = 'super_admin';


-- ============================================================
-- AFTER RUNNING THIS SQL:
-- 1. Go to Vercel dashboard
-- 2. Redeploy from branch: backup/pre-super-admin
--    OR run: git checkout backup/pre-super-admin && git push origin backup/pre-super-admin:main
-- 3. Clear browser cache and test login
-- ============================================================
-- VERIFICATION: Confirm no super_admin rows remain
-- SELECT id, email, role FROM profiles WHERE role = 'super_admin';
-- (should return 0 rows)
-- ============================================================
