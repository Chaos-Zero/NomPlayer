-- Remove thumbnail URLs from get_community_nominations_catalog.
-- Thumbnails are derivable from videoId on the client via getYouTubeThumbnailUrl()
-- and do not need to be fetched from the database on every page load.

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
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id as user_id,
        p.username,
        p.avatar_url,
        p.gamefaqs_username,
        COALESCE(MAX(n.created_at), p.updated_at) AS updated_at,
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'videoId', c.source_external_id,
                'title', CASE WHEN c.display_title IS NOT NULL AND c.display_title != '' THEN c.display_title ELSE c.source_title END,
                'channelTitle', c.source_channel_title,
                'trackId', c.track_id,
                'gameTitle', c.game_title,
                'trackTitle', c.track_title,
                'displayTitle', c.display_title
            ) ORDER BY n.order_index ASC
        ) FILTER (WHERE n.track_id IS NOT NULL), '[]'::jsonb) AS nominations
    FROM profiles p
    JOIN track_nominations n ON n.user_id = p.id
    JOIN track_catalog c ON c.track_id = n.track_id
    GROUP BY p.id, p.username, p.avatar_url, p.gamefaqs_username
    HAVING COUNT(n.track_id) > 0
    ORDER BY updated_at DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_community_nominations_catalog() TO authenticated, anon;
