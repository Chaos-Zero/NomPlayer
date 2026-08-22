import { getMediaThumbnailUrl } from '../utils/media.js';

// Backs the live VGMC standings homepage view. The scoring itself is computed
// server-side (src/lib/vgmcIngest.js) and persisted onto user_playlist_tracks by
// reconcile_vgmc_playlist, this module just reads that back and shapes it for the
// UI. Everything here is a plain read against RLS (public playlists are readable by
// anyone), so there's no new API surface for this feature.

/** Plain select against the VGMC playlist's tracks, ordered as nominated. */
export async function fetchVgmcPlaylistTracks(supabase, playlistId) {
  if (!supabase || !playlistId) return [];

  const { data, error } = await supabase
    .from('user_playlist_tracks')
    .select(
      'id, track_id, provider, external_id, cached_title, nomination_game, nomination_song, support_points, support_voters, is_dropped, order_index',
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
    videoId: row.external_id,
    provider: row.provider || 'youtube',
    title: row.cached_title || 'Untitled track',
    game: row.nomination_game || null,
    song: row.nomination_song || null,
    supportPoints: Number.isFinite(row.support_points) ? row.support_points : 0,
    // Distinct authors behind supportPoints, see support_voters on
    // buildReconcileEntries (src/lib/vgmcIngest.js). Older rows synced before
    // that column existed read as 0 here rather than throwing the row out.
    supportVoters: Number.isFinite(row.support_voters) ? row.support_voters : 0,
    orderIndex: Number.isFinite(row.order_index) ? row.order_index : 0,
  };
}

/** Maps playlist-track rows to the {videoId, title, thumbnail, channelTitle,
 * gameTitle, trackTitle, displayTitle, supportPoints, loadIndex} shape the rest
 * of the app already uses for playlist entries, in nomination order.
 *
 * gameTitle/trackTitle come straight off nomination_game/nomination_song
 * (populated correctly server-side by reconcile_vgmc_playlist), this used to
 * only carry the combined `cached_title` display string and nothing else,
 * which is why every VGMC track showed up as "Metadata Needed" wherever
 * something (the sidebar, the GameFAQs export formatter) needed the game/song
 * split individually rather than the single display string.
 *
 * isDropped mirrors is_dropped, set server-side by reconcile_vgmc_playlist
 * once a nomination's owner drops it and its support points fall to zero
 * (see isRecordActive in src/lib/vgmcIngest.js). Dropped rows are included
 * here unconditionally, same as every other row, whether they're actually
 * shown/played is a display-time decision the caller makes (App.jsx's
 * sidebarTracks/playingTracks, gated behind the "show dropped nominations"
 * toggle), not something this mapping filters. */
export function toPlaylistVideos(rows) {
  return (rows || [])
    .filter((row) => row && row.external_id)
    .map((row) => ({
      videoId: row.external_id,
      provider: row.provider || 'youtube',
      title: row.cached_title || 'Untitled track',
      displayTitle: row.cached_title || '',
      gameTitle: row.nomination_game || '',
      trackTitle: row.nomination_song || '',
      thumbnail: getMediaThumbnailUrl({
        provider: row.provider,
        videoId: row.external_id,
      }),
      channelTitle: '',
      // The catalog track this nomination was promoted to (reconcile_vgmc_playlist
      // links it), this is what a personal rating is actually keyed by
      // (track_user_feedback.track_id), not the video id.
      trackId: row.track_id || null,
      supportPoints: Number.isFinite(row.support_points)
        ? row.support_points
        : 0,
      isDropped: Boolean(row.is_dropped),
      loadIndex: Number.isFinite(row.order_index) ? row.order_index : 0,
    }));
}

/**
 * videoId -> {points, voters} for every row with a real second supporter
 * behind it, straight off the live GameFAQs VGMC thread (see vgmcIngest.js).
 * A lone voter is just the nominator (worth 1 point normally, or 2 via a
 * "++" self-nomination), neither of which is an actual second person backing
 * the song yet, so those are left out here too, same rule as
 * partitionStandings' own qualifying filter below, just keyed for a badge
 * lookup instead of a section split. Shared by every place that shows the
 * GameFAQs badge (HomePage.jsx's leaderboard, App.jsx's enriched
 * nominations/support lists feeding FavouritesPanel.jsx) so the "does this
 * track get a badge" rule only lives in one place.
 */
export function buildVgmcSupportPointsByVideoId(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.external_id) continue;
    const points = Number.isFinite(row.support_points) ? row.support_points : 0;
    const voters = Number.isFinite(row.support_voters) ? row.support_voters : 0;
    if (points <= 0 || voters <= 1) continue;
    map.set(row.external_id, { points, voters });
  }
  return map;
}

/**
 * Splits playlist-track rows into the two standings views: `standings` is
 * every song with more than 1 but fewer than 7 support points (this includes
 * a nomination submitted with `++`, which starts at 2), sorted highest-first;
 * `locked` is everything at 7+. Disjoint tabs, once a song locks in it moves
 * out of Current Standings entirely rather than continuing to show in both.
 *
 * Sort is points first (that's the section a song lands in, see
 * VgmcStandingsView's "N Supports" section headers), then, within a tied
 * point total, by supporterCount descending, since two songs can reach the
 * same point total from a different number of people (e.g. one ++ vs two
 * +'s), and the one more people backed should rank higher. Nomination order
 * is the final tiebreak, for songs tied on both.
 */
export function partitionStandings(rows) {
  const qualifying = (rows || [])
    .filter((row) => row && row.external_id)
    .map(normalizeRow)
    .filter((row) => row.supportPoints > 1)
    .sort(
      (a, b) =>
        b.supportPoints - a.supportPoints ||
        b.supportVoters - a.supportVoters ||
        a.orderIndex - b.orderIndex,
    );

  return {
    standings: qualifying.filter((row) => row.supportPoints < 7),
    locked: qualifying.filter((row) => row.supportPoints >= 7),
  };
}
