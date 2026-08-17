import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISCORD_USERNAME_PREFIX,
  LEGACY_SUPPORT_STORAGE_KEY,
  NOMINATION_LIST_STORAGE_KEY,
  PLAYER_STATE_STORAGE_KEY,
  SUPPORT_LIST_STORAGE_KEY,
  clearLocalGuestPlayerState,
  createGuestImportSelectionState,
  deriveProfileUsername,
  fetchUserTrackListenStatuses,
  getDisplayProfileName,
  hasImportableGuestCollections,
  parseStoredProfileUsername,
  recordYouTubeTrackListen,
  mergeGuestCollectionsIntoPlayerState,
  persistLocalGuestPlayerState,
  recordTrackHistory,
  getTrackHistory,
  clearTrackHistory,
  HISTORY_STORAGE_KEY,
  normalizePersistedPlayerState,
  syncCustomPlaylists,
} from '../lib/playerState.js';

describe('playback history', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records tracks into history and limits to 200 items', () => {
    const track1 = { videoId: 'v1', title: 'Track 1' };
    const track2 = { videoId: 'v2', title: 'Track 2' };

    recordTrackHistory(track1);
    let history = getTrackHistory();
    expect(history).toHaveLength(1);
    expect(history[0].videoId).toBe('v1');

    recordTrackHistory(track2);
    history = getTrackHistory();
    expect(history).toHaveLength(2);
    expect(history[0].videoId).toBe('v2'); // Newest first

    // Test deduplication: move track1 to top
    recordTrackHistory(track1);
    history = getTrackHistory();
    expect(history).toHaveLength(2);
    expect(history[0].videoId).toBe('v1');

    // Test limit
    for (let i = 0; i < 210; i++) {
      recordTrackHistory({ videoId: `video-${i}`, title: `Track ${i}` });
    }
    history = getTrackHistory();
    expect(history).toHaveLength(200);
    expect(history[0].videoId).toBe('video-209');
  });

  it('clears playback history from localStorage', () => {
    recordTrackHistory({ videoId: 'v1', title: 'Track 1' });
    expect(getTrackHistory()).toHaveLength(1);

    clearTrackHistory();
    expect(getTrackHistory()).toHaveLength(0);
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  });
});

