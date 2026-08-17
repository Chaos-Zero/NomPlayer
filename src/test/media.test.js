import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMediaItems,
  getMediaThumbnailUrl,
  parseMediaInput,
} from '../utils/media.js';

describe('parseMediaInput', () => {
  it('recognizes a YouTube watch URL', () => {
    expect(
      parseMediaInput('https://www.youtube.com/watch?v=abc12345678'),
    ).toEqual({
      type: 'video',
      videoId: 'abc12345678',
    });
  });

  it('recognizes a bare YouTube video id', () => {
    expect(parseMediaInput('abc12345678')).toEqual({
      type: 'video',
      videoId: 'abc12345678',
    });
  });

  it('recognizes a SoundCloud track URL', () => {
    expect(
      parseMediaInput('https://soundcloud.com/artist-name/track-name'),
    ).toEqual({
      type: 'track',
      provider: 'soundcloud',
      videoId: 'https://soundcloud.com/artist-name/track-name',
    });
  });

  it('recognizes a Bandcamp track URL', () => {
    expect(
      parseMediaInput('https://artistname.bandcamp.com/track/song-title'),
    ).toEqual({
      type: 'track',
      provider: 'bandcamp',
      videoId: 'https://artistname.bandcamp.com/track/song-title',
    });
  });

  it('returns null for an unrecognized URL', () => {
    expect(parseMediaInput('https://example.com/whatever')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseMediaInput('')).toBeNull();
  });
});

describe('fetchMediaItems', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns an empty result for a null parse', async () => {
    expect(await fetchMediaItems(null)).toEqual({
      items: [],
      startVideoId: null,
    });
  });

  it('resolves a single YouTube video and tags it with provider', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'My Video' }),
    });

    const { items, startVideoId } = await fetchMediaItems({
      type: 'video',
      videoId: 'abc12345678',
    });

    expect(startVideoId).toBe('abc12345678');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      videoId: 'abc12345678',
      provider: 'youtube',
      title: 'My Video',
    });
  });

  it('resolves a single SoundCloud track', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Great Track',
        thumbnail_url: 'https://i1.sndcdn.com/artworks-abc.jpg',
        author_name: 'Great Artist',
      }),
    });

    const { items, startVideoId } = await fetchMediaItems({
      type: 'track',
      provider: 'soundcloud',
      videoId: 'https://soundcloud.com/artist-name/track-name',
    });

    expect(startVideoId).toBe('https://soundcloud.com/artist-name/track-name');
    expect(items).toEqual([
      {
        videoId: 'https://soundcloud.com/artist-name/track-name',
        provider: 'soundcloud',
        title: 'Great Track',
        thumbnail: 'https://i1.sndcdn.com/artworks-abc.jpg',
        channelTitle: 'Great Artist',
      },
    ]);
  });

  it('resolves a single Bandcamp track', async () => {
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

    const { items, startVideoId } = await fetchMediaItems({
      type: 'track',
      provider: 'bandcamp',
      videoId: 'https://artistname.bandcamp.com/track/song-title',
    });

    expect(startVideoId).toBe(
      'https://artistname.bandcamp.com/track/song-title',
    );
    expect(items[0]).toMatchObject({
      provider: 'bandcamp',
      embedId: '1234567890',
      durationSeconds: 210,
    });
  });
});

describe('getMediaThumbnailUrl', () => {
  it('returns null-safe empty string for a missing video', () => {
    expect(getMediaThumbnailUrl(null)).toBe('');
  });

  it('prefers a cached thumbnail over any provider fallback', () => {
    expect(
      getMediaThumbnailUrl({
        provider: 'bandcamp',
        videoId: 'x',
        thumbnail: 'https://cached.example/art.jpg',
      }),
    ).toBe('https://cached.example/art.jpg');
  });

  it('falls back to the YouTube CDN pattern when provider is youtube (or unset) with no cached thumbnail', () => {
    expect(getMediaThumbnailUrl({ videoId: 'abc12345678' })).toBe(
      'https://i.ytimg.com/vi/abc12345678/mqdefault.jpg',
    );
    expect(
      getMediaThumbnailUrl({ provider: 'youtube', videoId: 'abc12345678' }),
    ).toBe('https://i.ytimg.com/vi/abc12345678/mqdefault.jpg');
  });

  it('returns empty string for a non-YouTube provider with no cached thumbnail', () => {
    expect(
      getMediaThumbnailUrl({
        provider: 'soundcloud',
        videoId: 'https://soundcloud.com/a/b',
      }),
    ).toBe('');
  });
});
