-- search_track_catalog_slim / search_track_catalog tokenize the query with
-- an ASCII-only character class ([a-zA-Z0-9]), so any accented letter
-- ("è", "é", "ñ", "ü", ...) in the search term is treated the same as
-- punctuation - stripped out as a word boundary. Postgres's own
-- to_tsvector doesn't do that: it treats accented letters as ordinary word
-- characters, so "Pokémon" indexes as the single lexeme 'pokémon'.
-- Searching "Pokémon" therefore gets tokenized into 'pok:* & mon:*' (split
-- on the é) and neither half matches the single indexed lexeme - and
-- searching the unaccented "Pokemon" can't match 'pokémon' either, since
-- nothing folds one to the other. Verified against a real Postgres
-- instance.
--
-- Fix: accent-fold the search term with the unaccent extension before
-- tokenizing, and accent-fold the indexed text the same way before it goes
-- into to_tsvector, so "e" and "è" compare equal on both sides regardless
-- of which one was typed.
--
-- While we're changing how matching works, also bring back the pg_trgm
-- trigram similarity matching that search_track_catalog (non-slim) had
-- before search_track_catalog_slim replaced it as the function the app
-- actually calls (see 20260318014500_upgrade_track_catalog_search_to_fuzzy
-- and 20260418010000_add_search_track_catalog_slim) - it was dropped along
-- the way, silently losing typo tolerance for the live search path. pg_trgm
-- is already enabled with indexes on the underlying tracks/track_sources
-- columns from that first migration; this doesn't add new ones (see the
-- performance note at the bottom).
--
-- Results are now ranked (exact source id match, then the better of
-- full-text rank / trigram similarity) before LIMIT, rather than whatever
-- order the scan happened to produce - matters most for
-- TrackCatalogSearch.jsx's dropdown, which renders the RPC's rows directly
-- with no client-side re-sort.
--
-- Both functions keep their existing signature/return type, so this is a
-- plain CREATE OR REPLACE - no DROP needed.

create extension if not exists unaccent with schema extensions;

