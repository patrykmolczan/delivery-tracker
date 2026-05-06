-- ============================================================
-- MIGRATION: admin_delete_user RPC — Final version (v4)
-- Supabase versions applied:
--   20260506082545  admin_delete_user_rpc          (v1 — initial)
--   20260506084036  fix_admin_delete_user_projects_fk (v2 — null created_by)
--   20260506084118  fix_admin_delete_user_all_fks  (v3 — all FK columns)
--   20260506084201  allow_null_csv_imports_uploaded_by
--   20260506084218  allow_null_project_files_uploaded_by
-- This file is the final consolidated state (v4 — currently live).
-- ============================================================

-- Allow NULLs on FK columns that previously blocked deletion
ALTER TABLE public.csv_imports ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE public.project_files ALTER COLUMN uploaded_by DROP NOT NULL;

-- Final admin_delete_user RPC with complete FK null-out chain
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
BEGIN
  -- Only super_admin can call this
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only super admins can delete users';
  END IF;

  -- Prevent self-deletion
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  -- Delete / null-out dependent public schema records
  DELETE FROM public.text_presets     WHERE user_id       = p_user_id;
  DELETE FROM public.notifications    WHERE user_id       = p_user_id;
  DELETE FROM public.audit_log        WHERE user_id       = p_user_id;
  DELETE FROM public.project_feedback WHERE author_id     = p_user_id;
  DELETE FROM public.client_requests  WHERE requested_by  = p_user_id;

  -- Tables where we null-out the reference (data stays, owner gone)
  UPDATE public.projects          SET created_by          = NULL WHERE created_by          = p_user_id;
  UPDATE public.projects          SET ai_eta_override_by  = NULL WHERE ai_eta_override_by  = p_user_id;
  UPDATE public.project_files     SET uploaded_by         = NULL WHERE uploaded_by         = p_user_id;
  UPDATE public.project_files     SET deleted_by          = NULL WHERE deleted_by          = p_user_id;
  UPDATE public.project_tasks     SET created_by          = NULL WHERE created_by          = p_user_id;
  UPDATE public.project_eta_history SET changed_by        = NULL WHERE changed_by          = p_user_id;
  UPDATE public.csv_imports       SET uploaded_by         = NULL WHERE uploaded_by         = p_user_id;

  -- Now safe to delete profile
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- Delete auth schema records
  DELETE FROM auth.identities     WHERE user_id = p_user_id;
  DELETE FROM auth.sessions       WHERE user_id = p_user_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  DELETE FROM auth.mfa_factors    WHERE user_id = p_user_id;
  DELETE FROM auth.users          WHERE id      = p_user_id;
END;
$$;

-- Restrict execution to authenticated users only (super_admin check is inside the function)
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
