-- Update cleanup functions to respect the relational user_playlists table.
-- Previously, tracks that only existed in custom playlists (new relational model)
-- were being deleted by the background cleanup sweep because it only checked
-- the legacy JSONB state in user_player_states.

-- 1. Update the base cleanup function (used by triggers)
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_tracks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tracks
  WHERE id NOT IN (SELECT track_id FROM public.track_tournament_appearances)
    AND id NOT IN (SELECT track_id FROM public.track_supports)
    AND id NOT IN (SELECT track_id FROM public.track_nominations)
    -- GUARD: also check new relational playlists table
    AND id NOT IN (SELECT track_id FROM public.user_playlist_tracks WHERE track_id IS NOT NULL)
    -- GUARD: also check listen history and feedback (NOT EXISTS avoids the NOT IN/NULL gotcha)
    AND NOT EXISTS (SELECT 1 FROM public.track_user_listen_history WHERE track_id = public.tracks.id)
    AND NOT EXISTS (SELECT 1 FROM public.track_user_feedback WHERE track_id = public.tracks.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_player_states ups
      WHERE (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         OR (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         OR (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(
             CASE
               WHEN jsonb_typeof(ups.state -> 'customPlaylists') = 'array'
               THEN ups.state -> 'customPlaylists'
               ELSE '[]'::jsonb
             END
           ) pl
           WHERE (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         )
    );
END;
$$;

-- 2. Update v5 (the grace-period version)
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_tracks_v5()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  -- 1. Cleanup orphaned player states (no profile)
  DELETE FROM public.user_player_states ups
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ups.user_id);

  -- 2. Cleanup orphaned tracks
  DELETE FROM public.tracks t
  WHERE
    t.created_at < timezone('utc', now()) - interval '2 minutes'

    AND NOT EXISTS (SELECT 1 FROM public.track_tournament_appearances tta WHERE tta.track_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM public.track_nominations tn WHERE tn.track_id = t.id)
    -- GUARD: check new relational playlists table
    AND NOT EXISTS (SELECT 1 FROM public.user_playlist_tracks upt WHERE upt.track_id = t.id)

    AND NOT EXISTS (
      SELECT 1 FROM public.track_supports ts
      JOIN public.profiles p ON p.id = ts.user_id
      WHERE ts.track_id = t.id
    )

    AND NOT EXISTS (
      SELECT 1 FROM public.track_user_listen_history tulh
      JOIN public.profiles p ON p.id = tulh.user_id
      WHERE tulh.track_id = t.id
    )

    AND NOT EXISTS (
      SELECT 1 FROM public.track_user_feedback tuf
      JOIN public.profiles p ON p.id = tuf.user_id
      WHERE tuf.track_id = t.id
    )

    AND NOT EXISTS (
      SELECT 1
      FROM public.user_player_states ups
      JOIN public.profiles p ON p.id = ups.user_id
      WHERE (
        (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        OR (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        OR (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ups.state -> 'customPlaylists') = 'array' THEN ups.state -> 'customPlaylists' ELSE '[]'::jsonb END) pl
          WHERE (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.track_sources src
        WHERE src.track_id = t.id
          AND (
            (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            OR (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            OR (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ups.state -> 'customPlaylists') = 'array' THEN ups.state -> 'customPlaylists' ELSE '[]'::jsonb END) pl
              WHERE (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            )
          )
      )
    );

  GET DIAGNOSTICS deleted_count = row_count;
  RETURN deleted_count;
END;
$$;
