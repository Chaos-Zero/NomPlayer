-- Fix get_user_hydrated_state and get_community_nominations_catalog to order
-- by order_index instead of created_at. The order_index column is kept in sync
-- by syncNominations/syncSupports on every save, but was never used here.

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
      c.source_external_id AS "videoId",
      CASE WHEN c.display_title IS NOT NULL AND c.display_title != '' THEN c.display_title ELSE c.source_title END AS "title",
      c.source_thumbnail_url AS "thumbnail",
      c.source_channel_title AS "channelTitle",
      c.track_id AS "trackId",
      c.game_title AS "gameTitle",
      c.track_title AS "trackTitle",
      c.display_title AS "displayTitle",
      c.is_retired AS "isRetired",
      c.support_count_1 AS "supportCount1",
      c.support_count_2 AS "supportCount2",
      c.support_count_3 AS "supportCount3"
    FROM public.track_nominations n
    JOIN public.track_catalog c ON c.track_id = n.track_id
    WHERE n.user_id = req_user_id
    ORDER BY n.order_index ASC
  ),
  sups AS (
    SELECT
      c.source_external_id AS "videoId",
      CASE WHEN c.display_title IS NOT NULL AND c.display_title != '' THEN c.display_title ELSE c.source_title END AS "title",
      c.source_thumbnail_url AS "thumbnail",
      c.source_channel_title AS "channelTitle",
      c.track_id AS "trackId",
      c.game_title AS "gameTitle",
      c.track_title AS "trackTitle",
      c.display_title AS "displayTitle",
      c.is_retired AS "isRetired",
      s.level AS "supportLevel",
      c.support_count_1 AS "supportCount1",
      c.support_count_2 AS "supportCount2",
      c.support_count_3 AS "supportCount3"
    FROM public.track_supports s
    JOIN public.track_catalog c ON c.track_id = s.track_id
    WHERE s.user_id = req_user_id
    ORDER BY s.order_index ASC
  ),
  active_pl AS (
    SELECT
      c.source_external_id AS "videoId",
      CASE WHEN c.display_title IS NOT NULL AND c.display_title != '' THEN c.display_title ELSE c.source_title END AS "title",
      c.source_thumbnail_url AS "thumbnail",
      c.source_channel_title AS "channelTitle",
      c.track_id AS "trackId",
      c.game_title AS "gameTitle",
      c.track_title AS "trackTitle",
      c.display_title AS "displayTitle"
    FROM public.user_playlists p
    JOIN public.user_playlist_tracks pt ON pt.playlist_id = p.id
    JOIN public.track_catalog c ON c.track_id = pt.track_id
    WHERE p.user_id = req_user_id AND p.is_active_queue = true
    ORDER BY pt.order_index ASC
  ),
  custom_pls AS (
    SELECT
      p.id,
      p.name,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'videoId', c.source_external_id,
            'title', CASE WHEN c.display_title IS NOT NULL AND c.display_title != '' THEN c.display_title ELSE c.source_title END,
            'thumbnail', c.source_thumbnail_url,
            'channelTitle', c.source_channel_title,
            'trackId', c.track_id,
            'gameTitle', c.game_title,
            'trackTitle', c.track_title,
            'displayTitle', c.display_title
          ) ORDER BY pt.order_index ASC
        )
        FROM public.user_playlist_tracks pt
        JOIN public.track_catalog c ON c.track_id = pt.track_id
        WHERE pt.playlist_id = p.id
      ), '[]'::jsonb) as "videos"
    FROM public.user_playlists p
    WHERE p.user_id = req_user_id AND p.is_active_queue = false
    ORDER BY p.created_at ASC
  )
  SELECT json_build_object(
    'nominationList', COALESCE((SELECT json_agg(row_to_json(noms)) FROM noms), '[]'::json),
    'supportList', COALESCE((SELECT json_agg(row_to_json(sups)) FROM sups), '[]'::json),
    'playlist', COALESCE((SELECT json_agg(row_to_json(active_pl)) FROM active_pl), '[]'::json),
    'customPlaylists', COALESCE((SELECT json_agg(row_to_json(custom_pls)) FROM custom_pls), '[]'::json)
  ) INTO result_json;

  RETURN result_json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_hydrated_state(uuid) TO authenticated;


-- Fix get_community_nominations_catalog similarly.
CREATE OR REPLACE FUNCTION public.get_community_nominations_catalog()
RETURNS TABLE (
    user_id uuid,
    username text,
    avatar_url text,
    gamefaqs_username text,
    updated_at timestamptz,
    nominations jsonb
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id as user_id,
        p.username,
        p.avatar_url,
        p.gamefaqs_username,
        COALESCE(MAX(n.created_at), p.updated_at) AS updated_at,
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'videoId', c.source_external_id,
                'title', CASE WHEN c.display_title IS NOT NULL AND c.display_title != '' THEN c.display_title ELSE c.source_title END,
                'thumbnail', c.source_thumbnail_url,
                'channelTitle', c.source_channel_title,
                'trackId', c.track_id,
                'gameTitle', c.game_title,
                'trackTitle', c.track_title,
                'displayTitle', c.display_title
            ) ORDER BY n.order_index ASC
        ) FILTER (WHERE n.track_id IS NOT NULL), '[]'::jsonb) AS nominations
    FROM profiles p
    JOIN track_nominations n ON n.user_id = p.id
    JOIN track_catalog c ON c.track_id = n.track_id
    GROUP BY p.id, p.username, p.avatar_url, p.gamefaqs_username
    HAVING COUNT(n.track_id) > 0
    ORDER BY updated_at DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_community_nominations_catalog() TO authenticated, anon;
