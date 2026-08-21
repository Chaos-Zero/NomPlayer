-- Nothing in the VGMC nomination-thread pipeline checked is_retired before
-- adding a nomination to the live playlist. A retired song reposted to the
-- thread (exact repost, retitle, whatever) sailed straight into
-- user_playlist_tracks and got a fresh track_tournament_appearances row for
-- the current tournament via import_vgmc_catalog_row, same as any other
-- nomination - nothing downstream of the thread parse knew to reject it.
--
-- Checked by the (provider, external_id) the entry's link actually resolves
-- to via track_sources, not by source_key/game/song text, so the same song
-- reposted under a slightly different title is still caught. A track only
-- ever carries is_retired = true once it's already been through
-- import_vgmc_catalog_row for some earlier tournament (that function's
-- update is OR-only, see its is_retired assignment - it never un-retires),
-- so a genuinely new video with no track_sources row yet always reads as
-- not retired here, correctly.

CREATE OR REPLACE FUNCTION public.reconcile_vgmc_playlist(
  thread_slug_input text,
  entries_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  thread_row public.vgmc_ingest_threads%rowtype;
  entry jsonb;
  position_index integer := 0;
  desired_keys text[] := '{}';
  claimed_source_ids text[] := '{}';
  skipped_video_conflicts integer := 0;
  skipped_retired integer := 0;
  promoted_count integer := 0;
  normalized_source_key text;
  normalized_video_id text;
  normalized_provider text;
  normalized_game text;
  normalized_song text;
  normalized_support_points integer;
  normalized_support_voters integer;
  display_title text;
  resolved_tournament_id uuid;
  resolved_track_id uuid;
  claim_key text;
  is_retired_match boolean;
BEGIN
  IF thread_slug_input IS NULL THEN
    RAISE EXCEPTION 'thread_slug is required';
  END IF;

  SELECT *
  INTO thread_row
  FROM public.vgmc_ingest_threads
  WHERE thread_slug = thread_slug_input;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown VGMC ingest thread: %', thread_slug_input;
  END IF;

  IF entries_input IS NULL OR jsonb_typeof(entries_input) <> 'array' THEN
    RAISE EXCEPTION 'entries must be a JSON array';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(entries_input)
  LOOP
    normalized_source_key := nullif(btrim(entry ->> 'source_key'), '');
    normalized_video_id := nullif(btrim(entry ->> 'video_id'), '');
    normalized_provider := coalesce(nullif(btrim(entry ->> 'provider'), ''), 'youtube');
    normalized_game := nullif(btrim(entry ->> 'game'), '');
    normalized_song := nullif(btrim(entry ->> 'song'), '');
    normalized_support_points := coalesce((entry ->> 'support_points')::integer, 0);
    normalized_support_voters := coalesce((entry ->> 'support_voters')::integer, 0);

    IF normalized_source_key IS NULL
       OR normalized_video_id IS NULL
       OR normalized_provider NOT IN ('youtube', 'soundcloud', 'bandcamp')
       OR (normalized_provider = 'youtube' AND normalized_video_id !~ '^[A-Za-z0-9_-]{11}$')
       OR (normalized_provider <> 'youtube' AND normalized_video_id !~* '^https?://') THEN
      CONTINUE;
    END IF;

    -- Retired tracks never enter a live VGMC playlist - see the migration
    -- header. Checked first, before this entry participates in any other
    -- bookkeeping below (claimed_source_ids, catalog promotion, etc).
    SELECT t.is_retired
    INTO is_retired_match
    FROM public.track_sources ts
    JOIN public.tracks t ON t.id = ts.track_id
    WHERE ts.provider = normalized_provider
      AND ts.external_id = normalized_video_id
    LIMIT 1;

    IF coalesce(is_retired_match, false) THEN
      skipped_retired := skipped_retired + 1;
      CONTINUE;
    END IF;

    -- Same (provider, id), different song identity, already claimed earlier
    -- this round (entries arrive in ordinal/nomination order), skip, don't
    -- crash the batch.
    claim_key := normalized_provider || ':' || normalized_video_id;
    IF claim_key = ANY (claimed_source_ids) THEN
      skipped_video_conflicts := skipped_video_conflicts + 1;
      CONTINUE;
    END IF;

    display_title := trim(both ' -' from
      coalesce(normalized_game, '') || ' - ' || coalesce(normalized_song, ''));

    resolved_track_id := null;
    IF thread_row.contest_number IS NOT NULL THEN
      BEGIN
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
          null, -- cached_thumbnail_url_input
          normalized_provider
        );
        promoted_count := promoted_count + 1;
      EXCEPTION WHEN OTHERS THEN
        -- Catalog promotion is a bonus, not the source of truth for the playlist
        -- itself, never let a bad title/row take the whole sync down.
        RAISE WARNING 'VGMC catalog promotion failed for % (%): %',
          normalized_source_key, normalized_video_id, sqlerrm;
      END;
    END IF;

    BEGIN
      INSERT INTO public.user_playlist_tracks (
        playlist_id,
        track_id,
        source_key,
        external_id,
        provider,
        cached_title,
        nomination_game,
        nomination_song,
        support_points,
        support_voters,
        order_index
      )
      VALUES (
        thread_row.playlist_id,
        resolved_track_id,
        normalized_source_key,
        normalized_video_id,
        normalized_provider,
        nullif(display_title, ''),
        normalized_game,
        normalized_song,
        normalized_support_points,
        normalized_support_voters,
        position_index
      )
      ON CONFLICT (playlist_id, source_key) WHERE source_key IS NOT NULL DO UPDATE
      SET external_id = excluded.external_id,
          provider = excluded.provider,
          -- Never null out an already-linked track_id just because this
          -- particular sync's promotion attempt happened to fail.
          track_id = coalesce(excluded.track_id, public.user_playlist_tracks.track_id),
          cached_title = excluded.cached_title,
          nomination_game = excluded.nomination_game,
          nomination_song = excluded.nomination_song,
          support_points = excluded.support_points,
          support_voters = excluded.support_voters,
          order_index = excluded.order_index;

      desired_keys := array_append(desired_keys, normalized_source_key);
      claimed_source_ids := array_append(claimed_source_ids, claim_key);
      position_index := position_index + 1;
    EXCEPTION WHEN unique_violation THEN
      -- resolved_track_id already belongs to a different source_key in this
      -- playlist (same video, different game/song text - a retitle, a typo
      -- fix, a duplicate repost) - upt_playlist_track_unique forbids the
      -- same catalog track appearing twice in one playlist. Skip this entry
      -- rather than letting one colliding pair take the entire sync down;
      -- whichever entry currently holds that track_id keeps its slot.
      skipped_video_conflicts := skipped_video_conflicts + 1;
      RAISE WARNING 'VGMC reconcile: % (%) collides with an existing track_id in this playlist, skipped',
        normalized_source_key, normalized_video_id;
    END;
  END LOOP;

  -- Retired tracks are also swept from the playlist by the trailing DELETE
  -- below: skipping one above means its source_key never joins desired_keys,
  -- exactly like any other command that no longer folds to an active
  -- nomination this round. A retired entry left over from before this guard
  -- existed is removed the next time this function runs for its thread, no
  -- separate cleanup path needed.
  DELETE FROM public.user_playlist_tracks
  WHERE playlist_id = thread_row.playlist_id
    AND source_key IS NOT NULL
    AND NOT (source_key = ANY (desired_keys));

  UPDATE public.user_playlists
  SET updated_at = timezone('utc', now())
  WHERE id = thread_row.playlist_id;

  -- Backfill the thread's tournament_id link once the tournament exists (first
  -- successful promotion above creates it), self-healing, doesn't block on it.
  IF thread_row.tournament_id IS NULL AND thread_row.contest_number IS NOT NULL THEN
    SELECT id INTO resolved_tournament_id
    FROM public.tournaments
    WHERE slug = 'vgmc-' || thread_row.contest_number;

    IF resolved_tournament_id IS NOT NULL THEN
      UPDATE public.vgmc_ingest_threads
      SET tournament_id = resolved_tournament_id
      WHERE id = thread_row.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'playlistSize', position_index,
    'skippedVideoConflicts', skipped_video_conflicts,
    'skippedRetired', skipped_retired,
    'promotedToCatalog', promoted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_vgmc_playlist(text, jsonb)
FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reconcile_vgmc_playlist(text, jsonb)
TO service_role;
