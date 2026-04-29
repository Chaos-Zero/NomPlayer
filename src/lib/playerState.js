import { checkContent } from '../utils/profanityFilter.js';
export const PLAYER_STATE_STORAGE_KEY = 'yt_player_state';
export const SUPPORT_LIST_STORAGE_KEY = 'yt_support_list';
export const NOMINATION_LIST_STORAGE_KEY = 'yt_nominations_list';
export const CUSTOM_PLAYLISTS_STORAGE_KEY = 'yt_custom_playlists';
export const HISTORY_STORAGE_KEY = 'yt_playback_history';
export const LEGACY_SUPPORT_STORAGE_KEY = 'yt_favourites';
export const DISCORD_USERNAME_PREFIX = 'dc:';
const MAX_HISTORY_LENGTH = 200;

function normalizeVideoEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.videoId !== 'string' || entry.videoId.trim() === '') {
    return null;
  }

  return {
    videoId: entry.videoId,
    title: typeof entry.title === 'string' ? entry.title : 'Untitled video',
    thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail : '',
    channelTitle:
      typeof entry.channelTitle === 'string' ? entry.channelTitle : '',
    trackId: typeof entry.trackId === 'string' ? entry.trackId : null,
    gameTitle: typeof entry.gameTitle === 'string' ? entry.gameTitle : '',
    trackTitle: typeof entry.trackTitle === 'string' ? entry.trackTitle : '',
    displayTitle:
      typeof entry.displayTitle === 'string' ? entry.displayTitle : '',
    isRetired: Boolean(entry.isRetired),
    retiredByTournamentName:
      typeof entry.retiredByTournamentName === 'string'
        ? entry.retiredByTournamentName
        : '',
    supportLevel:
      typeof entry.supportLevel === 'number' &&
      entry.supportLevel >= 1 &&
      entry.supportLevel <= 3
        ? entry.supportLevel
        : 1,
    rating:
      typeof entry.rating === 'number' &&
      entry.rating >= 1 &&
      entry.rating <= 10
        ? entry.rating
        : null,
    comment: typeof entry.comment === 'string' ? entry.comment : '',
  };
}

function normalizeVideoList(list) {
  if (!Array.isArray(list)) return [];

  const seenVideoIds = new Set();
  const normalizedList = [];

  for (const entry of list) {
    const normalizedEntry = normalizeVideoEntry(entry);
    if (!normalizedEntry || seenVideoIds.has(normalizedEntry.videoId)) {
      continue;
    }

    seenVideoIds.add(normalizedEntry.videoId);
    normalizedList.push(normalizedEntry);
  }

  return normalizedList;
}

function mergeUniqueVideoLists(baseList, incomingList) {
  const nextList = [...baseList];
  const knownIds = new Set(baseList.map((entry) => entry.videoId));

  for (const entry of incomingList) {
    if (knownIds.has(entry.videoId)) continue;
    knownIds.add(entry.videoId);
    nextList.push(entry);
  }

  return nextList;
}

