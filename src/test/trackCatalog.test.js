import { describe, expect, it, vi } from 'vitest';
import {
  createYouTubeTrackIngestPayload,
  ingestYouTubeTrackSources,
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
});
