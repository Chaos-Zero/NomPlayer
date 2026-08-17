// Bandcamp track/album pages don't expose the numeric id their embed player
// needs (`bandcamp.com/EmbeddedPlayer/track=<id>/...`) anywhere in the URL,
// and Bandcamp's oEmbed endpoint is undocumented, doesn't reliably support
// CORS, and doesn't return track duration at all. So unlike YouTube/
// SoundCloud, resolving a Bandcamp link to embeddable metadata goes through
// our own server-side proxy (functions/api/bandcamp-resolve.js), which
// fetches the page and reads the `TralbumData` blob Bandcamp embeds in every
// track/album page for its own player to use.
//
// The canonical page URL itself (not the numeric id) is what we store as
// `videoId` / `external_id` - it's stable, human-recognizable, and doesn't
// require a resolve step just to record "this playlist has this link in it".
// The numeric id + duration are resolved once at add-time and cached
// alongside the entry so playback never needs to re-resolve.

const BANDCAMP_TRACK_OR_ALBUM_PATTERN = /^\/(track|album)\/([^/]+)\/?$/;

/**
 * Normalize a Bandcamp track/album URL to its canonical form (scheme +
 * artist subdomain + /track|album/<slug>, no query string/fragment).
 * Returns null if the input isn't a recognizable Bandcamp track/album URL.
 */
function normalizeBandcampUrl(rawValue) {
  if (!rawValue) return null;

  let url;
  try {
    url = new URL(rawValue);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname.endsWith('.bandcamp.com')) return null;

  const match = url.pathname.match(BANDCAMP_TRACK_OR_ALBUM_PATTERN);
  if (!match) return null;

  const [, kind, slug] = match;
  return {
    url: `https://${hostname}/${kind}/${slug}`,
    type: kind, // 'track' | 'album'
  };
}

/**
 * Parse a Bandcamp track or album URL.
 * Returns: { type: 'track'|'album', provider: 'bandcamp', videoId: <page url> }
 */
export function parseBandcampInput(input) {
  const str = (input || '').trim();
  if (!str) return null;

  const normalized = normalizeBandcampUrl(str);
  if (!normalized) return null;

  return {
    type: normalized.type,
    provider: 'bandcamp',
    videoId: normalized.url,
  };
}

/**
 * Resolve a Bandcamp page URL to embeddable metadata via our server-side
 * proxy. Returns null on failure (caller falls back to a bare entry using
 * just the page URL, same as YouTube's oEmbed-failure fallback elsewhere).
 */
export async function fetchBandcampMetadata(pageUrl) {
  try {
    const res = await fetch(
      `/api/bandcamp-resolve?url=${encodeURIComponent(pageUrl)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.embedId) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Build a single-track entry from a Bandcamp page URL, resolving embed id,
 * title, artist, artwork, and duration via the server-side proxy.
 */
export async function singleTrackEntry(pageUrl) {
  const meta = await fetchBandcampMetadata(pageUrl);

  if (!meta) {
    // Resolve failed - fall back to a bare entry so the link can still be
    // added; the player will retry resolving on playback.
    return {
      videoId: pageUrl,
      provider: 'bandcamp',
      title: pageUrl,
      thumbnail: '',
      channelTitle: '',
    };
  }

  return {
    videoId: pageUrl,
    provider: 'bandcamp',
    title: meta.title || pageUrl,
    thumbnail: meta.artworkUrl || '',
    channelTitle: meta.artist || '',
    embedId: meta.embedId,
    embedType: meta.embedType,
    durationSeconds: meta.durationSeconds || null,
  };
}
