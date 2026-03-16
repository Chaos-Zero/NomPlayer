export const PLAYER_STATE_STORAGE_KEY = 'yt_player_state';

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
  const supportList = normalizeVideoList(
    rawState?.supportList ?? supportListFallback,
  );
  const nominationList = normalizeVideoList(
    rawState?.nominationList ?? nominationListFallback,
  );
  const shuffleOrderIds = normalizeIdList(
    rawState?.shuffleOrderIds,
    playlistIdSet,
  );
  const currentVideoId =
    typeof rawState?.currentVideoId === 'string' &&
    playlistIdSet.has(rawState.currentVideoId)
      ? rawState.currentVideoId
      : (playlist[0]?.videoId ?? null);

  return {
    playlist,
    currentVideoId,
    shuffleOrderIds,
    showOriginalOrder: Boolean(rawState?.showOriginalOrder),
    listenedStatusById: normalizeListenedStatus(
      rawState?.listenedStatusById,
      playlistIdSet,
    ),
    supportList,
    nominationList,
  };
}

export function createPersistedPlayerState(state) {
  return normalizePersistedPlayerState(state);
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

export function deriveProfileUsername(user, existingUsername = '') {
  if (existingUsername && existingUsername.trim()) {
    return existingUsername.trim();
  }

  const metadataUsername =
    typeof user?.user_metadata?.username === 'string'
      ? user.user_metadata.username.trim()
      : '';
  if (metadataUsername) {
    return metadataUsername;
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

export async function fetchUserProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertUserProfile(supabase, profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, {
      onConflict: 'id',
    })
    .select('id, username, email')
    .single();

  if (error) {
    throw error;
  }

  return data;
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

export async function saveUserPlayerState(supabase, userId, state) {
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

  return snapshot;
}
