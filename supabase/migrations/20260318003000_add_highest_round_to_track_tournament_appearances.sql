alter table public.track_tournament_appearances
add column if not exists highest_round text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'track_tournament_appearances_highest_round_length'
      and conrelid = 'public.track_tournament_appearances'::regclass
  ) then
    alter table public.track_tournament_appearances
    add constraint track_tournament_appearances_highest_round_length check (
      highest_round is null
      or char_length(btrim(highest_round)) between 1 and 120
    );
  end if;
end
$$;

comment on column public.track_tournament_appearances.highest_round is
  'Highest round reached by the track in that tournament, e.g. Top 16, Quarterfinal, Semifinal, Final.';

create or replace view public.track_catalog as
select
  tracks.id as track_id,
  tracks.canonical_game_title as game_title,
  tracks.canonical_track_title as track_title,
  case
    when nullif(btrim(coalesce(tracks.canonical_game_title, '')), '') is not null
      and nullif(btrim(coalesce(tracks.canonical_track_title, '')), '') is not null
      then tracks.canonical_game_title || ' - ' || tracks.canonical_track_title
    else coalesce(
      nullif(btrim(coalesce(tracks.canonical_track_title, '')), ''),
      nullif(btrim(coalesce(tracks.canonical_game_title, '')), ''),
      nullif(btrim(coalesce(track_sources.cached_title, '')), ''),
      track_sources.external_id
    )
  end as display_title,
  tracks.metadata_status,
  tracks.is_retired,
  retired_tournament.slug as retired_by_tournament_slug,
  retired_tournament.name as retired_by_tournament_name,
  track_sources.id as primary_source_id,
  track_sources.provider,
  track_sources.external_id as source_external_id,
  track_sources.source_url,
  track_sources.submitted_url,
  track_sources.cached_title as source_title,
  track_sources.cached_channel_title as source_channel_title,
  track_sources.cached_thumbnail_url as source_thumbnail_url,
  track_sources.last_fetched_at,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'slug', tournament_rows.slug,
          'name', tournament_rows.name,
          'sequence_number', tournament_rows.sequence_number,
          'appearance_label', appearances.appearance_label,
          'placement', appearances.placement,
          'highest_round', appearances.highest_round,
          'is_retired', appearances.is_retired_in_tournament,
          'notes', appearances.notes
        )
        order by tournament_rows.sequence_number nulls last, tournament_rows.name
      )
      from public.track_tournament_appearances appearances
      join public.tournaments tournament_rows
        on tournament_rows.id = appearances.tournament_id
      where appearances.track_id = tracks.id
    ),
    '[]'::jsonb
  ) as tournaments
from public.tracks
left join public.tournaments retired_tournament
  on retired_tournament.id = tracks.retired_by_tournament_id
left join public.track_sources
  on track_sources.track_id = tracks.id
 and track_sources.is_primary;
