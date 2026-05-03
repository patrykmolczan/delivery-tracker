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


-- ------------------------------------------------------------
-- STEP 5 ROLLBACK: Restore admin_create_user to original
-- (without the ON CONFLICT and email existence check)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_create_user(text,text,text,text);

CREATE OR REPLACE FUNCTION admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'user'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  -- instance_id must be all-zeros UUID
  INSERT INTO auth.users (
    instance_id, id, email, encrypted_password, email_confirmed_at,
    role, aud, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token,
    email_change_token_new, email_change, phone_change_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), p_email, v_encrypted_pw, now(),
    'authenticated', 'authenticated', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    false, '', '', '', '', ''
  ) RETURNING id INTO v_user_id;

  -- GoTrue requires auth.identities row
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at, id
  ) VALUES (
    p_email, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email', now(), now(), now(), v_user_id
  );

  INSERT INTO public.profiles (
    id, email, full_name, role, is_active,
    password_change_required, created_at, updated_at
  ) VALUES (
    v_user_id, p_email, p_full_name, p_role::user_role,
    true, true, now(), now()
  );

  RETURN v_user_id;
END;
$$;


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
