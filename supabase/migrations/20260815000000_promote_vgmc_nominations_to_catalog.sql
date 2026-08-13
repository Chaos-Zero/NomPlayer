-- Promote every currently-nominated VGMC song into the permanent track catalog.
--
-- Until now, a GameFAQs nomination only ever produced a raw `user_playlist_tracks`
-- row on the bot-owned playlist — never a `tracks`/`track_sources` catalog entry,
-- and never a `track_tournament_appearances` link. Two visible symptoms of that:
-- listen-progress tracking silently no-ops for these videos (`record_youtube_track
-- _listen` requires a `track_sources` match — see `isMissingCatalogTrackError` in
-- App.jsx, which already anticipates exactly this case), and the songs don't show
-- up anywhere as VGMC history once the contest ends.
--
-- Per explicit product decision: a song becomes a permanent catalog/history entry
-- the moment it's nominated — support-point count (locked-in 7+ or not) is not a
-- gate. So this promotes every entry reconcile_vgmc_playlist is about to write,
-- reusing import_vgmc_catalog_row (the same RPC the admin catalog-import flow
-- uses), rather than inventing a second way to create tracks/tournaments.

-- 1. Which numbered contest a thread feeds. Threads already carry a `tournament_id`
--    FK, but import_vgmc_catalog_row keys tournaments by integer sequence number
--    (creating "VGMC N" on first use, see e.g. VGMC 1..19 already seeded from past
--    contests), not by uuid — so a thread needs that same integer to call it.
alter table public.vgmc_ingest_threads
  add column if not exists contest_number integer;

update public.vgmc_ingest_threads
set contest_number = nullif(regexp_replace(thread_slug, '^vgmc-', ''), '')::integer
where contest_number is null
  and thread_slug ~ '^vgmc-\d+$';

-- 2. reconcile_vgmc_playlist now also calls import_vgmc_catalog_row for every
--    entry it's about to write (skipped entirely if the thread has no
--    contest_number configured, so this stays a no-op for any future ingest
--    thread that isn't a numbered contest). Catalog promotion is deliberately
--    best-effort: a bad row here must never take down the whole playlist sync, so
--    each call is wrapped and logged rather than allowed to raise.
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
  promoted_count integer := 0;
  normalized_source_key text;
  normalized_video_id text;
  normalized_game text;
  normalized_song text;
  normalized_support_points integer;
  display_title text;
  resolved_tournament_id uuid;
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

    if thread_row.contest_number is not null then
      begin
        perform public.import_vgmc_catalog_row(
          thread_row.contest_number,
          normalized_game,
          normalized_song,
          normalized_video_id,
          null, -- submitted_url_input: no URL to prefer over the canonical one
          false, -- is_retired_input
          null, -- retiree_contest_number
          null, -- retiree_placement
          null, -- highest_round_input: unknown at nomination time
          null, -- track_id_input: resolve by (provider, external_id) instead
          nullif(display_title, ''),
          null, -- cached_channel_title_input
          null -- cached_thumbnail_url_input
        );
        promoted_count := promoted_count + 1;
      exception when others then
        -- Catalog promotion is a bonus, not the source of truth for the playlist
        -- itself — never let a bad title/row take the whole sync down.
        raise warning 'VGMC catalog promotion failed for % (%): %',
          normalized_source_key, normalized_video_id, sqlerrm;
      end;
    end if;
  end loop;

  delete from public.user_playlist_tracks
  where playlist_id = thread_row.playlist_id
    and source_key is not null
    and not (source_key = any (desired_keys));

  update public.user_playlists
  set updated_at = timezone('utc', now())
  where id = thread_row.playlist_id;

  -- Backfill the thread's tournament_id link once the tournament exists (first
  -- successful promotion above creates it) — self-healing, doesn't block on it.
  if thread_row.tournament_id is null and thread_row.contest_number is not null then
    select id into resolved_tournament_id
    from public.tournaments
    where slug = 'vgmc-' || thread_row.contest_number;

    if resolved_tournament_id is not null then
      update public.vgmc_ingest_threads
      set tournament_id = resolved_tournament_id
      where id = thread_row.id;
    end if;
  end if;

  return jsonb_build_object(
    'playlistSize', position_index,
    'skippedVideoConflicts', skipped_video_conflicts,
    'promotedToCatalog', promoted_count
  );
end;
$$;

revoke all on function public.reconcile_vgmc_playlist(text, jsonb)
from public, anon, authenticated;

grant execute on function public.reconcile_vgmc_playlist(text, jsonb)
to service_role;