describe('playerState guest import helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('detects when guest collections have importable items', () => {
    expect(
      hasImportableGuestCollections({
        playlist: [],
        supportList: [],
        nominationList: [],
      }),
    ).toBe(false);

    expect(
      hasImportableGuestCollections({
        playlist: [{ videoId: 'alpha', title: 'Alpha' }],
        supportList: [],
        nominationList: [],
      }),
    ).toBe(true);
  });

  it('creates default guest import selections from populated collections', () => {
    expect(
      createGuestImportSelectionState({
        playlist: [{ videoId: 'alpha', title: 'Alpha' }],
        supportList: [],
        nominationList: [{ videoId: 'beta', title: 'Beta' }],
      }),
    ).toEqual({
      playlist: true,
      supportList: false,
      nominationList: true,
    });
  });

  it('merges selected guest collections into the current account state', () => {
    const mergedState = mergeGuestCollectionsIntoPlayerState(
      {
        playlist: [
          { videoId: 'alpha', title: 'Alpha' },
          { videoId: 'beta', title: 'Beta' },
        ],
        currentVideoId: 'alpha',
        shuffleOrderIds: ['alpha', 'beta'],
        showOriginalOrder: false,
        listenedStatusById: { alpha: 'complete' },
        supportList: [{ videoId: 'alpha', title: 'Alpha' }],
        nominationList: [{ videoId: 'gamma', title: 'Gamma' }],
      },
      {
        playlist: [
          { videoId: 'beta', title: 'Beta' },
          { videoId: 'delta', title: 'Delta' },
        ],
        currentVideoId: 'delta',
        supportList: [{ videoId: 'delta', title: 'Delta' }],
        nominationList: [
          { videoId: 'gamma', title: 'Gamma' },
          { videoId: 'epsilon', title: 'Epsilon' },
        ],
      },
      {
        playlist: true,
        supportList: true,
        nominationList: true,
      },
    );

    expect(mergedState.playlist.map((video) => video.videoId)).toEqual([
      'alpha',
      'beta',
      'delta',
    ]);
    expect(mergedState.shuffleOrderIds).toEqual(['alpha', 'beta', 'delta']);
    expect(mergedState.supportList.map((video) => video.videoId)).toEqual([
      'alpha',
      'delta',
    ]);
    expect(mergedState.nominationList.map((video) => video.videoId)).toEqual([
      'gamma',
      'epsilon',
    ]);
    expect(mergedState.currentVideoId).toBe('alpha');
    expect(mergedState.listenedStatusById).toEqual({ alpha: 'complete' });
  });

  it('does not import support entries that are nominated after the merge', () => {
    const mergedState = mergeGuestCollectionsIntoPlayerState(
      {
        playlist: [],
        supportList: [{ videoId: 'alpha', title: 'Alpha' }],
        nominationList: [],
      },
      {
        playlist: [],
        supportList: [{ videoId: 'beta', title: 'Beta' }],
        nominationList: [{ videoId: 'beta', title: 'Beta' }],
      },
      {
        playlist: false,
        supportList: true,
        nominationList: true,
      },
    );

    expect(mergedState.supportList.map((video) => video.videoId)).toEqual([
      'alpha',
    ]);
    expect(mergedState.nominationList.map((video) => video.videoId)).toEqual([
      'beta',
    ]);
  });

  it('persists guest player state into local storage', () => {
    const snapshot = persistLocalGuestPlayerState({
      playlist: [{ videoId: 'alpha', title: 'Alpha' }],
      currentVideoId: 'alpha',
      supportList: [{ videoId: 'beta', title: 'Beta' }],
      nominationList: [{ videoId: 'gamma', title: 'Gamma' }],
    });

    expect(snapshot.currentVideoId).toBe('alpha');
    expect(JSON.parse(localStorage.getItem(PLAYER_STATE_STORAGE_KEY))).toEqual(
      snapshot,
    );
    expect(JSON.parse(localStorage.getItem(SUPPORT_LIST_STORAGE_KEY))).toEqual(
      snapshot.supportList,
    );
    expect(
      JSON.parse(localStorage.getItem(NOMINATION_LIST_STORAGE_KEY)),
    ).toEqual(snapshot.nominationList);
    expect(localStorage.getItem(LEGACY_SUPPORT_STORAGE_KEY)).toBeNull();
  });

  it('clears all guest player state entries from local storage', () => {
    localStorage.setItem(PLAYER_STATE_STORAGE_KEY, '{"playlist":[]}');
    localStorage.setItem(SUPPORT_LIST_STORAGE_KEY, '[]');
    localStorage.setItem(NOMINATION_LIST_STORAGE_KEY, '[]');
    localStorage.setItem(LEGACY_SUPPORT_STORAGE_KEY, '[]');

    clearLocalGuestPlayerState();

    expect(localStorage.getItem(PLAYER_STATE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SUPPORT_LIST_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(NOMINATION_LIST_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_SUPPORT_STORAGE_KEY)).toBeNull();
  });

  it('stores Discord usernames in a namespaced format and strips that in the UI', () => {
    const authUser = {
      app_metadata: { provider: 'discord' },
      user_metadata: { preferred_username: 'ProtoMan' },
      email: 'protoman@example.com',
    };

    const storedUsername = deriveProfileUsername(authUser);

    expect(storedUsername).toBe(`${DISCORD_USERNAME_PREFIX}ProtoMan`);
    expect(parseStoredProfileUsername(storedUsername)).toEqual({
      rawUsername: `${DISCORD_USERNAME_PREFIX}ProtoMan`,
      displayName: 'ProtoMan',
      provider: 'discord',
    });
    expect(getDisplayProfileName(storedUsername)).toBe('ProtoMan');
  });

  it('builds a playlist status map from persisted track listen rows', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          youtube_video_id: 'alpha1234567',
          track_id: 'track-alpha',
          listen_status: 'partial',
          listen_count: 1,
        },
        {
          youtube_video_id: 'beta12345678',
          track_id: 'track-beta',
          listen_status: 'complete',
          listen_count: 3,
          completion_count: 2,
        },
      ],
      error: null,
    });

    const result = await fetchUserTrackListenStatuses({ rpc }, [
      'alpha1234567',
      'beta12345678',
      'alpha1234567',
    ]);

    expect(rpc).toHaveBeenCalledWith('get_user_youtube_track_listens', {
      youtube_video_ids: ['alpha1234567', 'beta12345678'],
    });
    expect(result).toEqual({
      alpha1234567: 'partial',
      beta12345678: 'complete',
    });
  });

  it('records a persisted listen event through the Supabase RPC wrapper', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        track_id: 'track-alpha',
        listen_status: 'complete',
        listen_count: 2,
        completion_count: 1,
        total_seconds_played: 241,
      },
      error: null,
    });

    const result = await recordYouTubeTrackListen(
      { rpc },
      ' alpha1234567 ',
      'completed',
      241,
    );

    expect(rpc).toHaveBeenCalledWith('record_youtube_track_listen', {
      youtube_video_id: 'alpha1234567',
      listen_event: 'completed',
      seconds_played: 241,
    });
    expect(result).toMatchObject({
      youtubeVideoId: 'alpha1234567',
      trackId: 'track-alpha',
      listenStatus: 'complete',
      listenCount: 2,
      completionCount: 1,
      totalSecondsPlayed: 241,
    });
  });
});

