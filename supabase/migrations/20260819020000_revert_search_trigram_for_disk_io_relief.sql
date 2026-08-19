-- TEMPORARY RELIEF: 20260819010000_add_accent_folding_and_trigram_fuzzy_search
-- made search_track_catalog_slim / search_track_catalog sequential-scan
-- public.track_catalog (itself a non-materialized view with two LATERAL
-- aggregate joins per row) while computing unaccent() (x3), to_tsvector()
-- (x2), and pg_trgm similarity() (x3) per row, with no supporting index -
-- the migration's own comment acknowledged the sequential scan but assumed
-- it'd stay sub-10ms at ~11k tracks. It didn't account for this running on
-- every debounced keystroke (TrackCatalogSearch.jsx, ~140ms) across
-- concurrent users against a view that's already doing per-row lateral
-- joins. Shortly after this shipped (2026-08-19 ~01:21), Disk IO hit 90%
-- and Postgres/Auth/Storage/Realtime all went unhealthy
-- (IncreaseSubscriptionConnectionPool: Too many database timeouts).
--
-- This migration reverts both functions to the version from
-- 20260819000000_fix_search_tokenization_punctuation (the last known-good
-- state before the trigram/accent-folding change), dropping the unaccent()
-- and similarity() work entirely to cut per-row cost back down. This
-- reintroduces the accent-folding bug those functions still have (see
-- 20260819010000's own description) - that's an accepted, deliberate
-- trade-off for immediate relief, not an oversight.
--
-- Once the database has recovered, accent-folding and trigram fuzzy
-- matching should be reintroduced properly: wrap unaccent() in your own
-- IMMUTABLE SQL function (unaccent() itself is only STABLE), then back it
-- with a GIN trigram index and a GIN to_tsvector index, per the performance
-- note at the bottom of 20260819010000, so the added matching doesn't cost
-- a full scan-plus-lateral-join on every keystroke.
--
-- Both functions keep their existing signature/return type, so this is a
-- plain CREATE OR REPLACE - no DROP needed.

CREATE OR REPLACE FUNCTION public.search_track_catalog_slim(
  search_term  text,
  result_limit integer DEFAULT 200
)
RETURNS TABLE (
  track_id              uuid,
  provider              text,
  source_external_id    text,
  game_title            text,
  track_title            text,
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
    tc.provider,
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
          SELECT word || ':*'
          FROM unnest(
            string_to_array(
              regexp_replace(search_term, '[^a-zA-Z0-9]+', ' ', 'g'),
              ' '
            )
          ) AS word
          WHERE length(word) > 0
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

-- search_track_catalog (non-slim) shares the identical bug. It's currently
-- unused by any client code (superseded by the _slim RPC above), but it's
-- reverted here too so it doesn't reintroduce the same load if it's ever
-- wired back up.
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
          SELECT word || ':*'
          FROM unnest(
            string_to_array(
              regexp_replace(search_term, '[^a-zA-Z0-9]+', ' ', 'g'),
              ' '
            )
          ) AS word
          WHERE length(word) > 0
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
