import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchOEmbedMetadata,
  parseSoundCloudInput,
} from '../utils/soundcloud.js';

describe('parseSoundCloudInput', () => {
  it('parses a standard track permalink', () => {
    expect(
      parseSoundCloudInput('https://soundcloud.com/artist-name/track-name'),
    ).toEqual({
      type: 'track',
      provider: 'soundcloud',
      videoId: 'https://soundcloud.com/artist-name/track-name',
    });
  });

  it('strips query string and fragment', () => {
    expect(
      parseSoundCloudInput(
        'https://soundcloud.com/artist-name/track-name?si=abc123#t=30',
      ),
    ).toEqual({
      type: 'track',
      provider: 'soundcloud',
      videoId: 'https://soundcloud.com/artist-name/track-name',
    });
  });

  it('normalizes the m.soundcloud.com mobile host to the canonical domain', () => {
    expect(
      parseSoundCloudInput('https://m.soundcloud.com/artist-name/track-name'),
    ).toEqual({
      type: 'track',
      provider: 'soundcloud',
      videoId: 'https://soundcloud.com/artist-name/track-name',
    });
  });

  it('rejects a "sets" (playlist) URL — not supported yet', () => {
    expect(
      parseSoundCloudInput(
        'https://soundcloud.com/artist-name/sets/album-name',
      ),
    ).toBeNull();
  });

  it('rejects a reserved top-level page that happens to have two segments', () => {
    expect(
      parseSoundCloudInput('https://soundcloud.com/you/library'),
    ).toBeNull();
  });

  it('rejects a bare artist profile URL (one segment)', () => {
    expect(
      parseSoundCloudInput('https://soundcloud.com/artist-name'),
    ).toBeNull();
  });

  it('rejects a non-SoundCloud URL', () => {
    expect(parseSoundCloudInput('https://example.com/artist/track')).toBeNull();
  });

  it('rejects a YouTube URL', () => {
    expect(
      parseSoundCloudInput('https://www.youtube.com/watch?v=abc12345678'),
    ).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseSoundCloudInput('')).toBeNull();
    expect(parseSoundCloudInput('   ')).toBeNull();
  });
});

describe('fetchOEmbedMetadata', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns title/thumbnail/channelTitle from a successful oEmbed response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Great Track',
        thumbnail_url: 'https://i1.sndcdn.com/artworks-abc.jpg',
        author_name: 'Great Artist',
      }),
    });

    const result = await fetchOEmbedMetadata(
      'https://soundcloud.com/artist-name/track-name',
    );

    expect(result).toEqual({
      title: 'Great Track',
      thumbnail: 'https://i1.sndcdn.com/artworks-abc.jpg',
      channelTitle: 'Great Artist',
    });
  });

  it('falls back to a permalink-derived title when the request fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const result = await fetchOEmbedMetadata(
      'https://soundcloud.com/artist-name/track-name',
    );

    expect(result).toEqual({
      title: 'track-name',
      thumbnail: '',
      channelTitle: '',
    });
  });

  it('falls back gracefully when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await fetchOEmbedMetadata(
      'https://soundcloud.com/artist-name/track-name',
    );

    expect(result.title).toBe('track-name');
  });
});