describe('normalizePersistedPlayerState video provider passthrough', () => {
  it('carries a non-YouTube provider and cached duration through every video list', () => {
    const bandcampVideo = {
      videoId: 'https://artist.bandcamp.com/track/song',
      provider: 'bandcamp',
      title: 'Song Title',
      durationSeconds: 245,
    };

    const normalized = normalizePersistedPlayerState({
      playlist: [bandcampVideo],
      customPlaylists: [
        { id: 'pl-1', name: 'My List', videos: [bandcampVideo] },
      ],
    });

    expect(normalized.playlist[0]).toMatchObject({
      provider: 'bandcamp',
      durationSeconds: 245,
    });
    expect(normalized.customPlaylists[0].videos[0]).toMatchObject({
      provider: 'bandcamp',
      durationSeconds: 245,
    });
  });

  it('defaults provider to youtube when missing or unrecognized', () => {
    const normalized = normalizePersistedPlayerState({
      playlist: [
        { videoId: 'a1234567890' },
        { videoId: 'b1234567890', provider: 'spotify' },
      ],
    });

    expect(normalized.playlist[0].provider).toBe('youtube');
    expect(normalized.playlist[1].provider).toBe('youtube');
  });

  it('drops a non-positive or non-numeric durationSeconds down to null', () => {
    const normalized = normalizePersistedPlayerState({
      playlist: [
        { videoId: 'a1234567890', durationSeconds: 0 },
        { videoId: 'b1234567890', durationSeconds: '245' },
      ],
    });

    expect(normalized.playlist[0].durationSeconds).toBeNull();
    expect(normalized.playlist[1].durationSeconds).toBeNull();
  });
});

describe('syncCustomPlaylists', () => {
  function createSupabaseMock() {
    const insertedTracks = [];

    function makeBuilder(resolveValue, overrides = {}) {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        delete: vi.fn(() => builder),
        upsert: vi.fn(() => builder),
        insert: vi.fn((rows) => {
          insertedTracks.push(...rows);
          return makeBuilder({ data: null, error: null });
        }),
        single: vi.fn().mockResolvedValue({
          data: { id: 'playlist-uuid-1' },
          error: null,
        }),
        then: (resolve) => Promise.resolve(resolveValue).then(resolve),
        ...overrides,
      };
      return builder;
    }

    const supabase = {
      from: vi.fn((table) => {
        if (table === 'user_playlists') {
          return makeBuilder({ data: [], error: null });
        }
        // user_playlist_tracks: delete-before-insert, both resolve empty.
        return makeBuilder({ data: null, error: null });
      }),
    };

    return { supabase, insertedTracks };
  }

  it('inserts a raw (non-catalog) video with provider/external_id/cached duration, not the retired youtube_video_id shape', async () => {
    const { supabase, insertedTracks } = createSupabaseMock();

    await syncCustomPlaylists(supabase, 'user-1', [
      {
        id: 'pl-1',
        name: 'My List',
        videos: [
          {
            videoId: 'https://artist.bandcamp.com/track/song',
            provider: 'bandcamp',
            title: 'Song Title',
            channelTitle: 'Artist Name',
            thumbnail: 'https://f4.bcbits.com/img/a1_10.jpg',
            durationSeconds: 245,
          },
        ],
      },
    ]);

    expect(insertedTracks).toHaveLength(1);
    expect(insertedTracks[0]).toMatchObject({
      provider: 'bandcamp',
      external_id: 'https://artist.bandcamp.com/track/song',
      cached_title: 'Song Title',
      cached_channel: 'Artist Name',
      cached_thumbnail: 'https://f4.bcbits.com/img/a1_10.jpg',
      cached_duration_seconds: 245,
    });
    expect(insertedTracks[0]).not.toHaveProperty('youtube_video_id');
  });

  it('defaults provider to youtube for a raw entry with no provider field', async () => {
    const { supabase, insertedTracks } = createSupabaseMock();

    await syncCustomPlaylists(supabase, 'user-1', [
      {
        id: 'pl-1',
        name: 'My List',
        videos: [{ videoId: 'a1234567890', title: 'A Video' }],
      },
    ]);

    expect(insertedTracks[0]).toMatchObject({
      provider: 'youtube',
      external_id: 'a1234567890',
      cached_duration_seconds: null,
    });
  });

  it('inserts a catalog-linked video by track_id, untouched by the provider/external_id changes', async () => {
    const { supabase, insertedTracks } = createSupabaseMock();

    await syncCustomPlaylists(supabase, 'user-1', [
      {
        id: 'pl-1',
        name: 'My List',
        videos: [{ videoId: 'a1234567890', trackId: 'track-uuid-1' }],
      },
    ]);

    expect(insertedTracks).toEqual([
      {
        playlist_id: 'playlist-uuid-1',
        track_id: 'track-uuid-1',
        order_index: 0,
      },
    ]);
  });
});
