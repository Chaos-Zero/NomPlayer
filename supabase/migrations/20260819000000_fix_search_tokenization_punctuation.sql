-- search_track_catalog_slim / search_track_catalog build their tsquery by
-- stripping non-alphanumeric characters out of each whitespace-delimited
-- word (regexp_replace(word, '[^a-zA-Z0-9]', '', 'g')). That deletes
-- punctuation instead of treating it as a word boundary, so "Kirby's"
-- becomes the single glued token "Kirbys" and "R-Type" becomes "RType".
--
-- Postgres's own to_tsvector does the opposite: it splits on punctuation,
-- so "Kirby's Dream Land" indexes as separate lexemes 'kirby' and 's', never
-- 'kirbys'. The glued query token then never matches anything indexed,
-- so any search word containing an apostrophe, hyphen, colon, etc. silently
-- returns zero rows (verified against a real Postgres instance).
--
-- Fix: replace runs of non-alphanumeric characters with a space *before*
-- splitting into words, so punctuation acts as a boundary the same way
-- to_tsvector treats it, instead of being deleted in place. This also
-- subsumes the old separate whitespace-collapsing step, since whitespace
-- is itself non-alphanumeric.
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
-- fixed here too so it doesn't reintroduce the same broken behavior if it's
-- ever wired back up.
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
