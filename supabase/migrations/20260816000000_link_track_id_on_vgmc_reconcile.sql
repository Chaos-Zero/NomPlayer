-- reconcile_vgmc_playlist never set user_playlist_tracks.track_id, even after the
-- previous migration started promoting every nomination into the tracks catalog.
-- That column is how the frontend resolves a personal rating (track_user_feedback
-- is keyed by track_id, not youtube_video_id) — without it, a user's own 1-10
-- rating on a VGMC song can never be found, no matter how correctly everything
-- else is wired up.
--
-- Fix: call import_vgmc_catalog_row *before* the playlist upsert instead of after,
-- capture the uuid it returns (that's the whole point of it being a `returns
-- uuid` function — the previous migration only ever `perform`ed it, discarding
-- that value), and write it onto the row. Catalog promotion is still allowed to
-- fail without taking the sync down — the only difference now is where the
-- resulting track_id, on success, actually goes.
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
  resolved_track_id uuid;
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

    resolved_track_id := null;
    if thread_row.contest_number is not null then
      begin
        resolved_track_id := public.import_vgmc_catalog_row(
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

    insert into public.user_playlist_tracks (
      playlist_id,
      track_id,
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
      resolved_track_id,
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
        -- Never null out an already-linked track_id just because this
        -- particular sync's promotion attempt happened to fail.
        track_id = coalesce(excluded.track_id, public.user_playlist_tracks.track_id),
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

-- One-time backfill so this doesn't have to wait for the next GameFAQs sync:
-- every VGMC row inserted before this fix already has a matching catalog track
-- (the previous migration's promotion pass created it), it just never got
-- linked back. Link it now via the same (provider, external_id) match
-- import_vgmc_catalog_row itself uses.
--
-- Scoped to playlists a vgmc_ingest_threads row actually feeds — this must
-- only ever touch VGMC nomination playlists, never reach into anyone's
-- personal/custom/other playlists just because a video id happens to match
-- something in the catalog.
update public.user_playlist_tracks upt
set track_id = src.track_id
from public.track_sources src
where upt.track_id is null
  and upt.youtube_video_id is not null
  and src.provider = 'youtube'
  and src.external_id = upt.youtube_video_id
  and exists (
    select 1
    from public.vgmc_ingest_threads vit
    where vit.playlist_id = upt.playlist_id
  );
