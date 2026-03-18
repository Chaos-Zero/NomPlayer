create or replace function public.import_vgmc_catalog_row(
  nomination_contest_number integer,
  canonical_game_title_input text,
  canonical_track_title_input text,
  youtube_video_id_input text,
  submitted_url_input text default null,
  is_retired_input boolean default false,
  retiree_contest_number integer default null,
  retiree_placement integer default null,
  highest_round_input text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_track_id uuid;
  nomination_tournament_id uuid;
  retiree_tournament_id uuid;
  normalized_game_title text;
  normalized_track_title text;
  canonical_source_url text;
begin
  if youtube_video_id_input is null
     or youtube_video_id_input !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Invalid YouTube video id: %', youtube_video_id_input;
  end if;

  normalized_game_title := nullif(btrim(canonical_game_title_input), '');
  normalized_track_title := nullif(btrim(canonical_track_title_input), '');
  canonical_source_url := 'https://www.youtube.com/watch?v=' || youtube_video_id_input;

  if nomination_contest_number is not null then
    insert into public.tournaments (
      slug,
      name,
      sequence_number
    )
    values (
      'vgmc-' || nomination_contest_number,
      'VGMC ' || nomination_contest_number,
      nomination_contest_number
    )
    on conflict (name) do update
    set
      slug = excluded.slug,
      sequence_number = excluded.sequence_number,
      updated_at = timezone('utc', now())
    returning id into nomination_tournament_id;
  end if;

  if retiree_contest_number is not null then
    insert into public.tournaments (
      slug,
      name,
      sequence_number
    )
    values (
      'vgmc-' || retiree_contest_number,
      'VGMC ' || retiree_contest_number,
      retiree_contest_number
    )
    on conflict (name) do update
    set
      slug = excluded.slug,
      sequence_number = excluded.sequence_number,
      updated_at = timezone('utc', now())
    returning id into retiree_tournament_id;
  end if;

  select track_id
  into resolved_track_id
  from public.track_sources
  where provider = 'youtube'
    and external_id = youtube_video_id_input
  limit 1;

  if resolved_track_id is null then
    insert into public.tracks (
      canonical_game_title,
      canonical_track_title,
      metadata_status,
      is_retired,
      retired_by_tournament_id
    )
    values (
      normalized_game_title,
      normalized_track_title,
      'confirmed',
      coalesce(is_retired_input, false),
      retiree_tournament_id
    )
    returning id into resolved_track_id;
  else
    update public.tracks
    set
      canonical_game_title = coalesce(normalized_game_title, canonical_game_title),
      canonical_track_title = coalesce(normalized_track_title, canonical_track_title),
      metadata_status = 'confirmed',
      is_retired = public.tracks.is_retired or coalesce(is_retired_input, false),
      retired_by_tournament_id = coalesce(
        retiree_tournament_id,
        public.tracks.retired_by_tournament_id
      ),
      updated_at = timezone('utc', now())
    where id = resolved_track_id;
  end if;

  insert into public.track_sources (
    track_id,
    provider,
    external_id,
    source_url,
    submitted_url,
    is_primary
  )
  values (
    resolved_track_id,
    'youtube',
    youtube_video_id_input,
    canonical_source_url,
    coalesce(submitted_url_input, canonical_source_url),
    true
  )
  on conflict (provider, external_id) do update
  set
    submitted_url = coalesce(public.track_sources.submitted_url, excluded.submitted_url),
    source_url = excluded.source_url,
    is_primary = public.track_sources.is_primary or excluded.is_primary,
    updated_at = timezone('utc', now());

  if nomination_tournament_id is not null then
    insert into public.track_tournament_appearances (
      track_id,
      tournament_id,
      placement,
      highest_round,
      is_retired_in_tournament
    )
    values (
      resolved_track_id,
      nomination_tournament_id,
      case
        when retiree_contest_number = nomination_contest_number
          then retiree_placement
        else null
      end,
      highest_round_input,
      coalesce(is_retired_input, false)
        and retiree_contest_number = nomination_contest_number
    )
    on conflict (track_id, tournament_id) do update
    set
      placement = coalesce(
        excluded.placement,
        public.track_tournament_appearances.placement
      ),
      highest_round = coalesce(
        excluded.highest_round,
        public.track_tournament_appearances.highest_round
      ),
      is_retired_in_tournament = public.track_tournament_appearances.is_retired_in_tournament
        or excluded.is_retired_in_tournament,
      updated_at = timezone('utc', now());
  end if;

  if retiree_tournament_id is not null
     and retiree_tournament_id is distinct from nomination_tournament_id then
    insert into public.track_tournament_appearances (
      track_id,
      tournament_id,
      placement,
      highest_round,
      is_retired_in_tournament
    )
    values (
      resolved_track_id,
      retiree_tournament_id,
      retiree_placement,
      highest_round_input,
      coalesce(is_retired_input, false)
    )
    on conflict (track_id, tournament_id) do update
    set
      placement = coalesce(
        excluded.placement,
        public.track_tournament_appearances.placement
      ),
      highest_round = coalesce(
        excluded.highest_round,
        public.track_tournament_appearances.highest_round
      ),
      is_retired_in_tournament = public.track_tournament_appearances.is_retired_in_tournament
        or excluded.is_retired_in_tournament,
      updated_at = timezone('utc', now());
  end if;

  return resolved_track_id;
end;
$$;

revoke all
on function public.import_vgmc_catalog_row(
  integer,
  text,
  text,
  text,
  text,
  boolean,
  integer,
  integer,
  text
)
from public;

grant execute
on function public.import_vgmc_catalog_row(
  integer,
  text,
  text,
  text,
  text,
  boolean,
  integer,
  integer,
  text
)
to authenticated;
