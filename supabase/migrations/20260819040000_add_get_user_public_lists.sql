-- Powers the Discord bot's "Open in NomPlayer" share links (?nominations=<uuid>
-- / ?supports=<uuid>, see App.jsx's shared-link boot loader) - a per-user cut
-- of the same data get_community_nominations_catalog() already exposes to
-- everyone, so a link doesn't have to fetch and filter the whole community
-- catalog just to find one person's list.
--
-- No auth.uid() = target_user_id check (unlike get_user_hydrated_state, which
-- is deliberately owner-only): nominations and support levels are already
-- fully public elsewhere in the app - get_community_nominations_catalog()
-- broadcasts every user's nominations to anon+authenticated, and
-- track_supports carries its own "track_supports_select_public" RLS policy
-- (using (true), no role restriction). This isn't a new privacy exposure,
-- just a cheaper way to fetch a slice of what's already public.
CREATE OR REPLACE FUNCTION public.get_user_public_lists(target_user_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object(
    'username', (SELECT username FROM profiles WHERE id = target_user_id),
    'nominationList', COALESCE((
      SELECT json_agg(json_build_object(
        'videoId', c.source_external_id,
        'title', CASE
                   WHEN c.display_title IS NOT NULL AND c.display_title != ''
                   THEN c.display_title
                   ELSE c.source_title
                 END,
        'thumbnail', c.source_thumbnail_url,
        'channelTitle', c.source_channel_title,
        'trackId', c.track_id,
        'gameTitle', c.game_title,
        'trackTitle', c.track_title,
        'displayTitle', c.display_title
      ) ORDER BY n.created_at ASC)
      FROM track_nominations n
      JOIN track_catalog c ON c.track_id = n.track_id
      WHERE n.user_id = target_user_id
    ), '[]'::json),
    'supportList', COALESCE((
      SELECT json_agg(json_build_object(
        'videoId', c.source_external_id,
        'title', CASE
                   WHEN c.display_title IS NOT NULL AND c.display_title != ''
                   THEN c.display_title
                   ELSE c.source_title
                 END,
        'thumbnail', c.source_thumbnail_url,
        'channelTitle', c.source_channel_title,
        'trackId', c.track_id,
        'gameTitle', c.game_title,
        'trackTitle', c.track_title,
        'displayTitle', c.display_title,
        'supportLevel', s.level
      ) ORDER BY s.created_at ASC)
      FROM track_supports s
      JOIN track_catalog c ON c.track_id = s.track_id
      WHERE s.user_id = target_user_id
    ), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_public_lists(uuid) TO authenticated, anon;
