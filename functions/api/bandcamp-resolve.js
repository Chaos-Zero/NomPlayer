import { parseBandcampInput } from '../../src/utils/bandcamp.js';
import { resolveBandcampUrl } from '../../src/lib/bandcampResolve.js';

// Resolves a Bandcamp track/album page to embeddable metadata (numeric
// embed id, title, artist, artwork, duration). Runs server-side because
// Bandcamp's page isn't fetchable cross-origin from the browser and its
// oEmbed endpoint doesn't expose duration at all - see src/lib/
// bandcampResolve.js for how the page itself is parsed.
//
// `parseBandcampInput` also doubles as this endpoint's allow-list: only a
// URL that already matches the `*.bandcamp.com/track|album/<slug>` shape is
// fetched, so this can't be used as an open URL-fetching proxy.
export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const targetUrl = requestUrl.searchParams.get('url') || '';

  const parsedInput = parseBandcampInput(targetUrl);
  if (!parsedInput) {
    return Response.json(
      { error: 'A valid Bandcamp track or album URL is required.' },
      { status: 400 },
    );
  }

  try {
    const resolved = await resolveBandcampUrl(parsedInput.videoId, parsedInput);
    return Response.json(resolved, {
      headers: {
        // Bandcamp track/album metadata is effectively static once
        // published, so this is safe to cache aggressively at the edge.
        'cache-control': 'public, max-age=0, s-maxage=86400',
      },
    });
  } catch (error) {
    return Response.json(
      { error: error.message || 'Failed to resolve Bandcamp link.' },
      { status: 502 },
    );
  }
}
