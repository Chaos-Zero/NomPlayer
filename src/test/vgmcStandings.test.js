import { describe, expect, it } from 'vitest';
import { partitionStandings, toPlaylistVideos } from '../lib/vgmcStandings.js';

function row(overrides) {
  return {
    id: overrides.id || `row-${overrides.support_points}`,
    youtube_video_id: overrides.youtube_video_id ?? 'aaaaaaaaaaa',
    cached_title: overrides.cached_title ?? 'Game - Song',
    nomination_game: overrides.nomination_game ?? 'Game',
    nomination_song: overrides.nomination_song ?? 'Song',
    support_points: overrides.support_points ?? 0,
    order_index: overrides.order_index ?? 0,
  };
}

describe('toPlaylistVideos', () => {
  it('maps rows to the playlist-video shape, skipping rows with no video id', () => {
    const videos = toPlaylistVideos([
      row({
        youtube_video_id: 'aaaaaaaaaaa',
        cached_title: 'Foo - Bar',
        nomination_game: 'Foo',
        nomination_song: 'Bar',
        support_points: 3,
        order_index: 2,
      }),
      { ...row({}), youtube_video_id: null },
    ]);

    expect(videos).toEqual([
      {
        videoId: 'aaaaaaaaaaa',
        title: 'Foo - Bar',
        displayTitle: 'Foo - Bar',
        gameTitle: 'Foo',
        trackTitle: 'Bar',
        thumbnail: expect.stringContaining('aaaaaaaaaaa'),
        channelTitle: '',
        supportPoints: 3,
        loadIndex: 2,
      },
    ]);
  });

  it('carries the game/song split individually, not just the combined display title', () => {
    // Regression guard: this split used to get dropped entirely, which is why
    // anything reading gameTitle/trackTitle off a VGMC track (the sidebar, the
    // GameFAQs export formatter) fell back to "Metadata Needed" even though
    // reconcile_vgmc_playlist had already stored the split correctly.
    const [video] = toPlaylistVideos([
      row({
        youtube_video_id: 'bbbbbbbbbbb',
        nomination_game: 'Some Game',
        nomination_song: 'Some Song',
      }),
    ]);

    expect(video.gameTitle).toBe('Some Game');
    expect(video.trackTitle).toBe('Some Song');
  });
});

describe('partitionStandings', () => {
  it('only includes songs with more than 1 support point', () => {
    const { standings } = partitionStandings([
      row({ id: 'a', support_points: 0 }),
      row({ id: 'b', support_points: 1 }),
      row({ id: 'c', support_points: 2 }),
    ]);

    expect(standings.map((r) => r.id)).toEqual(['c']);
  });

  it('includes a nomination submitted with ++ (2 points) in standings', () => {
    const { standings } = partitionStandings([
      row({ id: 'a', support_points: 2 }),
    ]);
    expect(standings).toHaveLength(1);
  });

  it('sorts standings by support points descending', () => {
    const { standings } = partitionStandings([
      row({ id: 'low', support_points: 2 }),
      row({ id: 'high', support_points: 9 }),
      row({ id: 'mid', support_points: 5 }),
    ]);

    expect(standings.map((r) => r.id)).toEqual(['high', 'mid', 'low']);
  });

  it('breaks ties by nomination order', () => {
    const { standings } = partitionStandings([
      row({ id: 'second', support_points: 3, order_index: 5 }),
      row({ id: 'first', support_points: 3, order_index: 1 }),
    ]);

    expect(standings.map((r) => r.id)).toEqual(['first', 'second']);
  });

  it('locked only includes songs at 7+ points', () => {
    const { locked } = partitionStandings([
      row({ id: 'a', support_points: 6 }),
      row({ id: 'b', support_points: 7 }),
      row({ id: 'c', support_points: 8 }),
    ]);

    expect(locked.map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('locked is a filtered view of standings, not a disjoint tab', () => {
    const { standings, locked } = partitionStandings([
      row({ id: 'a', support_points: 9 }),
    ]);

    expect(standings.map((r) => r.id)).toContain('a');
    expect(locked.map((r) => r.id)).toContain('a');
  });
});
