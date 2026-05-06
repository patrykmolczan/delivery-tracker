-- ============================================================
-- MIGRATION: Security Hardening — May 5, 2026
-- Supabase version: 20260505215521
-- Addresses: C-3, H-3, M-4
-- Safe to run twice (all statements are idempotent)
-- ============================================================

-- C-3: Revoke get_projects_all() and get_projects_count() from anon
REVOKE EXECUTE ON FUNCTION get_projects_all() FROM anon;
REVOKE EXECUTE ON FUNCTION get_projects_count() FROM anon;

GRANT EXECUTE ON FUNCTION get_projects_all() TO authenticated;
GRANT EXECUTE ON FUNCTION get_projects_count() TO authenticated;

-- H-3: Prevent regular admins from creating super_admin accounts
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

  IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can create super admin accounts';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'A user with email % already exists', p_email;
  END IF;

  v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));

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

GRANT EXECUTE ON FUNCTION admin_create_user(text,text,text,text) TO authenticated;

-- M-4: Ensure normal users cannot escalate their own role
DROP POLICY IF EXISTS "prevent_self_role_escalation" ON profiles;

CREATE POLICY "prevent_self_role_escalation"
ON profiles
FOR UPDATE
USING (true)
WITH CHECK (
  CASE
    WHEN NOT public.is_admin()
    THEN (role = (SELECT role FROM profiles WHERE id = auth.uid()))
    ELSE true
  END
);
