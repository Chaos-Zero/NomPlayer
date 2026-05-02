-- get_community_nominations_catalog was timing out because it joined against the
-- track_catalog view, which has three correlated subqueries against
-- track_tournament_appearances for every row (tournaments jsonb_agg, tournament_count,
-- has_result). The function only needs basic title/source columns, so we bypass the
-- view and join tracks + track_sources directly.

CREATE OR REPLACE FUNCTION public.get_community_nominations_catalog()
RETURNS TABLE (
    user_id uuid,
    username text,
    avatar_url text,
    gamefaqs_username text,
    updated_at timestamptz,
    nominations jsonb
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
    SELECT
        p.id AS user_id,
        p.username,
        p.avatar_url,
        p.gamefaqs_username,
        COALESCE(MAX(n.created_at), p.updated_at) AS updated_at,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'videoId',      src.external_id,
                    'title',        CASE
                                        WHEN nullif(btrim(coalesce(t.canonical_game_title, '')), '') IS NOT NULL
                                         AND nullif(btrim(coalesce(t.canonical_track_title, '')), '') IS NOT NULL
                                        THEN t.canonical_game_title || ' - ' || t.canonical_track_title
                                        ELSE coalesce(
                                            nullif(btrim(coalesce(t.canonical_track_title, '')), ''),
                                            nullif(btrim(coalesce(t.canonical_game_title,  '')), ''),
                                            nullif(btrim(coalesce(src.cached_title,         '')), ''),
                                            src.external_id
                                        )
                                    END,
                    'channelTitle', src.cached_channel_title,
                    'trackId',      t.id,
                    'gameTitle',    t.canonical_game_title,
                    'trackTitle',   t.canonical_track_title,
                    'displayTitle', CASE
                                        WHEN nullif(btrim(coalesce(t.canonical_game_title, '')), '') IS NOT NULL
                                         AND nullif(btrim(coalesce(t.canonical_track_title, '')), '') IS NOT NULL
                                        THEN t.canonical_game_title || ' - ' || t.canonical_track_title
                                        ELSE coalesce(
                                            nullif(btrim(coalesce(t.canonical_track_title, '')), ''),
                                            nullif(btrim(coalesce(t.canonical_game_title,  '')), ''),
                                            nullif(btrim(coalesce(src.cached_title,         '')), ''),
                                            src.external_id
                                        )
                                    END
                )
                ORDER BY n.order_index ASC
            ) FILTER (WHERE n.track_id IS NOT NULL),
            '[]'::jsonb
        ) AS nominations
    FROM profiles p
    JOIN track_nominations n ON n.user_id = p.id
    JOIN tracks t             ON t.id = n.track_id
    LEFT JOIN track_sources src ON src.track_id = t.id AND src.is_primary
    GROUP BY p.id, p.username, p.avatar_url, p.gamefaqs_username
    HAVING COUNT(n.track_id) > 0
    ORDER BY updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_nominations_catalog() TO authenticated, anon;
