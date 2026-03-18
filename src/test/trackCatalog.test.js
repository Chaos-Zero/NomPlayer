import { describe, expect, it, vi } from 'vitest';
import {
  createYouTubeTrackIngestPayload,
  fetchTrackCatalogByVideoIds,
  getTrackCatalogTournamentSummary,
  ingestYouTubeTrackSources,
  mapTrackCatalogEntryToVideo,
  searchTrackCatalog,
} from '../lib/trackCatalog.js';

describe('track catalog helpers', () => {
  it('builds a deduplicated ingest payload from YouTube video entries', () => {
    const payload = createYouTubeTrackIngestPayload([
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
        video_id: 'a1234567890',
        cached_title: 'Alpha',
        cached_channel_title: 'Channel A',
        cached_thumbnail_url: 'a.jpg',
        submitted_url: 'https://www.youtube.com/watch?v=a1234567890',
      },
      {
        video_id: 'b1234567890',
        cached_title: 'Beta',
        cached_channel_title: null,
        cached_thumbnail_url: null,
        submitted_url: 'https://www.youtube.com/watch?v=b1234567890',
      },
    ]);
  });

  it('sends the ingest payload through the Supabase RPC wrapper', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ youtube_video_id: 'a1234567890', was_created: true }],
      error: null,
    });

    const result = await ingestYouTubeTrackSources({ rpc }, [
      { videoId: 'a1234567890', title: 'Alpha' },
    ]);

    expect(rpc).toHaveBeenCalledWith('ingest_youtube_track_sources', {
      youtube_sources: [
        {
          video_id: 'a1234567890',
          cached_title: 'Alpha',
          cached_channel_title: null,
          cached_thumbnail_url: null,
          submitted_url: 'https://www.youtube.com/watch?v=a1234567890',
        },
      ],
    });
    expect(result).toEqual([
      { youtube_video_id: 'a1234567890', was_created: true },
    ]);
  });

  it('normalizes search results into catalog-backed playlist videos', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          track_id: 'track-1',
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
    expect(getTrackCatalogTournamentSummary(result)).toBe('VGMC 6');
    expect(mapTrackCatalogEntryToVideo(result)).toEqual({
      videoId: 'g1234567890',
      title: 'Gamma Game - Skyline',
      thumbnail: 'g.jpg',
      channelTitle: 'Channel G',
      trackId: 'track-1',
      gameTitle: 'Gamma Game',
      trackTitle: 'Skyline',
      displayTitle: 'Gamma Game - Skyline',
      isRetired: true,
      retiredByTournamentName: 'VGMC 6',
    });
  });

  it('queries track_catalog rows by YouTube ids', async () => {
    const select = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: [
          {
            track_id: 'track-1',
            game_title: 'Gamma Game',
            track_title: 'Skyline',
            display_title: 'Gamma Game - Skyline',
            is_retired: false,
            retired_by_tournament_name: null,
            source_external_id: 'g1234567890',
            source_url: 'https://youtu.be/g1234567890',
            submitted_url: 'https://youtu.be/g1234567890',
            source_title: 'Skyline',
            source_channel_title: 'Channel G',
            source_thumbnail_url: 'g.jpg',
            tournaments: [],
          },
        ],
        error: null,
      }),
    });

    const from = vi.fn().mockReturnValue({ select });

    const [result] = await fetchTrackCatalogByVideoIds({ from }, [
      'g1234567890',
    ]);

    expect(from).toHaveBeenCalledWith('track_catalog');
    expect(result.videoId).toBe('g1234567890');
    expect(result.isRetired).toBe(false);
  });
});