function normalizeIdList(ids, allowedIds = null) {
  if (!Array.isArray(ids)) return [];

  const nextIds = [];
  const seenIds = new Set();

  for (const id of ids) {
    if (typeof id !== 'string' || id.trim() === '' || seenIds.has(id)) {
      continue;
    }
    if (allowedIds && !allowedIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    nextIds.push(id);
  }

  return nextIds;
}

function normalizeListenedStatus(statusById, allowedIds) {
  if (!statusById || typeof statusById !== 'object') return {};

  const nextStatus = {};

  for (const [videoId, status] of Object.entries(statusById)) {
    if (!allowedIds.has(videoId)) continue;
    if (status !== 'partial' && status !== 'complete') continue;
    nextStatus[videoId] = status;
  }

  return nextStatus;
}

export function normalizePersistedPlayerState(
  rawState,
  { supportListFallback = [], nominationListFallback = [] } = {},
) {
  const playlist = normalizeVideoList(rawState?.playlist);
  const playlistIdSet = new Set(playlist.map((video) => video.videoId));
  const nominationList = normalizeVideoList(
    rawState?.nominationList ?? nominationListFallback,
  );
  const nominationIdSet = new Set(nominationList.map((video) => video.videoId));
  const supportList = normalizeVideoList(
    rawState?.supportList ?? supportListFallback,
  ).filter((video) => !nominationIdSet.has(video.videoId));
  const shuffleOrderIds = normalizeIdList(
    rawState?.shuffleOrderIds,
    playlistIdSet,
  );
  const currentVideoId =
    typeof rawState?.currentVideoId === 'string'
      ? rawState.currentVideoId
      : (playlist[0]?.videoId ?? null);

  const trackingIdSet = new Set([
    ...playlistIdSet,
    ...supportList.map((video) => video.videoId),
    ...nominationList.map((video) => video.videoId),
  ]);

  return {
    playlist,
    currentVideoId,
    shuffleOrderIds,
    showOriginalOrder: Boolean(rawState?.showOriginalOrder),
    listenedStatusById: normalizeListenedStatus(
      rawState?.listenedStatusById,
      trackingIdSet,
    ),
    supportList,
    nominationList,

    customPlaylists: Array.isArray(rawState?.customPlaylists)
      ? rawState.customPlaylists
          .map((pl) => ({
            id:
              typeof pl.id === 'string'
                ? pl.id
                : `pl-${Math.random().toString(36).slice(2, 11)}`,
            name: typeof pl.name === 'string' ? pl.name : 'Untitled Playlist',
            is_public: pl.is_public === true,
            videos: normalizeVideoList(pl.videos),
          }))
          .filter((pl) => pl.videos.length >= 0)
      : [],
    transientVideo: normalizeVideoEntry(rawState?.transientVideo),
  };
}

export function createPersistedPlayerState(state) {
  return normalizePersistedPlayerState(state);
}

export function persistLocalGuestPlayerState(state) {
  const snapshot = createPersistedPlayerState(state);

  localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(snapshot));
  localStorage.setItem(
    SUPPORT_LIST_STORAGE_KEY,
    JSON.stringify(snapshot.supportList),
  );
  localStorage.setItem(
    NOMINATION_LIST_STORAGE_KEY,
    JSON.stringify(snapshot.nominationList),
  );
  localStorage.setItem(
    CUSTOM_PLAYLISTS_STORAGE_KEY,
    JSON.stringify(snapshot.customPlaylists),
  );
  localStorage.removeItem(LEGACY_SUPPORT_STORAGE_KEY);

  return snapshot;
}

export function clearLocalGuestPlayerState() {
  localStorage.removeItem(PLAYER_STATE_STORAGE_KEY);
  localStorage.removeItem(SUPPORT_LIST_STORAGE_KEY);
  localStorage.removeItem(NOMINATION_LIST_STORAGE_KEY);
  localStorage.removeItem(CUSTOM_PLAYLISTS_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SUPPORT_STORAGE_KEY);
}

export function loadLocalPlayerState(options = {}) {
  try {
    const storedValue = localStorage.getItem(PLAYER_STATE_STORAGE_KEY);
    if (!storedValue) {
      return normalizePersistedPlayerState({}, options);
    }

    return normalizePersistedPlayerState(JSON.parse(storedValue), options);
  } catch {
    return normalizePersistedPlayerState({}, options);
  }
}

export function hasMeaningfulPlayerState(state) {
  const normalizedState = normalizePersistedPlayerState(state);

  return (
    normalizedState.playlist.length > 0 ||
    normalizedState.supportList.length > 0 ||
    normalizedState.nominationList.length > 0 ||
    Object.keys(normalizedState.listenedStatusById).length > 0
  );
}

export function hasImportableGuestCollections(state) {
  const normalizedState = normalizePersistedPlayerState(state);

  return (
    normalizedState.playlist.length > 0 ||
    normalizedState.supportList.length > 0 ||
    normalizedState.nominationList.length > 0
  );
}

export function createGuestImportSelectionState(state) {
  const normalizedState = normalizePersistedPlayerState(state);

  return {
    playlist: normalizedState.playlist.length > 0,
    supportList: normalizedState.supportList.length > 0,
    nominationList: normalizedState.nominationList.length > 0,
  };
}

