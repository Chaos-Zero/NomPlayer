const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

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
    // next `&` (or end of string) with no shape validation — if the input has no
    // `&` at all (e.g. a "link" that accidentally swallowed unrelated trailing
    // text — found live from a VGMC nomination post whose line breaks got lost
    // upstream), that's the *entire* rest of the string, not an 11-char id. Only
    // trust it once it actually looks like one.
    const rawVideoId = url.searchParams.get('v');
    const videoId =
      rawVideoId && VIDEO_ID_PATTERN.test(rawVideoId) ? rawVideoId : null;

    if (listId) return { type: 'playlist', playlistId: listId, videoId };
    if (videoId) return { type: 'video', videoId };

    // youtu.be short links
    if (url.hostname === 'youtu.be') {
      const vid = url.pathname.slice(1).split('?')[0];
      if (vid && VIDEO_ID_PATTERN.test(vid))
        return { type: 'video', videoId: vid };
    }
  } catch {
    // Not a URL — treat as bare ID
    // Playlist IDs start with PL, RD, UU, LL, FL, OL, etc.
    if (/^(PL|RD|UU|LL|FL|OL|WL)[A-Za-z0-9_-]+$/.test(str)) {
      return { type: 'playlist', playlistId: str };
    }
    // Video ID: 11 chars
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
 * Fetch a video's title via YouTube oEmbed — no API key required.
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
