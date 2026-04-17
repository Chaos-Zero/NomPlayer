/*
  # Harden Orphaned Track Cleanup

  This migration adds a 2-minute "grace period" to orphaned track cleanup.
  This prevents a race condition where a multi-step ingestion process
  (like adding a playlist) creates a track but hasn't yet linked a source,
  causing a background cleanup trigger to delete it prematurely and
  resulting in foreign key violations.
*/

-- 1. Update the global cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_tracks_v5()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  -- 1. Cleanup orphaned player states (no profile)
  DELETE FROM public.user_player_states ups
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ups.user_id);

  -- 2. Cleanup orphaned tracks
  DELETE FROM public.tracks t
  WHERE
    -- Safety check: only delete tracks older than 2 minutes to allow
    -- in-flight ingestion processes to finish linking sources/supports.
    t.created_at < timezone('utc', now()) - interval '2 minutes'

    -- NOT in any VGMC tournament
    AND NOT EXISTS (SELECT 1 FROM public.track_tournament_appearances tta WHERE tta.track_id = t.id)

    -- NOT supported by an ACTIVE user
    AND NOT EXISTS (
      SELECT 1 FROM public.track_supports ts
      JOIN public.profiles p ON p.id = ts.user_id
      WHERE ts.track_id = t.id
    )

    -- NO listen history from an ACTIVE user
    AND NOT EXISTS (
      SELECT 1 FROM public.track_user_listen_history tulh
      JOIN public.profiles p ON p.id = tulh.user_id
      WHERE tulh.track_id = t.id
    )

    -- NO feedback/notes from an ACTIVE user
    AND NOT EXISTS (
      SELECT 1 FROM public.track_user_feedback tuf
      JOIN public.profiles p ON p.id = tuf.user_id
      WHERE tuf.track_id = t.id
    )

    -- NOT in any list of an ACTIVE user
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_player_states ups
      JOIN public.profiles p ON p.id = ups.user_id
      WHERE (
        (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        OR (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        OR (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ups.state -> 'customPlaylists') = 'array' THEN ups.state -> 'customPlaylists' ELSE '[]'::jsonb END) pl
          WHERE (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.track_sources src
        WHERE src.track_id = t.id
          AND (
            (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            OR (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            OR (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ups.state -> 'customPlaylists') = 'array' THEN ups.state -> 'customPlaylists' ELSE '[]'::jsonb END) pl
              WHERE (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            )
          )
      )
    );

  GET DIAGNOSTICS deleted_count = row_count;
  RETURN deleted_count;
END;
$$;

-- 2. Update the catalog import function to respect the same grace period
CREATE OR REPLACE FUNCTION public.import_vgmc_catalog_row(
  nomination_contest_number integer,
  canonical_game_title_input text,
  canonical_track_title_input text,
  youtube_video_id_input text,
  submitted_url_input text DEFAULT NULL,
  is_retired_input boolean DEFAULT FALSE,
  retiree_contest_number integer DEFAULT NULL,
  retiree_placement integer DEFAULT NULL,
  highest_round_input text DEFAULT NULL,
  track_id_input uuid DEFAULT NULL,
  cached_title_input text DEFAULT NULL,
  cached_channel_title_input text DEFAULT NULL,
  cached_thumbnail_url_input text DEFAULT NULL
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
  IF youtube_video_id_input IS NULL
     OR youtube_video_id_input !~ '^[A-Za-z0-9_-]{11}$' THEN
    RAISE EXCEPTION 'Invalid YouTube video id: %', youtube_video_id_input;
  END IF;

  normalized_game_title := NULLIF(btrim(canonical_game_title_input), '');
  normalized_track_title := NULLIF(btrim(canonical_track_title_input), '');
  canonical_source_url := 'https://www.youtube.com/watch?v=' || youtube_video_id_input;
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
    WHERE provider = 'youtube' AND external_id = youtube_video_id_input
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
  IF EXISTS (SELECT 1 FROM public.track_sources WHERE provider = 'youtube' AND external_id = youtube_video_id_input AND track_id != resolved_track_id) THEN
      UPDATE public.track_sources
      SET track_id = resolved_track_id, is_primary = true, updated_at = timezone('utc', now())
      WHERE provider = 'youtube' AND external_id = youtube_video_id_input;

      -- Safety cleanup: only delete tracks older than some minutes
      DELETE FROM public.tracks
      WHERE id NOT IN (SELECT track_id FROM public.track_sources)
        AND id != resolved_track_id
        AND created_at < timezone('utc', now()) - interval '2 minutes';
  END IF;

  UPDATE public.track_sources
  SET is_primary = false, updated_at = timezone('utc', now())
  WHERE track_id = resolved_track_id
    AND is_primary = true
    AND NOT (provider = 'youtube' AND external_id = youtube_video_id_input);

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
    'youtube',
    youtube_video_id_input,
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
