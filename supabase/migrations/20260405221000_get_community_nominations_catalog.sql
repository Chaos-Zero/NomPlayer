-- Create the get_community_nominations_catalog RPC
-- This RPC returns all users who have nominations, along with their profile data and the full nomination list.
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
        ups.updated_at,
        (ups.state->'nominationList') as nominations
    FROM
        profiles p
    JOIN
        user_player_states ups ON p.id = ups.user_id
    WHERE
        ups.state->'nominationList' IS NOT NULL
        AND jsonb_array_length(ups.state->'nominationList') > 0
    ORDER BY
        ups.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant access to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.get_community_nominations_catalog() TO authenticated, anon;
