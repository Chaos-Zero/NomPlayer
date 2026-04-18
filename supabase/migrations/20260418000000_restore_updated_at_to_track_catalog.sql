-- Migration 20260417160000 recreated track_catalog without tracks.updated_at,
-- breaking the client-side delta query (getFullCatalog filters the view by updated_at).
-- This migration recreates the view with the column restored.

DROP FUNCTION IF EXISTS public.search_track_catalog(text, integer);
DROP VIEW IF EXISTS public.track_catalog CASCADE;

CREATE VIEW public.track_catalog
WITH (security_invoker = true) AS
SELECT
  tracks.id                        AS track_id,
  tracks.canonical_game_title      AS game_title,
  tracks.canonical_track_title     AS track_title,
  CASE
    WHEN nullif(btrim(coalesce(tracks.canonical_game_title, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(tracks.canonical_track_title, '')), '') IS NOT NULL
      THEN tracks.canonical_game_title || ' - ' || tracks.canonical_track_title
    ELSE coalesce(
      nullif(btrim(coalesce(tracks.canonical_track_title,  '')), ''),
      nullif(btrim(coalesce(tracks.canonical_game_title,   '')), ''),
      nullif(btrim(coalesce(track_sources.cached_title,    '')), ''),
      track_sources.external_id
    )
  END                              AS display_title,
  tracks.updated_at,
  tracks.metadata_status,
  tracks.is_retired,
  retired_tournament.slug          AS retired_by_tournament_slug,
  retired_tournament.name          AS retired_by_tournament_name,
  track_sources.id                 AS primary_source_id,
  track_sources.provider,
  track_sources.external_id        AS source_external_id,
  track_sources.source_url,
  track_sources.submitted_url,
  track_sources.cached_title       AS source_title,
  track_sources.cached_channel_title AS source_channel_title,
  track_sources.cached_thumbnail_url AS source_thumbnail_url,
  track_sources.last_fetched_at,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug',             tournament_rows.slug,
          'name',             tournament_rows.name,
          'sequence_number',  tournament_rows.sequence_number,
          'appearance_label', appearances.appearance_label,
          'placement',        appearances.placement,
          'is_retired',       appearances.is_retired_in_tournament,
          'notes',            appearances.notes
        )
        ORDER BY tournament_rows.sequence_number NULLS LAST, tournament_rows.name
      )
      FROM public.track_tournament_appearances appearances
      JOIN public.tournaments tournament_rows ON tournament_rows.id = appearances.tournament_id
      WHERE appearances.track_id = tracks.id
    ),
    '[]'::jsonb
  )                                AS tournaments,
  COALESCE(
    (SELECT count(*) FROM public.track_tournament_appearances a WHERE a.track_id = tracks.id),
    0
  )                                AS tournament_count,
  COALESCE(tas.support_count_1, 0) AS support_count_1,
  COALESCE(tas.support_count_2, 0) AS support_count_2,
  COALESCE(tas.support_count_3, 0) AS support_count_3,
  COALESCE(tas.nomination_count, 0) AS nomination_count,
  COALESCE(tas.comment_count,    0) AS comment_count,
  CASE
    WHEN COALESCE(tas.rating_count, 0) > 0
      THEN ROUND(tas.rating_sum::numeric / tas.rating_count, 1)
    ELSE NULL
  END                              AS avg_rating,
  EXISTS (
    SELECT 1 FROM public.track_tournament_appearances a
    WHERE a.track_id = tracks.id AND a.placement IS NOT NULL
  )                                AS has_result
FROM public.tracks
LEFT JOIN public.tournaments retired_tournament
       ON retired_tournament.id = tracks.retired_by_tournament_id
LEFT JOIN public.track_sources
       ON track_sources.track_id = tracks.id
      AND track_sources.is_primary
LEFT JOIN public.track_allotment_stats tas
       ON tas.track_id = tracks.id;

GRANT SELECT ON public.track_catalog TO anon;
GRANT SELECT ON public.track_catalog TO authenticated;

CREATE OR REPLACE FUNCTION public.search_track_catalog(
  search_term  text,
  result_limit integer DEFAULT 50
)
RETURNS SETOF public.track_catalog
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT track_catalog.*
  FROM public.track_catalog,
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
      coalesce(track_catalog.game_title, '')
      || ' ' ||
      coalesce(track_catalog.track_title, '')
    ) @@ query
    OR
    to_tsvector('simple',
      coalesce(track_catalog.source_title, '')
      || ' ' ||
      coalesce(track_catalog.source_channel_title, '')
    ) @@ query
    OR track_catalog.source_external_id = search_term
  )
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO authenticated;
