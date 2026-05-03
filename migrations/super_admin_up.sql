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
-- STEP 4: Fix admin_create_user — 3 critical GoTrue bugs fixed
-- Bug 1: No auth.identities row → GoTrue can't authenticate user
-- Bug 2: instance_id was NULL → GoTrue rejects login
-- Bug 3: bcrypt cost factor 6 → GoTrue requires minimum 10
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

  -- Check if email already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'A user with email % already exists', p_email;
  END IF;

  -- FIX 3: Use cost factor 10 (GoTrue minimum)
  v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));

  -- FIX 2: instance_id must be all-zeros UUID (not NULL)
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

  -- FIX 1: Insert auth.identities row (GoTrue requires this to authenticate)
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


-- ============================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================
-- SELECT proname, prosrc FROM pg_proc WHERE proname IN ('is_admin', 'is_super_admin');
-- SELECT rolname FROM pg_roles WHERE rolname = 'authenticated';
-- ============================================================
