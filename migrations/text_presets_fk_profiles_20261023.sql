-- NOT YET APPLIED (applied at deploy time of the text-presets fix PR).
-- 1) text_presets.user_id now references public.profiles(id) instead of the leftover auth.users table
--    (the Cognito app never populates auth.users). The 3 existing rows already satisfy it. Same cascade as before.
-- 2) The legacy BEFORE INSERT trigger overwrote user_id with auth.uid() (always NULL on Aurora), so every INSERT failed.
--    It now only fills user_id when the caller did not supply one.
-- Rollback: restore the old FK (REFERENCES auth.users(id) ON DELETE CASCADE) and the old function body
--           (NEW.user_id = auth.uid();).
ALTER TABLE public.text_presets DROP CONSTRAINT text_presets_user_id_fkey;
ALTER TABLE public.text_presets ADD CONSTRAINT text_presets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.set_text_preset_user_id() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER AS $f$
BEGIN
  IF NEW.user_id IS NULL THEN NEW.user_id = auth.uid(); END IF;
  RETURN NEW;
END;
$f$;
