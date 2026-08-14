-- Add SET search_path = public to functions that were missing it.
-- Prevents search_path hijack by malicious roles (Supabase lint: function_search_path_mutable).
-- No logic changes, bodies are identical to originals.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.check_nomination_before_support()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_player_states ups,
         jsonb_array_elements(ups.state->'nominationList') AS nom
    WHERE ups.user_id = NEW.user_id
      AND nom->>'trackId' IS NOT NULL
      AND (nom->>'trackId')::uuid = NEW.track_id
  ) THEN
    RAISE EXCEPTION 'Track is already in your nomination list and cannot be added to support list.';
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.sync_supports_on_nomination_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT (NEW.state ? 'nominationList') THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.track_supports ts
  WHERE ts.user_id = NEW.user_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.state->'nominationList') AS nom
      WHERE nom->>'trackId' IS NOT NULL
        AND (nom->>'trackId')::uuid = ts.track_id
    );

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.check_user_active(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_exists boolean;
  state_exists boolean;
  profile_data jsonb;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = target_user_id) INTO profile_exists;
  SELECT EXISTS(SELECT 1 FROM public.user_player_states WHERE user_id = target_user_id) INTO state_exists;

  IF profile_exists THEN
    SELECT json_build_object('username', username) INTO profile_data
    FROM public.profiles WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object(
    'user_id', target_user_id,
    'profile_exists', profile_exists,
    'state_exists', state_exists,
    'profile_info', profile_data
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.find_any_track_reference(target_id text)
RETURNS TABLE (
  user_id uuid,
  path text,
  full_state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ups.user_id,
    'state'::text,
    ups.state
  FROM public.user_player_states ups
  WHERE ups.state::text LIKE '%' || target_id || '%';
END;
$$;
