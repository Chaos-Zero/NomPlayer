-- 1. Add order_index column
ALTER TABLE public.track_nominations ADD COLUMN IF NOT EXISTS order_index integer not null default 0;
ALTER TABLE public.track_supports ADD COLUMN IF NOT EXISTS order_index integer not null default 0;

-- 2. Backfill order_index from the JSON blob
DO $$
DECLARE
    r RECORD;
    n RECORD;
    s RECORD;
    order_idx integer;
BEGIN
    FOR r IN SELECT user_id, state FROM public.user_player_states LOOP
        -- Backfill Nominations order
        IF r.state ? 'nominationList' THEN
            order_idx := 0;
            FOR n IN SELECT value FROM jsonb_array_elements(r.state->'nominationList') LOOP
                IF n.value->>'trackId' IS NOT NULL THEN
                    UPDATE public.track_nominations 
                    SET order_index = order_idx
                    WHERE user_id = r.user_id AND track_id = (n.value->>'trackId')::uuid;
                    
                    order_idx := order_idx + 1;
                END IF;
            END LOOP;
        END IF;

        -- Backfill Supports order
        IF r.state ? 'supportList' THEN
            order_idx := 0;
            FOR s IN SELECT value FROM jsonb_array_elements(r.state->'supportList') LOOP
                IF s.value->>'trackId' IS NOT NULL THEN
                    UPDATE public.track_supports
                    SET order_index = order_idx
                    WHERE user_id = r.user_id AND track_id = (s.value->>'trackId')::uuid;

                    order_idx := order_idx + 1;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- 3. Modify get_user_hydrated_state RPC to sort by order_index
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
    ORDER BY n.order_index ASC, n.created_at ASC
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
    ORDER BY s.order_index ASC, s.created_at ASC
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
