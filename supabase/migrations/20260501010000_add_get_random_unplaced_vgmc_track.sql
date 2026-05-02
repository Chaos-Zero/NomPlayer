-- Replaces the two-round-trip client pattern (HEAD count + ranged SELECT) with a
-- single ORDER BY RANDOM() LIMIT 1 that also filters excluded video IDs server-side.
-- The client no longer needs to fetch 21 rows per attempt × up to 3 attempts.

CREATE OR REPLACE FUNCTION public.get_random_unplaced_vgmc_track(
  exclude_video_ids text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
  track_id                   uuid,
  source_external_id         text,
  game_title                 text,
  track_title                text,
  display_title              text,
  source_title               text,
  source_channel_title       text,
  source_thumbnail_url       text,
  source_url                 text,
  submitted_url              text,
  is_retired                 boolean,
  retired_by_tournament_name text,
  support_count_1            integer,
  support_count_2            integer,
  support_count_3            integer,
  comment_count              integer,
  avg_rating                 numeric,
  has_result                 boolean,
  tournament_count           bigint,
  tournaments                jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    tc.track_id,
    tc.source_external_id,
    tc.game_title,
    tc.track_title,
    tc.display_title,
    tc.source_title,
    tc.source_channel_title,
    tc.source_thumbnail_url,
    tc.source_url,
    tc.submitted_url,
    tc.is_retired,
    tc.retired_by_tournament_name,
    tc.support_count_1,
    tc.support_count_2,
    tc.support_count_3,
    tc.comment_count,
    tc.avg_rating,
    tc.has_result,
    tc.tournament_count,
    tc.tournaments
  FROM public.track_catalog tc
  WHERE tc.tournaments != '[]'::jsonb
    AND tc.has_result = false
    AND (
      cardinality(exclude_video_ids) = 0
      OR tc.source_external_id IS NULL
      OR tc.source_external_id != ALL(exclude_video_ids)
    )
  ORDER BY random()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_random_unplaced_vgmc_track(text[]) TO anon, authenticated;
