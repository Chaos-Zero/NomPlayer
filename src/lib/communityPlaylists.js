import { getMediaThumbnailUrl } from '../utils/media.js';

/**
 * Looks up a playlist's own row (name, owner, visibility) by id, used to
 * confirm a shared playlist link is actually loadable before fetching its
 * tracks. RLS on user_playlists already restricts SELECT to public rows or
 * the caller's own, a private playlist opened by someone else (or a
 * deleted/mistyped id) simply comes back as `null` here rather than an
 * error, callers should treat that as "this link doesn't work" rather than
 * a fetch failure.
 */
export async function fetchPlaylistMeta(supabase, playlistId) {
  const { data, error } = await supabase
    .from('user_playlists')
    .select('id, name, is_public, user_id')
    .eq('id', playlistId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Loads one playlist's tracks in play order, mapped to the same video
 * shape the rest of the app (playlist/customPlaylists/queue) uses. Shared
 * by CommunityPlaylistsView (browsing/loading a playlist) and the
 * shared-link boot loader in App.jsx, so both read a playlist's tracks
 * exactly the same way.
 */
export async function fetchPlaylistTracks(supabase, playlistId) {
  const { data, error } = await supabase
    .from('user_playlist_tracks')
    .select(
      `id, order_index, track_id, provider, external_id, cached_title, cached_channel, cached_thumbnail,
       tracks (
         id, canonical_game_title, canonical_track_title,
         track_sources (
           provider, external_id, cached_title, cached_channel_title,
           cached_thumbnail_url, is_primary
         )
       )`,
    )
    .eq('playlist_id', playlistId)
    .order('order_index');
  if (error) throw error;
  return (data || [])
    .map((pt) => {
      if (pt.track_id != null) {
        const track = pt.tracks;
        const src =
          track?.track_sources?.find((s) => s.is_primary) ??
          track?.track_sources?.[0];
        if (!src) return null;
        return {
          id: pt.id,
          videoId: src.external_id,
          provider: src.provider || 'youtube',
          trackId: pt.track_id,
          title:
            src.cached_title ||
            [track.canonical_game_title, track.canonical_track_title]
              .filter(Boolean)
              .join(' – '),
          displayTitle:
            track.canonical_track_title || src.cached_title || src.external_id,
          channelTitle:
            src.cached_channel_title ||
            (!src.provider || src.provider === 'youtube' ? 'YouTube' : ''),
          thumbnail:
            src.cached_thumbnail_url ||
            getMediaThumbnailUrl({
              provider: src.provider,
              videoId: src.external_id,
            }),
          gameTitle: track.canonical_game_title,
          trackTitle: track.canonical_track_title,
          comment: '',
          addedAt: new Date().toISOString(),
        };
      }
      if (pt.external_id) {
        return {
          id: pt.id,
          videoId: pt.external_id,
          provider: pt.provider || 'youtube',
          trackId: null,
          title: pt.cached_title || pt.external_id,
          displayTitle: pt.cached_title || pt.external_id,
          channelTitle: pt.cached_channel || 'YouTube',
          thumbnail:
            pt.cached_thumbnail ||
            getMediaThumbnailUrl({
              provider: pt.provider,
              videoId: pt.external_id,
            }),
          gameTitle: '',
          trackTitle: '',
          comment: '',
          addedAt: new Date().toISOString(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

/** `?playlist=<uuid>` share link for the given playlist id, resolved
 * against wherever the app is actually being served from (prod domain,
 * a preview deploy, or localhost) rather than a hardcoded origin. */
export function buildPlaylistShareUrl(playlistId) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?playlist=${playlistId}`;
}
