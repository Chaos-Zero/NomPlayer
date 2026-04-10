-- Final Consolidated Persistence Fixes
-- Recreates the track_catalog view with updated_at to fix 400 errors during delta sync
-- Fixes record_youtube_track_listen to handle anonymous users gracefully

-- 1. Recreate track_stats_summary for consistency
CREATE OR REPLACE VIEW "public"."track_stats_summary" WITH ("security_invoker"='true') AS
SELECT
    t.id AS track_id,
    COALESCE(COUNT(tf.user_id), 0) AS total_comments,
    COALESCE(AVG(tf.rating), 0) AS average_rating,
    t.updated_at
FROM "public"."tracks" t
LEFT JOIN "public"."track_user_feedback" tf ON tf.track_id = t.id
GROUP BY t.id, t.updated_at;

-- 2. Modify existing track_catalog view to expose updated_at for the delta sync
-- We drop it first to ensure no column order mismatches or stale definitions
DROP VIEW IF EXISTS "public"."track_catalog" CASCADE;
CREATE OR REPLACE VIEW "public"."track_catalog" WITH ("security_invoker"='true') AS
 SELECT "tracks"."id" AS "track_id",
    "tracks"."canonical_game_title" AS "game_title",
    "tracks"."canonical_track_title" AS "track_title",
        CASE
            WHEN ((NULLIF("btrim"(COALESCE("tracks"."canonical_game_title", ''::"text")), ''::"text") IS NOT NULL) AND (NULLIF("btrim"(COALESCE("tracks"."canonical_track_title", ''::"text")), ''::"text") IS NOT NULL)) THEN (("tracks"."canonical_game_title" || ' - '::"text") || "tracks"."canonical_track_title")
            ELSE COALESCE(NULLIF("btrim"(COALESCE("tracks"."canonical_track_title", ''::"text")), ''::"text"), NULLIF("btrim"(COALESCE("tracks"."canonical_game_title", ''::"text")), ''::"text"), NULLIF("btrim"(COALESCE("track_sources"."cached_title", ''::"text")), ''::"text"), "track_sources"."external_id")
        END AS "display_title",
    "tracks"."metadata_status",
    "tracks"."is_retired",
    "retired_tournament"."slug" AS "retired_by_tournament_slug",
    "retired_tournament"."name" AS "retired_by_tournament_name",
    "track_sources"."id" AS "primary_source_id",
    "track_sources"."provider",
    "track_sources"."external_id" AS "source_external_id",
    "track_sources"."source_url",
    "track_sources"."submitted_url",
    "track_sources"."cached_title" AS "source_title",
    "track_sources"."cached_channel_title" AS "source_channel_title",
    "track_sources"."cached_thumbnail_url" AS "source_thumbnail_url",
    "track_sources"."last_fetched_at",
    "tracks"."updated_at",
    COALESCE(( SELECT "jsonb_agg"("jsonb_build_object"('slug', "tournament_rows"."slug", 'name', "tournament_rows"."name", 'sequence_number', "tournament_rows"."sequence_number", 'appearance_label', "appearances"."appearance_label", 'placement', "appearances"."placement", 'highest_round', "appearances"."highest_round", 'is_retired', "appearances"."is_retired_in_tournament", 'notes', "appearances"."notes") ORDER BY "tournament_rows"."sequence_number", "tournament_rows"."name") AS "jsonb_agg"
           FROM ("public"."track_tournament_appearances" "appearances"
             JOIN "public"."tournaments" "tournament_rows" ON (("tournament_rows"."id" = "appearances"."tournament_id")))
          WHERE ("appearances"."track_id" = "tracks"."id")), '[]'::"jsonb") AS "tournaments",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."track_tournament_appearances" "appearances"
          WHERE ("appearances"."track_id" = "tracks"."id")), (0)::bigint) AS "tournament_count",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."track_supports" "ts"
          WHERE (("ts"."track_id" = "tracks"."id") AND ("ts"."level" = 1))), (0)::bigint) AS "support_count_1",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."track_supports" "ts"
          WHERE (("ts"."track_id" = "tracks"."id") AND ("ts"."level" = 2))), (0)::bigint) AS "support_count_2",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."track_supports" "ts"
          WHERE (("ts"."track_id" = "tracks"."id") AND ("ts"."level" = 3))), (0)::bigint) AS "support_count_3",
    (EXISTS ( SELECT 1
           FROM "public"."track_tournament_appearances" "appearances"
          WHERE (("appearances"."track_id" = "tracks"."id") AND (("appearances"."placement" IS NOT NULL) OR ("appearances"."highest_round" IS NOT NULL))))) AS "has_result"
   FROM (("public"."tracks"
     LEFT JOIN "public"."tournaments" "retired_tournament" ON (("retired_tournament"."id" = "tracks"."retired_by_tournament_id")))
     LEFT JOIN "public"."track_sources" ON ((("track_sources"."track_id" = "tracks"."id") AND "track_sources"."is_primary")));