export function mergeGuestCollectionsIntoPlayerState(
  accountState,
  guestState,
  selections,
) {
  const baseState = normalizePersistedPlayerState(accountState);
  const incomingState = normalizePersistedPlayerState(guestState);
  const shouldImportPlaylist = Boolean(selections?.playlist);
  const shouldImportSupportList = Boolean(selections?.supportList);
  const shouldImportNominationList = Boolean(selections?.nominationList);

  const nextPlaylist = shouldImportPlaylist
    ? mergeUniqueVideoLists(baseState.playlist, incomingState.playlist)
    : baseState.playlist;
  const playlistIdSet = new Set(nextPlaylist.map((video) => video.videoId));

  let nextShuffleOrderIds = normalizeIdList(
    baseState.shuffleOrderIds,
    playlistIdSet,
  );
  if (shouldImportPlaylist && nextShuffleOrderIds.length > 0) {
    for (const video of incomingState.playlist) {
      if (
        playlistIdSet.has(video.videoId) &&
        !nextShuffleOrderIds.includes(video.videoId)
      ) {
        nextShuffleOrderIds.push(video.videoId);
      }
    }
  }

  const nextNominationList = shouldImportNominationList
    ? mergeUniqueVideoLists(
        baseState.nominationList,
        incomingState.nominationList,
      )
    : baseState.nominationList;
  const nominationIds = new Set(
    nextNominationList.map((video) => video.videoId),
  );
  const baseSupportWithoutNominations = baseState.supportList.filter(
    (video) => !nominationIds.has(video.videoId),
  );
  const nextSupportList = shouldImportSupportList
    ? mergeUniqueVideoLists(
        baseSupportWithoutNominations,
        incomingState.supportList.filter(
          (video) => !nominationIds.has(video.videoId),
        ),
      )
    : baseSupportWithoutNominations;

  const currentVideoId =
    typeof baseState.currentVideoId === 'string' &&
    playlistIdSet.has(baseState.currentVideoId)
      ? baseState.currentVideoId
      : shouldImportPlaylist &&
          typeof incomingState.currentVideoId === 'string' &&
          playlistIdSet.has(incomingState.currentVideoId)
        ? incomingState.currentVideoId
        : (nextPlaylist[0]?.videoId ?? null);

  return normalizePersistedPlayerState({
    playlist: nextPlaylist,
    currentVideoId,
    shuffleOrderIds: nextShuffleOrderIds,
    showOriginalOrder: baseState.showOriginalOrder,
    listenedStatusById: baseState.listenedStatusById,
    supportList: nextSupportList,
    nominationList: nextNominationList,
    customPlaylists: baseState.customPlaylists,
  });
}

export function isDiscordAuthUser(user) {
  if (!user || typeof user !== 'object') return false;

  if (user?.app_metadata?.provider === 'discord') return true;
  if (
    Array.isArray(user?.identities) &&
    user.identities.some((identity) => identity?.provider === 'discord')
  ) {
    return true;
  }

  return user?.user_metadata?.iss?.includes('discord.com') ?? false;
}

export function parseStoredProfileUsername(username, fallback = 'User') {
  const rawUsername =
    typeof username === 'string' && username.trim() ? username.trim() : '';
  const isDiscordUsername = rawUsername.startsWith(DISCORD_USERNAME_PREFIX);
  let displayName = isDiscordUsername
    ? rawUsername.slice(DISCORD_USERNAME_PREFIX.length).trim()
    : rawUsername;

  if (isDiscordUsername && displayName.includes('#')) {
    const hashIndex = displayName.lastIndexOf('#');
    const discriminator = displayName.slice(hashIndex + 1);
    // Strip if it's the legacy 4-digit discriminator or the new #0 placeholder
    if (discriminator === '0' || /^\d{4}$/.test(discriminator)) {
      displayName = displayName.slice(0, hashIndex);
    }
  }

  return {
    rawUsername,
    displayName: displayName || fallback,
    provider: isDiscordUsername ? 'discord' : null,
  };
}

export function getDisplayProfileName(username, fallback = 'User') {
  return parseStoredProfileUsername(username, fallback).displayName;
}

