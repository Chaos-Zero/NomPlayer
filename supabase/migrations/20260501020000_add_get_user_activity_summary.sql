-- Replaces the 4-query fetchDetailedUserActivity pattern with a single RPC.
-- Previously: personal feedback, peer feedback, global highlights, then a fourth
-- query for track_supports cross-referencing all three result sets.
-- Now: all four are computed server-side, support data attached before returning.

CREATE OR REPLACE FUNCTION public.get_user_activity_summary(
  req_user_id         uuid,
  nominated_track_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_personal   jsonb;
  v_peer       jsonb := '[]'::jsonb;
  v_highlights jsonb;
BEGIN
  -- 1. Personal: all feedback the user has written, with support status for their
  --    own position on each track.
  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'updated_at' DESC), '[]'::jsonb)
  INTO v_personal
  FROM (
    SELECT jsonb_build_object(
      'rating',      f.rating,
      'note',        f.note,
      'updated_at',  f.updated_at,
      'tracks',      jsonb_build_object(
        'id',                    t.id,
        'canonical_game_title',  t.canonical_game_title,
        'canonical_track_title', t.canonical_track_title,
        'track_sources',         COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('external_id', s.external_id))
           FROM track_sources s WHERE s.track_id = t.id AND s.is_primary),
          '[]'::jsonb
        )
      ),
      'isSupported', EXISTS (
        SELECT 1 FROM track_supports ts
        WHERE ts.user_id = req_user_id AND ts.track_id = t.id
      ),
      'supportLevel', (
        SELECT ts.level FROM track_supports ts
        WHERE ts.user_id = req_user_id AND ts.track_id = t.id
        LIMIT 1
      )
    ) AS item
    FROM track_user_feedback f
    JOIN tracks t ON t.id = f.track_id
    WHERE f.user_id = req_user_id
  ) sub;

  -- 2. Peer: other users' feedback on tracks the requester has nominated.
  IF cardinality(nominated_track_ids) > 0 THEN
    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'updated_at' DESC), '[]'::jsonb)
    INTO v_peer
    FROM (
      SELECT jsonb_build_object(
        'rating',      f.rating,
        'note',        f.note,
        'updated_at',  f.updated_at,
        'user_id',     f.user_id,
        'profiles',    jsonb_build_object(
          'username',   p.username,
          'avatar_url', p.avatar_url
        ),
        'tracks',      jsonb_build_object(
          'id',                    t.id,
          'canonical_game_title',  t.canonical_game_title,
          'canonical_track_title', t.canonical_track_title,
          'track_sources',         COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('external_id', s.external_id))
             FROM track_sources s WHERE s.track_id = t.id AND s.is_primary),
            '[]'::jsonb
          )
        ),
        'isSupported', EXISTS (
          SELECT 1 FROM track_supports ts
          WHERE ts.user_id = f.user_id AND ts.track_id = t.id
        ),
        'supportLevel', (
          SELECT ts.level FROM track_supports ts
          WHERE ts.user_id = f.user_id AND ts.track_id = t.id
          LIMIT 1
        )
      ) AS item
      FROM track_user_feedback f
      JOIN tracks t ON t.id = f.track_id
      JOIN profiles p ON p.id = f.user_id
      WHERE f.track_id = ANY(nominated_track_ids)
        AND f.user_id != req_user_id
    ) sub;
  END IF;

  -- 3. Highlights: 10 most recent community comments from other users.
  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'updated_at' DESC), '[]'::jsonb)
  INTO v_highlights
  FROM (
    SELECT jsonb_build_object(
      'rating',      f.rating,
      'note',        f.note,
      'updated_at',  f.updated_at,
      'user_id',     f.user_id,
      'profiles',    jsonb_build_object(
        'username',   p.username,
        'avatar_url', p.avatar_url
      ),
      'tracks',      jsonb_build_object(
        'id',                    t.id,
        'canonical_game_title',  t.canonical_game_title,
        'canonical_track_title', t.canonical_track_title,
        'track_sources',         COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('external_id', s.external_id))
           FROM track_sources s WHERE s.track_id = t.id AND s.is_primary),
          '[]'::jsonb
        )
      ),
      'isSupported', EXISTS (
        SELECT 1 FROM track_supports ts
        WHERE ts.user_id = f.user_id AND ts.track_id = t.id
      ),
      'supportLevel', (
        SELECT ts.level FROM track_supports ts
        WHERE ts.user_id = f.user_id AND ts.track_id = t.id
        LIMIT 1
      )
    ) AS item
    FROM (
      SELECT f.rating, f.note, f.updated_at, f.user_id, f.track_id
      FROM track_user_feedback f
      WHERE f.note IS NOT NULL
        AND f.user_id != req_user_id
      ORDER BY f.updated_at DESC
      LIMIT 10
    ) f
    JOIN tracks t ON t.id = f.track_id
    JOIN profiles p ON p.id = f.user_id
  ) sub;

  RETURN jsonb_build_object(
    'personal',   v_personal,
    'peer',       v_peer,
    'highlights', v_highlights
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_activity_summary(uuid, uuid[]) TO authenticated;
