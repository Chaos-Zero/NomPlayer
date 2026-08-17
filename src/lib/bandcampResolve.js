// Bandcamp track/album pages don't expose their embed player's numeric id,
// or a track's duration, anywhere a client could derive it from the URL
// alone. They do embed it for their own player to use, though: every
// track/album page ships a `<script data-tralbum="...">` tag (its value is
// HTML-entity-encoded JSON) plus a sibling `data-band="..."` tag, alongside
// standard OpenGraph meta tags for title/artwork. This is the same
// `data-tralbum` blob every third-party Bandcamp scraper/embed tool reads
// (undocumented, but stable and widely relied on).
//
// This module only extracts the handful of fields we need to build an
// embed src and cache display metadata - it does not attempt to be a
// general Bandcamp page parser.

const NAMED_HTML_ENTITIES = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
};

function decodeHtmlEntities(str) {
  return str.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const codePoint =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    }
    const replacement = NAMED_HTML_ENTITIES[entity.toLowerCase()];
    return replacement ?? match;
  });
}

/** Extract and JSON-parse a `data-<attrName>="..."` attribute's value. */
function extractJsonAttribute(html, attrName) {
  const match = html.match(new RegExp(`data-${attrName}="([^"]*)"`));
  if (!match) return null;
  try {
    return JSON.parse(decodeHtmlEntities(match[1]));
  } catch {
    return null;
  }
}

/** Extract an OpenGraph-style `<meta property="..." content="...">` value, tolerant of attribute order. */
function extractMetaProperty(html, property) {
  const tagMatch = html.match(
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*>`, 'i'),
  );
  if (!tagMatch) return null;
  const contentMatch = tagMatch[0].match(/content=["']([^"']*)["']/i);
  return contentMatch ? decodeHtmlEntities(contentMatch[1]) : null;
}

/**
 * Parse a Bandcamp track/album page's HTML into embeddable metadata.
 * `expectedType` ('track'|'album') comes from the already-validated URL
 * shape (see src/utils/bandcamp.js) rather than being re-derived from the
 * page, since the page path is the more reliable signal.
 *
 * Returns null if the page doesn't contain a recognizable data-tralbum
 * blob (e.g. it 404'd, or Bandcamp served something unexpected).
 */
export function parseBandcampPage(html, { expectedType = 'track' } = {}) {
  const tralbum = extractJsonAttribute(html, 'tralbum');
  const embedId = tralbum?.current?.id;
  if (!embedId) return null;

  const band = extractJsonAttribute(html, 'band');

  const title =
    tralbum.current?.title || extractMetaProperty(html, 'og:title') || null;
  const artist =
    band?.name || extractMetaProperty(html, 'og:site_name') || null;
  const artworkUrl = extractMetaProperty(html, 'og:image');

  // A duration only means something for a single track; an album embed
  // plays multiple tracks back to back, so there's no one number to
  // extrapolate an "ended" timer from - leave it null and let the player
  // fall back to manual skip for albums.
  let durationSeconds = null;
  // When a track belongs to an album, Bandcamp's own "Share/Embed" UI
  // generates a combined `album=<albumId>/track=<trackId>` embed src rather
  // than `track=<trackId>` alone - the track-only src still works, but
  // renders its "large" card layout more sparsely (see BandcampPlayer.jsx).
  let albumId = null;
  if (expectedType === 'track') {
    const rawDuration = tralbum.trackinfo?.[0]?.duration;
    if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
      durationSeconds = Math.round(rawDuration);
    }
    if (tralbum.current?.album_id) {
      albumId = String(tralbum.current.album_id);
    }
  }

  return {
    embedId: String(embedId),
    embedType: expectedType,
    albumId,
    title,
    artist,
    artworkUrl,
    durationSeconds,
  };
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Fetch a Bandcamp page and resolve it to embeddable metadata.
 * `parsedInput` is the result of parseBandcampInput() - its `type` tells
 * us whether we're resolving a track or an album page.
 * Throws on a non-ok fetch or an unparseable page; callers decide how to
 * surface that (see functions/api/bandcamp-resolve.js).
 */
export async function resolveBandcampUrl(
  pageUrl,
  parsedInput,
  { fetchImpl = fetch } = {},
) {
  const res = await fetchImpl(pageUrl, {
    headers: { 'user-agent': BROWSER_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Bandcamp page returned ${res.status}`);
  }

  const html = await res.text();
  const parsed = parseBandcampPage(html, { expectedType: parsedInput?.type });
  if (!parsed) {
    throw new Error(
      'Could not find embeddable track/album data on that Bandcamp page.',
    );
  }

  return parsed;
}