function deriveBaseProfileUsername(user, existingUsername = '') {
  const preferredUsername =
    typeof existingUsername === 'string' && existingUsername.trim()
      ? existingUsername.trim()
      : '';
  if (preferredUsername) {
    return preferredUsername;
  }

  const metadataUsernameFields = [
    user?.user_metadata?.preferred_username,
    user?.user_metadata?.user_name,
    user?.user_metadata?.username,
    user?.user_metadata?.name,
    user?.user_metadata?.global_name,
    user?.user_metadata?.full_name,
  ];

  for (const candidate of metadataUsernameFields) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const email =
    typeof user?.email === 'string' && user.email.includes('@')
      ? user.email
      : '';
  if (email) {
    return email.split('@')[0];
  }

  return 'listener';
}

export function deriveProfileUsername(user, existingUsername = '') {
  let baseUsername = deriveBaseProfileUsername(
    user,
    parseStoredProfileUsername(existingUsername, '').displayName,
  );

  if (isDiscordAuthUser(user)) {
    // Strip Discord discriminator if present in the base username
    if (baseUsername.includes('#')) {
      const hashIndex = baseUsername.lastIndexOf('#');
      const discriminator = baseUsername.slice(hashIndex + 1);
      if (discriminator === '0' || /^\d{4}$/.test(discriminator)) {
        baseUsername = baseUsername.slice(0, hashIndex);
      }
    }
    return `${DISCORD_USERNAME_PREFIX}${baseUsername}`;
  }

  return baseUsername;
}

