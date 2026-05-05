-- ============================================================
-- MIGRATION: Security Hardening — May 5, 2026
-- Addresses: C-3, H-3, M-4
-- Run in: Supabase Dashboard -> SQL Editor
-- Safe to run twice (all statements are idempotent)
-- ============================================================


-- ------------------------------------------------------------
-- C-3: Revoke get_projects_all() and get_projects_count() from anon
--
-- These RPCs were granted to anon to solve the PostgREST pagination
-- problem, but that inadvertently made ALL 14,302 project rows
-- readable by unauthenticated callers hitting the Supabase API
-- directly. The frontend always has an authenticated session before
-- calling fetchProjects(), so revoking anon access breaks nothing
-- for legitimate users.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION get_projects_all() FROM anon;
REVOKE EXECUTE ON FUNCTION get_projects_count() FROM anon;

-- Confirm authenticated role still has access (should already be set)
GRANT EXECUTE ON FUNCTION get_projects_all() TO authenticated;
GRANT EXECUTE ON FUNCTION get_projects_count() TO authenticated;


-- ------------------------------------------------------------
-- H-3: Prevent regular admins from creating super_admin accounts
--
-- admin_create_user() already checks is_admin(), but any admin
-- could pass p_role='super_admin' to bypass the UI restriction.
-- This adds a DB-level check so only super_admins can create
-- other super_admins.
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
  -- Must be at least a regular admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- H-3 FIX: Only super_admins can create other super_admin accounts
  IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can create super admin accounts';
  END IF;

  -- Check if email already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'A user with email % already exists', p_email;
  END IF;

  -- bcrypt cost factor 10 (GoTrue minimum)
  v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));

  -- instance_id must be all-zeros UUID (not NULL)
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

  -- GoTrue requires auth.identities row to authenticate
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at, id
  ) VALUES (
    p_email,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email',
    now(), now(), now(),
    v_user_id
  );

  -- Insert profile
  INSERT INTO public.profiles (
    id, email, full_name, role, is_active,
    password_change_required, created_at, updated_at
  ) VALUES (
    v_user_id, p_email, p_full_name, p_role::user_role,
    true, true, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = now();

  RETURN v_user_id;
END;
$$;

-- Re-grant execute (SECURITY DEFINER function needs explicit grants)
-- Only admins can call this (enforced inside the function above),
-- but the grant must exist for the authenticated role to invoke it.
GRANT EXECUTE ON FUNCTION admin_create_user(text,text,text,text) TO authenticated;


-- ------------------------------------------------------------
-- M-4: Ensure normal users cannot escalate their own role
--
-- Adds (or replaces) an RLS UPDATE policy on profiles that
-- prevents any non-admin from changing their own role column.
-- Admins can update other users' roles normally.
-- This is defence-in-depth alongside the existing is_admin() checks.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "prevent_self_role_escalation" ON profiles;

CREATE POLICY "prevent_self_role_escalation"
ON profiles
FOR UPDATE
USING (true)   -- who can attempt an update (everyone can try)
WITH CHECK (
  -- If the caller is NOT an admin, they cannot change their own role
  -- (they can still update other allowed fields like full_name)
  CASE
    WHEN NOT public.is_admin()
    THEN (role = (SELECT role FROM profiles WHERE id = auth.uid()))
    ELSE true
  END
);


-- ============================================================
-- VERIFICATION QUERIES — run after migration to confirm
-- ============================================================
-- C-3: Confirm anon can no longer call the RPCs
--   SELECT has_function_privilege('anon', 'get_projects_all()', 'EXECUTE');
--   -- should return: false
--   SELECT has_function_privilege('anon', 'get_projects_count()', 'EXECUTE');
--   -- should return: false
--   SELECT has_function_privilege('authenticated', 'get_projects_all()', 'EXECUTE');
--   -- should return: true
--
-- H-3: Confirm super_admin guard exists in function source
--   SELECT prosrc FROM pg_proc WHERE proname = 'admin_create_user';
--   -- should contain: 'Only super admins can create super admin accounts'
--
-- M-4: Confirm policy exists
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'profiles' AND policyname = 'prevent_self_role_escalation';
-- ============================================================
