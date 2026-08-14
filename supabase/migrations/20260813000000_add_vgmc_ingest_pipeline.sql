-- VGMC ingest pipeline
--
-- Backs the GameFAQs-thread-syncing browser extension: raw posts extracted from a
-- nomination thread are ingested and replayed server-side into a "VGMC 20"-style
-- public playlist. Both mutation entry points are SECURITY DEFINER functions granted
-- to service_role only, no authenticated user, not even the bot account that owns
-- the playlist, can write to these tables or the reconciled playlist directly. The
-- Cloudflare Function holding the service-role secret is the only caller.

-- 1. source_key on user_playlist_tracks: normalized (game, song) identity used by the
--    reconciler so a link edit updates a row in place instead of delete+insert, which
--    is what keeps ordering stable across edits. Mirrors the existing nullable-column +
--    partial-unique-index pattern used for youtube_video_id.
alter table public.user_playlist_tracks
  add column if not exists source_key text;

create unique index if not exists upt_playlist_source_key_unique
  on public.user_playlist_tracks (playlist_id, source_key)
  where source_key is not null;

-- 2. One row per tracked GameFAQs thread, mapping it to the playlist (and optionally
--    the tournament) it feeds, plus the version/watermark guard rails.
create table if not exists public.vgmc_ingest_threads (
  id uuid not null default gen_random_uuid() primary key,
  thread_slug text not null unique,
  tournament_id uuid references public.tournaments (id) on delete set null,
  playlist_id uuid not null references public.user_playlists (id) on delete cascade,
  min_scraper_version integer not null default 1,
  watermark integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.vgmc_ingest_threads enable row level security;
-- No policies: RLS default-denies anon/authenticated with nothing to fall back on.
-- Explicit REVOKE/GRANT below is belt-and-suspenders on top of that, matching this
-- schema's existing hardening style (see harden_default_privileges,
-- restrict_profiles_anon_columns) rather than relying on implicit default privileges.
revoke all on public.vgmc_ingest_threads from public, anon, authenticated;
grant all on public.vgmc_ingest_threads to service_role;

-- 3. Raw post storage, the replay source of truth. Keyed by GameFAQs' own message id
--    (not a page-relative index) so identity survives pagination. Re-ingesting the same
--    post_id overwrites raw_text, so edits and re-syncs are naturally idempotent.
create table if not exists public.vgmc_thread_posts (
  thread_id uuid not null references public.vgmc_ingest_threads (id) on delete cascade,
  post_id text not null,
  author text not null,
  raw_text text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (thread_id, post_id)
);

create index if not exists vgmc_thread_posts_thread_id_idx
  on public.vgmc_thread_posts (thread_id);

alter table public.vgmc_thread_posts enable row level security;
-- No policies, same rationale as vgmc_ingest_threads above.
revoke all on public.vgmc_thread_posts from public, anon, authenticated;
grant all on public.vgmc_thread_posts to service_role;

