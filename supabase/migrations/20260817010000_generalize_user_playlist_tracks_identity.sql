-- Generalize public.user_playlist_tracks's "raw" (uncatalogued) entry
-- identity from a YouTube-specific youtube_video_id column to the same
-- (provider, external_id) pair track_sources already uses. This is the
-- storage for a playlist entry that was added by URL but hasn't (yet) been
-- promoted into the shared track catalog.

-- 1. Add the generalized identity columns.
alter table public.user_playlist_tracks
  add column provider text not null default 'youtube',
  add column external_id text,
  add column cached_duration_seconds integer;

alter table public.user_playlist_tracks
  add constraint upt_provider_check check (
    provider in ('youtube', 'soundcloud', 'bandcamp')
  );

alter table public.user_playlist_tracks
  add constraint upt_cached_duration_positive check (
    cached_duration_seconds is null or cached_duration_seconds > 0
  );

-- 2. Backfill from the column being retired.
update public.user_playlist_tracks
set external_id = youtube_video_id
where youtube_video_id is not null;

-- 3. Swap the raw-entry uniqueness index onto the generalized pair.
drop index public.upt_playlist_video_unique;

create unique index upt_playlist_external_unique
  on public.user_playlist_tracks (playlist_id, provider, external_id)
  where external_id is not null;

-- 4. Swap the "must have an identifier" check onto the generalized column,
--    then drop the retired column itself.
alter table public.user_playlist_tracks
  drop constraint upt_track_or_video_check;

alter table public.user_playlist_tracks
  add constraint upt_track_or_external_check
  check (track_id is not null or external_id is not null);

alter table public.user_playlist_tracks
  drop column youtube_video_id;

-- 5. Redefine get_user_hydrated_state so every video object it returns
--    (nominationList/supportList/playlist/customPlaylists) carries a
--    `provider` field alongside `videoId`, and the raw-entry arm of
--    customPlaylists reads external_id instead of the retired column.
--    Everything else here is unchanged from the previous definition
--    (20260504000000_user_playlist_tracks_allow_raw_youtube.sql).
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
      ts.provider     AS "provider",
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
      ts.provider     AS "provider",
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
      ts.provider     AS "provider",
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
              'provider',     ts.provider,
              'trackId',      pt.track_id,
              'order_index',  pt.order_index
            ) AS v
          FROM public.user_playlist_tracks pt
          JOIN public.track_sources ts
            ON ts.track_id = pt.track_id AND ts.is_primary = true
          WHERE pt.playlist_id = p.id
            AND pt.track_id IS NOT NULL

          UNION ALL

          -- Arm 2: raw entries (no catalog row, use cached metadata)
          SELECT
            jsonb_build_object(
              'videoId',        pt.external_id,
              'provider',       pt.provider,
              'trackId',        NULL,
              'title',          pt.cached_title,
              'channelTitle',   pt.cached_channel,
              'thumbnail',      pt.cached_thumbnail,
              'durationSeconds', pt.cached_duration_seconds,
              'order_index',    pt.order_index
            ) AS v
          FROM public.user_playlist_tracks pt
          WHERE pt.playlist_id = p.id
            AND pt.track_id IS NULL
            AND pt.external_id IS NOT NULL
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

-- Note on public.get_allotment_stats_by_video_ids (20260417160000): it also
-- hardcodes `track_sources.provider = 'youtube'`, but deliberately left as
-- is here - its contract is specifically "batch stats lookup by YouTube
-- video id array" (param name video_ids, no provider param), it has no
-- current callers in this codebase, and the filter is a correct defensive
-- measure for that YouTube-specific contract rather than an arbitrary
-- restriction. Revisit only if/when something actually needs a
-- provider-aware version of this lookup.
