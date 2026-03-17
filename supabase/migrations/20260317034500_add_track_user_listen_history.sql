create table if not exists public.track_user_listen_history (
  track_id uuid not null references public.tracks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listen_count integer not null default 0,
  completion_count integer not null default 0,
  total_seconds_played integer not null default 0,
  first_listened_at timestamptz not null default timezone('utc', now()),
  last_listened_at timestamptz not null default timezone('utc', now()),
  first_completed_at timestamptz,
  last_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  listen_status text generated always as (
    case
      when completion_count > 0 then 'complete'
      else 'partial'
    end
  ) stored,
  primary key (track_id, user_id),
  constraint track_user_listen_history_counts check (
    listen_count >= 0
    and completion_count >= 0
    and total_seconds_played >= 0
    and completion_count <= listen_count
  ),
  constraint track_user_listen_history_listened_order check (
    last_listened_at >= first_listened_at
  ),
  constraint track_user_listen_history_completed_order check (
    (
      completion_count = 0
      and first_completed_at is null
      and last_completed_at is null
    )
    or (
      completion_count > 0
      and first_completed_at is not null
      and last_completed_at is not null
      and last_completed_at >= first_completed_at
    )
  )
);

create index if not exists track_user_listen_history_user_id_idx
on public.track_user_listen_history (user_id);

create index if not exists track_user_listen_history_user_status_idx
on public.track_user_listen_history (user_id, listen_status, last_listened_at desc);

drop trigger if exists set_track_user_listen_history_updated_at on public.track_user_listen_history;
create trigger set_track_user_listen_history_updated_at
before update on public.track_user_listen_history
for each row
execute function public.set_updated_at();

alter table public.track_user_listen_history enable row level security;

drop policy if exists "track_user_listen_history_select_own" on public.track_user_listen_history;
create policy "track_user_listen_history_select_own"
on public.track_user_listen_history
for select
using (auth.uid() = user_id);

drop policy if exists "track_user_listen_history_insert_own" on public.track_user_listen_history;
create policy "track_user_listen_history_insert_own"
on public.track_user_listen_history
for insert
with check (auth.uid() = user_id);

drop policy if exists "track_user_listen_history_update_own" on public.track_user_listen_history;
create policy "track_user_listen_history_update_own"
on public.track_user_listen_history
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "track_user_listen_history_delete_own" on public.track_user_listen_history;
create policy "track_user_listen_history_delete_own"
on public.track_user_listen_history
for delete
using (auth.uid() = user_id);

grant select, insert, update, delete
on public.track_user_listen_history
to authenticated;

create or replace function public.record_youtube_track_listen(
  youtube_video_id text,
  listen_event text,
  seconds_played integer default 0
)
returns public.track_user_listen_history
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_video_id text := nullif(btrim(youtube_video_id), '');
  normalized_event text := lower(nullif(btrim(listen_event), ''));
  normalized_seconds integer := greatest(coalesce(seconds_played, 0), 0);
  active_user_id uuid := auth.uid();
  resolved_track_id uuid;
  now_utc timestamptz := timezone('utc', now());
  result_row public.track_user_listen_history;
begin
  if active_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_video_id is null then
    raise exception 'youtube_video_id is required';
  end if;

  if normalized_event not in ('started', 'completed') then
    raise exception 'listen_event must be started or completed';
  end if;

  select track_sources.track_id
  into resolved_track_id
  from public.track_sources
  where track_sources.provider = 'youtube'
    and track_sources.external_id = normalized_video_id
  order by track_sources.is_primary desc, track_sources.created_at asc
  limit 1;

  if resolved_track_id is null then
    raise exception 'No catalog track found for YouTube video ID %', normalized_video_id
      using errcode = 'P0002';
  end if;

  insert into public.track_user_listen_history (
    track_id,
    user_id,
    listen_count,
    completion_count,
    total_seconds_played,
    first_listened_at,
    last_listened_at,
    first_completed_at,
    last_completed_at
  )
  values (
    resolved_track_id,
    active_user_id,
    1,
    case when normalized_event = 'completed' then 1 else 0 end,
    normalized_seconds,
    now_utc,
    now_utc,
    case when normalized_event = 'completed' then now_utc else null end,
    case when normalized_event = 'completed' then now_utc else null end
  )
  on conflict (track_id, user_id) do update
  set listen_count = public.track_user_listen_history.listen_count + 1,
      completion_count = public.track_user_listen_history.completion_count
        + case when normalized_event = 'completed' then 1 else 0 end,
      total_seconds_played = public.track_user_listen_history.total_seconds_played
        + normalized_seconds,
      last_listened_at = now_utc,
      first_completed_at = case
        when normalized_event = 'completed'
          then coalesce(public.track_user_listen_history.first_completed_at, now_utc)
        else public.track_user_listen_history.first_completed_at
      end,
      last_completed_at = case
        when normalized_event = 'completed' then now_utc
        else public.track_user_listen_history.last_completed_at
      end
  returning *
  into result_row;

  return result_row;
end;
$$;

revoke all
on function public.record_youtube_track_listen(text, text, integer)
from public;

grant execute
on function public.record_youtube_track_listen(text, text, integer)
to authenticated;

create or replace function public.get_user_youtube_track_listens(
  youtube_video_ids text[] default null
)
returns table (
  youtube_video_id text,
  track_id uuid,
  listen_status text,
  listen_count integer,
  completion_count integer,
  total_seconds_played integer,
  first_listened_at timestamptz,
  last_listened_at timestamptz,
  first_completed_at timestamptz,
  last_completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    track_sources.external_id as youtube_video_id,
    track_user_listen_history.track_id,
    track_user_listen_history.listen_status,
    track_user_listen_history.listen_count,
    track_user_listen_history.completion_count,
    track_user_listen_history.total_seconds_played,
    track_user_listen_history.first_listened_at,
    track_user_listen_history.last_listened_at,
    track_user_listen_history.first_completed_at,
    track_user_listen_history.last_completed_at
  from public.track_user_listen_history
  join public.track_sources
    on track_sources.track_id = track_user_listen_history.track_id
   and track_sources.provider = 'youtube'
  where track_user_listen_history.user_id = auth.uid()
    and (
      youtube_video_ids is null
      or track_sources.external_id = any (youtube_video_ids)
    )
  order by track_user_listen_history.last_listened_at desc, track_sources.external_id asc;
$$;

revoke all
on function public.get_user_youtube_track_listens(text[])
from public;

grant execute
on function public.get_user_youtube_track_listens(text[])
to authenticated;
