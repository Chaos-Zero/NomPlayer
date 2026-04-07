-- Supabase Migration: Add updated_at and stats aggregate

-- 1. Create an aggregated view for fast sorting of user-generated stats
CREATE OR REPLACE VIEW "public"."track_stats_summary" WITH ("security_invoker"='true') AS
SELECT
    t.id AS track_id,
    COALESCE(COUNT(tf.user_id), 0) AS total_comments,
    COALESCE(AVG(tf.rating), 0) AS average_rating,
    t.updated_at
FROM "public"."tracks" t
LEFT JOIN "public"."track_user_feedback" tf ON tf.track_id = t.id
GROUP BY t.id, t.updated_at;

ALTER VIEW "public"."track_stats_summary" OWNER TO "postgres";

-- 2. Modify existing track_catalog view to expose updated_at for the delta sync
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

ALTER VIEW "public"."track_catalog" OWNER TO "postgres";
