-- Slim search function: same text-matching logic as search_track_catalog but
-- returns only the fields the client needs for display and client-side filtering.
-- Tournaments are stripped down to sequence_number only (used for VGMC filter/sort).
-- This replaces client-side Fuse.js search, cutting per-query egress by ~70%.

CREATE OR REPLACE FUNCTION public.search_track_catalog_slim(
  search_term  text,
  result_limit integer DEFAULT 200
)
RETURNS TABLE (
  track_id              uuid,
  source_external_id    text,
  game_title            text,
  track_title           text,
  display_title         text,
  source_title          text,
  source_channel_title  text,
  source_thumbnail_url  text,
  is_retired            boolean,
  retired_by_tournament_name text,
  support_count_1       integer,
  support_count_2       integer,
  support_count_3       integer,
  has_result            boolean,
  tournament_count      bigint,
  tournaments           jsonb
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
    tc.is_retired,
    tc.retired_by_tournament_name,
    tc.support_count_1,
    tc.support_count_2,
    tc.support_count_3,
    tc.has_result,
    tc.tournament_count,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'sequence_number', (elem->>'sequence_number')::int
        ))
        FROM jsonb_array_elements(tc.tournaments) AS elem
        WHERE (elem->>'sequence_number') IS NOT NULL
      ),
      '[]'::jsonb
    ) AS tournaments
  FROM public.track_catalog tc,
    to_tsquery('simple',
      array_to_string(
        array(
          SELECT regexp_replace(word, '[^a-zA-Z0-9]', '', 'g') || ':*'
          FROM unnest(
            string_to_array(
              regexp_replace(search_term, '\s+', ' ', 'g'),
              ' '
            )
          ) AS word
          WHERE length(regexp_replace(word, '[^a-zA-Z0-9]', '', 'g')) > 0
        ),
        ' & '
      )
    ) AS query
  WHERE (
    to_tsvector('simple',
      coalesce(tc.game_title, '')
      || ' ' ||
      coalesce(tc.track_title, '')
    ) @@ query
    OR
    to_tsvector('simple',
      coalesce(tc.source_title, '')
      || ' ' ||
      coalesce(tc.source_channel_title, '')
    ) @@ query
    OR tc.source_external_id = search_term
  )
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_track_catalog_slim(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_track_catalog_slim(text, integer) TO authenticated;
