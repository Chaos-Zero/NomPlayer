-- Fix two bugs that cause URL-only nomination updates to fail:
--
-- 1. import_vgmc_catalog_row always set metadata_status = 'confirmed' even when
--    both canonical titles are NULL. This triggers the
--    tracks_confirmed_metadata_requires_title CHECK constraint (SQLSTATE 23514).
--    Fix: use 'pending' when both titles are absent.
--
-- 2. All orphan-cleanup functions only checked user_player_states JSONB for
--    track references, ignoring the relational track_nominations table.
--    A freshly-ingested track (pending metadata, no JSONB trackId yet) could be
--    deleted before syncNominations wrote it to track_nominations, producing a
--    foreign-key violation (SQLSTATE 23503) on the next sync attempt.
--    Fix: guard with NOT EXISTS (SELECT 1 FROM track_nominations WHERE track_id = t.id).

-- ─── 1. Fix import_vgmc_catalog_row ─────────────────────────────────────────

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
  new_metadata_status text;
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

  -- Use 'confirmed' only when at least one title is provided; otherwise 'pending'.
  -- This prevents the tracks_confirmed_metadata_requires_title CHECK from firing
  -- when the caller supplies a URL but no game/track title yet.
  new_metadata_status := CASE
    WHEN normalized_game_title IS NOT NULL OR normalized_track_title IS NOT NULL
      THEN 'confirmed'
    ELSE 'pending'
  END;

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
      canonical_game_title = COALESCE(normalized_game_title, canonical_game_title),
      canonical_track_title = COALESCE(normalized_track_title, canonical_track_title),
      metadata_status = CASE
        WHEN normalized_game_title IS NOT NULL OR normalized_track_title IS NOT NULL
          THEN 'confirmed'
        ELSE metadata_status  -- preserve existing status when no titles given
      END,
      is_retired = public.tracks.is_retired OR coalesce(is_retired_input, false),
      retired_by_tournament_id = coalesce(retiree_tournament_id, public.tracks.retired_by_tournament_id),
      updated_at = timezone('utc', now())
    WHERE id = resolved_track_id;
  ELSE
    INSERT INTO public.tracks (canonical_game_title, canonical_track_title, metadata_status, is_retired, retired_by_tournament_id)
    VALUES (normalized_game_title, normalized_track_title, new_metadata_status, coalesce(is_retired_input, false), retiree_tournament_id)
    RETURNING id INTO resolved_track_id;
  END IF;

  -- 3. Handle orphaned source reassignment
  IF EXISTS (SELECT 1 FROM public.track_sources WHERE provider = 'youtube' AND external_id = youtube_video_id_input AND track_id != resolved_track_id) THEN
      UPDATE public.track_sources
      SET track_id = resolved_track_id, is_primary = true, updated_at = timezone('utc', now())
      WHERE provider = 'youtube' AND external_id = youtube_video_id_input;

      DELETE FROM public.tracks
      WHERE id NOT IN (SELECT track_id FROM public.track_sources)
        AND id != resolved_track_id
        AND created_at < timezone('utc', now()) - interval '2 minutes';
  END IF;

  -- Demote any existing primary source for this track that is NOT the incoming video ID.
  UPDATE public.track_sources
  SET is_primary = false, updated_at = timezone('utc', now())
  WHERE track_id = resolved_track_id
    AND is_primary = true
    AND NOT (provider = 'youtube' AND external_id = youtube_video_id_input);

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


-- ─── 2. Fix orphan cleanup: protect tracks in track_nominations ──────────────

-- Update the original cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_tracks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tracks
  WHERE id NOT IN (SELECT track_id FROM public.track_tournament_appearances)
    AND id NOT IN (SELECT track_id FROM public.track_supports)
    AND id NOT IN (SELECT track_id FROM public.track_nominations)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_player_states ups
      WHERE (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         OR (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         OR (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(
             CASE
               WHEN jsonb_typeof(ups.state -> 'customPlaylists') = 'array'
               THEN ups.state -> 'customPlaylists'
               ELSE '[]'::jsonb
             END
           ) pl
           WHERE (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         )
    );
END;
$$;

-- Update v5 (the grace-period version used by service_role)
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
    t.created_at < timezone('utc', now()) - interval '2 minutes'

    AND NOT EXISTS (SELECT 1 FROM public.track_tournament_appearances tta WHERE tta.track_id = t.id)

    -- Guard: track is not actively nominated by anyone (relational table)
    AND NOT EXISTS (SELECT 1 FROM public.track_nominations tn WHERE tn.track_id = t.id)

    AND NOT EXISTS (
      SELECT 1 FROM public.track_supports ts
      JOIN public.profiles p ON p.id = ts.user_id
      WHERE ts.track_id = t.id
    )

    AND NOT EXISTS (
      SELECT 1 FROM public.track_user_listen_history tulh
      JOIN public.profiles p ON p.id = tulh.user_id
      WHERE tulh.track_id = t.id
    )

    AND NOT EXISTS (
      SELECT 1 FROM public.track_user_feedback tuf
      JOIN public.profiles p ON p.id = tuf.user_id
      WHERE tuf.track_id = t.id
    )

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