export function deriveProfileAvatarUrl(user, existingAvatarUrl = '') {
  if (existingAvatarUrl && existingAvatarUrl.trim()) {
    return existingAvatarUrl.trim();
  }

  const metadataAvatarFields = [
    user?.user_metadata?.avatar_url,
    user?.user_metadata?.picture,
  ];

  for (const candidate of metadataAvatarFields) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const isDiscordProvider =
    user?.app_metadata?.provider === 'discord' ||
    user?.user_metadata?.iss?.includes('discord.com');
  const discordAvatarHash =
    typeof user?.user_metadata?.avatar === 'string'
      ? user.user_metadata.avatar.trim()
      : '';
  const discordUserIdCandidates = [
    user?.user_metadata?.provider_id,
    user?.user_metadata?.sub,
    user?.user_metadata?.user_id,
  ];
  const discordUserId = discordUserIdCandidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim(),
  );

  if (isDiscordProvider && discordAvatarHash && discordUserId) {
    const extension = discordAvatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${discordUserId.trim()}/${discordAvatarHash}.${extension}?size=256`;
  }

  return '';
}

export function normalizeOptionalProfileValue(value) {
  if (typeof value !== 'string') return null;

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

export async function fetchUserProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email, gamefaqs_username, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertUserProfile(supabase, profile) {
  // Profanity Filter Check
  if (profile.username) {
    const { isBlocked, message } = checkContent(profile.username);
    if (isBlocked) {
      const error = new Error(message);
      error.isValidationError = true;
      throw error;
    }
  }

  if (profile.gamefaqs_username) {
    const { isBlocked, message } = checkContent(profile.gamefaqs_username);
    if (isBlocked) {
      const error = new Error(message);
      error.isValidationError = true;
      throw error;
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, {
      onConflict: 'id',
    })
    .select('id, username, email, gamefaqs_username, avatar_url')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function checkSignupAvailability(supabase, { email, username }) {
  const { data, error } = await supabase.rpc('check_signup_availability', {
    check_email: email,
    check_username: username,
  });

  if (error) {
    throw error;
  }

  return {
    emailAvailable: Boolean(data?.email_available),
    usernameAvailable: Boolean(data?.username_available),
  };
}

export async function fetchUserPlayerState(
  supabase,
  userId,
  normalizeOptions = {},
) {
  const { data, error } = await supabase
    .from('user_player_states')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizePersistedPlayerState(data?.state ?? {}, normalizeOptions);
}

function listChanged(current, previous) {
  if (previous === null) return true; // no cache yet, always sync
  if (current === previous) return false; // same reference, unchanged
  return JSON.stringify(current) !== JSON.stringify(previous);
}

export async function saveUserPlayerState(
  supabase,
  userId,
  state,
  previousLists = {},
) {
  const snapshot = createPersistedPlayerState(state);
  const { error } = await supabase.from('user_player_states').upsert(
    {
      user_id: userId,
      state: snapshot,
    },
    {
      onConflict: 'user_id',
    },
  );

  if (error) {
    throw error;
  }

  // Sync relational tables only for lists that have changed
  if (
    snapshot.playlist &&
    listChanged(snapshot.playlist, previousLists.playlist ?? null)
  ) {
    saveActiveQueue(
      supabase,
      userId,
      snapshot.playlist,
      previousLists.playlist ?? null,
    ).catch((err) => console.error('Failed to sync active queue', err));
  }
  if (
    snapshot.customPlaylists &&
    listChanged(snapshot.customPlaylists, previousLists.customPlaylists ?? null)
  ) {
    syncCustomPlaylists(supabase, userId, snapshot.customPlaylists).catch(
      (err) => console.error('Failed to sync custom playlists', err),
    );
  }
  if (
    snapshot.nominationList &&
    listChanged(snapshot.nominationList, previousLists.nominationList ?? null)
  ) {
    syncNominations(
      supabase,
      userId,
      snapshot.nominationList,
      previousLists.nominationList ?? null,
    ).catch((err) => console.error('Failed to sync nominations', err));
  }
  if (
    snapshot.supportList &&
    listChanged(snapshot.supportList, previousLists.supportList ?? null)
  ) {
    syncSupports(
      supabase,
      userId,
      snapshot.supportList,
      previousLists.supportList ?? null,
    ).catch((err) => console.error('Failed to sync supports', err));
  }

  return snapshot;
}

function normalizeTrackListenStatusRow(row) {
  if (!row || typeof row !== 'object') return null;

  const youtubeVideoId =
    typeof row.youtube_video_id === 'string' && row.youtube_video_id.trim()
      ? row.youtube_video_id.trim()
      : null;
  const listenStatus =
    row.listen_status === 'complete'
      ? 'complete'
      : row.listen_status === 'partial'
        ? 'partial'
        : null;

  if (!youtubeVideoId || !listenStatus) {
    return null;
  }

  return {
    youtubeVideoId,
    trackId:
      typeof row.track_id === 'string' && row.track_id.trim()
        ? row.track_id
        : null,
    listenStatus,
    listenCount:
      typeof row.listen_count === 'number' && Number.isFinite(row.listen_count)
        ? row.listen_count
        : 0,
    completionCount:
      typeof row.completion_count === 'number' &&
      Number.isFinite(row.completion_count)
        ? row.completion_count
        : 0,
    totalSecondsPlayed:
      typeof row.total_seconds_played === 'number' &&
      Number.isFinite(row.total_seconds_played)
        ? row.total_seconds_played
        : 0,
    firstListenedAt:
      typeof row.first_listened_at === 'string' ? row.first_listened_at : null,
    lastListenedAt:
      typeof row.last_listened_at === 'string' ? row.last_listened_at : null,
    firstCompletedAt:
      typeof row.first_completed_at === 'string'
        ? row.first_completed_at
        : null,
    lastCompletedAt:
      typeof row.last_completed_at === 'string' ? row.last_completed_at : null,
  };
}

function normalizeRequestedYoutubeIds(youtubeVideoIds) {
  if (!Array.isArray(youtubeVideoIds)) {
    return null;
  }

  const normalizedIds = [];
  const seenIds = new Set();

  for (const videoId of youtubeVideoIds) {
    if (typeof videoId !== 'string') continue;
    const normalizedVideoId = videoId.trim();
    if (!normalizedVideoId || seenIds.has(normalizedVideoId)) continue;
    seenIds.add(normalizedVideoId);
    normalizedIds.push(normalizedVideoId);
  }

  return normalizedIds.length > 0 ? normalizedIds : null;
}

export async function fetchUserTrackListenStatuses(
  supabase,
  youtubeVideoIds = null,
) {
  const { data, error } = await supabase.rpc('get_user_youtube_track_listens', {
    youtube_video_ids: normalizeRequestedYoutubeIds(youtubeVideoIds),
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data)
    ? data.map(normalizeTrackListenStatusRow).filter(Boolean)
    : [];

  return rows.reduce((statusById, row) => {
    statusById[row.youtubeVideoId] = row.listenStatus;
    return statusById;
  }, {});
}

export async function recordYouTubeTrackListen(
  supabase,
  youtubeVideoId,
  listenEvent,
  secondsPlayed = 0,
) {
  const normalizedVideoId =
    typeof youtubeVideoId === 'string' ? youtubeVideoId.trim() : '';

  const { data, error } = await supabase.rpc('record_youtube_track_listen', {
    youtube_video_id: normalizedVideoId,
    listen_event: listenEvent,
    seconds_played: secondsPlayed,
  });

  if (error) {
    throw error;
  }

  return normalizeTrackListenStatusRow({
    youtube_video_id: normalizedVideoId,
    ...data,
  });
}

export async function fetchUserTrackSupports(supabase, userId) {
  const { data, error } = await supabase
    .from('track_supports')
    .select('track_id, level')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return (data || []).reduce((acc, row) => {
    acc[row.track_id] = row.level;
    return acc;
  }, {});
}

export async function saveTrackSupport(supabase, userId, video, level) {
  if (!video.trackId) return; // Only sync cataloged tracks

  if (level === 0) {
    // Remove support
    const { error } = await supabase
      .from('track_supports')
      .delete()
      .eq('track_id', video.trackId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('track_supports').upsert(
      {
        track_id: video.trackId,
        user_id: userId,
        level,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'track_id,user_id' },
    );
    if (error) throw error;
  }
}

export function recordTrackHistory(track) {
  if (!track || !track.videoId) return;

  try {
    const rawHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    let history = rawHistory ? JSON.parse(rawHistory) : [];

    // Remove existing entry of the same track to move it to the top
    history = history.filter((item) => item.videoId !== track.videoId);

    // Add to the beginning
    history.unshift({
      videoId: track.videoId,
      title: track.title,
      trackTitle: track.trackTitle,
      gameTitle: track.gameTitle,
      trackId: track.trackId,
      timestamp: new Date().toISOString(),
    });

    // Limit to 200
    if (history.length > MAX_HISTORY_LENGTH) {
      history = history.slice(0, MAX_HISTORY_LENGTH);
    }

    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to record track history:', err);
  }
}

export function getTrackHistory() {
  try {
    const rawHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    return rawHistory ? JSON.parse(rawHistory) : [];
  } catch {
    return [];
  }
}

export function clearTrackHistory() {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}

export async function fetchListenHistory(supabase, limit = 200) {
  const { data, error } = await supabase.rpc('get_user_listen_history', {
    p_limit: limit,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => ({
    videoId: row.video_id,
    trackId: row.track_id,
    trackTitle: row.track_title || '',
    gameTitle: row.game_title || '',
    timestamp: row.last_listened_at,
  }));
}

export async function fetchUserHydratedState(supabase, userId) {
  const { data, error } = await supabase.rpc('get_user_hydrated_state', {
    req_user_id: userId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function saveTrackNomination(
  supabase,
  userId,
  video,
  isNominated,
) {
  if (!video.trackId) return;

  if (!isNominated) {
    const { error } = await supabase
      .from('track_nominations')
      .delete()
      .eq('track_id', video.trackId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('track_nominations').upsert(
      {
        track_id: video.trackId,
        user_id: userId,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'track_id,user_id' },
    );
    if (error) throw error;
  }
}

export async function syncNominations(
  supabase,
  userId,
  nominationList,
  previousList = null,
) {
  const currentEntries = nominationList.filter((v) => v.trackId != null);
  const currentTrackIds = currentEntries.map((v) => v.trackId);
  const currentSet = new Set(currentTrackIds);

  // Guard: if current list is empty and we have no previous cache, we cannot
  // distinguish "user genuinely cleared everything" from "state wasn't loaded
  // yet". Skip rather than risk deleting rows that still exist in the DB.
  if (currentEntries.length === 0 && previousList === null) {
    return;
  }

  let trackIdsToDelete;
  if (previousList !== null) {
    // Use cached previous state — no SELECT needed
    const prevSet = new Set(
      previousList.filter((v) => v.trackId != null).map((v) => v.trackId),
    );
    trackIdsToDelete = [...prevSet].filter((id) => !currentSet.has(id));
  } else {
    // First sync after login — fall back to fetching from DB
    const { data: existingNoms } = await supabase
      .from('track_nominations')
      .select('track_id')
      .eq('user_id', userId);
    trackIdsToDelete = (existingNoms || [])
      .filter((n) => !currentSet.has(n.track_id))
      .map((n) => n.track_id);
  }

  if (trackIdsToDelete.length > 0) {
    await supabase
      .from('track_nominations')
      .delete()
      .eq('user_id', userId)
      .in('track_id', trackIdsToDelete);
  }

  // Only upsert rows that are new or have changed order_index
  const prevIndexMap =
    previousList !== null
      ? new Map(
          previousList
            .filter((v) => v.trackId != null)
            .map((v, i) => [v.trackId, i]),
        )
      : null;

  const tracksToUpsert = currentTrackIds
    .map((id, index) => ({ id, index }))
    .filter(({ id, index }) => {
      if (prevIndexMap === null) return true; // first sync, upsert everything
      if (!prevIndexMap.has(id)) return true; // new entry
      return prevIndexMap.get(id) !== index; // order changed
    })
    .map(({ id, index }) => ({
      user_id: userId,
      track_id: id,
      order_index: index,
    }));

  if (tracksToUpsert.length > 0) {
    await supabase
      .from('track_nominations')
      .upsert(tracksToUpsert, { onConflict: 'track_id,user_id' });
  }
}

export async function syncSupports(
  supabase,
  userId,
  supportList,
  previousList = null,
) {
  const validSupports = supportList.filter(
    (v) => v.trackId != null && v.supportLevel,
  );
  const currentSet = new Set(validSupports.map((v) => v.trackId));

  // Guard: if current list is empty and we have no previous cache, skip.
  // Cannot distinguish "genuinely empty" from "state not yet loaded".
  if (validSupports.length === 0 && previousList === null) {
    return;
  }

  let trackIdsToDelete;
  if (previousList !== null) {
    // Use cached previous state — no SELECT needed
    const prevValid = previousList.filter(
      (v) => v.trackId != null && v.supportLevel,
    );
    const prevSet = new Set(prevValid.map((v) => v.trackId));
    trackIdsToDelete = [...prevSet].filter((id) => !currentSet.has(id));
  } else {
    // First sync after login — fall back to fetching from DB
    const { data: existingSups } = await supabase
      .from('track_supports')
      .select('track_id')
      .eq('user_id', userId);
    trackIdsToDelete = (existingSups || [])
      .filter((s) => !currentSet.has(s.track_id))
      .map((s) => s.track_id);
  }

  if (trackIdsToDelete.length > 0) {
    await supabase
      .from('track_supports')
      .delete()
      .eq('user_id', userId)
      .in('track_id', trackIdsToDelete);
  }

  // Only upsert rows that are new, changed support level, or changed order_index
  const prevStateMap =
    previousList !== null
      ? new Map(
          previousList
            .filter((v) => v.trackId != null && v.supportLevel)
            .map((v, i) => [v.trackId, { index: i, level: v.supportLevel }]),
        )
      : null;

  const tracksToUpsert = validSupports
    .map((v, index) => ({ v, index }))
    .filter(({ v, index }) => {
      if (prevStateMap === null) return true; // first sync, upsert everything
      const prev = prevStateMap.get(v.trackId);
      if (!prev) return true; // new entry
      return prev.index !== index || prev.level !== v.supportLevel; // order or level changed
    })
    .map(({ v, index }) => ({
      user_id: userId,
      track_id: v.trackId,
      level: v.supportLevel,
      order_index: index,
    }));

  if (tracksToUpsert.length > 0) {
    await supabase
      .from('track_supports')
      .upsert(tracksToUpsert, { onConflict: 'track_id,user_id' });
  }
}

export async function saveActiveQueue(
  supabase,
  userId,
  playlistVideos,
  previousPlaylist = null,
) {
  let { data: queue, error: queueError } = await supabase
    .from('user_playlists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active_queue', true)
    .maybeSingle();

  if (queueError) throw queueError;

  let playlistId;
  if (!queue) {
    const { data: newQueue, error: insertError } = await supabase
      .from('user_playlists')
      .insert({ user_id: userId, name: 'Now Playing', is_active_queue: true })
      .select('id')
      .single();
    if (insertError) throw insertError;
    playlistId = newQueue.id;
  } else {
    playlistId = queue.id;
  }

  const currentEntries = playlistVideos.filter((v) => v.trackId != null);
  const currentSet = new Set(currentEntries.map((v) => v.trackId));

  if (previousPlaylist !== null) {
    // Diff-based: only delete removed tracks, upsert changed/new tracks
    const prevEntries = previousPlaylist.filter((v) => v.trackId != null);
    const prevSet = new Set(prevEntries.map((v) => v.trackId));

    const trackIdsToDelete = [...prevSet].filter((id) => !currentSet.has(id));
    if (trackIdsToDelete.length > 0) {
      await supabase
        .from('user_playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId)
        .in('track_id', trackIdsToDelete);
    }

    const prevIndexMap = new Map(prevEntries.map((v, i) => [v.trackId, i]));
    const tracksToUpsert = currentEntries
      .map((v, i) => ({ v, i }))
      .filter(({ v, i }) => {
        if (!prevIndexMap.has(v.trackId)) return true; // new
        return prevIndexMap.get(v.trackId) !== i; // reordered
      })
      .map(({ v, i }) => ({
        playlist_id: playlistId,
        track_id: v.trackId,
        order_index: i,
      }));

    if (tracksToUpsert.length > 0) {
      const { error: tracksError } = await supabase
        .from('user_playlist_tracks')
        .upsert(tracksToUpsert, { onConflict: 'playlist_id,track_id' });
      if (tracksError) throw tracksError;
    }
  } else if (currentEntries.length > 0) {
    // First sync or no cache — full replace, but only if there are tracks.
    // If current is empty and we have no cache, skip: cannot distinguish
    // "genuinely empty" from "state not yet loaded". Avoids wiping the table.
    await supabase
      .from('user_playlist_tracks')
      .delete()
      .eq('playlist_id', playlistId);

    const tracksToInsert = currentEntries.map((v, i) => ({
      playlist_id: playlistId,
      track_id: v.trackId,
      order_index: i,
    }));

    const { error: tracksError } = await supabase
      .from('user_playlist_tracks')
      .insert(tracksToInsert);
    if (tracksError) throw tracksError;
  }
}

export async function syncCustomPlaylists(supabase, userId, customPlaylists) {
  // First, fetch existing custom playlists to see what to delete
  const { data: existingPls, error: fetchError } = await supabase
    .from('user_playlists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active_queue', false);

  if (fetchError) throw fetchError;

  const currentIds = new Set(customPlaylists.map((pl) => pl.id));
  const idsToDelete = (existingPls || [])
    .filter((pl) => !currentIds.has(pl.id))
    .map((pl) => pl.id);

  if (idsToDelete.length > 0) {
    await supabase.from('user_playlists').delete().in('id', idsToDelete);
  }

  // Upsert current ones
  for (const pl of customPlaylists) {
    // If pl.id is 'pl-...', we shouldn't use it as a uuid.
    // However, App.jsx uses 'pl-xxxx'. Our migrations ignore 'pl-'. Let's check pl.id format
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        pl.id,
      );
    let playlistId = isUuid ? pl.id : undefined;

    const playlistData = {
      user_id: userId,
      name: pl.name || 'Untitled Playlist',
      is_active_queue: false,
      is_public: pl.is_public === true,
    };
    if (playlistId) {
      playlistData.id = playlistId;
    }

    const { data: upsertedPl, error: plError } = await supabase
      .from('user_playlists')
      .upsert(playlistData, { onConflict: 'id' })
      .select('id')
      .single();

    if (plError) {
      console.error(
        'syncCustomPlaylists: failed to upsert playlist',
        pl.name,
        plError,
      );
      continue;
    }
    playlistId = upsertedPl.id;
    // ensure local object gets the actual UUID if it didn't have one
    if (!isUuid) {
      pl.id = playlistId;
    }

    await supabase
      .from('user_playlist_tracks')
      .delete()
      .eq('playlist_id', playlistId);

    const tracksToInsert = (pl.videos || [])
      .filter((v) => v.trackId != null)
      .map((v, i) => ({
        playlist_id: playlistId,
        track_id: v.trackId,
        order_index: i,
      }));

    if (tracksToInsert.length > 0) {
      await supabase.from('user_playlist_tracks').insert(tracksToInsert);
    }
  }
  return customPlaylists;
}
