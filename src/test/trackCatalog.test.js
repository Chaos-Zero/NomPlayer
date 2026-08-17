import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// getFullCatalog seeds its module-level cache from a dynamic import of the
// real catalog snapshot — mock it so patchCatalogCache/bulkUpdateTracks/
// mergeTracks tests below get a small, deterministic seed instead of
// depending on (or touching) any real data or database.
vi.mock('../data/catalogSnapshot.json', () => ({
  default: {
    exportedAt: '2020-01-01T00:00:00.000Z',
    tracks: [
      {
        track_id: 'track-1',
        provider: 'youtube',
        source_external_id: 'a1234567890',
        game_title: 'Game A',
        track_title: 'Song A',
        display_title: 'Game A - Song A',
        source_url: 'https://www.youtube.com/watch?v=a1234567890',
        submitted_url: 'https://www.youtube.com/watch?v=a1234567890',
        is_retired: false,
        tournaments: [],
      },
      {
        track_id: 'track-2',
        provider: 'bandcamp',
        source_external_id: 'https://artist.bandcamp.com/track/song-b',
        game_title: 'Game B',
        track_title: 'Song B',
        display_title: 'Game B - Song B',
        source_url: 'https://artist.bandcamp.com/track/song-b',
        submitted_url: 'https://artist.bandcamp.com/track/song-b',
        is_retired: false,
        tournaments: [],
      },
    ],
  },
}));

import {
  bulkUpdateTracks,
  clearCatalogCache,
  createTrackIngestPayload,
  fetchTrackCatalogByVideoIds,
  getCachedCatalog,
  getFullCatalog,
  getTrackCatalogTournamentSummary,
  ingestTrackSources,
  mapTrackCatalogEntryToVideo,
  mergeTracks,
  patchCatalogCache,
  searchTrackCatalog,
} from '../lib/trackCatalog.js';

/** Chainable, thenable mock matching supabase-js's query builder shape —
 * every .eq() call returns the same builder, and awaiting the builder at
 * any point in the chain resolves to `result`. */
