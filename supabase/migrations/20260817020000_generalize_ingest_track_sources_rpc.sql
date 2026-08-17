-- Generalize ingest_youtube_track_sources -> ingest_track_sources: accepts a
-- provider alongside each entry instead of assuming YouTube, and derives
-- source_url per-provider (YouTube: canonical watch URL built from the id;
-- SoundCloud/Bandcamp: the external_id *is* the canonical URL already, our
-- client-side parsers only ever produce a normalized permalink/page URL).
-- No other callers exist besides src/lib/trackCatalog.js, so this is a
-- straight rename rather than keeping a deprecated wrapper.

drop function if exists public.ingest_youtube_track_sources(jsonb);

create or replace function public.ingest_track_sources(
  sources jsonb
)
returns table (
  track_id uuid,
  source_id uuid,
  provider text,
  external_id text,
  was_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
  source_entry jsonb;
  normalized_provider text;
  normalized_external_id text;
  normalized_source_url text;
  normalized_title text;
  normalized_channel_title text;
  normalized_thumbnail_url text;
  normalized_duration_seconds integer;
  normalized_submitted_url text;
  now_utc timestamptz := timezone('utc', now());
  existing_source public.track_sources%rowtype;
  created_track_id uuid;
  created_source_id uuid;
begin
  if active_user_id is null then
    raise exception 'Authentication required';
  end if;

  if sources is null or jsonb_typeof(sources) <> 'array' then
    return;
  end if;

  for source_entry in
    select value
    from jsonb_array_elements(sources)
  loop
    normalized_provider := coalesce(
      nullif(btrim(source_entry ->> 'provider'), ''),
      'youtube'
    );
    normalized_external_id := nullif(btrim(source_entry ->> 'external_id'), '');
    normalized_title := nullif(btrim(source_entry ->> 'cached_title'), '');
    normalized_channel_title := nullif(
      btrim(source_entry ->> 'cached_channel_title'),
      ''
    );
    normalized_thumbnail_url := nullif(
      btrim(source_entry ->> 'cached_thumbnail_url'),
      ''
    );
    normalized_duration_seconds := nullif(
      source_entry ->> 'cached_duration_seconds',
      ''
    )::integer;
    normalized_submitted_url := nullif(btrim(source_entry ->> 'submitted_url'), '');

    if normalized_provider not in ('youtube', 'soundcloud', 'bandcamp') then
      continue;
    end if;

    if normalized_external_id is null then
      continue;
    end if;

    if normalized_provider = 'youtube'
      and normalized_external_id !~ '^[A-Za-z0-9_-]{11}$' then
      continue;
    end if;

    if normalized_provider <> 'youtube'
      and normalized_external_id !~* '^https?://' then
      continue;
    end if;

    normalized_source_url := case
      when normalized_provider = 'youtube'
        then format('https://www.youtube.com/watch?v=%s', normalized_external_id)
      else normalized_external_id
    end;

    select *
    into existing_source
    from public.track_sources
    where public.track_sources.provider = normalized_provider
      and public.track_sources.external_id = normalized_external_id
    order by is_primary desc, created_at asc
    limit 1;

    if found then
      update public.track_sources
      set source_url = normalized_source_url,
          submitted_url = coalesce(
            normalized_submitted_url,
            public.track_sources.submitted_url
          ),
          cached_title = coalesce(
            normalized_title,
            public.track_sources.cached_title
          ),
          cached_channel_title = coalesce(
            normalized_channel_title,
            public.track_sources.cached_channel_title
          ),
          cached_thumbnail_url = coalesce(
            normalized_thumbnail_url,
            public.track_sources.cached_thumbnail_url
          ),
          cached_duration_seconds = coalesce(
            normalized_duration_seconds,
            public.track_sources.cached_duration_seconds
          ),
          last_seen_at = now_utc,
          last_fetched_at = case
            when normalized_title is not null
              or normalized_channel_title is not null
              or normalized_thumbnail_url is not null
              then now_utc
            else public.track_sources.last_fetched_at
          end
      where id = existing_source.id
      returning
        public.track_sources.track_id,
        public.track_sources.id,
        public.track_sources.provider,
        public.track_sources.external_id,
        false
      into track_id, source_id, provider, external_id, was_created;

      return next;
      continue;
    end if;

    insert into public.tracks (created_by)
    values (active_user_id)
    returning id into created_track_id;

    insert into public.track_sources (
      track_id,
      provider,
      external_id,
      source_url,
      submitted_url,
      is_primary,
      cached_title,
      cached_channel_title,
      cached_thumbnail_url,
      cached_duration_seconds,
      first_seen_at,
      last_seen_at,
      last_fetched_at,
      created_by
    )
    values (
      created_track_id,
      normalized_provider,
      normalized_external_id,
      normalized_source_url,
      normalized_submitted_url,
      true,
      normalized_title,
      normalized_channel_title,
      normalized_thumbnail_url,
      normalized_duration_seconds,
      now_utc,
      now_utc,
      case
        when normalized_title is not null
          or normalized_channel_title is not null
          or normalized_thumbnail_url is not null
          then now_utc
        else null
      end,
      active_user_id
    )
    returning id into created_source_id;

    track_id := created_track_id;
    source_id := created_source_id;
    provider := normalized_provider;
    external_id := normalized_external_id;
    was_created := true;
    return next;
  end loop;
end;
$$;

revoke all
on function public.ingest_track_sources(jsonb)
from public;

grant execute
on function public.ingest_track_sources(jsonb)
to authenticated;

-- search_track_catalog_slim (20260418010000) predates the multi-provider
-- track_sources column and doesn't return provider at all. It's the primary
-- search RPC behind the Track Database view (fetchFilteredTracks ->
-- search_track_catalog_slim), so without this a SoundCloud/Bandcamp catalog
-- entry would search-match fine but silently normalize back to a YouTube
-- default (wrong thumbnail fallback, wrong link, wrong player choice) once
-- rendered. Adding a column changes the function's return type, which
-- CREATE OR REPLACE can't do in place - drop it first.
DROP FUNCTION IF EXISTS public.search_track_catalog_slim(text, integer);

CREATE FUNCTION public.search_track_catalog_slim(
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
