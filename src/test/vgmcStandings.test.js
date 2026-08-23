import { describe, expect, it } from 'vitest';
import { partitionStandings, toPlaylistVideos } from '../lib/vgmcStandings.js';

function row(overrides) {
  return {
    id: overrides.id || `row-${overrides.support_points}`,
    track_id: overrides.track_id ?? null,
    provider: overrides.provider ?? 'youtube',
    external_id: overrides.external_id ?? 'aaaaaaaaaaa',
    cached_title: overrides.cached_title ?? 'Game - Song',
    nomination_game: overrides.nomination_game ?? 'Game',
    nomination_song: overrides.nomination_song ?? 'Song',
    support_points: overrides.support_points ?? 0,
    support_voters: overrides.support_voters ?? 0,
    is_dropped: overrides.is_dropped ?? false,
    order_index: overrides.order_index ?? 0,
    locked_order: overrides.locked_order ?? null,
  };
}

describe('toPlaylistVideos', () => {
  it('maps rows to the playlist-video shape, skipping rows with no video id', () => {
    const videos = toPlaylistVideos([
      row({
        external_id: 'aaaaaaaaaaa',
        cached_title: 'Foo - Bar',
        nomination_game: 'Foo',
        nomination_song: 'Bar',
        support_points: 3,
        order_index: 2,
        track_id: 'track-uuid-1',
      }),
      { ...row({}), external_id: null },
    ]);

    expect(videos).toEqual([
      {
        videoId: 'aaaaaaaaaaa',
        provider: 'youtube',
        title: 'Foo - Bar',
        displayTitle: 'Foo - Bar',
        gameTitle: 'Foo',
        trackTitle: 'Bar',
        thumbnail: expect.stringContaining('aaaaaaaaaaa'),
        channelTitle: '',
        trackId: 'track-uuid-1',
        supportPoints: 3,
        isDropped: false,
        loadIndex: 2,
      },
    ]);
  });

  it('carries isDropped through from is_dropped', () => {
    const [live, dropped] = toPlaylistVideos([
      row({ external_id: 'aaaaaaaaaaa', is_dropped: false }),
      row({ external_id: 'bbbbbbbbbbb', is_dropped: true }),
    ]);

    expect(live.isDropped).toBe(false);
    expect(dropped.isDropped).toBe(true);
  });

  it('carries trackId through as null when the nomination has not been promoted to the catalog yet', () => {
    const [video] = toPlaylistVideos([row({ track_id: null })]);
    expect(video.trackId).toBeNull();
  });

  it('carries the game/song split individually, not just the combined display title', () => {
    // Regression guard: this split used to get dropped entirely, which is why
    // anything reading gameTitle/trackTitle off a VGMC track (the sidebar, the
    // GameFAQs export formatter) fell back to "Metadata Needed" even though
    // reconcile_vgmc_playlist had already stored the split correctly.
    const [video] = toPlaylistVideos([
      row({
        external_id: 'bbbbbbbbbbb',
        nomination_game: 'Some Game',
        nomination_song: 'Some Song',
      }),
    ]);

    expect(video.gameTitle).toBe('Some Game');
    expect(video.trackTitle).toBe('Some Song');
  });

  it('carries a non-YouTube provider through, with no thumbnail fallback available', () => {
    const [video] = toPlaylistVideos([
      row({
        provider: 'bandcamp',
        external_id: 'https://artist.bandcamp.com/track/song',
      }),
    ]);

    expect(video.provider).toBe('bandcamp');
    expect(video.videoId).toBe('https://artist.bandcamp.com/track/song');
    expect(video.thumbnail).toBe('');
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
      row({ id: 'high', support_points: 6 }),
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

  it('locked only includes songs with a locked_order', () => {
    // In practice a row with 7+ points always has a locked_order too (see
    // foldThread's markLockOrder) - this exercises the actual field
    // partitionStandings keys membership on, not the point total that
    // usually, but not always (see the lock-cutoff test below), comes with it.
    const { locked } = partitionStandings([
      row({ id: 'a', support_points: 6 }),
      row({ id: 'b', support_points: 7, locked_order: 1 }),
      row({ id: 'c', support_points: 8, locked_order: 0 }),
    ]);

    expect(locked.map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('sorts locked by locked_order (qualification order), not current points', () => {
    // 'late' has more points now, but 'early' reached 7 points first - the
    // Locked tab should read as a finishing order, not a leaderboard.
    const { locked } = partitionStandings([
      row({ id: 'late', support_points: 9, locked_order: 3 }),
      row({ id: 'early', support_points: 7, locked_order: 0 }),
      row({ id: 'middle', support_points: 8, locked_order: 1 }),
    ]);

    expect(locked.map((r) => r.id)).toEqual(['early', 'middle', 'late']);
  });

  it('a 7+ point row with no locked_order yet stays in standings, not locked', () => {
    // Membership is keyed on locked_order, not the point total - covers both
    // a row synced before locked_order existed and not yet backfilled by its
    // next thread sync, and (the reason this distinction exists at all) a
    // song that crossed 7 points only after its thread's lock cutoff, which
    // never gets a locked_order at all. Either way it belongs here, however
    // high its points climb, until/unless a real locked_order shows up.
    const { standings, locked } = partitionStandings([
      row({ id: 'missing-order', support_points: 9, locked_order: null }),
    ]);

    expect(standings.map((r) => r.id)).toContain('missing-order');
    expect(locked.map((r) => r.id)).not.toContain('missing-order');
  });

  it('a locked song (has locked_order) is removed from standings, not shown in both', () => {
    const { standings, locked } = partitionStandings([
      row({ id: 'a', support_points: 9, locked_order: 0 }),
    ]);

    expect(standings.map((r) => r.id)).not.toContain('a');
    expect(locked.map((r) => r.id)).toContain('a');
  });

  it('standings only includes songs without a locked_order', () => {
    const { standings } = partitionStandings([
      row({ id: 'a', support_points: 2 }),
      row({ id: 'b', support_points: 6 }),
      row({ id: 'c', support_points: 7, locked_order: 0 }),
    ]);

    expect(standings.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('within the same point total, ranks the song with more supporters higher', () => {
    const { standings } = partitionStandings([
      row({
        id: 'fewer',
        support_points: 5,
        support_voters: 2,
        order_index: 0,
      }),
      row({ id: 'more', support_points: 5, support_voters: 3, order_index: 1 }),
    ]);

    expect(standings.map((r) => r.id)).toEqual(['more', 'fewer']);
  });

  it('falls back to nomination order when both points and supporters tie', () => {
    const { standings } = partitionStandings([
      row({
        id: 'second',
        support_points: 5,
        support_voters: 2,
        order_index: 5,
      }),
      row({
        id: 'first',
        support_points: 5,
        support_voters: 2,
        order_index: 1,
      }),
    ]);

    expect(standings.map((r) => r.id)).toEqual(['first', 'second']);
  });

  it('carries supportVoters through separately from supportPoints', () => {
    // Mirrors the ++/++/+ example: 5 points from 3 distinct people.
    const { standings } = partitionStandings([
      row({ id: 'a', support_points: 5, support_voters: 3 }),
    ]);

    expect(standings[0].supportPoints).toBe(5);
    expect(standings[0].supportVoters).toBe(3);
  });

  it('defaults supportVoters to 0 for a row synced before that column existed', () => {
    const { standings } = partitionStandings([
      { ...row({ id: 'a', support_points: 2 }), support_voters: null },
    ]);

    expect(standings[0].supportVoters).toBe(0);
  });
});
