-- Update search_track_catalog to include tournament_count from the updated view
CREATE OR REPLACE FUNCTION public.search_track_catalog(
  search_term text,
  limit_count integer DEFAULT 20
)
RETURNS SETOF public.track_catalog
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH normalized_term AS (
    SELECT nullif(btrim(search_term), '') AS value
  ),
  ranked_catalog AS (
    SELECT
      track_catalog.*,
      CASE
        WHEN track_catalog.source_external_id = normalized_term.value THEN 1
        ELSE 0
      END AS exact_id_match,
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
        ),
        similarity(
          lower(coalesce(track_catalog.display_title, '')),
          lower(normalized_term.value)
        ),
        similarity(
          lower(
            coalesce(track_catalog.game_title, '')
              || ' '
              || coalesce(track_catalog.track_title, '')
          ),
          lower(normalized_term.value)
        ),
        similarity(
          lower(
            coalesce(track_catalog.source_title, '')
              || ' '
              || coalesce(track_catalog.source_channel_title, '')
          ),
          lower(normalized_term.value)
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
        OR lower(coalesce(track_catalog.display_title, '')) % lower(normalized_term.value)
        OR lower(
          coalesce(track_catalog.game_title, '')
            || ' '
            || coalesce(track_catalog.track_title, '')
        ) % lower(normalized_term.value)
        OR lower(
          coalesce(track_catalog.source_title, '')
            || ' '
            || coalesce(track_catalog.source_channel_title, '')
        ) % lower(normalized_term.value)
        OR lower(coalesce(track_catalog.display_title, '')) LIKE
          '%' || lower(normalized_term.value) || '%'
        OR lower(
          coalesce(track_catalog.game_title, '')
            || ' '
            || coalesce(track_catalog.track_title, '')
        ) LIKE '%' || lower(normalized_term.value) || '%'
        OR lower(
          coalesce(track_catalog.source_title, '')
            || ' '
            || coalesce(track_catalog.source_channel_title, '')
        ) LIKE '%' || lower(normalized_term.value) || '%'
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
    tournament_count
  FROM ranked_catalog
  ORDER BY exact_id_match DESC, search_rank DESC, display_title ASC
  LIMIT least(greatest(coalesce(limit_count, 20), 1), 50);
$$;

-- Ensure permissions are maintained
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO authenticated;
