-- 1. Track Deletion Log
-- Lightweight append-only table that records when tracks are deleted (e.g. via merges).
-- The client-side catalog uses this to prune stale entries from the snapshot.

CREATE TABLE IF NOT EXISTS public.track_deletions (
  track_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, deleted_at)
);

-- Allow public read so the client delta-sync can query it
GRANT SELECT ON public.track_deletions TO anon, authenticated;

-- Trigger: auto-log when a track row is deleted
CREATE OR REPLACE FUNCTION public.log_track_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.track_deletions (track_id, deleted_at)
  VALUES (OLD.id, now());
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_log_track_deletion
  AFTER DELETE ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.log_track_deletion();

-- 2. Restore search_track_catalog RPC
-- This was accidentally dropped by a CASCADE in 20260406_catalog_delta_views.sql.

CREATE OR REPLACE FUNCTION public.search_track_catalog(
  search_term text,
  limit_count integer DEFAULT 20
)
RETURNS SETOF public.track_catalog
LANGUAGE sql
STABLE
SECURITY INVOKER
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
    updated_at,
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

-- 3. Restore permissions
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO anon, authenticated;
