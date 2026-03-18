create extension if not exists pg_trgm with schema extensions;

create index if not exists tracks_metadata_trgm_idx
on public.tracks
using gin (
  (
    coalesce(canonical_game_title, '') || ' ' || coalesce(canonical_track_title, '')
  ) extensions.gin_trgm_ops
);

create index if not exists track_sources_cached_trgm_idx
on public.track_sources
using gin (
  (
    coalesce(cached_title, '') || ' ' || coalesce(cached_channel_title, '')
  ) extensions.gin_trgm_ops
);

create or replace function public.search_track_catalog(
  search_term text,
  limit_count integer default 20
)
returns setof public.track_catalog
language sql
stable
security definer
set search_path = public, extensions
as $$
  with normalized_term as (
    select nullif(btrim(search_term), '') as value
  ),
  ranked_catalog as (
    select
      track_catalog.*,
      case
        when track_catalog.source_external_id = normalized_term.value then 1
        else 0
      end as exact_id_match,
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
      ) as search_rank
    from public.track_catalog
    cross join normalized_term
    where normalized_term.value is not null
      and (
        track_catalog.source_external_id = normalized_term.value
        or to_tsvector(
          'simple',
          coalesce(track_catalog.game_title, '')
            || ' '
            || coalesce(track_catalog.track_title, '')
        ) @@ websearch_to_tsquery('simple', normalized_term.value)
        or to_tsvector(
          'simple',
          coalesce(track_catalog.source_title, '')
            || ' '
            || coalesce(track_catalog.source_channel_title, '')
        ) @@ websearch_to_tsquery('simple', normalized_term.value)
        or lower(coalesce(track_catalog.display_title, '')) % lower(normalized_term.value)
        or lower(
          coalesce(track_catalog.game_title, '')
            || ' '
            || coalesce(track_catalog.track_title, '')
        ) % lower(normalized_term.value)
        or lower(
          coalesce(track_catalog.source_title, '')
            || ' '
            || coalesce(track_catalog.source_channel_title, '')
        ) % lower(normalized_term.value)
        or lower(coalesce(track_catalog.display_title, '')) like
          '%' || lower(normalized_term.value) || '%'
        or lower(
          coalesce(track_catalog.game_title, '')
            || ' '
            || coalesce(track_catalog.track_title, '')
        ) like '%' || lower(normalized_term.value) || '%'
        or lower(
          coalesce(track_catalog.source_title, '')
            || ' '
            || coalesce(track_catalog.source_channel_title, '')
        ) like '%' || lower(normalized_term.value) || '%'
      )
  )
  select
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
    tournaments
  from ranked_catalog
  order by exact_id_match desc, search_rank desc, display_title asc
  limit least(greatest(coalesce(limit_count, 20), 1), 50);
$$;
