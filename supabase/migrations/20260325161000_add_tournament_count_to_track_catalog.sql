-- Update track_catalog view to include tournament_count for sorting
CREATE OR REPLACE VIEW public.track_catalog AS
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
  ) AS tournament_count
FROM public.tracks
LEFT JOIN public.tournaments retired_tournament
  ON retired_tournament.id = tracks.retired_by_tournament_id
LEFT JOIN public.track_sources
  ON track_sources.track_id = tracks.id
 AND track_sources.is_primary;

-- Ensure permissions are maintained
GRANT SELECT ON public.track_catalog TO anon;
GRANT SELECT ON public.track_catalog TO authenticated;