CREATE OR REPLACE FUNCTION public.search_track_catalog_slim(
  search_term  text,
  result_limit integer DEFAULT 200
)
RETURNS TABLE (
  track_id              uuid,
  provider              text,
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
SET search_path = public, extensions
AS $$
  WITH params AS (
    -- Accent-fold up front: turns "è"/"é"/etc. into their plain-ASCII base
    -- letter, so the tokenizer below (which only treats a-z/0-9 as word
    -- characters) sees the same word an unaccented search would, instead
    -- of splitting on the accent as if it were punctuation.
    SELECT unaccent(coalesce(search_term, '')) AS unaccented_term
  ),
  tokens AS (
    SELECT array(
      SELECT word || ':*'
      FROM unnest(
        string_to_array(
          regexp_replace(params.unaccented_term, '[^a-zA-Z0-9]+', ' ', 'g'),
          ' '
        )
      ) AS word
      WHERE length(word) > 0
    ) AS words
    FROM params
  ),
  query AS (
    SELECT
      CASE
        WHEN tokens.words = '{}'::text[] THEN NULL
        ELSE to_tsquery('simple', array_to_string(tokens.words, ' & '))
      END AS tsquery,
      lower(params.unaccented_term) AS trigram_term
    FROM tokens, params
  )
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
  FROM public.track_catalog tc
  CROSS JOIN query
  CROSS JOIN LATERAL (
    -- Computed once per row and reused below, instead of re-running
    -- unaccent()/coalesce() on every predicate and rank expression.
    SELECT
      unaccent(coalesce(tc.game_title, '') || ' ' || coalesce(tc.track_title, '')) AS game_track,
      unaccent(coalesce(tc.source_title, '') || ' ' || coalesce(tc.source_channel_title, '')) AS source,
      unaccent(coalesce(tc.display_title, '')) AS display
  ) AS blob
  WHERE (
    tc.source_external_id = search_term
    OR (
      query.tsquery IS NOT NULL
      AND (
        to_tsvector('simple', blob.game_track) @@ query.tsquery
        OR to_tsvector('simple', blob.source) @@ query.tsquery
      )
    )
    OR (
      -- Trigram similarity is unreliable below ~3 characters (too few
      -- trigrams to be meaningful), so it only kicks in past the prefix
      -- search above, not in place of it.
      length(query.trigram_term) >= 3
      AND (
        lower(blob.display) % query.trigram_term
        OR lower(blob.game_track) % query.trigram_term
        OR lower(blob.source) % query.trigram_term
      )
    )
  )
  ORDER BY
    (tc.source_external_id = search_term) DESC,
    GREATEST(
      COALESCE(ts_rank_cd(to_tsvector('simple', blob.game_track), query.tsquery), 0),
      COALESCE(ts_rank_cd(to_tsvector('simple', blob.source), query.tsquery), 0),
      similarity(lower(blob.display), query.trigram_term),
      similarity(lower(blob.game_track), query.trigram_term),
      similarity(lower(blob.source), query.trigram_term)
    ) DESC
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_track_catalog_slim(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_track_catalog_slim(text, integer) TO authenticated;

-- search_track_catalog (non-slim) shares the identical bug and isn't
-- currently called by any client code (superseded by the _slim RPC above)
-- - kept in sync anyway so it doesn't reintroduce this if it's ever wired
-- back up.
CREATE OR REPLACE FUNCTION public.search_track_catalog(
  search_term  text,
  result_limit integer DEFAULT 50
)
RETURNS SETOF public.track_catalog
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT unaccent(coalesce(search_term, '')) AS unaccented_term
  ),
  tokens AS (
    SELECT array(
      SELECT word || ':*'
      FROM unnest(
        string_to_array(
          regexp_replace(params.unaccented_term, '[^a-zA-Z0-9]+', ' ', 'g'),
          ' '
        )
      ) AS word
      WHERE length(word) > 0
    ) AS words
    FROM params
  ),
  query AS (
    SELECT
      CASE
        WHEN tokens.words = '{}'::text[] THEN NULL
        ELSE to_tsquery('simple', array_to_string(tokens.words, ' & '))
      END AS tsquery,
      lower(params.unaccented_term) AS trigram_term
    FROM tokens, params
  )
  SELECT track_catalog.*
  FROM public.track_catalog
  CROSS JOIN query
  CROSS JOIN LATERAL (
    SELECT
      unaccent(coalesce(track_catalog.game_title, '') || ' ' || coalesce(track_catalog.track_title, '')) AS game_track,
      unaccent(coalesce(track_catalog.source_title, '') || ' ' || coalesce(track_catalog.source_channel_title, '')) AS source,
      unaccent(coalesce(track_catalog.display_title, '')) AS display
  ) AS blob
  WHERE (
    track_catalog.source_external_id = search_term
    OR (
      query.tsquery IS NOT NULL
      AND (
        to_tsvector('simple', blob.game_track) @@ query.tsquery
        OR to_tsvector('simple', blob.source) @@ query.tsquery
      )
    )
    OR (
      length(query.trigram_term) >= 3
      AND (
        lower(blob.display) % query.trigram_term
        OR lower(blob.game_track) % query.trigram_term
        OR lower(blob.source) % query.trigram_term
      )
    )
  )
  ORDER BY
    (track_catalog.source_external_id = search_term) DESC,
    GREATEST(
      COALESCE(ts_rank_cd(to_tsvector('simple', blob.game_track), query.tsquery), 0),
      COALESCE(ts_rank_cd(to_tsvector('simple', blob.source), query.tsquery), 0),
      similarity(lower(blob.display), query.trigram_term),
      similarity(lower(blob.game_track), query.trigram_term),
      similarity(lower(blob.source), query.trigram_term)
    ) DESC
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO authenticated;

-- Performance note: this doesn't add a GIN index for either the
-- unaccent()-wrapped trigram comparisons or the to_tsvector() full-text
-- match (there wasn't one for full-text before this migration either -
-- search_track_catalog_slim has always sequential-scanned that predicate).
-- At today's catalog size (~11k tracks, see src/data/catalogSnapshot.json)
-- that's sub-10ms regardless, so it isn't worth the added migration
-- surface yet. If the catalog grows enough for this to matter: unaccent()
-- is STABLE, not IMMUTABLE (its result depends on search_path resolving
-- the dictionary), so it can't be used directly in an index expression -
-- you'd need to wrap it in your own IMMUTABLE SQL function first, then
-- index gin_trgm_ops / to_tsvector on top of that wrapper.
