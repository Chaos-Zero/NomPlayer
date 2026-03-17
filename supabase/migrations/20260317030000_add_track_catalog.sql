create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  sequence_number integer,
  started_at date,
  ended_at date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tournaments_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint tournaments_sequence_number_positive check (
    sequence_number is null or sequence_number > 0
  ),
  constraint tournaments_date_order check (
    started_at is null or ended_at is null or ended_at >= started_at
  )
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  canonical_game_title text,
  canonical_track_title text,
  metadata_status text not null default 'pending',
  is_retired boolean not null default false,
  retired_by_tournament_id uuid references public.tournaments (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tracks_metadata_status check (
    metadata_status in ('pending', 'confirmed')
  ),
  constraint tracks_confirmed_metadata_requires_title check (
    metadata_status <> 'confirmed'
    or nullif(
      btrim(concat_ws(' ', canonical_game_title, canonical_track_title)),
      ''
    ) is not null
  )
);

create table if not exists public.track_sources (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  provider text not null default 'youtube',
  external_id text not null,
  source_url text not null,
  submitted_url text,
  is_primary boolean not null default false,
  cached_title text,
  cached_channel_title text,
  cached_thumbnail_url text,
  cached_description text,
  youtube_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  last_fetched_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint track_sources_provider check (provider in ('youtube')),
  constraint track_sources_external_source_unique unique (provider, external_id),
  constraint track_sources_source_url_unique unique (source_url),
  constraint track_sources_youtube_id_format check (
    provider <> 'youtube' or external_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  constraint track_sources_source_url_format check (source_url ~* '^https?://'),
  constraint track_sources_submitted_url_format check (
    submitted_url is null or submitted_url ~* '^https?://'
  ),
  constraint track_sources_seen_order check (last_seen_at >= first_seen_at)
);

create table if not exists public.track_tournament_appearances (
  track_id uuid not null references public.tracks (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  appearance_label text,
  placement integer,
  is_retired_in_tournament boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (track_id, tournament_id),
  constraint track_tournament_appearances_placement_positive check (
    placement is null or placement > 0
  ),
  constraint track_tournament_appearances_note_length check (
    notes is null or char_length(notes) <= 1000
  )
);

create table if not exists public.track_user_feedback (
  track_id uuid not null references public.tracks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (track_id, user_id),
  constraint track_user_feedback_rating_range check (
    rating is null or rating between 1 and 10
  ),
  constraint track_user_feedback_requires_content check (
    rating is not null or nullif(btrim(coalesce(note, '')), '') is not null
  ),
  constraint track_user_feedback_note_length check (
    note is null or char_length(note) <= 4000
  )
);

create unique index if not exists track_sources_primary_per_track_idx
on public.track_sources (track_id)
where is_primary;

create index if not exists tracks_retired_by_tournament_id_idx
on public.tracks (retired_by_tournament_id);

create index if not exists track_sources_track_id_idx
on public.track_sources (track_id);

create index if not exists track_tournament_appearances_tournament_id_idx
on public.track_tournament_appearances (tournament_id);

create index if not exists tracks_metadata_search_idx
on public.tracks
using gin (
  to_tsvector(
    'simple',
    coalesce(canonical_game_title, '') || ' ' || coalesce(canonical_track_title, '')
  )
);

create index if not exists track_sources_cached_search_idx
on public.track_sources
using gin (
  to_tsvector(
    'simple',
    coalesce(cached_title, '') || ' ' || coalesce(cached_channel_title, '')
  )
);

drop trigger if exists set_tournaments_updated_at on public.tournaments;
create trigger set_tournaments_updated_at
before update on public.tournaments
for each row
execute function public.set_updated_at();

drop trigger if exists set_tracks_updated_at on public.tracks;
create trigger set_tracks_updated_at
before update on public.tracks
for each row
execute function public.set_updated_at();

drop trigger if exists set_track_sources_updated_at on public.track_sources;
create trigger set_track_sources_updated_at
before update on public.track_sources
for each row
execute function public.set_updated_at();

drop trigger if exists set_track_tournament_appearances_updated_at on public.track_tournament_appearances;
create trigger set_track_tournament_appearances_updated_at
before update on public.track_tournament_appearances
for each row
execute function public.set_updated_at();

drop trigger if exists set_track_user_feedback_updated_at on public.track_user_feedback;
create trigger set_track_user_feedback_updated_at
before update on public.track_user_feedback
for each row
execute function public.set_updated_at();

alter table public.tournaments enable row level security;
alter table public.tracks enable row level security;
alter table public.track_sources enable row level security;
alter table public.track_tournament_appearances enable row level security;
alter table public.track_user_feedback enable row level security;

drop policy if exists "tournaments_select_public" on public.tournaments;
create policy "tournaments_select_public"
on public.tournaments
for select
using (true);

drop policy if exists "tournaments_write_authenticated" on public.tournaments;
create policy "tournaments_write_authenticated"
on public.tournaments
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "tracks_select_public" on public.tracks;
create policy "tracks_select_public"
on public.tracks
for select
using (true);

drop policy if exists "tracks_write_authenticated" on public.tracks;
create policy "tracks_write_authenticated"
on public.tracks
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "track_sources_select_public" on public.track_sources;
create policy "track_sources_select_public"
on public.track_sources
for select
using (true);

drop policy if exists "track_sources_write_authenticated" on public.track_sources;
create policy "track_sources_write_authenticated"
on public.track_sources
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "track_tournament_appearances_select_public" on public.track_tournament_appearances;
create policy "track_tournament_appearances_select_public"
on public.track_tournament_appearances
for select
using (true);

drop policy if exists "track_tournament_appearances_write_authenticated" on public.track_tournament_appearances;
create policy "track_tournament_appearances_write_authenticated"
on public.track_tournament_appearances
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "track_user_feedback_select_own" on public.track_user_feedback;
create policy "track_user_feedback_select_own"
on public.track_user_feedback
for select
using (auth.uid() = user_id);

drop policy if exists "track_user_feedback_insert_own" on public.track_user_feedback;
create policy "track_user_feedback_insert_own"
on public.track_user_feedback
for insert
with check (auth.uid() = user_id);

drop policy if exists "track_user_feedback_update_own" on public.track_user_feedback;
create policy "track_user_feedback_update_own"
on public.track_user_feedback
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "track_user_feedback_delete_own" on public.track_user_feedback;
create policy "track_user_feedback_delete_own"
on public.track_user_feedback
for delete
using (auth.uid() = user_id);

grant select on public.tournaments to anon;
grant select on public.tournaments to authenticated;
grant insert, update, delete on public.tournaments to authenticated;

grant select on public.tracks to anon;
grant select on public.tracks to authenticated;
grant insert, update, delete on public.tracks to authenticated;

grant select on public.track_sources to anon;
grant select on public.track_sources to authenticated;
grant insert, update, delete on public.track_sources to authenticated;

grant select on public.track_tournament_appearances to anon;
grant select on public.track_tournament_appearances to authenticated;
grant insert, update, delete on public.track_tournament_appearances to authenticated;

grant select on public.track_user_feedback to authenticated;
grant insert, update, delete on public.track_user_feedback to authenticated;

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

grant select on public.track_catalog to anon;
grant select on public.track_catalog to authenticated;

create or replace function public.search_track_catalog(
  search_term text,
  limit_count integer default 20
)
returns setof public.track_catalog
language sql
stable
security definer
set search_path = public
as $$
  with normalized_term as (
    select nullif(btrim(search_term), '') as value
  ),
  ranked_catalog as (
    select
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
  order by search_rank desc, display_title asc
  limit least(greatest(coalesce(limit_count, 20), 1), 50);
$$;

revoke all
on function public.search_track_catalog(text, integer)
from public;

grant execute
on function public.search_track_catalog(text, integer)
to anon;

grant execute
on function public.search_track_catalog(text, integer)
to authenticated;
