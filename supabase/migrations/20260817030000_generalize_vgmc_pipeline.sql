-- Generalize the VGMC nomination pipeline (import_vgmc_catalog_row,
-- reconcile_vgmc_playlist) to accept SoundCloud/Bandcamp links alongside
-- YouTube, matching the (provider, external_id) pattern already applied to
-- track_sources (20260817000000), user_playlist_tracks (20260817010000),
-- and ingest_track_sources (20260817020000).

-- 1. import_vgmc_catalog_row: rename youtube_video_id_input -> external_id_input,
--    add provider_input (defaults to 'youtube' so any caller that hasn't been
--    updated yet keeps working unchanged), validate/build source_url per
--    provider instead of assuming YouTube.
--
-- Renaming a parameter changes the function's identity as far as Postgres is
-- concerned (parameter names are part of overload resolution), so CREATE OR
-- REPLACE alone would leave every prior revision of this function sitting
-- alongside the new one as separate overloads rather than replacing them -
-- confirmed locally: three stale youtube_video_id_input-named overloads
-- (from 20260318021000 and its early revisions) survived a first pass of
-- this migration written without these drops. Remove them explicitly so
-- exactly one version of this function exists.
DROP FUNCTION IF EXISTS public.import_vgmc_catalog_row(
  nomination_contest_number integer,
  canonical_game_title_input text,
  canonical_track_title_input text,
  youtube_video_id_input text,
  submitted_url_input text,
  is_retired_input boolean,
  retiree_contest_number integer,
  retiree_placement integer,
  highest_round_input text
);

DROP FUNCTION IF EXISTS public.import_vgmc_catalog_row(
  nomination_contest_number integer,
  canonical_game_title_input text,
  canonical_track_title_input text,
  youtube_video_id_input text,
  submitted_url_input text,
  is_retired_input boolean,
  retiree_contest_number integer,
  retiree_placement integer,
  highest_round_input text,
  track_id_input uuid
);

DROP FUNCTION IF EXISTS public.import_vgmc_catalog_row(
  nomination_contest_number integer,
  canonical_game_title_input text,
  canonical_track_title_input text,
  youtube_video_id_input text,
  submitted_url_input text,
  is_retired_input boolean,
  retiree_contest_number integer,
  retiree_placement integer,
  highest_round_input text,
  track_id_input uuid,
  cached_title_input text,
  cached_channel_title_input text,
  cached_thumbnail_url_input text
);

