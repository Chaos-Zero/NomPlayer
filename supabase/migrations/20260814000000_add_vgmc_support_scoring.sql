-- VGMC support scoring
--
-- The GameFAQs nomination convention isn't just add/remove: people also vote
-- support/opposition on an already-nominated song with +/++/-/-- (see
-- src/lib/vgmcIngest.js for the fold logic, one live vote per author, magnitude
-- 1 or 2). This persists that score per playlist track, and adds a per-user opt-in
-- flag for the new live standings homepage view (no admin roles yet, so it's a
-- personal setting for now, toggled from the existing account settings dialog).

-- 1. Score + display fields on the VGMC playlist's tracks. Additive/defaulted,
--    nothing existing selects `*` from this table, so this is non-breaking.
alter table public.user_playlist_tracks
  add column if not exists support_points integer not null default 0,
  add column if not exists nomination_game text,
  add column if not exists nomination_song text;

-- 2. Per-user opt-in: land on the VGMC standings view instead of the normal
--    homepage. Existing profiles_select_own/profiles_update_own policies already
--    cover this column, no RLS changes needed.
alter table public.profiles
  add column if not exists vgmc_mode_enabled boolean not null default false;

-- 3. reconcile_vgmc_playlist now also persists support_points/nomination_game/
--    nomination_song per entry (source_key/video_id/game/song unchanged from the
--    add_vgmc_ingest_pipeline migration). Same signature, so existing grants
--    (service_role only) carry over automatically.
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
  normalized_support_points integer;
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
    normalized_support_points := coalesce((entry ->> 'support_points')::integer, 0);

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
      nomination_game,
      nomination_song,
      support_points,
      order_index
    )
    values (
      thread_row.playlist_id,
      normalized_source_key,
      normalized_video_id,
      nullif(display_title, ''),
      normalized_game,
      normalized_song,
      normalized_support_points,
      position_index
    )
    on conflict (playlist_id, source_key) where source_key is not null do update
    set youtube_video_id = excluded.youtube_video_id,
        cached_title = excluded.cached_title,
        nomination_game = excluded.nomination_game,
        nomination_song = excluded.nomination_song,
        support_points = excluded.support_points,
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
