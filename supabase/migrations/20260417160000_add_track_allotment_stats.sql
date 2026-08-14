-- ─────────────────────────────────────────────────────────────────────────────
-- track_allotment_stats
--
-- Denormalised, trigger-maintained counters for tracks that are actively
-- nominated or supported in the current VGMC allotment.  Reads are a single
-- primary-key lookup instead of per-row subquery aggregations.
--
-- Year rollover is a manual admin operation (see bottom of file), it is
-- intentionally NOT exposed through any RPC or application route.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Live stats table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.track_allotment_stats (
  track_id         uuid    PRIMARY KEY
                           REFERENCES public.tracks(id) ON DELETE CASCADE,
  nomination_count integer NOT NULL DEFAULT 0 CHECK (nomination_count >= 0),
  support_count_1  integer NOT NULL DEFAULT 0 CHECK (support_count_1  >= 0),
  support_count_2  integer NOT NULL DEFAULT 0 CHECK (support_count_2  >= 0),
  support_count_3  integer NOT NULL DEFAULT 0 CHECK (support_count_3  >= 0),
  comment_count    integer NOT NULL DEFAULT 0 CHECK (comment_count    >= 0),
  rating_count     integer NOT NULL DEFAULT 0 CHECK (rating_count     >= 0),
  -- Store raw sum so avg can be recomputed without floating-point drift
  rating_sum       integer NOT NULL DEFAULT 0 CHECK (rating_sum       >= 0),
  updated_at       timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- ── 2. Historical archive (populated by the admin rollover script) ────────────

CREATE TABLE IF NOT EXISTS public.track_allotment_stats_history (
  track_id         uuid    NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  tournament_id    uuid    NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  nomination_count integer NOT NULL DEFAULT 0,
  support_count_1  integer NOT NULL DEFAULT 0,
  support_count_2  integer NOT NULL DEFAULT 0,
  support_count_3  integer NOT NULL DEFAULT 0,
  comment_count    integer NOT NULL DEFAULT 0,
  rating_count     integer NOT NULL DEFAULT 0,
  rating_sum       integer NOT NULL DEFAULT 0,
  archived_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (track_id, tournament_id)
);

CREATE INDEX IF NOT EXISTS track_allotment_stats_history_tournament_idx
  ON public.track_allotment_stats_history (tournament_id);


-- ── 3. Trigger functions ─────────────────────────────────────────────────────

-- 3a. track_supports → support_count_1 / 2 / 3

CREATE OR REPLACE FUNCTION public.maintain_stats_on_support()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO track_allotment_stats (track_id, support_count_1, support_count_2, support_count_3)
    VALUES (
      NEW.track_id,
      CASE WHEN NEW.level = 1 THEN 1 ELSE 0 END,
      CASE WHEN NEW.level = 2 THEN 1 ELSE 0 END,
      CASE WHEN NEW.level = 3 THEN 1 ELSE 0 END
    )
    ON CONFLICT (track_id) DO UPDATE SET
      support_count_1 = track_allotment_stats.support_count_1
                        + CASE WHEN NEW.level = 1 THEN 1 ELSE 0 END,
      support_count_2 = track_allotment_stats.support_count_2
                        + CASE WHEN NEW.level = 2 THEN 1 ELSE 0 END,
      support_count_3 = track_allotment_stats.support_count_3
                        + CASE WHEN NEW.level = 3 THEN 1 ELSE 0 END,
      updated_at      = timezone('utc', now());

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE track_allotment_stats SET
      support_count_1 = GREATEST(0, support_count_1 - CASE WHEN OLD.level = 1 THEN 1 ELSE 0 END),
      support_count_2 = GREATEST(0, support_count_2 - CASE WHEN OLD.level = 2 THEN 1 ELSE 0 END),
      support_count_3 = GREATEST(0, support_count_3 - CASE WHEN OLD.level = 3 THEN 1 ELSE 0 END),
      updated_at      = timezone('utc', now())
    WHERE track_id = OLD.track_id;

  ELSIF TG_OP = 'UPDATE' AND OLD.level IS DISTINCT FROM NEW.level THEN
    UPDATE track_allotment_stats SET
      support_count_1 = GREATEST(0, support_count_1
                          - CASE WHEN OLD.level = 1 THEN 1 ELSE 0 END
                          + CASE WHEN NEW.level = 1 THEN 1 ELSE 0 END),
      support_count_2 = GREATEST(0, support_count_2
                          - CASE WHEN OLD.level = 2 THEN 1 ELSE 0 END
                          + CASE WHEN NEW.level = 2 THEN 1 ELSE 0 END),
      support_count_3 = GREATEST(0, support_count_3
                          - CASE WHEN OLD.level = 3 THEN 1 ELSE 0 END
                          + CASE WHEN NEW.level = 3 THEN 1 ELSE 0 END),
      updated_at      = timezone('utc', now())
    WHERE track_id = NEW.track_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_stats_on_support ON public.track_supports;
CREATE TRIGGER trg_maintain_stats_on_support
AFTER INSERT OR UPDATE OR DELETE ON public.track_supports
FOR EACH ROW EXECUTE FUNCTION public.maintain_stats_on_support();


-- 3b. track_nominations → nomination_count

CREATE OR REPLACE FUNCTION public.maintain_stats_on_nomination()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO track_allotment_stats (track_id, nomination_count)
    VALUES (NEW.track_id, 1)
    ON CONFLICT (track_id) DO UPDATE SET
      nomination_count = track_allotment_stats.nomination_count + 1,
      updated_at       = timezone('utc', now());

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE track_allotment_stats SET
      nomination_count = GREATEST(0, nomination_count - 1),
      updated_at       = timezone('utc', now())
    WHERE track_id = OLD.track_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_stats_on_nomination ON public.track_nominations;
CREATE TRIGGER trg_maintain_stats_on_nomination
AFTER INSERT OR DELETE ON public.track_nominations
FOR EACH ROW EXECUTE FUNCTION public.maintain_stats_on_nomination();


-- 3c. track_user_feedback → comment_count, rating_count, rating_sum

CREATE OR REPLACE FUNCTION public.maintain_stats_on_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO track_allotment_stats (track_id, comment_count, rating_count, rating_sum)
    VALUES (
      NEW.track_id,
      CASE WHEN nullif(btrim(coalesce(NEW.note, '')), '') IS NOT NULL THEN 1 ELSE 0 END,
      CASE WHEN NEW.rating IS NOT NULL THEN 1 ELSE 0 END,
      COALESCE(NEW.rating, 0)
    )
    ON CONFLICT (track_id) DO UPDATE SET
      comment_count = track_allotment_stats.comment_count
                      + CASE WHEN nullif(btrim(coalesce(NEW.note, '')), '') IS NOT NULL THEN 1 ELSE 0 END,
      rating_count  = track_allotment_stats.rating_count
                      + CASE WHEN NEW.rating IS NOT NULL THEN 1 ELSE 0 END,
      rating_sum    = track_allotment_stats.rating_sum + COALESCE(NEW.rating, 0),
      updated_at    = timezone('utc', now());

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE track_allotment_stats SET
      comment_count = GREATEST(0, comment_count
                        - CASE WHEN nullif(btrim(coalesce(OLD.note, '')), '') IS NOT NULL THEN 1 ELSE 0 END),
      rating_count  = GREATEST(0, rating_count
                        - CASE WHEN OLD.rating IS NOT NULL THEN 1 ELSE 0 END),
      rating_sum    = GREATEST(0, rating_sum - COALESCE(OLD.rating, 0)),
      updated_at    = timezone('utc', now())
    WHERE track_id = OLD.track_id;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE track_allotment_stats SET
      comment_count = GREATEST(0, comment_count
                        - CASE WHEN nullif(btrim(coalesce(OLD.note, '')), '') IS NOT NULL THEN 1 ELSE 0 END
                        + CASE WHEN nullif(btrim(coalesce(NEW.note, '')), '') IS NOT NULL THEN 1 ELSE 0 END),
      rating_count  = GREATEST(0, rating_count
                        - CASE WHEN OLD.rating IS NOT NULL THEN 1 ELSE 0 END
                        + CASE WHEN NEW.rating IS NOT NULL THEN 1 ELSE 0 END),
      rating_sum    = GREATEST(0, rating_sum
                        - COALESCE(OLD.rating, 0)
                        + COALESCE(NEW.rating, 0)),
      updated_at    = timezone('utc', now())
    WHERE track_id = NEW.track_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_stats_on_feedback ON public.track_user_feedback;
CREATE TRIGGER trg_maintain_stats_on_feedback
AFTER INSERT OR UPDATE OR DELETE ON public.track_user_feedback
FOR EACH ROW EXECUTE FUNCTION public.maintain_stats_on_feedback();


-- ── 4. Backfill from existing data ───────────────────────────────────────────

INSERT INTO public.track_allotment_stats (
  track_id,
  support_count_1,
  support_count_2,
  support_count_3,
  nomination_count,
  comment_count,
  rating_count,
  rating_sum
)
SELECT
  t.id                                                       AS track_id,
  COUNT(*) FILTER (WHERE ts.level = 1)                       AS support_count_1,
  COUNT(*) FILTER (WHERE ts.level = 2)                       AS support_count_2,
  COUNT(*) FILTER (WHERE ts.level = 3)                       AS support_count_3,
  COUNT(DISTINCT tn.user_id)                                 AS nomination_count,
  COUNT(*) FILTER (
    WHERE nullif(btrim(coalesce(tuf.note, '')), '') IS NOT NULL
  )                                                          AS comment_count,
  COUNT(*) FILTER (WHERE tuf.rating IS NOT NULL)             AS rating_count,
  COALESCE(SUM(tuf.rating) FILTER (WHERE tuf.rating IS NOT NULL), 0)
                                                             AS rating_sum
FROM public.tracks t
LEFT JOIN public.track_supports       ts  ON ts.track_id  = t.id
LEFT JOIN public.track_nominations    tn  ON tn.track_id  = t.id
LEFT JOIN public.track_user_feedback  tuf ON tuf.track_id = t.id
-- Only include tracks that have at least one signal
WHERE ts.track_id IS NOT NULL
   OR tn.track_id IS NOT NULL
   OR tuf.track_id IS NOT NULL
GROUP BY t.id
ON CONFLICT (track_id) DO UPDATE SET
  support_count_1  = EXCLUDED.support_count_1,
  support_count_2  = EXCLUDED.support_count_2,
  support_count_3  = EXCLUDED.support_count_3,
  nomination_count = EXCLUDED.nomination_count,
  comment_count    = EXCLUDED.comment_count,
  rating_count     = EXCLUDED.rating_count,
  rating_sum       = EXCLUDED.rating_sum,
  updated_at       = timezone('utc', now());


-- ── 5. Update track_catalog view to use stats table ──────────────────────────
-- Replace the three per-row subquery aggregations with a single LEFT JOIN.

DROP FUNCTION IF EXISTS public.search_track_catalog(text, integer);
DROP VIEW IF EXISTS public.track_catalog CASCADE;

CREATE VIEW public.track_catalog AS
SELECT
  tracks.id                        AS track_id,
  tracks.canonical_game_title      AS game_title,
  tracks.canonical_track_title     AS track_title,
  CASE
    WHEN nullif(btrim(coalesce(tracks.canonical_game_title, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(tracks.canonical_track_title, '')), '') IS NOT NULL
      THEN tracks.canonical_game_title || ' - ' || tracks.canonical_track_title
    ELSE coalesce(
      nullif(btrim(coalesce(tracks.canonical_track_title,  '')), ''),
      nullif(btrim(coalesce(tracks.canonical_game_title,   '')), ''),
      nullif(btrim(coalesce(track_sources.cached_title,    '')), ''),
      track_sources.external_id
    )
  END                              AS display_title,
  tracks.metadata_status,
  tracks.is_retired,
  retired_tournament.slug          AS retired_by_tournament_slug,
  retired_tournament.name          AS retired_by_tournament_name,
  track_sources.id                 AS primary_source_id,
  track_sources.provider,
  track_sources.external_id        AS source_external_id,
  track_sources.source_url,
  track_sources.submitted_url,
  track_sources.cached_title       AS source_title,
  track_sources.cached_channel_title AS source_channel_title,
  track_sources.cached_thumbnail_url AS source_thumbnail_url,
  track_sources.last_fetched_at,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug',             tournament_rows.slug,
          'name',             tournament_rows.name,
          'sequence_number',  tournament_rows.sequence_number,
          'appearance_label', appearances.appearance_label,
          'placement',        appearances.placement,
          'is_retired',       appearances.is_retired_in_tournament,
          'notes',            appearances.notes
        )
        ORDER BY tournament_rows.sequence_number NULLS LAST, tournament_rows.name
      )
      FROM public.track_tournament_appearances appearances
      JOIN public.tournaments tournament_rows ON tournament_rows.id = appearances.tournament_id
      WHERE appearances.track_id = tracks.id
    ),
    '[]'::jsonb
  )                                AS tournaments,
  COALESCE(
    (SELECT count(*) FROM public.track_tournament_appearances a WHERE a.track_id = tracks.id),
    0
  )                                AS tournament_count,
  -- Support counts now come from the maintained stats table (single JOIN, no subquery)
  COALESCE(tas.support_count_1, 0) AS support_count_1,
  COALESCE(tas.support_count_2, 0) AS support_count_2,
  COALESCE(tas.support_count_3, 0) AS support_count_3,
  -- Extra stats available for the current allotment
  COALESCE(tas.nomination_count, 0) AS nomination_count,
  COALESCE(tas.comment_count,    0) AS comment_count,
  CASE
    WHEN COALESCE(tas.rating_count, 0) > 0
      THEN ROUND(tas.rating_sum::numeric / tas.rating_count, 1)
    ELSE NULL
  END                              AS avg_rating,
  EXISTS (
    SELECT 1 FROM public.track_tournament_appearances a
    WHERE a.track_id = tracks.id AND a.placement IS NOT NULL
  )                                AS has_result