CREATE OR REPLACE FUNCTION public.import_vgmc_catalog_row(
  nomination_contest_number integer,
  canonical_game_title_input text,
  canonical_track_title_input text,
  external_id_input text,
  submitted_url_input text DEFAULT NULL,
  is_retired_input boolean DEFAULT FALSE,
  retiree_contest_number integer DEFAULT NULL,
  retiree_placement integer DEFAULT NULL,
  highest_round_input text DEFAULT NULL,
  track_id_input uuid DEFAULT NULL,
  cached_title_input text DEFAULT NULL,
  cached_channel_title_input text DEFAULT NULL,
  cached_thumbnail_url_input text DEFAULT NULL,
  provider_input text DEFAULT 'youtube'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_track_id uuid;
  nomination_tournament_id uuid;
  retiree_tournament_id uuid;
  normalized_game_title text;
  normalized_track_title text;
  canonical_source_url text;
  normalized_submitted_url text;
  retired_in_nomination_tournament boolean;
BEGIN
  IF provider_input NOT IN ('youtube', 'soundcloud', 'bandcamp') THEN
    RAISE EXCEPTION 'Unsupported provider: %', provider_input;
  END IF;

  IF external_id_input IS NULL THEN
    RAISE EXCEPTION 'external_id is required';
  END IF;

  IF provider_input = 'youtube' AND external_id_input !~ '^[A-Za-z0-9_-]{11}$' THEN
    RAISE EXCEPTION 'Invalid YouTube video id: %', external_id_input;
  END IF;

  IF provider_input <> 'youtube' AND external_id_input !~* '^https?://' THEN
    RAISE EXCEPTION 'Invalid external id for provider %: %', provider_input, external_id_input;
  END IF;

  normalized_game_title := NULLIF(btrim(canonical_game_title_input), '');
  normalized_track_title := NULLIF(btrim(canonical_track_title_input), '');
  canonical_source_url := CASE
    WHEN provider_input = 'youtube'
      THEN 'https://www.youtube.com/watch?v=' || external_id_input
    ELSE external_id_input
  END;
  normalized_submitted_url := NULLIF(btrim(submitted_url_input), '');
  IF normalized_submitted_url IS NULL
     OR normalized_submitted_url !~* '^https?://' THEN
    normalized_submitted_url := canonical_source_url;
  END IF;

  retired_in_nomination_tournament := coalesce(is_retired_input, false)
    and coalesce(retiree_contest_number = nomination_contest_number, false);

  IF nomination_contest_number IS NOT NULL THEN
    INSERT INTO public.tournaments (slug, name, sequence_number)
    VALUES ('vgmc-' || nomination_contest_number, 'VGMC ' || nomination_contest_number, nomination_contest_number)
    ON CONFLICT (name) DO UPDATE SET
      slug = excluded.slug,
      sequence_number = excluded.sequence_number,
      updated_at = timezone('utc', now())
    RETURNING id INTO nomination_tournament_id;
  END IF;

  IF retiree_contest_number IS NOT NULL THEN
    INSERT INTO public.tournaments (slug, name, sequence_number)
    VALUES ('vgmc-' || retiree_contest_number, 'VGMC ' || retiree_contest_number, retiree_contest_number)
    ON CONFLICT (name) DO UPDATE SET
      slug = excluded.slug,
      sequence_number = excluded.sequence_number,
      updated_at = timezone('utc', now())
    RETURNING id INTO retiree_tournament_id;
  END IF;

  -- 1. Identify track to update
  IF track_id_input IS NOT NULL THEN
    resolved_track_id := track_id_input;
  ELSE
    SELECT track_id INTO resolved_track_id
    FROM public.track_sources
    WHERE provider = provider_input AND external_id = external_id_input
    LIMIT 1;
  END IF;

  -- 2. Update or Create Track
  IF resolved_track_id IS NOT NULL THEN
    UPDATE public.tracks
    SET
      canonical_game_title = normalized_game_title,
      canonical_track_title = normalized_track_title,
      metadata_status = 'confirmed',
      is_retired = public.tracks.is_retired OR coalesce(is_retired_input, false),
      retired_by_tournament_id = coalesce(retiree_tournament_id, public.tracks.retired_by_tournament_id),
      updated_at = timezone('utc', now())
    WHERE id = resolved_track_id;
  ELSE
    INSERT INTO public.tracks (canonical_game_title, canonical_track_title, metadata_status, is_retired, retired_by_tournament_id)
    VALUES (normalized_game_title, normalized_track_title, 'confirmed', coalesce(is_retired_input, false), retiree_tournament_id)
    RETURNING id INTO resolved_track_id;
  END IF;

  -- 3. Update Primary Source

  -- Demote any existing primary source for this track that is NOT the incoming (provider, id).
  -- Without this, inserting or reassigning a new primary source violates track_sources_primary_per_track_idx.
  UPDATE public.track_sources
  SET is_primary = false, updated_at = timezone('utc', now())
  WHERE track_id = resolved_track_id
    AND is_primary = true
    AND NOT (provider = provider_input AND external_id = external_id_input);

  -- Handle the case where the (provider, id) might already be linked to another track (orphaned from ingest)
  IF EXISTS (SELECT 1 FROM public.track_sources WHERE provider = provider_input AND external_id = external_id_input AND track_id != resolved_track_id) THEN
      -- Reassign the orphaned source to the correct track instead of raising exception
      UPDATE public.track_sources
      SET track_id = resolved_track_id, is_primary = true, updated_at = timezone('utc', now())
      WHERE provider = provider_input AND external_id = external_id_input;

      -- Delete any tracks that were left without sources as a result (cleanup)
      DELETE FROM public.tracks
      WHERE id NOT IN (SELECT track_id FROM public.track_sources)
        AND id != resolved_track_id;
  END IF;

  -- Upsert the source record
  INSERT INTO public.track_sources (
    track_id,
    provider,
    external_id,
    source_url,
    submitted_url,
    is_primary,
    cached_title,
    cached_channel_title,
    cached_thumbnail_url
  )
  VALUES (
    resolved_track_id,
    provider_input,
    external_id_input,
    canonical_source_url,
    normalized_submitted_url,
    true,
    cached_title_input,
    cached_channel_title_input,
    cached_thumbnail_url_input
  )
  ON CONFLICT (provider, external_id) DO UPDATE SET
    track_id = excluded.track_id,
    submitted_url = excluded.submitted_url,
    source_url = excluded.source_url,
    is_primary = true,
    cached_title = coalesce(excluded.cached_title, public.track_sources.cached_title),
    cached_channel_title = coalesce(excluded.cached_channel_title, public.track_sources.cached_channel_title),
    cached_thumbnail_url = coalesce(excluded.cached_thumbnail_url, public.track_sources.cached_thumbnail_url),
    updated_at = timezone('utc', now());

  -- 4. Upsert Appearances
  IF nomination_tournament_id IS NOT NULL THEN
    INSERT INTO public.track_tournament_appearances (track_id, tournament_id, placement, highest_round, is_retired_in_tournament)
    VALUES (resolved_track_id, nomination_tournament_id, CASE WHEN retired_in_nomination_tournament THEN retiree_placement ELSE NULL END, highest_round_input, retired_in_nomination_tournament)
    ON CONFLICT (track_id, tournament_id) DO UPDATE SET
      placement = coalesce(excluded.placement, public.track_tournament_appearances.placement),
      highest_round = coalesce(excluded.highest_round, public.track_tournament_appearances.highest_round),
      is_retired_in_tournament = public.track_tournament_appearances.is_retired_in_tournament OR excluded.is_retired_in_tournament,
      updated_at = timezone('utc', now());
  END IF;

  IF retiree_tournament_id IS NOT NULL AND retiree_tournament_id IS DISTINCT FROM nomination_tournament_id THEN
    INSERT INTO public.track_tournament_appearances (track_id, tournament_id, placement, highest_round, is_retired_in_tournament)
    VALUES (resolved_track_id, retiree_tournament_id, retiree_placement, highest_round_input, coalesce(is_retired_input, false))
    ON CONFLICT (track_id, tournament_id) DO UPDATE SET
      placement = coalesce(excluded.placement, public.track_tournament_appearances.placement),
      highest_round = coalesce(excluded.highest_round, public.track_tournament_appearances.highest_round),
      is_retired_in_tournament = public.track_tournament_appearances.is_retired_in_tournament OR excluded.is_retired_in_tournament,
      updated_at = timezone('utc', now());
  END IF;

  RETURN resolved_track_id;
END;
$$;

-- 2. reconcile_vgmc_playlist: entries_input entries gain a `provider` field
--    (defaulted to 'youtube' server-side if absent, see buildReconcileEntries
--    in src/lib/vgmcIngest.js - the extension never supplies this itself,
--    it ships raw post text only). Insert/upsert column list swaps
--    youtube_video_id -> external_id, provider.
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
