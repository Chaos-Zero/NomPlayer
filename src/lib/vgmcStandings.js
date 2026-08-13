import { getYouTubeThumbnailUrl } from '../utils/youtube.js';

// Backs the live VGMC standings homepage view. The scoring itself is computed
// server-side (src/lib/vgmcIngest.js) and persisted onto user_playlist_tracks by
// reconcile_vgmc_playlist — this module just reads that back and shapes it for the
// UI. Everything here is a plain read against RLS (public playlists are readable by
// anyone), so there's no new API surface for this feature.

/** Plain select against the VGMC playlist's tracks, ordered as nominated. */
export async function fetchVgmcPlaylistTracks(supabase, playlistId) {
  if (!supabase || !playlistId) return [];

  const { data, error } = await supabase
    .from('user_playlist_tracks')
    .select(
      'id, youtube_video_id, cached_title, nomination_game, nomination_song, support_points, order_index',
    )
    .eq('playlist_id', playlistId)
    .order('order_index', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

function normalizeRow(row) {
  return {
    id: row.id,
    videoId: row.youtube_video_id,
    title: row.cached_title || 'Untitled track',
    game: row.nomination_game || null,
    song: row.nomination_song || null,
    supportPoints: Number.isFinite(row.support_points) ? row.support_points : 0,
    orderIndex: Number.isFinite(row.order_index) ? row.order_index : 0,
  };
}

/** Maps playlist-track rows to the {videoId, title, thumbnail, channelTitle} shape
 * the rest of the app already uses for playlist entries, in nomination order. */
export function toPlaylistVideos(rows) {
  return (rows || [])
    .filter((row) => row && row.youtube_video_id)
    .map((row) => ({
      videoId: row.youtube_video_id,
      title: row.cached_title || 'Untitled track',
      thumbnail: getYouTubeThumbnailUrl(row.youtube_video_id),
      channelTitle: '',
    }));
}

/**
 * Splits playlist-track rows into the two standings views: `standings` is every
 * song with more than 1 support point (this includes a nomination submitted with
 * `++`, which starts at 2), sorted highest-first; `locked` is the subset at 7+
 * points. Locked is a filtered view of standings, not a separate bucket — a song
 * can appear in both.
 */
export function partitionStandings(rows) {
  const qualifying = (rows || [])
    .filter((row) => row && row.youtube_video_id)
    .map(normalizeRow)
    .filter((row) => row.supportPoints > 1)
    .sort(
      (a, b) =>
        b.supportPoints - a.supportPoints || a.orderIndex - b.orderIndex,
    );

  return {
    standings: qualifying,
    locked: qualifying.filter((row) => row.supportPoints >= 7),
  };
}
