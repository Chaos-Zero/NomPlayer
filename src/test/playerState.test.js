import { beforeEach, describe, expect, it } from 'vitest';
import {
  DISCORD_USERNAME_PREFIX,
  LEGACY_SUPPORT_STORAGE_KEY,
  NOMINATION_LIST_STORAGE_KEY,
  PLAYER_STATE_STORAGE_KEY,
  SUPPORT_LIST_STORAGE_KEY,
  clearLocalGuestPlayerState,
  createGuestImportSelectionState,
  deriveProfileUsername,
  getDisplayProfileName,
  hasImportableGuestCollections,
  parseStoredProfileUsername,
  mergeGuestCollectionsIntoPlayerState,
  persistLocalGuestPlayerState,
} from '../lib/playerState.js';

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
});
