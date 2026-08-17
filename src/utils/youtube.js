const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
// A poster's link sometimes has a couple of stray characters tacked directly onto
// the id with no separator, e.g. `?v=t1bzqjoZyeQ38` (confirmed live: VGMC thread
// 81179417 post #11, the "38" isn't a valid part of any id, likely a lost `&t=38s`).
// YouTube's own watch page is lenient about this, it still resolves and plays
// `t1bzqjoZyeQ` regardless of what's tacked on after, so rejecting the link
// outright was too strict, confirmed via oembed on the truncated id. Accept a
// leading valid id plus a *short* id-charset tail: capped small so this can't
// reopen the actual bug VIDEO_ID_PATTERN was hardened against, a lost line break
// merging a whole extra `Game | Song | link` command into the tail. That's always
// much longer than a few characters and contains spaces/pipes, which this pattern
// doesn't allow, so it still gets rejected below.
//
// Deliberately NOT applied to a bare (non-URL) id string below, that leniency is
// specific to how a real browser resolves YouTube's `v=`/path segment, it has no
// equivalent for someone just typing/pasting a token, and being lenient there
// backfired immediately: a literal placeholder left in a post, `Youtube_Link` (12
// id-charset characters, no URL at all), was accepted as id `Youtube_Lin` and
// synced into a live playlist as a nomination for a video that doesn't exist.
const VIDEO_ID_WITH_TRAILING_JUNK_PATTERN =
  /^([A-Za-z0-9_-]{11})[A-Za-z0-9_-]{1,4}$/;

/** Only for a value pulled out of an actual URL (query param or path segment). */
function coerceVideoIdFromUrlPart(rawValue) {
  if (!rawValue) return null;
  if (VIDEO_ID_PATTERN.test(rawValue)) return rawValue;
  const match = rawValue.match(VIDEO_ID_WITH_TRAILING_JUNK_PATTERN);
  return match ? match[1] : null;
}

/**
 * Parse YouTube video ID or playlist ID from a URL or bare ID string.
 * Returns: { type: 'video'|'playlist', videoId?, playlistId? }
 */
export function parseYouTubeInput(input) {
  const str = (input || '').trim();
  if (!str) return null;

  try {
    const url = new URL(str);
    const listId = url.searchParams.get('list');
    // `URLSearchParams.get('v')` happily returns whatever's between `v=` and the
    // next `&` (or end of string) with no shape validation, so this only trusts
    // it once coerceVideoIdFromUrlPart has confirmed it's a real id (with at most
    // a short junk tail).
    const videoId = coerceVideoIdFromUrlPart(url.searchParams.get('v'));

    if (listId) return { type: 'playlist', playlistId: listId, videoId };
    if (videoId) return { type: 'video', videoId };

    // youtu.be short links
    if (url.hostname === 'youtu.be') {
      const vid = coerceVideoIdFromUrlPart(url.pathname.slice(1).split('?')[0]);
      if (vid) return { type: 'video', videoId: vid };
    }
  } catch {
    // Not a URL, treat as bare ID
    // Playlist IDs start with PL, RD, UU, LL, FL, OL, etc.
    if (/^(PL|RD|UU|LL|FL|OL|WL)[A-Za-z0-9_-]+$/.test(str)) {
      return { type: 'playlist', playlistId: str };
    }
    // Video ID: exactly 11 chars, no junk-tail leniency here, see the comment on
    // VIDEO_ID_WITH_TRAILING_JUNK_PATTERN above.
    if (VIDEO_ID_PATTERN.test(str)) {
      return { type: 'video', videoId: str };
    }
  }

  return null;
}

export function getYouTubeThumbnailUrl(videoId, quality = 'mqdefault') {
  const normalizedVideoId = typeof videoId === 'string' ? videoId.trim() : '';
  if (!VIDEO_ID_PATTERN.test(normalizedVideoId)) {
    return '';
  }

  const normalizedQuality =
    typeof quality === 'string' && quality.trim()
      ? quality.trim()
      : 'mqdefault';

  return `https://i.ytimg.com/vi/${normalizedVideoId}/${normalizedQuality}.jpg`;
}

/**
 * Fetch all items from a YouTube playlist via Data API v3.
 * Requires VITE_YT_API_KEY environment variable.
 */
export async function fetchPlaylistItems(playlistId, apiKey) {
  if (!apiKey) throw new Error('NO_API_KEY');

  const results = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId,
      maxResults: '50',
      key: apiKey,
      ...(pageToken ? { pageToken } : {}),
    });

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message || 'YouTube API error');
    }
    const data = await res.json();

    for (const item of data.items || []) {
      const snippet = item.snippet;
      const videoId = snippet?.resourceId?.videoId;
      if (
        !videoId ||
        snippet?.title === 'Deleted video' ||
        snippet?.title === 'Private video'
      )
        continue;
      results.push({
        videoId,
        title: snippet.title,
        thumbnail:
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          getYouTubeThumbnailUrl(videoId),
        channelTitle: snippet.videoOwnerChannelTitle || '',
      });
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return results;
}

/**
 * Fetch a video's title via YouTube oEmbed, no API key required.
 * Falls back to videoId if the request fails.
 */
export async function fetchOEmbedTitle(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (!res.ok) return videoId;
    const data = await res.json();
    return data.title || videoId;
  } catch {
    return videoId;
  }
}

/**
 * Build a single-video entry from a videoId.
 * Fetches the real title via oEmbed (no API key needed).
 */
export async function singleVideoEntry(videoId) {
  const title = await fetchOEmbedTitle(videoId);
  return {
    videoId,
    title,
    thumbnail: getYouTubeThumbnailUrl(videoId),
    channelTitle: '',
  };
}

/**
 * Format a duration in seconds to a human-readable string (M:SS).
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
