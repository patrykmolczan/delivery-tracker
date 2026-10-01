-- Applied live 2026-10-01. Feedback author/resolver columns now reference public.profiles(id)
-- (they previously referenced the leftover auth.users table, which the Cognito app never populates).
ALTER TABLE public.project_feedback DROP CONSTRAINT project_feedback_author_id_fkey;
ALTER TABLE public.project_feedback ADD CONSTRAINT project_feedback_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.project_feedback_items DROP CONSTRAINT project_feedback_items_resolved_by_fkey;
ALTER TABLE public.project_feedback_items ADD CONSTRAINT project_feedback_items_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
