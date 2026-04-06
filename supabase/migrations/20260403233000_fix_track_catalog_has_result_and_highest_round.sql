-- Restore highest_round and fix has_result logic in track_catalog view
-- This fixes the regression from 20260403000000 where tracks with results were marked as unplaced.

-- Drop dependencies first to allow view recreation
DROP FUNCTION IF EXISTS public.search_track_catalog(text, integer);
DROP VIEW IF EXISTS public.track_catalog CASCADE;

-- Recreate track_catalog view with highest_round and corrected has_result logic
CREATE VIEW public.track_catalog AS
SELECT
  tracks.id AS track_id,
  tracks.canonical_game_title AS game_title,
  tracks.canonical_track_title AS track_title,
  CASE
    WHEN nullif(btrim(coalesce(tracks.canonical_game_title, '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(tracks.canonical_track_title, '')), '') IS NOT NULL
      THEN tracks.canonical_game_title || ' - ' || tracks.canonical_track_title
    ELSE coalesce(
      nullif(btrim(coalesce(tracks.canonical_track_title, '')), ''),
      nullif(btrim(coalesce(tracks.canonical_game_title, '')), ''),
      nullif(btrim(coalesce(track_sources.cached_title, '')), ''),
      track_sources.external_id
    )
  END AS display_title,
  tracks.metadata_status,
  tracks.is_retired,
  retired_tournament.slug AS retired_by_tournament_slug,
  retired_tournament.name AS retired_by_tournament_name,
  track_sources.id AS primary_source_id,
  track_sources.provider,
  track_sources.external_id AS source_external_id,
  track_sources.source_url,
  track_sources.submitted_url,
  track_sources.cached_title AS source_title,
  track_sources.cached_channel_title AS source_channel_title,
  track_sources.cached_thumbnail_url AS source_thumbnail_url,
  track_sources.last_fetched_at,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug', tournament_rows.slug,
          'name', tournament_rows.name,
          'sequence_number', tournament_rows.sequence_number,
          'appearance_label', appearances.appearance_label,
          'placement', appearances.placement,
          'highest_round', appearances.highest_round, -- [FIX] Restored
          'is_retired', appearances.is_retired_in_tournament,
          'notes', appearances.notes
        )
        ORDER BY tournament_rows.sequence_number NULLS LAST, tournament_rows.name
      )
      FROM public.track_tournament_appearances appearances
      JOIN public.tournaments tournament_rows
        ON tournament_rows.id = appearances.tournament_id
      WHERE appearances.track_id = tracks.id
    ),
    '[]'::jsonb
  ) AS tournaments,
  COALESCE(
    (
      SELECT count(*)
      FROM public.track_tournament_appearances appearances
      WHERE appearances.track_id = tracks.id
    ),
    0
  ) AS tournament_count,
  COALESCE(
    (
      SELECT count(*)
      FROM public.track_supports ts
      WHERE ts.track_id = tracks.id AND ts.level = 1
    ),
    0
  ) AS support_count_1,
  COALESCE(
    (
      SELECT count(*)
      FROM public.track_supports ts
      WHERE ts.track_id = tracks.id AND ts.level = 2
    ),
    0
  ) AS support_count_2,
  COALESCE(
    (
      SELECT count(*)
      FROM public.track_supports ts
      WHERE ts.track_id = tracks.id AND ts.level = 3
    ),
    0
  ) AS support_count_3,
  EXISTS (
    SELECT 1
    FROM public.track_tournament_appearances appearances
    WHERE appearances.track_id = tracks.id
      AND (appearances.placement IS NOT NULL OR appearances.highest_round IS NOT NULL) -- [FIX] Added highest_round check
  ) AS has_result
FROM public.tracks
LEFT JOIN public.tournaments retired_tournament
  ON retired_tournament.id = tracks.retired_by_tournament_id
LEFT JOIN public.track_sources
  ON track_sources.track_id = tracks.id
 AND track_sources.is_primary;

-- Recreate search_track_catalog function (identical to before, but follows view structure)
CREATE OR REPLACE FUNCTION public.search_track_catalog(
  search_term text,
  limit_count integer default 20
)
RETURNS SETOF public.track_catalog
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized_term AS (
    SELECT nullif(btrim(search_term), '') AS value
  ),
  ranked_catalog AS (
    SELECT
      track_catalog.*,
      greatest(
        ts_rank_cd(
          to_tsvector(
            'simple',
            coalesce(track_catalog.game_title, '')
              || ' '
              || coalesce(track_catalog.track_title, '')
          ),
          websearch_to_tsquery('simple', normalized_term.value)
        ),
        ts_rank_cd(
          to_tsvector(
            'simple',
            coalesce(track_catalog.source_title, '')
              || ' '
              || coalesce(track_catalog.source_channel_title, '')
          ),
          websearch_to_tsquery('simple', normalized_term.value)
        )
      ) AS search_rank
    FROM public.track_catalog
    CROSS JOIN normalized_term
    WHERE normalized_term.value IS NOT NULL
      AND (
        track_catalog.source_external_id = normalized_term.value
        OR to_tsvector(
          'simple',
          coalesce(track_catalog.game_title, '')
            || ' '
            || coalesce(track_catalog.track_title, '')
        ) @@ websearch_to_tsquery('simple', normalized_term.value)
        OR to_tsvector(
          'simple',
          coalesce(track_catalog.source_title, '')
            || ' '
            || coalesce(track_catalog.source_channel_title, '')
        ) @@ websearch_to_tsquery('simple', normalized_term.value)
      )
  )
  SELECT
    track_id,
    game_title,
    track_title,
    display_title,
    metadata_status,
    is_retired,
    retired_by_tournament_slug,
    retired_by_tournament_name,
    primary_source_id,
    provider,
    source_external_id,
    source_url,
    submitted_url,
    source_title,
    source_channel_title,
    source_thumbnail_url,
    last_fetched_at,
    tournaments,
    tournament_count,
    support_count_1,
    support_count_2,
    support_count_3,
    has_result
  FROM ranked_catalog
  ORDER BY search_rank DESC, display_title ASC
  LIMIT least(greatest(coalesce(limit_count, 20), 1), 50);
$$;

-- Ensure permissions are maintained
GRANT SELECT ON public.track_catalog TO anon;
GRANT SELECT ON public.track_catalog TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO authenticated;
