import { describe, expect, it, vi } from 'vitest';
import {
  createTrackIngestPayload,
  fetchTrackCatalogByVideoIds,
  getTrackCatalogTournamentSummary,
  ingestTrackSources,
  mapTrackCatalogEntryToVideo,
  searchTrackCatalog,
} from '../lib/trackCatalog.js';

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
      // Same external_id string as a *different* provider — must not be
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