GRANT SELECT ON "public"."track_catalog" TO "anon", "authenticated";

-- 3. Robust Fix for record_youtube_track_listen 500 error
CREATE OR REPLACE FUNCTION public.record_youtube_track_listen(
  youtube_video_id text,
  listen_event text,
  seconds_played integer DEFAULT 0
)
RETURNS public.track_user_listen_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_video_id text := nullif(btrim(youtube_video_id), '');
  normalized_event text := lower(nullif(btrim(listen_event), ''));
  normalized_seconds integer := greatest(coalesce(seconds_played, 0), 0);
  active_user_id uuid := auth.uid();
  resolved_track_id uuid;
  now_utc timestamptz := timezone('utc', now());
  result_row public.track_user_listen_history;
BEGIN
  -- Gracefully handle anonymous users instead of raising exception (prevents 500 errors)
  IF active_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF normalized_video_id IS NULL OR normalized_event NOT IN ('started', 'completed') THEN
    RETURN NULL;
  END IF;

  -- Find the track
  SELECT track_sources.track_id
  INTO resolved_track_id
  FROM public.track_sources
  WHERE track_sources.provider = 'youtube'
    AND track_sources.external_id = normalized_video_id
  ORDER BY track_sources.is_primary DESC, track_sources.created_at ASC
  LIMIT 1;

  IF resolved_track_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.track_user_listen_history (
    track_id,
    user_id,
    listen_count,
    completion_count,
    total_seconds_played,
    first_listened_at,
    last_listened_at,
    first_completed_at,
    last_completed_at
  )
  VALUES (
    resolved_track_id,
    active_user_id,
    1,
    CASE WHEN normalized_event = 'completed' THEN 1 ELSE 0 END,
    normalized_seconds,
    now_utc,
    now_utc,
    CASE WHEN normalized_event = 'completed' THEN now_utc ELSE NULL END,
    CASE WHEN normalized_event = 'completed' THEN now_utc ELSE NULL END
  )
  ON CONFLICT (track_id, user_id) DO UPDATE
  SET listen_count = public.track_user_listen_history.listen_count + 1,
      completion_count = public.track_user_listen_history.completion_count
        + CASE WHEN normalized_event = 'completed' THEN 1 ELSE 0 END,
      total_seconds_played = public.track_user_listen_history.total_seconds_played
        + normalized_seconds,
      last_listened_at = now_utc,
      first_completed_at = CASE
        WHEN normalized_event = 'completed'
          THEN coalesce(public.track_user_listen_history.first_completed_at, now_utc)
        ELSE public.track_user_listen_history.first_completed_at
      END,
      last_completed_at = CASE
        WHEN normalized_event = 'completed' THEN now_utc
        ELSE public.track_user_listen_history.last_completed_at
      END
  RETURNING *
  INTO result_row;

  RETURN result_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_youtube_track_listen(text, text, integer) TO authenticated;