function makeUpdateBuilder(result) {
  const builder = {
    eq: vi.fn(() => builder),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe('track catalog helpers', () => {
  it('builds a deduplicated ingest payload from YouTube video entries', () => {
    const payload = createTrackIngestPayload([
      {
        videoId: 'a1234567890',
        title: 'Alpha',
        thumbnail: 'a.jpg',
        channelTitle: 'Channel A',
      },
      {
        videoId: 'a1234567890',
        title: 'Alpha duplicate',
        thumbnail: 'a2.jpg',
        channelTitle: 'Channel B',
      },
      {
        videoId: 'bad-id',
        title: 'Ignored',
      },
      {
        videoId: 'b1234567890',
        title: 'Beta',
        thumbnail: '',
        channelTitle: '',
      },
    ]);

    expect(payload).toEqual([
      {
        provider: 'youtube',
        external_id: 'a1234567890',
        cached_title: 'Alpha',
        cached_channel_title: 'Channel A',
        cached_thumbnail_url: 'a.jpg',
        cached_duration_seconds: null,
        submitted_url: 'https://www.youtube.com/watch?v=a1234567890',
      },
      {
        provider: 'youtube',
        external_id: 'b1234567890',
        cached_title: 'Beta',
        cached_channel_title: null,
        cached_thumbnail_url: null,
        cached_duration_seconds: null,
        submitted_url: 'https://www.youtube.com/watch?v=b1234567890',
      },
    ]);
  });

  it('builds an ingest payload entry for a non-YouTube provider, keyed by (provider, id)', () => {
    const payload = createTrackIngestPayload([
      {
        videoId: 'https://artist.bandcamp.com/track/song',
        provider: 'bandcamp',
        title: 'Song Title',
        channelTitle: 'Artist Name',
        thumbnail: 'https://f4.bcbits.com/img/a1_10.jpg',
        durationSeconds: 245,
      },
      // Same external_id string as a *different* provider - must not be
      // deduped against the entry above, dedup is scoped per provider.
      {
        videoId: 'https://artist.bandcamp.com/track/song',
        provider: 'soundcloud',
        title: 'Unrelated track that happens to share a URL string',
      },
    ]);

    expect(payload).toEqual([
      {
        provider: 'bandcamp',
        external_id: 'https://artist.bandcamp.com/track/song',
        cached_title: 'Song Title',
        cached_channel_title: 'Artist Name',
        cached_thumbnail_url: 'https://f4.bcbits.com/img/a1_10.jpg',
        cached_duration_seconds: 245,
        submitted_url: 'https://artist.bandcamp.com/track/song',
      },
      {
        provider: 'soundcloud',
        external_id: 'https://artist.bandcamp.com/track/song',
        cached_title: 'Unrelated track that happens to share a URL string',
        cached_channel_title: null,
        cached_thumbnail_url: null,
        cached_duration_seconds: null,
        submitted_url: 'https://artist.bandcamp.com/track/song',
      },
    ]);
  });

  it('drops a non-YouTube entry whose id is not a URL', () => {
    const payload = createTrackIngestPayload([
      { videoId: 'not-a-url', provider: 'bandcamp', title: 'Ignored' },
    ]);

    expect(payload).toEqual([]);
  });

  it('sends the ingest payload through the Supabase RPC wrapper', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          provider: 'youtube',
          external_id: 'a1234567890',
          was_created: true,
        },
      ],
      error: null,
    });

    const result = await ingestTrackSources({ rpc }, [
      { videoId: 'a1234567890', title: 'Alpha' },
    ]);

    expect(rpc).toHaveBeenCalledWith('ingest_track_sources', {
      sources: [
        {
          provider: 'youtube',
          external_id: 'a1234567890',
          cached_title: 'Alpha',
          cached_channel_title: null,
          cached_thumbnail_url: null,
          cached_duration_seconds: null,
          submitted_url: 'https://www.youtube.com/watch?v=a1234567890',
        },
      ],
    });
    expect(result).toEqual([
      { provider: 'youtube', external_id: 'a1234567890', was_created: true },
    ]);
  });

  it('normalizes search results into catalog-backed playlist videos', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          track_id: 'track-1',
          provider: 'youtube',
          game_title: 'Gamma Game',
          track_title: 'Skyline',
          display_title: 'Gamma Game - Skyline',
          is_retired: true,
          retired_by_tournament_name: 'VGMC 6',
          source_external_id: 'g1234567890',
          source_url: 'https://youtu.be/g1234567890',
          submitted_url: 'https://youtu.be/g1234567890',
          source_title: 'Skyline',
          source_channel_title: 'Channel G',
          source_thumbnail_url: 'g.jpg',
          tournaments: [{ sequence_number: 6 }],
        },
      ],
      error: null,
    });

    const [result] = await searchTrackCatalog({ rpc }, 'Skyline');

    expect(result.videoId).toBe('g1234567890');
    expect(result.provider).toBe('youtube');
    expect(getTrackCatalogTournamentSummary(result)).toBe('VGMC 6');
    expect(mapTrackCatalogEntryToVideo(result)).toEqual({
      videoId: 'g1234567890',
      provider: 'youtube',
      title: 'Gamma Game - Skyline',
      thumbnail: 'g.jpg',
      channelTitle: 'Channel G',
      trackId: 'track-1',
      gameTitle: 'Gamma Game',
      trackTitle: 'Skyline',
      displayTitle: 'Gamma Game - Skyline',
      isRetired: true,
      retiredByTournamentName: 'VGMC 6',
      supportCount1: 0,
      supportCount2: 0,
      supportCount3: 0,
    });
  });

  it('queries track_catalog rows by external id, for any provider', async () => {
    const select = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: [
          {
            track_id: 'track-2',
            provider: 'bandcamp',
            game_title: 'Delta Game',
            track_title: 'Night Drive',
            display_title: 'Delta Game - Night Drive',
            is_retired: false,
            retired_by_tournament_name: null,
            source_external_id: 'https://artist.bandcamp.com/track/night-drive',
            source_url: 'https://artist.bandcamp.com/track/night-drive',
            submitted_url: 'https://artist.bandcamp.com/track/night-drive',
            source_title: 'Night Drive',
            source_channel_title: 'Artist',
            source_thumbnail_url: 'https://f4.bcbits.com/img/a2_10.jpg',
            tournaments: [],
          },
        ],
        error: null,
      }),
    });

    const from = vi.fn().mockReturnValue({ select });

    const [result] = await fetchTrackCatalogByVideoIds({ from }, [
      'https://artist.bandcamp.com/track/night-drive',
    ]);

    expect(from).toHaveBeenCalledWith('track_catalog');
    expect(result.videoId).toBe(
      'https://artist.bandcamp.com/track/night-drive',
    );
    expect(result.provider).toBe('bandcamp');
    expect(result.isRetired).toBe(false);
  });

  it('falls back to the standard YouTube thumbnail when the catalog row has no cached image', () => {
    expect(
      mapTrackCatalogEntryToVideo({
        track_id: 'track-2',
        provider: 'youtube',
        game_title: 'Delta Game',
        track_title: 'Night Drive',
        display_title: 'Delta Game - Night Drive',
        is_retired: false,
        retired_by_tournament_name: null,
        source_external_id: 'd1234567890',
        source_url: 'https://youtu.be/d1234567890',
        submitted_url: 'https://youtu.be/d1234567890',
        source_title: '',
        source_channel_title: '',
        source_thumbnail_url: '',
        tournaments: [],
      }),
    ).toMatchObject({
      videoId: 'd1234567890',
      thumbnail: 'https://i.ytimg.com/vi/d1234567890/mqdefault.jpg',
    });
  });

  it('has no thumbnail fallback for a non-YouTube provider with no cached image', () => {
    expect(
      mapTrackCatalogEntryToVideo({
        track_id: 'track-3',
        provider: 'soundcloud',
        game_title: '',
        track_title: '',
        display_title: 'Some Track',
        is_retired: false,
        retired_by_tournament_name: null,
        source_external_id: 'https://soundcloud.com/artist/track',
        source_url: 'https://soundcloud.com/artist/track',
        submitted_url: 'https://soundcloud.com/artist/track',
        source_title: '',
        source_channel_title: '',
        source_thumbnail_url: '',
        tournaments: [],
      }),
    ).toMatchObject({
      videoId: 'https://soundcloud.com/artist/track',
      provider: 'soundcloud',
      thumbnail: '',
    });
  });
});

