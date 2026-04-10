-- Enhance import_vgmc_catalog_row to handle YouTube metadata directly and avoid duplication
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
  -- Handle the case where the Video ID might already be linked to another track (orphaned from ingest)
  IF EXISTS (SELECT 1 FROM public.track_sources WHERE provider = 'youtube' AND external_id = youtube_video_id_input AND track_id != resolved_track_id) THEN
      -- Reassign the orphaned source to the correct track instead of raising exception
      UPDATE public.track_sources
      SET track_id = resolved_track_id, is_primary = true, updated_at = timezone('utc', now())
      WHERE provider = 'youtube' AND external_id = youtube_video_id_input;

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
