import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBandcampMetadata,
  parseBandcampInput,
  singleTrackEntry,
} from '../utils/bandcamp.js';

describe('parseBandcampInput', () => {
  it('parses a track URL on an artist subdomain', () => {
    expect(
      parseBandcampInput('https://artistname.bandcamp.com/track/song-title'),
    ).toEqual({
      type: 'track',
      provider: 'bandcamp',
      videoId: 'https://artistname.bandcamp.com/track/song-title',
    });
  });

  it('parses an album URL', () => {
    expect(
      parseBandcampInput('https://artistname.bandcamp.com/album/album-title'),
    ).toEqual({
      type: 'album',
      provider: 'bandcamp',
      videoId: 'https://artistname.bandcamp.com/album/album-title',
    });
  });

  it('strips query string and fragment', () => {
    expect(
      parseBandcampInput(
        'https://artistname.bandcamp.com/track/song-title?from=search&x=1#comments',
      ),
    ).toEqual({
      type: 'track',
      provider: 'bandcamp',
      videoId: 'https://artistname.bandcamp.com/track/song-title',
    });
  });

  it('rejects the bare artist homepage (no /track/ or /album/ segment)', () => {
    expect(parseBandcampInput('https://artistname.bandcamp.com/')).toBeNull();
  });

  it('rejects the bare bandcamp.com domain (no artist subdomain)', () => {
    expect(
      parseBandcampInput('https://bandcamp.com/track/song-title'),
    ).toBeNull();
  });

  it('rejects a non-Bandcamp URL', () => {
    expect(
      parseBandcampInput('https://example.com/track/song-title'),
    ).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseBandcampInput('')).toBeNull();
    expect(parseBandcampInput('   ')).toBeNull();
  });
});

describe('fetchBandcampMetadata', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('calls our server-side resolve proxy and returns its JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embedId: '1234567890',
        embedType: 'track',
        title: 'Song Title',
        artist: 'Artist Name',
        artworkUrl: 'https://f4.bcbits.com/img/a1234567890_10.jpg',
        durationSeconds: 210,
      }),
    });

    const result = await fetchBandcampMetadata(
      'https://artistname.bandcamp.com/track/song-title',
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/bandcamp-resolve?url=' +
        encodeURIComponent('https://artistname.bandcamp.com/track/song-title'),
    );
    expect(result.embedId).toBe('1234567890');
    expect(result.durationSeconds).toBe(210);
  });

  it('returns null when the proxy responds with an error status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(
      await fetchBandcampMetadata(
        'https://artistname.bandcamp.com/track/song-title',
      ),
    ).toBeNull();
  });

  it('returns null when the proxy response has no embedId', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Song Title' }),
    });
    expect(
      await fetchBandcampMetadata(
        'https://artistname.bandcamp.com/track/song-title',
      ),
    ).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    expect(
      await fetchBandcampMetadata(
        'https://artistname.bandcamp.com/track/song-title',
      ),
    ).toBeNull();
  });
});

describe('singleTrackEntry', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('builds a full entry when resolve succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embedId: '1234567890',
        embedType: 'track',
        title: 'Song Title',
        artist: 'Artist Name',
        artworkUrl: 'https://f4.bcbits.com/img/a1234567890_10.jpg',
        durationSeconds: 210,
      }),
    });

    const entry = await singleTrackEntry(
      'https://artistname.bandcamp.com/track/song-title',
    );

    expect(entry).toEqual({
      videoId: 'https://artistname.bandcamp.com/track/song-title',
      provider: 'bandcamp',
      title: 'Song Title',
      thumbnail: 'https://f4.bcbits.com/img/a1234567890_10.jpg',
      channelTitle: 'Artist Name',
      embedId: '1234567890',
      embedType: 'track',
      durationSeconds: 210,
    });
  });

  it('falls back to a bare entry keyed off the page URL when resolve fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const entry = await singleTrackEntry(
      'https://artistname.bandcamp.com/track/song-title',
    );

    expect(entry).toEqual({
      videoId: 'https://artistname.bandcamp.com/track/song-title',
      provider: 'bandcamp',
      title: 'https://artistname.bandcamp.com/track/song-title',
      thumbnail: '',
      channelTitle: '',
    });
  });
});
