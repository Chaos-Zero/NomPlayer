-- Migration to handle user data merging during track merges
CREATE OR REPLACE FUNCTION public.migrate_track_user_data(
  target_track_id uuid,
  source_track_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_id uuid;
BEGIN
  FOREACH source_id IN ARRAY source_track_ids LOOP
    -- 1. Merge track_user_feedback (Ratings and Notes)
    -- Rule: Keep target rating, append source note if it exists
    INSERT INTO public.track_user_feedback (user_id, track_id, rating, note, created_at, updated_at)
    SELECT
      user_id,
      target_track_id,
      rating,
      note,
      created_at,
      updated_at
    FROM public.track_user_feedback
    WHERE track_id = source_id
    ON CONFLICT (user_id, track_id) DO UPDATE SET
      note = CASE
        WHEN NULLIF(btrim(excluded.note), '') IS NOT NULL THEN
          COALESCE(public.track_user_feedback.note, '') ||
          CASE WHEN NULLIF(btrim(public.track_user_feedback.note), '') IS NOT NULL THEN ' | ' ELSE '' END ||
          'Merged note: ' || btrim(excluded.note)
        ELSE public.track_user_feedback.note
      END,
      updated_at = timezone('utc', now());

    -- 2. Merge track_supports
    -- Rule: Keep the highest support level
    INSERT INTO public.track_supports (user_id, track_id, level, created_at)
    SELECT
      user_id,
      target_track_id,
      level,
      created_at
    FROM public.track_supports
    WHERE track_id = source_id
    ON CONFLICT (user_id, track_id) DO UPDATE SET
      level = GREATEST(public.track_supports.level, excluded.level);

    -- 3. Merge track_user_listen_history
    -- Rule: Sum counts and aggregate timestamps
    INSERT INTO public.track_user_listen_history (
      user_id,
      track_id,
      listen_count,
      completion_count,
      total_seconds_played,
      first_listened_at,
      last_listened_at,
      first_completed_at,
      last_completed_at
    )
    SELECT
      user_id,
      target_track_id,
      listen_count,
      completion_count,
      total_seconds_played,
      first_listened_at,
      last_listened_at,
      first_completed_at,
      last_completed_at
    FROM public.track_user_listen_history
    WHERE track_id = source_id
    ON CONFLICT (user_id, track_id) DO UPDATE SET
      listen_count = public.track_user_listen_history.listen_count + excluded.listen_count,
      completion_count = public.track_user_listen_history.completion_count + excluded.completion_count,
      total_seconds_played = public.track_user_listen_history.total_seconds_played + excluded.total_seconds_played,
      first_listened_at = LEAST(public.track_user_listen_history.first_listened_at, excluded.first_listened_at),
      last_listened_at = GREATEST(public.track_user_listen_history.last_listened_at, excluded.last_listened_at),
      first_completed_at = LEAST(public.track_user_listen_history.first_completed_at, excluded.first_completed_at),
      last_completed_at = GREATEST(public.track_user_listen_history.last_completed_at, excluded.last_completed_at);

    -- After migrating data for this source, we can safely allow the caller to delete it.
    -- (The caller handles the tracks table deletion)
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_track_user_data(uuid, uuid[]) TO authenticated;