-- 4. Ingest raw posts for a thread. Rejects submissions from an out-of-date extension
--    (scraper_version below the configured minimum) or one that's suspiciously far
--    behind the stored watermark (a stale cached page), so a broken/old client can only
--    ever get ignored, never roll the thread state backwards.
create or replace function public.ingest_vgmc_thread_posts(
  thread_slug_input text,
  scraper_version_input integer,
  watermark_input integer,
  posts_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_row public.vgmc_ingest_threads%rowtype;
  post_entry jsonb;
  accepted_count integer := 0;
  normalized_post_id text;
  normalized_author text;
  normalized_text text;
begin
  if thread_slug_input is null then
    raise exception 'thread_slug is required';
  end if;

  select *
  into thread_row
  from public.vgmc_ingest_threads
  where thread_slug = thread_slug_input
  for update;

  if not found then
    raise exception 'Unknown VGMC ingest thread: %', thread_slug_input;
  end if;

  if scraper_version_input is null
     or scraper_version_input < thread_row.min_scraper_version then
    raise exception 'update_required: scraper_version % is below minimum %',
      scraper_version_input, thread_row.min_scraper_version;
  end if;

  -- Small drift tolerance: two browsers can legitimately race by a few posts.
  if watermark_input is null or watermark_input < thread_row.watermark - 50 then
    raise exception 'stale_watermark: submitted watermark % is behind stored watermark %',
      watermark_input, thread_row.watermark;
  end if;

  if posts_input is null or jsonb_typeof(posts_input) <> 'array' then
    raise exception 'posts must be a JSON array';
  end if;

  if jsonb_array_length(posts_input) > 500 then
    raise exception 'too many posts in a single submission';
  end if;

  for post_entry in select value from jsonb_array_elements(posts_input)
  loop
    normalized_post_id := nullif(btrim(post_entry ->> 'post_id'), '');
    normalized_author := nullif(btrim(post_entry ->> 'author'), '');
    normalized_text := post_entry ->> 'text';

    if normalized_post_id is null
       or normalized_author is null
       or normalized_text is null then
      continue;
    end if;

    insert into public.vgmc_thread_posts (thread_id, post_id, author, raw_text)
    values (thread_row.id, normalized_post_id, normalized_author, normalized_text)
    on conflict (thread_id, post_id) do update
    set author = excluded.author,
        raw_text = excluded.raw_text,
        updated_at = timezone('utc', now());

    accepted_count := accepted_count + 1;
  end loop;

  update public.vgmc_ingest_threads
  set watermark = greatest(watermark, watermark_input),
      updated_at = timezone('utc', now())
  where id = thread_row.id;

  return jsonb_build_object(
    'threadId', thread_row.id,
    'accepted', accepted_count
  );
end;
$$;

revoke all on function public.ingest_vgmc_thread_posts(text, integer, integer, jsonb)
from public, anon, authenticated;

grant execute on function public.ingest_vgmc_thread_posts(text, integer, integer, jsonb)
to service_role;

-- 5. Replace-diff the playlist's tracks against an already-folded, ordered desired
--    state. `entries_input` is `[{source_key, video_id, game, song}]` in final order,
--    the fold/authority-rule/ordinal logic lives in application code
--    (src/lib/vgmcIngest.js), not here; this function only does the idempotent write.
create or replace function public.reconcile_vgmc_playlist(
  thread_slug_input text,
  entries_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_row public.vgmc_ingest_threads%rowtype;
  entry jsonb;
  position_index integer := 0;
  desired_keys text[] := '{}';
  normalized_source_key text;
  normalized_video_id text;
  normalized_game text;
  normalized_song text;
  display_title text;
begin
  if thread_slug_input is null then
    raise exception 'thread_slug is required';
  end if;

  select *
  into thread_row
  from public.vgmc_ingest_threads
  where thread_slug = thread_slug_input;

  if not found then
    raise exception 'Unknown VGMC ingest thread: %', thread_slug_input;
  end if;

  if entries_input is null or jsonb_typeof(entries_input) <> 'array' then
    raise exception 'entries must be a JSON array';
  end if;

  for entry in select value from jsonb_array_elements(entries_input)
  loop
    normalized_source_key := nullif(btrim(entry ->> 'source_key'), '');
    normalized_video_id := nullif(btrim(entry ->> 'video_id'), '');
    normalized_game := nullif(btrim(entry ->> 'game'), '');
    normalized_song := nullif(btrim(entry ->> 'song'), '');

    if normalized_source_key is null
       or normalized_video_id is null
       or normalized_video_id !~ '^[A-Za-z0-9_-]{11}$' then
      continue;
    end if;

    display_title := trim(both ' -' from
      coalesce(normalized_game, '') || ' - ' || coalesce(normalized_song, ''));

    insert into public.user_playlist_tracks (
      playlist_id,
      source_key,
      youtube_video_id,
      cached_title,
      order_index
    )
    values (
      thread_row.playlist_id,
      normalized_source_key,
      normalized_video_id,
      nullif(display_title, ''),
      position_index
    )
    on conflict (playlist_id, source_key) where source_key is not null do update
    set youtube_video_id = excluded.youtube_video_id,
        cached_title = excluded.cached_title,
        order_index = excluded.order_index;

    desired_keys := array_append(desired_keys, normalized_source_key);
    position_index := position_index + 1;
  end loop;

  delete from public.user_playlist_tracks
  where playlist_id = thread_row.playlist_id
    and source_key is not null
    and not (source_key = any (desired_keys));

  update public.user_playlists
  set updated_at = timezone('utc', now())
  where id = thread_row.playlist_id;

  return jsonb_build_object('playlistSize', position_index);
end;
$$;

revoke all on function public.reconcile_vgmc_playlist(text, jsonb)
from public, anon, authenticated;

grant execute on function public.reconcile_vgmc_playlist(text, jsonb)
to service_role;
