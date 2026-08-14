-- Allow user_playlist_tracks to store raw YouTube links (no catalog track required).
-- Previously track_id was NOT NULL, meaning only catalogued tracks could be saved.
-- This migration makes track_id nullable, adds youtube_video_id + cached metadata
-- columns, and replaces the composite PK with a surrogate UUID so both entry types
-- can coexist with proper uniqueness guarantees.
--
-- Also updates get_user_hydrated_state to return raw-YouTube entries in custom playlists.

-- 1. Drop the old composite primary key (playlist_id, track_id)
ALTER TABLE public.user_playlist_tracks
  DROP CONSTRAINT user_playlist_tracks_pkey;

-- 2. Make track_id nullable (the FK itself stays, NULLs skip FK checks in Postgres)
ALTER TABLE public.user_playlist_tracks
  ALTER COLUMN track_id DROP NOT NULL;

-- 3. Add surrogate primary key
ALTER TABLE public.user_playlist_tracks
  ADD COLUMN id UUID DEFAULT gen_random_uuid();

-- Backfill any existing rows that somehow got NULL (shouldn't happen, but safe)
UPDATE public.user_playlist_tracks SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE public.user_playlist_tracks
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.user_playlist_tracks
  ADD PRIMARY KEY (id);

-- 4. Add columns for raw YouTube entries
ALTER TABLE public.user_playlist_tracks
  ADD COLUMN youtube_video_id TEXT,
  ADD COLUMN cached_title     TEXT,
  ADD COLUMN cached_channel   TEXT,
  ADD COLUMN cached_thumbnail TEXT;

-- 5. Integrity constraint: every row must have at least one identifier
ALTER TABLE public.user_playlist_tracks
  ADD CONSTRAINT upt_track_or_video_check
  CHECK (track_id IS NOT NULL OR youtube_video_id IS NOT NULL);

-- 6. Partial unique indexes (replaces the dropped PK uniqueness)
--    One catalog-track entry per playlist
CREATE UNIQUE INDEX upt_playlist_track_unique
  ON public.user_playlist_tracks (playlist_id, track_id)
  WHERE track_id IS NOT NULL;

--    One raw-YouTube entry per playlist (only when no track_id)
CREATE UNIQUE INDEX upt_playlist_video_unique
  ON public.user_playlist_tracks (playlist_id, youtube_video_id)
  WHERE youtube_video_id IS NOT NULL AND track_id IS NULL;

-- 7. Update get_user_hydrated_state to return raw-YouTube entries in custom playlists.
--    The custom_pls CTE now uses UNION ALL so both catalog-backed rows (joined via
--    track_sources) and youtube_video_id-only rows (using cached metadata) are included.
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
        SELECT jsonb_agg(v ORDER BY (v->>'order_index')::integer)
        FROM (
          -- Arm 1: catalog-backed entries (joined via track_sources)
          SELECT
            jsonb_build_object(
              'videoId',      ts.external_id,
              'trackId',      pt.track_id,
              'order_index',  pt.order_index
            ) AS v
          FROM public.user_playlist_tracks pt
          JOIN public.track_sources ts
            ON ts.track_id = pt.track_id AND ts.is_primary = true
          WHERE pt.playlist_id = p.id
            AND pt.track_id IS NOT NULL

          UNION ALL

          -- Arm 2: raw YouTube entries (no catalog row, use cached metadata)
          SELECT
            jsonb_build_object(
              'videoId',      pt.youtube_video_id,
              'trackId',      NULL,
              'title',        pt.cached_title,
              'channelTitle', pt.cached_channel,
              'thumbnail',    pt.cached_thumbnail,
              'order_index',  pt.order_index
            ) AS v
          FROM public.user_playlist_tracks pt
          WHERE pt.playlist_id = p.id
            AND pt.track_id IS NULL
            AND pt.youtube_video_id IS NOT NULL
        ) arms
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
