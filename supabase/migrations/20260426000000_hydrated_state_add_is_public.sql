-- Return is_public on each custom playlist so the client can persist it.

CREATE OR REPLACE FUNCTION public.get_user_hydrated_state(req_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_json json;
BEGIN
  IF auth.uid() != req_user_id THEN
    RAISE EXCEPTION 'Unauthorized for get_user_hydrated_state';
  END IF;

  WITH
  noms AS (
    SELECT
      ts.external_id AS "videoId",
      n.track_id      AS "trackId"
    FROM public.track_nominations n
    JOIN public.track_sources ts
      ON ts.track_id = n.track_id AND ts.is_primary = true
    WHERE n.user_id = req_user_id
    ORDER BY n.order_index ASC
  ),
  sups AS (
    SELECT
      ts.external_id AS "videoId",
      s.track_id      AS "trackId",
      s.level         AS "supportLevel"
    FROM public.track_supports s
    JOIN public.track_sources ts
      ON ts.track_id = s.track_id AND ts.is_primary = true
    WHERE s.user_id = req_user_id
    ORDER BY s.order_index ASC
  ),
  active_pl AS (
    SELECT
      ts.external_id AS "videoId",
      pt.track_id     AS "trackId"
    FROM public.user_playlists p
    JOIN public.user_playlist_tracks pt ON pt.playlist_id = p.id
    JOIN public.track_sources ts
      ON ts.track_id = pt.track_id AND ts.is_primary = true
    WHERE p.user_id = req_user_id AND p.is_active_queue = true
    ORDER BY pt.order_index ASC
  ),
  custom_pls AS (
    SELECT
      p.id,
      p.name,
      p.is_public,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'videoId', ts.external_id,
            'trackId', pt.track_id
          ) ORDER BY pt.order_index ASC
        )
        FROM public.user_playlist_tracks pt
        JOIN public.track_sources ts
          ON ts.track_id = pt.track_id AND ts.is_primary = true
        WHERE pt.playlist_id = p.id
      ), '[]'::jsonb) AS "videos"
    FROM public.user_playlists p
    WHERE p.user_id = req_user_id AND p.is_active_queue = false
    ORDER BY p.created_at ASC
  )
  SELECT json_build_object(
    'nominationList',  COALESCE((SELECT json_agg(row_to_json(noms)) FROM noms),           '[]'::json),
    'supportList',     COALESCE((SELECT json_agg(row_to_json(sups)) FROM sups),           '[]'::json),
    'playlist',        COALESCE((SELECT json_agg(row_to_json(active_pl)) FROM active_pl), '[]'::json),
    'customPlaylists', COALESCE((SELECT json_agg(row_to_json(custom_pls)) FROM custom_pls), '[]'::json)
  ) INTO result_json;

  RETURN result_json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_hydrated_state(uuid) TO authenticated;
