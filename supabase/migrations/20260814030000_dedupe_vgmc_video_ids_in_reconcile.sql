-- Fixes a real bug found while testing the VGMC pipeline end-to-end: two different
-- nominations (distinct game/song, hence distinct source_key) that happen to point
-- at the same YouTube video crashed the *entire* reconcile call outright — the whole
-- batch failed, not just the conflicting entry — because it hit
-- upt_playlist_video_unique (playlist, youtube_video_id), which intentionally
-- enforces "the same video never appears twice in a playlist" and is staying exactly
-- as strict as it already was.
--
-- The fix belongs in the reconciler, not the constraint: entries are already
-- processed in ordinal order (earliest nomination first), so the first source_key to
-- claim a video id wins it for this round; anything after it for the same video is
-- skipped cleanly (never inserted, and dropped by the existing "not in desired_keys"
-- cleanup if it happened to hold the slot in a prior round). One duplicate no longer
-- takes the rest of the batch down with it.
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
  claimed_video_ids text[] := '{}';
  skipped_video_conflicts integer := 0;
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

    -- Same video, different song identity, already claimed earlier this round
    -- (entries arrive in ordinal/nomination order) — skip, don't crash the batch.
    if normalized_video_id = any (claimed_video_ids) then
      skipped_video_conflicts := skipped_video_conflicts + 1;
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
    claimed_video_ids := array_append(claimed_video_ids, normalized_video_id);
    position_index := position_index + 1;
  end loop;

  delete from public.user_playlist_tracks
  where playlist_id = thread_row.playlist_id
    and source_key is not null
    and not (source_key = any (desired_keys));

  update public.user_playlists
  set updated_at = timezone('utc', now())
  where id = thread_row.playlist_id;

  return jsonb_build_object(
    'playlistSize', position_index,
    'skippedVideoConflicts', skipped_video_conflicts
  );
end;
$$;