describe('patchCatalogCache', () => {
  beforeEach(() => {
    clearCatalogCache();
  });

  it('is a no-op when the cache has not been populated yet', () => {
    expect(() =>
      patchCatalogCache([{ trackId: 'track-1', gameTitle: 'X' }]),
    ).not.toThrow();
    expect(getCachedCatalog()).toBeNull();
  });

  it('patches provider/videoId/sourceUrl for an entry matched by videoId', async () => {
    await getFullCatalog(null);

    patchCatalogCache([
      {
        videoId: 'https://artist.bandcamp.com/track/song-b',
        provider: 'bandcamp',
        gameTitle: 'Game B Updated',
      },
    ]);

    const patched = getCachedCatalog().find((t) => t.trackId === 'track-2');
    expect(patched).toMatchObject({
      gameTitle: 'Game B Updated',
      provider: 'bandcamp',
      sourceUrl: 'https://artist.bandcamp.com/track/song-b',
    });
  });

  it('derives videoId/provider from a YouTube sourceUrl when no explicit videoId is given', async () => {
    await getFullCatalog(null);

    patchCatalogCache([
      { trackId: 'track-1', sourceUrl: 'https://youtu.be/z9876543210' },
    ]);

    const patched = getCachedCatalog().find((t) => t.trackId === 'track-1');
    expect(patched).toMatchObject({
      videoId: 'z9876543210',
      provider: 'youtube',
      sourceUrl: 'https://youtu.be/z9876543210',
    });
  });

  it('derives videoId/provider from a Bandcamp sourceUrl when no explicit videoId is given', async () => {
    await getFullCatalog(null);

    patchCatalogCache([
      {
        trackId: 'track-1',
        sourceUrl: 'https://another-artist.bandcamp.com/track/new-song',
      },
    ]);

    const patched = getCachedCatalog().find((t) => t.trackId === 'track-1');
    expect(patched).toMatchObject({
      videoId: 'https://another-artist.bandcamp.com/track/new-song',
      provider: 'bandcamp',
    });
  });

  it('leaves an unmatched entry alone', async () => {
    await getFullCatalog(null);

    patchCatalogCache([{ trackId: 'no-such-track', gameTitle: 'Ignored' }]);

    const untouched = getCachedCatalog().find((t) => t.trackId === 'track-1');
    expect(untouched.gameTitle).toBe('Game A');
  });
});

