-- 1. Initial cleanup: Remove any existing supports that overlap with nominations
DO $$
DECLARE
  overlap_count integer;
BEGIN
  DELETE FROM public.track_supports ts
  WHERE EXISTS (
    SELECT 1
    FROM public.user_player_states ups,
         jsonb_array_elements(ups.state->'nominationList') AS nom
    WHERE ups.user_id = ts.user_id
      AND nom->>'trackId' IS NOT NULL
      AND (nom->>'trackId')::uuid = ts.track_id
  );

  GET DIAGNOSTICS overlap_count = ROW_COUNT;
  -- Output count for logging purposes
  RAISE NOTICE 'Removed % existing overlapping supports.', overlap_count;
END $$;

-- 2. Trigger on user_player_states to clean up supports when nominations are added via JSONB state update
CREATE OR REPLACE FUNCTION public.sync_supports_on_nomination_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If state doesn't have nominationList, skip
  IF NOT (NEW.state ? 'nominationList') THEN
    RETURN NEW;
  END IF;

  -- Remove any corresponding supports if they exist for tracks in nominationList
  DELETE FROM public.track_supports ts
  WHERE ts.user_id = NEW.user_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.state->'nominationList') AS nom
      WHERE nom->>'trackId' IS NOT NULL
        AND (nom->>'trackId')::uuid = ts.track_id
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_supports_on_nomination_update ON public.user_player_states;
CREATE TRIGGER trigger_sync_supports_on_nomination_update
AFTER INSERT OR UPDATE OF state ON public.user_player_states
FOR EACH ROW EXECUTE FUNCTION public.sync_supports_on_nomination_update();

-- 3. Trigger on track_supports to block additions if track is already in user's nomination list (JSONB state)
CREATE OR REPLACE FUNCTION public.check_nomination_before_support()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_player_states ups,
         jsonb_array_elements(ups.state->'nominationList') AS nom
    WHERE ups.user_id = NEW.user_id
      AND nom->>'trackId' IS NOT NULL
      AND (nom->>'trackId')::uuid = NEW.track_id
  ) THEN
    RAISE EXCEPTION 'Track is already in your nomination list and cannot be added to support list.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_nomination_before_support ON public.track_supports;
CREATE TRIGGER trigger_check_nomination_before_support
BEFORE INSERT OR UPDATE ON public.track_supports
FOR EACH ROW EXECUTE FUNCTION public.check_nomination_before_support();