FROM public.tracks
LEFT JOIN public.tournaments retired_tournament
       ON retired_tournament.id = tracks.retired_by_tournament_id
LEFT JOIN public.track_sources
       ON track_sources.track_id = tracks.id
      AND track_sources.is_primary
LEFT JOIN public.track_allotment_stats tas
       ON tas.track_id = tracks.id;

-- Restore grants
GRANT SELECT ON public.track_catalog TO anon;
GRANT SELECT ON public.track_catalog TO authenticated;


-- ── 6. Restore search_track_catalog ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_track_catalog(
  search_term  text,
  limit_count  integer DEFAULT 20
)
RETURNS SETOF public.track_catalog
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized_term AS (
    SELECT nullif(btrim(search_term), '') AS value
  ),
  ranked_catalog AS (
    SELECT
      track_catalog.*,
      greatest(
        ts_rank_cd(
          to_tsvector('simple',
            coalesce(track_catalog.game_title, '') || ' ' || coalesce(track_catalog.track_title, '')),
          websearch_to_tsquery('simple', normalized_term.value)
        ),
        ts_rank_cd(
          to_tsvector('simple',
            coalesce(track_catalog.source_title, '') || ' ' || coalesce(track_catalog.source_channel_title, '')),
          websearch_to_tsquery('simple', normalized_term.value)
        )
      ) AS search_rank
    FROM public.track_catalog
    CROSS JOIN normalized_term
    WHERE normalized_term.value IS NOT NULL
      AND (
        track_catalog.source_external_id = normalized_term.value
        OR to_tsvector('simple',
             coalesce(track_catalog.game_title, '') || ' ' || coalesce(track_catalog.track_title, ''))
           @@ websearch_to_tsquery('simple', normalized_term.value)
        OR to_tsvector('simple',
             coalesce(track_catalog.source_title, '') || ' ' || coalesce(track_catalog.source_channel_title, ''))
           @@ websearch_to_tsquery('simple', normalized_term.value)
      )
  )
  SELECT
    track_id, game_title, track_title, display_title,
    metadata_status, is_retired,
    retired_by_tournament_slug, retired_by_tournament_name,
    primary_source_id, provider, source_external_id,
    source_url, submitted_url, source_title, source_channel_title,
    source_thumbnail_url, last_fetched_at,
    tournaments, tournament_count,
    support_count_1, support_count_2, support_count_3,
    nomination_count, comment_count, avg_rating,
    has_result
  FROM ranked_catalog
  ORDER BY search_rank DESC, display_title ASC
  LIMIT least(greatest(coalesce(limit_count, 20), 1), 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO authenticated;


-- ── 7. Bulk stats lookup by YouTube video ID ─────────────────────────────────
-- Lets the app fetch current stats for a batch of video IDs in one round-trip.

CREATE OR REPLACE FUNCTION public.get_allotment_stats_by_video_ids(
  video_ids text[]
)
RETURNS TABLE (
  video_id         text,
  nomination_count integer,
  support_count_1  integer,
  support_count_2  integer,
  support_count_3  integer,
  comment_count    integer,
  avg_rating       numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    src.external_id                                            AS video_id,
    COALESCE(tas.nomination_count, 0)                          AS nomination_count,
    COALESCE(tas.support_count_1,  0)                          AS support_count_1,
    COALESCE(tas.support_count_2,  0)                          AS support_count_2,
    COALESCE(tas.support_count_3,  0)                          AS support_count_3,
    COALESCE(tas.comment_count,    0)                          AS comment_count,
    CASE
      WHEN COALESCE(tas.rating_count, 0) > 0
        THEN ROUND(tas.rating_sum::numeric / tas.rating_count, 1)
      ELSE NULL
    END                                                        AS avg_rating
  FROM unnest(video_ids) AS v(external_id)
  JOIN public.track_sources src
    ON src.external_id = v.external_id AND src.provider = 'youtube'
  LEFT JOIN public.track_allotment_stats tas
    ON tas.track_id = src.track_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_allotment_stats_by_video_ids(text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_allotment_stats_by_video_ids(text[]) TO authenticated;


-- ── 8. RLS ───────────────────────────────────────────────────────────────────
-- Public read. No user writes, the table is exclusively trigger-maintained.

ALTER TABLE public.track_allotment_stats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_allotment_stats_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "track_allotment_stats_select_public"
  ON public.track_allotment_stats;
CREATE POLICY "track_allotment_stats_select_public"
  ON public.track_allotment_stats FOR SELECT USING (true);

DROP POLICY IF EXISTS "track_allotment_stats_history_select_public"
  ON public.track_allotment_stats_history;
CREATE POLICY "track_allotment_stats_history_select_public"
  ON public.track_allotment_stats_history FOR SELECT USING (true);

GRANT SELECT ON public.track_allotment_stats         TO anon, authenticated;
GRANT SELECT ON public.track_allotment_stats_history TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- YEAR ROLLOVER (admin SQL, run manually in Supabase SQL editor, never via app)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Replace 'vgmc-XX' with the slug of the tournament year being archived.
--
-- BEGIN;
--
-- -- 1. Snapshot live stats into history
-- INSERT INTO public.track_allotment_stats_history (
--   track_id, tournament_id,
--   nomination_count, support_count_1, support_count_2, support_count_3,
--   comment_count, rating_count, rating_sum
-- )
-- SELECT
--   s.track_id,
--   t.id,
--   s.nomination_count, s.support_count_1, s.support_count_2, s.support_count_3,
--   s.comment_count, s.rating_count, s.rating_sum
-- FROM public.track_allotment_stats s
-- CROSS JOIN (SELECT id FROM public.tournaments WHERE slug = 'vgmc-XX') t
-- ON CONFLICT (track_id, tournament_id) DO NOTHING;
--
-- -- 2. Clear nomination and support data for the new year
-- TRUNCATE public.track_nominations;
-- TRUNCATE public.track_supports;
--
-- -- 3. Reset live stats (triggers will maintain it going forward)
-- TRUNCATE public.track_allotment_stats;
--
-- -- 4. Clear nomination/support lists from all user JSONB states
-- UPDATE public.user_player_states
-- SET state      = state - 'nominationList' - 'supportList',
--     updated_at = timezone('utc', now());
--
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
