-- Generalize listen-history tracking (record_youtube_track_listen,
-- get_user_youtube_track_listens) to any provider, not just YouTube.
--
-- track_user_listen_history itself is already provider-agnostic (keyed by
-- track_id, a uuid — see 20260317034500_add_track_user_listen_history.sql),
-- only these two RPCs' lookup against track_sources hardcodes
-- provider = 'youtube'. That filter can simply be dropped rather than
-- replaced with a provider parameter: a YouTube external_id is always
-- exactly 11 [A-Za-z0-9_-] characters and a SoundCloud/Bandcamp external_id
-- is always a full https:// URL — those shapes can never collide, so
-- matching on external_id alone is already unambiguous across providers.
--
-- Renaming (not just adding a param) means the old function names would
-- otherwise keep existing as separate, still-callable functions alongside
-- the new ones (see the overload lesson from 20260817030000) — drop them
-- explicitly.
DROP FUNCTION IF EXISTS public.record_youtube_track_listen(text, text, integer);
DROP FUNCTION IF EXISTS public.get_user_youtube_track_listens(text[]);

CREATE FUNCTION public.record_track_listen(
  external_id text,
  listen_event text,
  seconds_played integer DEFAULT 0
)
RETURNS public.track_user_listen_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_external_id text := nullif(btrim(external_id), '');
  normalized_event text := lower(nullif(btrim(listen_event), ''));
  normalized_seconds integer := greatest(coalesce(seconds_played, 0), 0);
  active_user_id uuid := auth.uid();
  resolved_track_id uuid;
  now_utc timestamptz := timezone('utc', now());
  result_row public.track_user_listen_history;
BEGIN
  -- Gracefully handle anonymous users instead of raising exception (prevents 500 errors)
  IF active_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF normalized_external_id IS NULL OR normalized_event NOT IN ('started', 'completed') THEN
    RETURN NULL;
  END IF;

  -- Find the track
  SELECT track_sources.track_id
  INTO resolved_track_id
  FROM public.track_sources
  WHERE track_sources.external_id = normalized_external_id
  ORDER BY track_sources.is_primary DESC, track_sources.created_at ASC
  LIMIT 1;

  IF resolved_track_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.track_user_listen_history (
    track_id,
    user_id,
    listen_count,
    completion_count,
    total_seconds_played,
    first_listened_at,
    last_listened_at,
    first_completed_at,
    last_completed_at
  )
  VALUES (
    resolved_track_id,
    active_user_id,
    1,
    CASE WHEN normalized_event = 'completed' THEN 1 ELSE 0 END,
    normalized_seconds,
    now_utc,
    now_utc,
    CASE WHEN normalized_event = 'completed' THEN now_utc ELSE NULL END,
    CASE WHEN normalized_event = 'completed' THEN now_utc ELSE NULL END
  )
  ON CONFLICT (track_id, user_id) DO UPDATE
  SET listen_count = public.track_user_listen_history.listen_count + 1,
      completion_count = public.track_user_listen_history.completion_count
        + CASE WHEN normalized_event = 'completed' THEN 1 ELSE 0 END,
      total_seconds_played = public.track_user_listen_history.total_seconds_played
        + normalized_seconds,
      last_listened_at = now_utc,
      first_completed_at = CASE
        WHEN normalized_event = 'completed'
          THEN coalesce(public.track_user_listen_history.first_completed_at, now_utc)
        ELSE public.track_user_listen_history.first_completed_at
      END,
      last_completed_at = CASE
        WHEN normalized_event = 'completed' THEN now_utc
        ELSE public.track_user_listen_history.last_completed_at
      END
  RETURNING *
  INTO result_row;

  RETURN result_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_track_listen(text, text, integer) TO anon, authenticated;

CREATE FUNCTION public.get_track_listens(
  external_ids text[] DEFAULT NULL
)
RETURNS TABLE (
  external_id text,
  track_id uuid,
  listen_status text,
  listen_count integer,
  completion_count integer,
  total_seconds_played integer,
  first_listened_at timestamptz,
  last_listened_at timestamptz,
  first_completed_at timestamptz,
  last_completed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    track_sources.external_id,
    track_user_listen_history.track_id,
    track_user_listen_history.listen_status,
    track_user_listen_history.listen_count,
    track_user_listen_history.completion_count,
    track_user_listen_history.total_seconds_played,
    track_user_listen_history.first_listened_at,
    track_user_listen_history.last_listened_at,
    track_user_listen_history.first_completed_at,
    track_user_listen_history.last_completed_at
  FROM public.track_user_listen_history
  JOIN public.track_sources
    ON track_sources.track_id = track_user_listen_history.track_id
   AND track_sources.is_primary = true
  WHERE track_user_listen_history.user_id = auth.uid()
    AND (
      external_ids IS NULL
      OR track_sources.external_id = ANY (external_ids)
    )
  ORDER BY track_user_listen_history.last_listened_at DESC, track_sources.external_id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_track_listens(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_track_listens(text[]) TO authenticated;
