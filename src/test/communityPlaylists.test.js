import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildPlaylistShareUrl,
  fetchPlaylistMeta,
  fetchPlaylistTracks,
} from '../lib/communityPlaylists.js';

function makeSupabase({
  metaData = null,
  metaError = null,
  tracksData = [],
} = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'user_playlists') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: metaData,
            error: metaError,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: tracksData, error: null }),
      };
    }),
  };
}

describe('fetchPlaylistMeta', () => {
  it('returns the playlist row when it exists and is readable', async () => {
    const supabase = makeSupabase({
      metaData: {
        id: 'pl-1',
        name: 'Chill Mix',
        is_public: true,
        user_id: 'u1',
      },
    });
    const meta = await fetchPlaylistMeta(supabase, 'pl-1');
    expect(meta).toEqual({
      id: 'pl-1',
      name: 'Chill Mix',
      is_public: true,
      user_id: 'u1',
    });
  });

  it('returns null for a private/deleted playlist rather than throwing, RLS just hides the row', async () => {
    const supabase = makeSupabase({ metaData: null });
    const meta = await fetchPlaylistMeta(supabase, 'does-not-exist');
    expect(meta).toBeNull();
  });

  it('throws on a genuine query error', async () => {
    const supabase = makeSupabase({ metaError: new Error('boom') });
    await expect(fetchPlaylistMeta(supabase, 'pl-1')).rejects.toThrow('boom');
  });
});

describe('fetchPlaylistTracks', () => {
  it('maps catalog-backed tracks using their primary source', async () => {
    const supabase = makeSupabase({
      tracksData: [
        {
          id: 'pt-1',
          track_id: 'track-1',
          tracks: {
            canonical_game_title: 'Some Game',
            canonical_track_title: 'Some Song',
            track_sources: [
              {
                provider: 'youtube',
                external_id: 'aaaaaaaaaaa',
                is_primary: true,
              },
            ],
          },
        },
      ],
    });
    const tracks = await fetchPlaylistTracks(supabase, 'pl-1');
    expect(tracks).toEqual([
      expect.objectContaining({
        videoId: 'aaaaaaaaaaa',
        trackId: 'track-1',
        gameTitle: 'Some Game',
        trackTitle: 'Some Song',
      }),
    ]);
  });

  it('maps ad-hoc (non-catalog) tracks from their cached fields', async () => {
    const supabase = makeSupabase({
      tracksData: [
        {
          id: 'pt-2',
          track_id: null,
          provider: 'youtube',
          external_id: 'bbbbbbbbbbb',
          cached_title: 'Some Video',
          cached_channel: 'Some Channel',
        },
      ],
    });
    const tracks = await fetchPlaylistTracks(supabase, 'pl-1');
    expect(tracks).toEqual([
      expect.objectContaining({
        videoId: 'bbbbbbbbbbb',
        trackId: null,
        title: 'Some Video',
        channelTitle: 'Some Channel',
      }),
    ]);
  });

  it('returns an empty list for a playlist with no tracks', async () => {
    const supabase = makeSupabase({ tracksData: [] });
    expect(await fetchPlaylistTracks(supabase, 'pl-1')).toEqual([]);
  });
});

describe('buildPlaylistShareUrl', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete window.location;
    window.location = new URL('https://nomplayer.app/app/');
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('builds the link from the page currently being served, not a hardcoded origin', () => {
    expect(buildPlaylistShareUrl('pl-1')).toBe(
      'https://nomplayer.app/app/?playlist=pl-1',
    );
  });
});
