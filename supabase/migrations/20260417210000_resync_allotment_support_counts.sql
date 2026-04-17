-- Resync track_allotment_stats support counts from the live track_supports table.
-- The trigger-maintained counters can drift if rows were deleted outside the
-- normal app flow or if a trigger misfired.  This migration reconciles them.

UPDATE public.track_allotment_stats tas
SET
  support_count_1 = COALESCE(live.c1, 0),
  support_count_2 = COALESCE(live.c2, 0),
  support_count_3 = COALESCE(live.c3, 0),
  updated_at      = timezone('utc', now())
FROM (
  SELECT
    track_id,
    COUNT(*) FILTER (WHERE level = 1) AS c1,
    COUNT(*) FILTER (WHERE level = 2) AS c2,
    COUNT(*) FILTER (WHERE level = 3) AS c3
  FROM public.track_supports
  GROUP BY track_id
) live
WHERE tas.track_id = live.track_id
  AND (
    tas.support_count_1 IS DISTINCT FROM live.c1 OR
    tas.support_count_2 IS DISTINCT FROM live.c2 OR
    tas.support_count_3 IS DISTINCT FROM live.c3
  );

-- Zero out any rows that have stale counts but no matching track_supports rows
UPDATE public.track_allotment_stats
SET
  support_count_1 = 0,
  support_count_2 = 0,
  support_count_3 = 0,
  updated_at      = timezone('utc', now())
WHERE (support_count_1 > 0 OR support_count_2 > 0 OR support_count_3 > 0)
  AND track_id NOT IN (SELECT DISTINCT track_id FROM public.track_supports);
