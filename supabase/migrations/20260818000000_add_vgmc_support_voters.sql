-- Standings currently only ever persisted the summed support_points total, even
-- though foldThread (src/lib/vgmcIngest.js) already computes, per song, how many
-- distinct authors contributed to that total (record.votes.size) - it just got
-- discarded before it ever reached the database. Persist it so the standings
-- pane can show both: e.g. "5 points from 3 people" (two ++'s and a +), not just
-- an opaque 5 that reads as if five different people voted once each.
--
-- buildReconcileEntries now ships `support_voters` alongside `support_points` on
-- every entry (see src/lib/vgmcIngest.js), this migration adds the column to
-- store it and teaches reconcile_vgmc_playlist to write it through.

ALTER TABLE public.user_playlist_tracks
  ADD COLUMN IF NOT EXISTS support_voters integer NOT NULL DEFAULT 0;

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
  END LOOP;

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
    'promotedToCatalog', promoted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_vgmc_playlist(text, jsonb)
FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reconcile_vgmc_playlist(text, jsonb)
TO service_role;
