// SoundCloud has no bare "id" a user can paste the way a YouTube video id
// works — a track's only public identifier is its permalink URL
// (soundcloud.com/<user>/<track-slug>). SoundCloud's embed widget and oEmbed
// endpoint both accept that permalink URL directly, so it doubles as our
// `videoId` for SoundCloud entries: no numeric-id resolution step needed,
// unlike Bandcamp (see bandcamp.js).

const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'm.soundcloud.com']);

// Reserved top-level paths that aren't `<user>/<track>` — a track permalink
// is always exactly two path segments, so most of these are already excluded
// by that shape check, but a couple (e.g. `for-you/discover`) legitimately
// have two segments too and would otherwise false-positive as a track.
const RESERVED_FIRST_SEGMENTS = new Set([
  'you',
  'stream',
  'discover',
  'charts',
  'library',
  'search',
  'settings',
  'notifications',
  'messages',
  'upload',
  'for-you',
  'trending',
  'tags',
]);

/**
 * Normalize a SoundCloud track URL to its canonical permalink form
 * (`https://soundcloud.com/<user>/<track-slug>`, no query string/fragment).
 * Returns null if the input isn't a recognizable SoundCloud track URL.
 *
 * Playlists ("sets", `/<user>/sets/<slug>`) and non-track pages are
 * deliberately not matched here — three-plus path segments fail the shape
 * check below. Support for those is a possible future extension, not v1.
 */
function normalizeSoundCloudTrackUrl(rawValue) {
  if (!rawValue) return null;

  let url;
  try {
    url = new URL(rawValue);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (!SOUNDCLOUD_HOSTS.has(hostname)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) return null;
  if (RESERVED_FIRST_SEGMENTS.has(segments[0].toLowerCase())) return null;

  return `https://soundcloud.com/${segments[0]}/${segments[1]}`;
}

/**
 * Parse a SoundCloud track URL.
 * Returns: { type: 'track', provider: 'soundcloud', videoId: <permalink> }
 */
export function parseSoundCloudInput(input) {
  const str = (input || '').trim();
  if (!str) return null;

  const permalink = normalizeSoundCloudTrackUrl(str);
  if (!permalink) return null;

  return { type: 'track', provider: 'soundcloud', videoId: permalink };
}

/**
 * Fetch a track's title/artist/artwork via SoundCloud's oEmbed endpoint.
 * No API key required; the endpoint supports CORS for browser fetches.
 * Falls back to a permalink-derived title if the request fails.
 */
export async function fetchOEmbedMetadata(permalinkUrl) {
  const fallback = {
    title: permalinkUrl.split('/').pop() || permalinkUrl,
    thumbnail: '',
    channelTitle: '',
  };

  try {
    const res = await fetch(
      `https://soundcloud.com/oembed?url=${encodeURIComponent(permalinkUrl)}&format=json`,
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      title: data.title || fallback.title,
      thumbnail: data.thumbnail_url || '',
      channelTitle: data.author_name || '',
    };
  } catch {
    return fallback;
  }
}

/**
 * Build a single-track entry from a SoundCloud permalink URL.
 * Fetches real metadata via oEmbed (no API key needed).
 */
export async function singleTrackEntry(permalinkUrl) {
  const { title, thumbnail, channelTitle } =
    await fetchOEmbedMetadata(permalinkUrl);
  return {
    videoId: permalinkUrl,
    provider: 'soundcloud',
    title,
    thumbnail,
    channelTitle,
  };
}