describe('bulkUpdateTracks', () => {
  beforeEach(() => {
    // Ensures the patchCatalogCache call inside bulkUpdateTracks safely
    // no-ops (cache not seeded) rather than patching a cache these tests
    // don't care about.
    clearCatalogCache();
  });

  function createMockSupabase() {
    const updateCalls = { tracks: [], track_sources: [] };
    const supabase = {
      from: vi.fn((table) => ({
        update: vi.fn((payload) => {
          updateCalls[table].push(payload);
          return makeUpdateBuilder({ error: null, count: 1 });
        }),
      })),
    };
    return { supabase, updateCalls };
  }

  it('writes provider + external_id to track_sources when sourceUrl is a SoundCloud link', async () => {
    const { supabase, updateCalls } = createMockSupabase();

    await bulkUpdateTracks(supabase, {
      'track-1': { sourceUrl: 'https://soundcloud.com/artist/track' },
    });

    expect(updateCalls.track_sources[0]).toMatchObject({
      source_url: 'https://soundcloud.com/artist/track',
      submitted_url: 'https://soundcloud.com/artist/track',
      external_id: 'https://soundcloud.com/artist/track',
      provider: 'soundcloud',
    });
  });

  it('writes provider + external_id to track_sources when sourceUrl is a YouTube link', async () => {
    const { supabase, updateCalls } = createMockSupabase();

    await bulkUpdateTracks(supabase, {
      'track-1': { sourceUrl: 'https://www.youtube.com/watch?v=a1234567890' },
    });

    expect(updateCalls.track_sources[0]).toMatchObject({
      external_id: 'a1234567890',
      provider: 'youtube',
    });
  });

  it('does not set provider/external_id when the sourceUrl is unparseable', async () => {
    const { supabase, updateCalls } = createMockSupabase();

    await bulkUpdateTracks(supabase, {
      'track-1': { sourceUrl: 'not a real link' },
    });

    expect(updateCalls.track_sources[0]).not.toHaveProperty('provider');
    expect(updateCalls.track_sources[0]).not.toHaveProperty('external_id');
  });
});

describe('mergeTracks', () => {
  beforeEach(async () => {
    clearCatalogCache();
    // mergeTracks reads memoryCatalog directly (not guarded like
    // patchCatalogCache is), so it needs a non-null cache to not throw —
    // an empty catalog is enough since these tests only assert on the
    // Supabase calls, not the resulting cache contents.
    await getFullCatalog(null);
  });

  afterEach(() => {
    clearCatalogCache();
  });

  function createMockSupabase() {
    const updateCalls = { tracks: [], track_sources: [] };
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn((table) => ({
        update: vi.fn((payload) => {
          updateCalls[table].push(payload);
          return makeUpdateBuilder({ error: null });
        }),
      })),
    };
    return { supabase, updateCalls };
  }

  it('writes provider + canonical source_url to track_sources for a Bandcamp merge target', async () => {
    const { supabase, updateCalls } = createMockSupabase();

    await mergeTracks(
      supabase,
      { trackId: 'track-1', gameTitle: 'Game', trackTitle: 'Song' },
      [], // no source tracks being merged away
      {
        gameTitle: 'Game',
        trackTitle: 'Song',
        sourceUrl: 'https://artist.bandcamp.com/track/song',
        provider: 'bandcamp',
      },
    );

    expect(updateCalls.track_sources[0]).toMatchObject({
      provider: 'bandcamp',
      external_id: 'https://artist.bandcamp.com/track/song',
      source_url: 'https://artist.bandcamp.com/track/song',
    });
  });

  it('builds a canonical YouTube watch URL for a YouTube merge target', async () => {
    const { supabase, updateCalls } = createMockSupabase();

    await mergeTracks(
      supabase,
      { trackId: 'track-1', gameTitle: 'Game', trackTitle: 'Song' },
      [],
      {
        gameTitle: 'Game',
        trackTitle: 'Song',
        sourceUrl: 'https://youtu.be/b1234567890',
        provider: 'youtube',
      },
    );

    expect(updateCalls.track_sources[0]).toMatchObject({
      provider: 'youtube',
      external_id: 'b1234567890',
      source_url: 'https://www.youtube.com/watch?v=b1234567890',
      submitted_url: 'https://youtu.be/b1234567890',
    });
  });

  it('skips the track_sources update when the merged sourceUrl is unparseable', async () => {
    const { supabase, updateCalls } = createMockSupabase();

    await mergeTracks(
      supabase,
      { trackId: 'track-1', gameTitle: 'Game', trackTitle: 'Song' },
      [],
      { gameTitle: 'Game', trackTitle: 'Song', sourceUrl: 'not a real link' },
    );

    expect(updateCalls.track_sources).toHaveLength(0);
  });
});
