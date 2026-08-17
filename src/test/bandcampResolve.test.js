import { describe, expect, it } from 'vitest';
import {
  parseBandcampPage,
  resolveBandcampUrl,
} from '../lib/bandcampResolve.js';

function buildFixtureHtml({ tralbum, band, meta = {} }) {
  const encode = (value) =>
    JSON.stringify(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const metaTags = Object.entries(meta)
    .map(
      ([property, content]) =>
        `<meta property="${property}" content="${content}">`,
    )
    .join('\n');

  return `
    <!doctype html>
    <html>
      <head>
        ${metaTags}
      </head>
      <body>
        <script data-tralbum="${encode(tralbum)}" data-band="${encode(band)}"></script>
      </body>
    </html>
  `;
}

describe('parseBandcampPage', () => {
  it('extracts embed id, title, artist, artwork, and duration for a track page', () => {
    const html = buildFixtureHtml({
      tralbum: {
        current: { id: 1234567890, title: 'Song Title' },
        trackinfo: [{ id: 1234567890, duration: 245.71 }],
      },
      band: { id: 987, name: 'Artist Name' },
      meta: {
        'og:title': 'Song Title, by Artist Name',
        'og:site_name': 'Artist Name',
        'og:image': 'https://f4.bcbits.com/img/a1234567890_10.jpg',
      },
    });

    expect(parseBandcampPage(html, { expectedType: 'track' })).toEqual({
      embedId: '1234567890',
      embedType: 'track',
      albumId: null,
      title: 'Song Title',
      artist: 'Artist Name',
      artworkUrl: 'https://f4.bcbits.com/img/a1234567890_10.jpg',
      durationSeconds: 246,
    });
  });

  it('extracts album_id for a track that belongs to an album', () => {
    const html = buildFixtureHtml({
      tralbum: {
        current: { id: 1234567890, title: 'Song Title', album_id: 42 },
        trackinfo: [{ duration: 100 }],
      },
      band: { name: 'Artist Name' },
    });

    expect(parseBandcampPage(html, { expectedType: 'track' })).toMatchObject({
      albumId: '42',
    });
  });

  it('leaves albumId null for a standalone track (not part of an album)', () => {
    const html = buildFixtureHtml({
      tralbum: {
        current: { id: 1234567890, title: 'Song Title' },
        trackinfo: [{ duration: 100 }],
      },
      band: { name: 'Artist Name' },
    });

    expect(parseBandcampPage(html, { expectedType: 'track' })).toMatchObject({
      albumId: null,
    });
  });

  it('does not extract albumId for an album embed itself', () => {
    const html = buildFixtureHtml({
      tralbum: {
        current: { id: 42, album_id: 42 },
        trackinfo: [{ duration: 200 }, { duration: 180 }],
      },
      band: { name: 'Artist Name' },
    });

    expect(parseBandcampPage(html, { expectedType: 'album' })).toMatchObject({
      albumId: null,
    });
  });

  it('falls back to OpenGraph meta tags when data-band or tralbum titles are missing', () => {
    const html = buildFixtureHtml({
      tralbum: { current: { id: 555 }, trackinfo: [{ duration: 100 }] },
      band: {},
      meta: {
        'og:title': 'Fallback Title',
        'og:site_name': 'Fallback Artist',
        'og:image': 'https://f4.bcbits.com/img/a000000555_10.jpg',
      },
    });

    expect(parseBandcampPage(html, { expectedType: 'track' })).toMatchObject({
      title: 'Fallback Title',
      artist: 'Fallback Artist',
    });
  });

  it('does not attribute a single duration to an album embed', () => {
    const html = buildFixtureHtml({
      tralbum: {
        current: { id: 42 },
        trackinfo: [{ duration: 200 }, { duration: 180 }],
      },
      band: { name: 'Artist Name' },
      meta: {
        'og:title': 'Album Title',
        'og:image': 'https://f4.bcbits.com/img/a42_10.jpg',
      },
    });

    const result = parseBandcampPage(html, { expectedType: 'album' });
    expect(result.embedType).toBe('album');
    expect(result.durationSeconds).toBeNull();
  });

  it('returns null when the page has no data-tralbum blob at all', () => {
    expect(parseBandcampPage('<html><body>Not found</body></html>')).toBeNull();
  });

  it('returns null when data-tralbum is present but has no current.id', () => {
    const html = buildFixtureHtml({ tralbum: { current: {} }, band: {} });
    expect(parseBandcampPage(html)).toBeNull();
  });

  it('decodes HTML-entity-escaped characters inside titles', () => {
    const html = buildFixtureHtml({
      tralbum: {
        current: { id: 7, title: 'Rock & Roll "Anthem"' },
        trackinfo: [{ duration: 60 }],
      },
      band: { name: "Artist's Band" },
    });

    expect(parseBandcampPage(html, { expectedType: 'track' })).toMatchObject({
      title: 'Rock & Roll "Anthem"',
      artist: "Artist's Band",
    });
  });
});

describe('resolveBandcampUrl', () => {
  it('fetches the page and returns parsed metadata', async () => {
    const html = buildFixtureHtml({
      tralbum: {
        current: { id: 1, title: 'Song Title' },
        trackinfo: [{ duration: 120 }],
      },
      band: { name: 'Artist Name' },
      meta: { 'og:image': 'https://f4.bcbits.com/img/a1_10.jpg' },
    });

    const fetchImpl = async (url) => {
      expect(url).toBe('https://artistname.bandcamp.com/track/song-title');
      return { ok: true, status: 200, text: async () => html };
    };

    const result = await resolveBandcampUrl(
      'https://artistname.bandcamp.com/track/song-title',
      { type: 'track' },
      { fetchImpl },
    );

    expect(result).toMatchObject({ embedId: '1', title: 'Song Title' });
  });

  it('throws when the page fetch fails', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404 });

    await expect(
      resolveBandcampUrl(
        'https://artistname.bandcamp.com/track/song-title',
        { type: 'track' },
        { fetchImpl },
      ),
    ).rejects.toThrow('404');
  });

  it('throws when the page has no resolvable tralbum data', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () => '<html><body>nope</body></html>',
    });

    await expect(
      resolveBandcampUrl(
        'https://artistname.bandcamp.com/track/song-title',
        { type: 'track' },
        { fetchImpl },
      ),
    ).rejects.toThrow(/embeddable track\/album data/);
  });
});
