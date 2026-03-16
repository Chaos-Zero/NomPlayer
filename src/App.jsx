import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import TopBar from './components/TopBar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PlaylistSidebar from './components/PlaylistSidebar.jsx';
import FavouritesPanel from './components/FavouritesPanel.jsx';
import AuthDialog from './components/AuthDialog.jsx';
import HomePage from './components/HomePage.jsx';
import SiteNavigation from './components/SiteNavigation.jsx';
import ScrollingText from './components/ScrollingText.jsx';
import UserSettingsDialog from './components/UserSettingsDialog.jsx';
import useMediaQuery from './hooks/useMediaQuery.js';
import {
  PLAYER_STATE_STORAGE_KEY,
  createPersistedPlayerState,
  deriveProfileUsername,
  fetchUserPlayerState,
  fetchUserProfile,
  hasMeaningfulPlayerState,
  loadLocalPlayerState,
  normalizePersistedPlayerState,
  saveUserPlayerState,
  upsertUserProfile,
} from './lib/playerState.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabase.js';

const SUPPORT_STORAGE_KEY = 'yt_support_list';
const NOMINATIONS_STORAGE_KEY = 'yt_nominations_list';
const LEGACY_STORAGE_KEY = 'yt_favourites';
const PREVIEW_DURATION_MS = 31_000;

function loadStoredList(storageKey, fallbackKey = null) {
  try {
    const storedValue = localStorage.getItem(storageKey);
    if (storedValue) return JSON.parse(storedValue);

    if (fallbackKey) {
      const fallbackValue = localStorage.getItem(fallbackKey);
      if (fallbackValue) return JSON.parse(fallbackValue);
    }

    return [];
  } catch {
    return [];
  }
}

function loadSupportList() {
  return loadStoredList(SUPPORT_STORAGE_KEY, LEGACY_STORAGE_KEY);
}

function loadNominationList() {
  return loadStoredList(NOMINATIONS_STORAGE_KEY);
}

function appendUniqueVideos(list, videos, blockedIds = new Set()) {
  const existingIds = new Set(list.map((entry) => entry.videoId));
  const nextList = [...list];
  let addedCount = 0;
  const blockedVideoIds = new Set();
  const duplicateVideoIds = new Set();

  for (const video of videos) {
    if (blockedIds.has(video.videoId)) {
      blockedVideoIds.add(video.videoId);
      continue;
    }

    if (existingIds.has(video.videoId)) {
      duplicateVideoIds.add(video.videoId);
      continue;
    }

    existingIds.add(video.videoId);
    nextList.push(video);
    addedCount += 1;
  }

  return {
    nextList: addedCount > 0 ? nextList : list,
    addedCount,
    blockedCount: blockedVideoIds.size,
    duplicateCount: duplicateVideoIds.size,
  };
}

function resolvePlayOrderIds(playlist, shuffleOrderIds) {
  const originalIds = playlist.map((video) => video.videoId);
  if (shuffleOrderIds.length !== originalIds.length) return originalIds;

  const originalIdSet = new Set(originalIds);
  if (shuffleOrderIds.some((id) => !originalIdSet.has(id))) return originalIds;

  return shuffleOrderIds;
}

function shuffleVideoIds(videoIds, pinnedVideoId = null) {
  const remainingIds = pinnedVideoId
    ? videoIds.filter((id) => id !== pinnedVideoId)
    : [...videoIds];

  for (let index = remainingIds.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [remainingIds[index], remainingIds[swapIndex]] = [
      remainingIds[swapIndex],
      remainingIds[index],
    ];
  }

  return pinnedVideoId ? [pinnedVideoId, ...remainingIds] : remainingIds;
}

export default function App() {
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
  const supabase = getSupabaseClient();
  const initialPlayerStateRef = useRef(null);
  if (!initialPlayerStateRef.current) {
    initialPlayerStateRef.current = loadLocalPlayerState({
      supportListFallback: loadSupportList(),
      nominationListFallback: loadNominationList(),
    });
  }
  const initialPlayerState = initialPlayerStateRef.current;
  const [activePage, setActivePage] = useState('home');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [
    suppressPlaylistRestoreTransition,
    setSuppressPlaylistRestoreTransition,
  ] = useState(false);
  // Playlist state
  const [playlist, setPlaylist] = useState(initialPlayerState.playlist);
  const playlistRef = useRef([]);
  const [currentVideoId, setCurrentVideoId] = useState(
    initialPlayerState.currentVideoId,
  );
  const currentVideoIdRef = useRef(null);
  const [shuffleOrderIds, setShuffleOrderIds] = useState(
    initialPlayerState.shuffleOrderIds,
  );
  const shuffleOrderIdsRef = useRef([]);
  const [showOriginalOrder, setShowOriginalOrder] = useState(
    initialPlayerState.showOriginalOrder,
  );
  const [listenedStatusById, setListenedStatusById] = useState(
    initialPlayerState.listenedStatusById,
  );
  const [transientVideo, setTransientVideo] = useState(null);
  const transientResumeVideoIdRef = useRef(null);
  const [flashVideoIds, setFlashVideoIds] = useState([]);
  const [isPlaylistCollapsed, setIsPlaylistCollapsed] = useState(
    () => window.matchMedia?.('(max-width: 960px)')?.matches ?? false,
  );
  const [isPreviewModeEnabled, setIsPreviewModeEnabled] = useState(false);
  const isPlayingRef = useRef(false);
  const hasReachedPlaylistEndRef = useRef(false);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);

  // Support list
  const [supportList, setSupportList] = useState(
    initialPlayerState.supportList,
  );
  const [showSupportList, setShowSupportList] = useState(false);
  const [renderSupportList, setRenderSupportList] = useState(false);
  const [nominationList, setNominationList] = useState(
    initialPlayerState.nominationList,
  );
  const [showNominationsList, setShowNominationsList] = useState(false);
  const [renderNominationsList, setRenderNominationsList] = useState(false);
  const [supportToastMessage, setSupportToastMessage] = useState('');
  const [isDetachedFooterEntering, setIsDetachedFooterEntering] =
    useState(false);
  const [isDetachedFooterPending, setIsDetachedFooterPending] = useState(false);
  const [isPlayerRevealPending, setIsPlayerRevealPending] = useState(false);
  const [isPlayerRevealing, setIsPlayerRevealing] = useState(false);
  const supportToastTimeoutRef = useRef(null);
  const restoreTransitionFrameRef = useRef(0);
  const detachedFooterTimeoutRef = useRef(0);
  const detachedFooterFrameRef = useRef(0);
  const playerRevealTimeoutRef = useRef(0);
  const playerRevealFrameRef = useRef(0);
  const syncTimeoutRef = useRef(0);
  const pendingMergeAfterLoginRef = useRef(false);
  const pendingPreferredUsernameRef = useRef('');
  const lastSyncedPlayerStateRef = useRef('');
  const [authSession, setAuthSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState(null);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsSubmitting, setIsSettingsSubmitting] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');

  useEffect(
    () => () => {
      if (supportToastTimeoutRef.current) {
        window.clearTimeout(supportToastTimeoutRef.current);
      }
      if (restoreTransitionFrameRef.current) {
        window.cancelAnimationFrame(restoreTransitionFrameRef.current);
      }
      if (detachedFooterTimeoutRef.current) {
        window.clearTimeout(detachedFooterTimeoutRef.current);
      }
      if (detachedFooterFrameRef.current) {
        window.cancelAnimationFrame(detachedFooterFrameRef.current);
      }
      if (playerRevealTimeoutRef.current) {
        window.clearTimeout(playerRevealTimeoutRef.current);
      }
      if (playerRevealFrameRef.current) {
        window.cancelAnimationFrame(playerRevealFrameRef.current);
      }
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    currentVideoIdRef.current = currentVideoId;
  }, [currentVideoId]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    shuffleOrderIdsRef.current = shuffleOrderIds;
  }, [shuffleOrderIds]);

  useEffect(() => {
    if (flashVideoIds.length === 0) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFlashVideoIds([]);
    }, 1400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [flashVideoIds]);

  const createPlayerStateSnapshot = useCallback(
    () =>
      createPersistedPlayerState({
        playlist,
        currentVideoId,
        shuffleOrderIds,
        showOriginalOrder,
        listenedStatusById,
        supportList,
        nominationList,
      }),
    [
      currentVideoId,
      listenedStatusById,
      nominationList,
      playlist,
      showOriginalOrder,
      shuffleOrderIds,
      supportList,
    ],
  );

  const applyPersistedPlayerState = useCallback((nextState) => {
    const normalizedState = normalizePersistedPlayerState(nextState);

    transientResumeVideoIdRef.current = null;
    setTransientVideo(null);
    setFlashVideoIds([]);
    hasReachedPlaylistEndRef.current = false;

    playlistRef.current = normalizedState.playlist;
    setPlaylist(normalizedState.playlist);

    currentVideoIdRef.current = normalizedState.currentVideoId;
    setCurrentVideoId(normalizedState.currentVideoId);

    shuffleOrderIdsRef.current = normalizedState.shuffleOrderIds;
    setShuffleOrderIds(normalizedState.shuffleOrderIds);

    setShowOriginalOrder(normalizedState.showOriginalOrder);
    setListenedStatusById(normalizedState.listenedStatusById);
    setSupportList(normalizedState.supportList);
    setNominationList(normalizedState.nominationList);
    setIsPlaying(false);
  }, []);

  const authUser = authSession?.user ?? null;

  const playOrderIds = useMemo(
    () => resolvePlayOrderIds(playlist, shuffleOrderIds),
    [playlist, shuffleOrderIds],
  );

  const isShuffleEnabled = useMemo(
    () => shuffleOrderIds.length > 0 && playOrderIds === shuffleOrderIds,
    [playOrderIds, shuffleOrderIds],
  );

  const displayPlaylist = useMemo(() => {
    const loadIndexById = new Map(
      playlist.map((video, index) => [video.videoId, index]),
    );
    const orderIds =
      isShuffleEnabled && !showOriginalOrder
        ? playOrderIds
        : playlist.map((video) => video.videoId);
    const playlistById = new Map(
      playlist.map((video) => [video.videoId, video]),
    );

    return orderIds
      .map((videoId) => {
        const video = playlistById.get(videoId);
        if (!video) return null;
        return {
          ...video,
          loadIndex: loadIndexById.get(videoId) ?? 0,
        };
      })
      .filter(Boolean);
  }, [isShuffleEnabled, playlist, playOrderIds, showOriginalOrder]);

  const currentDisplayIndex = transientVideo
    ? null
    : displayPlaylist.findIndex((video) => video.videoId === currentVideoId);
  const isPlayerPage = activePage === 'player';

  const currentPlaylistVideo =
    playlist.find((video) => video.videoId === currentVideoId) || null;
  const currentVideo = transientVideo || currentPlaylistVideo;
  const isCurrentVideoSupported = currentVideo
    ? supportList.some((entry) => entry.videoId === currentVideo.videoId)
    : false;
  const isCurrentVideoNominated = currentVideo
    ? nominationList.some((entry) => entry.videoId === currentVideo.videoId)
    : false;
  const apiKeyMissing = !import.meta.env.VITE_YT_API_KEY;

  useEffect(() => {
    const snapshot = createPlayerStateSnapshot();
    localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(
      SUPPORT_STORAGE_KEY,
      JSON.stringify(snapshot.supportList),
    );
    localStorage.setItem(
      NOMINATIONS_STORAGE_KEY,
      JSON.stringify(snapshot.nominationList),
    );
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, [createPlayerStateSnapshot]);

  const ensureUserProfile = useCallback(
    async (user, preferredUsername = '') => {
      if (!supabase || !user) return null;

      const existingProfile = await fetchUserProfile(supabase, user.id);
      const nextUsername = deriveProfileUsername(user, preferredUsername);

      if (
        existingProfile &&
        existingProfile.username === nextUsername &&
        existingProfile.email === (user.email || '')
      ) {
        return existingProfile;
      }

      return upsertUserProfile(supabase, {
        id: user.id,
        username: nextUsername,
        email: user.email || '',
      });
    },
    [supabase],
  );

  const hydrateAuthenticatedUser = useCallback(
    async (user, { mergeLocalState = false, preferredUsername = '' } = {}) => {
      if (!supabase || !user) return;

      setIsAuthReady(false);

      try {
        const profile = await ensureUserProfile(user, preferredUsername);
        setUserProfile(profile);

        if (
          mergeLocalState &&
          hasMeaningfulPlayerState(createPlayerStateSnapshot())
        ) {
          const snapshot = createPlayerStateSnapshot();
          const savedSnapshot = await saveUserPlayerState(
            supabase,
            user.id,
            snapshot,
          );
          lastSyncedPlayerStateRef.current = JSON.stringify(savedSnapshot);
        } else {
          const remoteState = await fetchUserPlayerState(supabase, user.id);
          const normalizedState = normalizePersistedPlayerState(remoteState);
          applyPersistedPlayerState(normalizedState);
          lastSyncedPlayerStateRef.current = JSON.stringify(normalizedState);
        }
      } catch (error) {
        setAuthError(error.message || 'Failed to load your account data.');
      } finally {
        setIsAuthReady(true);
      }
    },
    [
      applyPersistedPlayerState,
      createPlayerStateSnapshot,
      ensureUserProfile,
      supabase,
    ],
  );

  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      return undefined;
    }

    let isActive = true;

    async function loadSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!isActive) return;
        if (error) throw error;

        setAuthSession(session);

        if (session?.user) {
          await hydrateAuthenticatedUser(session.user);
        } else {
          setUserProfile(null);
          setIsAuthReady(true);
        }
      } catch (error) {
        if (!isActive) return;
        setAuthError(error.message || 'Failed to restore your session.');
        setIsAuthReady(true);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;

      setAuthSession(session);

      if (!session?.user) {
        pendingMergeAfterLoginRef.current = false;
        pendingPreferredUsernameRef.current = '';
        lastSyncedPlayerStateRef.current = '';
        setUserProfile(null);
        setIsSettingsOpen(false);
        setIsAuthReady(true);
        return;
      }

      const mergeLocalState = pendingMergeAfterLoginRef.current;
      const preferredUsername = pendingPreferredUsernameRef.current;
      pendingMergeAfterLoginRef.current = false;
      pendingPreferredUsernameRef.current = '';

      window.setTimeout(() => {
        if (!isActive) return;
        hydrateAuthenticatedUser(session.user, {
          mergeLocalState,
          preferredUsername,
        });
      }, 0);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [hydrateAuthenticatedUser, supabase]);

  useEffect(() => {
    if (!supabase || !authUser || !isAuthReady) {
      return undefined;
    }

    const snapshot = createPlayerStateSnapshot();
    const serializedSnapshot = JSON.stringify(snapshot);

    if (serializedSnapshot === lastSyncedPlayerStateRef.current) {
      return undefined;
    }

    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      syncTimeoutRef.current = 0;
      saveUserPlayerState(supabase, authUser.id, snapshot)
        .then((savedSnapshot) => {
          lastSyncedPlayerStateRef.current = JSON.stringify(savedSnapshot);
        })
        .catch((error) => {
          setAuthError(error.message || 'Failed to sync your account data.');
        });
    }, 400);

    return () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = 0;
      }
    };
  }, [authUser, createPlayerStateSnapshot, isAuthReady, supabase]);

  const handleOpenAuthDialog = useCallback(() => {
    setAuthError('');
    setAuthMessage('');
    setAuthDialogMode('signin');
  }, []);

  const handleCloseAuthDialog = useCallback(() => {
    setAuthDialogMode(null);
    setAuthError('');
    setAuthMessage('');
  }, []);

  const handleSignIn = useCallback(
    async ({ email, password }) => {
      if (!supabase) {
        setAuthError('Supabase is not configured yet.');
        return;
      }

      setIsAuthSubmitting(true);
      setAuthError('');
      setAuthMessage('');
      pendingMergeAfterLoginRef.current = hasMeaningfulPlayerState(
        createPlayerStateSnapshot(),
      );
      pendingPreferredUsernameRef.current = '';

      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setAuthDialogMode(null);
      } catch (error) {
        pendingMergeAfterLoginRef.current = false;
        setAuthError(error.message || 'Failed to log in.');
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [createPlayerStateSnapshot, supabase],
  );

  const handleSignUp = useCallback(
    async ({ email, password, username }) => {
      if (!supabase) {
        setAuthError('Supabase is not configured yet.');
        return;
      }

      setIsAuthSubmitting(true);
      setAuthError('');
      setAuthMessage('');
      pendingMergeAfterLoginRef.current = hasMeaningfulPlayerState(
        createPlayerStateSnapshot(),
      );
      pendingPreferredUsernameRef.current = username.trim();

      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username.trim(),
            },
          },
        });

        if (error) throw error;

        if (!session) {
          pendingMergeAfterLoginRef.current = false;
          pendingPreferredUsernameRef.current = '';
          setAuthMessage(
            'Account created. Check your email to confirm the sign-up, then log in.',
          );
          return;
        }

        setAuthDialogMode(null);
      } catch (error) {
        pendingMergeAfterLoginRef.current = false;
        pendingPreferredUsernameRef.current = '';
        setAuthError(error.message || 'Failed to create your account.');
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [createPlayerStateSnapshot, supabase],
  );

  const handleLogout = useCallback(async () => {
    if (!supabase) return;

    setAuthError('');

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setAuthError(error.message || 'Failed to log out.');
    }
  }, [supabase]);

  const handleOpenSettings = useCallback(() => {
    setSettingsError('');
    setSettingsNotice('');
    setIsSettingsOpen(true);
  }, []);

  const handleSaveSettings = useCallback(
    async ({ username }) => {
      if (!supabase || !authUser) return;

      setIsSettingsSubmitting(true);
      setSettingsError('');
      setSettingsNotice('');

      try {
        const profile = await upsertUserProfile(supabase, {
          id: authUser.id,
          username: deriveProfileUsername(authUser, username),
          email: authUser.email || '',
        });
        setUserProfile(profile);
        setSettingsNotice('Settings saved.');
      } catch (error) {
        setSettingsError(error.message || 'Failed to save your settings.');
      } finally {
        setIsSettingsSubmitting(false);
      }
    },
    [authUser, supabase],
  );

  const markVideoCompleted = useCallback((videoId) => {
    if (!videoId) return;

    setListenedStatusById((previousStatus) => {
      if (previousStatus[videoId] === 'complete') return previousStatus;
      return {
        ...previousStatus,
        [videoId]: 'complete',
      };
    });
  }, []);

  const markVideoStarted = useCallback((videoId) => {
    if (!videoId) return;

    setListenedStatusById((previousStatus) => {
      if (previousStatus[videoId]) return previousStatus;
      return {
        ...previousStatus,
        [videoId]: 'partial',
      };
    });
  }, []);

  const handleAdvancePreview = useCallback(() => {
    const resolvedPlayOrderIds = resolvePlayOrderIds(
      playlistRef.current,
      shuffleOrderIdsRef.current,
    );

    if (transientVideo) {
      transientResumeVideoIdRef.current = null;
      setTransientVideo(null);
    }

    if (resolvedPlayOrderIds.length === 0) {
      hasReachedPlaylistEndRef.current = false;
      setIsPlaying(false);
      return;
    }

    const activeVideoId = currentVideoIdRef.current ?? resolvedPlayOrderIds[0];
    const currentPlayIndex = Math.max(
      0,
      resolvedPlayOrderIds.indexOf(activeVideoId),
    );

    if (currentPlayIndex >= resolvedPlayOrderIds.length - 1) {
      hasReachedPlaylistEndRef.current = false;
      setIsPlaying(false);
      return;
    }

    const nextVideoId = resolvedPlayOrderIds[currentPlayIndex + 1];
    hasReachedPlaylistEndRef.current = false;
    markVideoStarted(nextVideoId);
    setCurrentVideoId(nextVideoId);
    setIsPlaying(true);
  }, [markVideoStarted, transientVideo]);

  useEffect(() => {
    if (!isPreviewModeEnabled || !isPlaying || !currentVideo?.videoId)
      return undefined;

    const timeoutId = window.setTimeout(() => {
      handleAdvancePreview();
    }, PREVIEW_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    currentVideo?.videoId,
    handleAdvancePreview,
    isPlaying,
    isPreviewModeEnabled,
  ]);

  const appendVideosToPlaylist = useCallback(
    (videos, options = {}) => {
      const {
        autoplayIfFirst = false,
        startVideoId = null,
        flashResolved = false,
      } = options;

      if (!videos.length) {
        return {
          addedCount: 0,
          resolvedVideoIds: [],
        };
      }

      const previousPlaylist = playlistRef.current;
      const previousLength = previousPlaylist.length;
      const nextPlaylist = [...previousPlaylist];
      const indexById = new Map(
        previousPlaylist.map((video, index) => [video.videoId, index]),
      );

      const resolvedVideoIds = [];
      const newVideoIds = [];
      let resolvedStartVideoId =
        startVideoId && indexById.has(startVideoId) ? startVideoId : null;

      for (const video of videos) {
        const existingIndex = indexById.get(video.videoId);
        if (existingIndex !== undefined) {
          resolvedVideoIds.push(video.videoId);
          if (video.videoId === startVideoId) {
            resolvedStartVideoId = video.videoId;
          }
          continue;
        }

        nextPlaylist.push(video);
        indexById.set(video.videoId, nextPlaylist.length - 1);
        newVideoIds.push(video.videoId);
        resolvedVideoIds.push(video.videoId);

        if (video.videoId === startVideoId) {
          resolvedStartVideoId = video.videoId;
        }
      }

      if (nextPlaylist.length === previousLength) {
        if (flashResolved && resolvedVideoIds.length > 0) {
          setFlashVideoIds(resolvedVideoIds);
        }
        return {
          addedCount: 0,
          resolvedVideoIds,
        };
      }

      playlistRef.current = nextPlaylist;
      setPlaylist(nextPlaylist);
      hasReachedPlaylistEndRef.current = false;
      if (isMobileLayout) {
        setIsPlaylistCollapsed(false);
      }

      if (shuffleOrderIdsRef.current.length > 0) {
        const nextIdSet = new Set(nextPlaylist.map((video) => video.videoId));
        const nextShuffleOrderIds = shuffleOrderIdsRef.current.filter((id) =>
          nextIdSet.has(id),
        );
        nextShuffleOrderIds.push(
          ...newVideoIds.filter((id) => !nextShuffleOrderIds.includes(id)),
        );
        shuffleOrderIdsRef.current = nextShuffleOrderIds;
        setShuffleOrderIds(nextShuffleOrderIds);
      }

      if (previousLength === 0) {
        const initialVideoId =
          resolvedStartVideoId ?? nextPlaylist[0]?.videoId ?? null;
        if (autoplayIfFirst) {
          markVideoStarted(initialVideoId);
        }
        setCurrentVideoId(initialVideoId);
        if (flashResolved && resolvedVideoIds.length > 0) {
          setFlashVideoIds(resolvedVideoIds);
        }
        if (!transientVideo) {
          setIsPlaying(autoplayIfFirst);
        }
        return {
          addedCount: newVideoIds.length,
          resolvedVideoIds,
        };
      }

      if (flashResolved && resolvedVideoIds.length > 0) {
        setFlashVideoIds(resolvedVideoIds);
      }
      return {
        addedCount: newVideoIds.length,
        resolvedVideoIds,
      };
    },
    [isMobileLayout, markVideoStarted, transientVideo],
  );

  // ── Load a new playlist / single video ──────────────────────────
  const handleLoad = useCallback(
    (items, options = {}) => {
      const {
        startVideoId = null,
        mode = 'replace',
        autoplay = false,
      } = options;

      if (mode === 'append') {
        appendVideosToPlaylist(items, {
          autoplayIfFirst: autoplay,
          startVideoId,
        });
        return;
      }

      transientResumeVideoIdRef.current = null;
      setTransientVideo(null);
      hasReachedPlaylistEndRef.current = false;
      playlistRef.current = items;
      setPlaylist(items);
      if (isMobileLayout) {
        setIsPlaylistCollapsed(false);
      }
      shuffleOrderIdsRef.current = [];
      setShuffleOrderIds([]);
      setShowOriginalOrder(false);
      setListenedStatusById({});

      const resolvedStartVideoId =
        startVideoId && items.some((video) => video.videoId === startVideoId)
          ? startVideoId
          : (items[0]?.videoId ?? null);

      if (autoplay) {
        markVideoStarted(resolvedStartVideoId);
      }
      setCurrentVideoId(resolvedStartVideoId);
      setIsPlaying(autoplay);
    },
    [appendVideosToPlaylist, isMobileLayout, markVideoStarted],
  );

  // ── Navigation ──────────────────────────────────────────────────
  const goToVideo = useCallback(
    (videoId) => {
      if (!playlistRef.current.some((video) => video.videoId === videoId))
        return;

      transientResumeVideoIdRef.current = null;
      setTransientVideo(null);
      hasReachedPlaylistEndRef.current = false;
      if (isPlaying) {
        markVideoStarted(videoId);
      }
      setCurrentVideoId(videoId);
    },
    [isPlaying, markVideoStarted],
  );

  const handlePrev = useCallback(() => {
    const resolvedPlayOrderIds = resolvePlayOrderIds(
      playlistRef.current,
      shuffleOrderIdsRef.current,
    );
    if (resolvedPlayOrderIds.length === 0) return;

    transientResumeVideoIdRef.current = null;
    setTransientVideo(null);
    hasReachedPlaylistEndRef.current = false;

    const activeVideoId = currentVideoIdRef.current ?? resolvedPlayOrderIds[0];
    const currentPlayIndex = Math.max(
      0,
      resolvedPlayOrderIds.indexOf(activeVideoId),
    );
    const previousVideoId =
      resolvedPlayOrderIds[Math.max(0, currentPlayIndex - 1)];

    if (isPlaying) {
      markVideoStarted(previousVideoId);
    }
    setCurrentVideoId(previousVideoId);
  }, [isPlaying, markVideoStarted]);

  const handleNext = useCallback(() => {
    const resolvedPlayOrderIds = resolvePlayOrderIds(
      playlistRef.current,
      shuffleOrderIdsRef.current,
    );
    if (resolvedPlayOrderIds.length === 0) return;

    transientResumeVideoIdRef.current = null;
    setTransientVideo(null);
    hasReachedPlaylistEndRef.current = false;

    const activeVideoId = currentVideoIdRef.current ?? resolvedPlayOrderIds[0];
    const currentPlayIndex = Math.max(
      0,
      resolvedPlayOrderIds.indexOf(activeVideoId),
    );
    const nextVideoId =
      resolvedPlayOrderIds[
        Math.min(currentPlayIndex + 1, resolvedPlayOrderIds.length - 1)
      ];

    if (isPlaying) {
      markVideoStarted(nextVideoId);
    }
    setCurrentVideoId(nextVideoId);
  }, [isPlaying, markVideoStarted]);

  const handleVideoEnd = useCallback(() => {
    if (!isPlaying) return;

    if (transientVideo) {
      const resumeVideoId = transientResumeVideoIdRef.current;
      transientResumeVideoIdRef.current = null;
      setTransientVideo(null);

      if (
        resumeVideoId &&
        playlistRef.current.some((video) => video.videoId === resumeVideoId)
      ) {
        hasReachedPlaylistEndRef.current = false;
        markVideoStarted(resumeVideoId);
        setCurrentVideoId(resumeVideoId);
        setIsPlaying(true);
      } else {
        hasReachedPlaylistEndRef.current = false;
        setIsPlaying(false);
      }
      return;
    }

    const finishedVideoId = currentVideoIdRef.current;
    const resolvedPlayOrderIds = resolvePlayOrderIds(
      playlistRef.current,
      shuffleOrderIdsRef.current,
    );
    const currentPlayIndex = finishedVideoId
      ? resolvedPlayOrderIds.indexOf(finishedVideoId)
      : -1;

    if (!isPreviewModeEnabled) {
      markVideoCompleted(finishedVideoId);
    }

    if (
      currentPlayIndex >= 0 &&
      currentPlayIndex < resolvedPlayOrderIds.length - 1
    ) {
      const nextVideoId = resolvedPlayOrderIds[currentPlayIndex + 1];
      hasReachedPlaylistEndRef.current = false;
      markVideoStarted(nextVideoId);
      setCurrentVideoId(nextVideoId);
      return;
    }

    hasReachedPlaylistEndRef.current =
      resolvedPlayOrderIds.length > 0 &&
      currentPlayIndex === resolvedPlayOrderIds.length - 1;
    setIsPlaying(false);
  }, [
    isPlaying,
    isPreviewModeEnabled,
    markVideoCompleted,
    markVideoStarted,
    transientVideo,
  ]);

  // ── Shuffle ─────────────────────────────────────────────────────
  const handleShufflePlaylist = useCallback(() => {
    hasReachedPlaylistEndRef.current = false;

    if (shuffleOrderIdsRef.current.length > 0) {
      shuffleOrderIdsRef.current = [];
      setShuffleOrderIds([]);
      setShowOriginalOrder(false);
      return;
    }

    const originalIds = playlistRef.current.map((video) => video.videoId);
    if (originalIds.length < 2) return;

    const pinnedVideoId =
      currentVideoIdRef.current &&
      originalIds.includes(currentVideoIdRef.current)
        ? currentVideoIdRef.current
        : originalIds[0];

    const nextShuffleOrderIds = shuffleVideoIds(originalIds, pinnedVideoId);
    shuffleOrderIdsRef.current = nextShuffleOrderIds;
    setShuffleOrderIds(nextShuffleOrderIds);
    setShowOriginalOrder(false);
  }, []);

  const handleTogglePlaylistOrderView = useCallback(() => {
    if (shuffleOrderIdsRef.current.length === 0) return;
    setShowOriginalOrder((previousValue) => !previousValue);
  }, []);

  const handleTogglePreviewMode = useCallback(() => {
    setIsPreviewModeEnabled((previousValue) => !previousValue);
  }, []);

  // ── Support list ─────────────────────────────────────────────────
  const handleOpenSupportList = useCallback(() => {
    setRenderNominationsList(false);
    setRenderSupportList(true);
    setShowSupportList(true);
    setShowNominationsList(false);
  }, []);

  const handleRequestCloseSupportList = useCallback(() => {
    setShowSupportList(false);
  }, []);

  const handleSupportListExited = useCallback(() => {
    setRenderSupportList(false);
  }, []);

  const handleOpenNominationsList = useCallback(() => {
    setRenderSupportList(false);
    setRenderNominationsList(true);
    setShowNominationsList(true);
    setShowSupportList(false);
  }, []);

  const handleRequestCloseNominationsList = useCallback(() => {
    setShowNominationsList(false);
  }, []);

  const handleNominationsListExited = useCallback(() => {
    setRenderNominationsList(false);
  }, []);

  const showSupportToast = useCallback((message) => {
    if (!message) return;

    if (supportToastTimeoutRef.current) {
      window.clearTimeout(supportToastTimeoutRef.current);
    }

    setSupportToastMessage(message);
    supportToastTimeoutRef.current = window.setTimeout(() => {
      supportToastTimeoutRef.current = null;
      setSupportToastMessage('');
    }, 1800);
  }, []);

  const handleToggleSupportFromPlaylist = useCallback(
    (video) => {
      if (!video) return;
      if (nominationList.some((entry) => entry.videoId === video.videoId))
        return;

      const exists = supportList.some(
        (entry) => entry.videoId === video.videoId,
      );

      setSupportList((previousList) => {
        if (exists) {
          return previousList.filter(
            (entry) => entry.videoId !== video.videoId,
          );
        }

        return [...previousList, video];
      });

      if (!exists) {
        showSupportToast('Added to Support list');
      }
    },
    [nominationList, showSupportToast, supportList],
  );

  const handleAddToSupportList = useCallback(
    (video) => {
      if (!video) return 0;
      if (nominationList.some((entry) => entry.videoId === video.videoId))
        return 0;

      let addedCount = 0;
      setSupportList((previousList) => {
        const result = appendUniqueVideos(
          previousList,
          [video],
          new Set(nominationList.map((entry) => entry.videoId)),
        );
        addedCount = result.addedCount;
        return result.nextList;
      });

      if (addedCount > 0) {
        showSupportToast('Added to Support list');
      }

      return addedCount;
    },
    [nominationList, showSupportToast],
  );

  const handleAddManyToSupportList = useCallback(
    (videos) => {
      if (!videos.length) {
        return { addedCount: 0, blockedNominationCount: 0 };
      }

      let resultSummary = {
        addedCount: 0,
        blockedNominationCount: 0,
      };
      setSupportList((previousList) => {
        const result = appendUniqueVideos(
          previousList,
          videos,
          new Set(nominationList.map((entry) => entry.videoId)),
        );
        resultSummary = {
          addedCount: result.addedCount,
          blockedNominationCount: result.blockedCount,
        };
        return result.nextList;
      });

      if (resultSummary.addedCount > 0) {
        showSupportToast(
          resultSummary.addedCount === 1
            ? 'Added 1 song to Support list'
            : `Added ${resultSummary.addedCount} songs to Support list`,
        );
      }

      return resultSummary;
    },
    [nominationList, showSupportToast],
  );

  const handleRemoveFromNominationList = useCallback((videoIdsOrId) => {
    const videoIds = Array.isArray(videoIdsOrId)
      ? videoIdsOrId
      : [videoIdsOrId];
    const idSet = new Set(videoIds);
    setNominationList((previousList) =>
      previousList.filter((entry) => !idSet.has(entry.videoId)),
    );
  }, []);

  const handleAddManyToNominationList = useCallback((videos) => {
    if (!videos.length) {
      return { addedCount: 0, blockedNominationCount: 0 };
    }

    const incomingIds = new Set(videos.map((video) => video.videoId));
    setSupportList((previousList) =>
      previousList.filter((entry) => !incomingIds.has(entry.videoId)),
    );

    let resultSummary = {
      addedCount: 0,
      blockedNominationCount: 0,
    };
    setNominationList((previousList) => {
      const result = appendUniqueVideos(previousList, videos);
      resultSummary = {
        addedCount: result.addedCount,
        blockedNominationCount: 0,
      };
      return result.nextList;
    });

    return resultSummary;
  }, []);

  const handleReorderNominationList = useCallback((newOrder) => {
    setNominationList(newOrder);
  }, []);

  const handleRemoveFromSupportList = useCallback((videoIdsOrId) => {
    const videoIds = Array.isArray(videoIdsOrId)
      ? videoIdsOrId
      : [videoIdsOrId];
    const idSet = new Set(videoIds);
    setSupportList((previousList) =>
      previousList.filter((entry) => !idSet.has(entry.videoId)),
    );
  }, []);

  const handleReorderSupportList = useCallback((newOrder) => {
    setSupportList(newOrder);
  }, []);

  const handleRemoveFromPlaylist = useCallback(
    (videoId) => {
      hasReachedPlaylistEndRef.current = false;
      const previousPlaylist = playlistRef.current;
      const removeIndex = previousPlaylist.findIndex(
        (video) => video.videoId === videoId,
      );
      if (removeIndex < 0) return;

      const previousPlayOrderIds = resolvePlayOrderIds(
        previousPlaylist,
        shuffleOrderIdsRef.current,
      );
      const removedPlayIndex = previousPlayOrderIds.indexOf(videoId);
      const nextPlaylist = previousPlaylist.filter(
        (video) => video.videoId !== videoId,
      );
      const nextIdSet = new Set(nextPlaylist.map((video) => video.videoId));
      const nextShuffleOrderIds =
        shuffleOrderIdsRef.current.length > 0
          ? shuffleOrderIdsRef.current.filter((id) => nextIdSet.has(id))
          : [];

      playlistRef.current = nextPlaylist;
      setPlaylist(nextPlaylist);
      shuffleOrderIdsRef.current = nextShuffleOrderIds;
      setShuffleOrderIds(nextShuffleOrderIds);
      if (nextShuffleOrderIds.length === 0) {
        setShowOriginalOrder(false);
      }

      setListenedStatusById((previousStatus) => {
        if (!(videoId in previousStatus)) return previousStatus;

        const nextStatus = { ...previousStatus };
        delete nextStatus[videoId];
        return nextStatus;
      });

      if (transientResumeVideoIdRef.current === videoId) {
        const remainingResumeIds = previousPlayOrderIds
          .slice(removedPlayIndex + 1)
          .filter((id) => nextIdSet.has(id));
        transientResumeVideoIdRef.current = remainingResumeIds[0] ?? null;
      }

      if (nextPlaylist.length === 0) {
        setCurrentVideoId(null);
        if (!transientVideo) {
          setIsPlaying(false);
        }
        return;
      }

      if (!transientVideo && currentVideoIdRef.current === videoId) {
        const nextPlayOrderIds = resolvePlayOrderIds(
          nextPlaylist,
          nextShuffleOrderIds,
        );
        const replacementVideoId =
          nextPlayOrderIds[
            Math.min(removedPlayIndex, nextPlayOrderIds.length - 1)
          ] ?? nextPlaylist[0].videoId;
        if (isPlaying) {
          markVideoStarted(replacementVideoId);
        }
        setCurrentVideoId(replacementVideoId);
        return;
      }

      if (
        currentVideoIdRef.current &&
        !nextIdSet.has(currentVideoIdRef.current)
      ) {
        setCurrentVideoId(nextPlaylist[0].videoId);
      }
    },
    [isPlaying, markVideoStarted, transientVideo],
  );

  const handleQueueFromSupportList = useCallback(
    (videos) => {
      return appendVideosToPlaylist(videos, { flashResolved: true });
    },
    [appendVideosToPlaylist],
  );

  const handlePlayNowFromSupportList = useCallback(
    (video) => {
      hasReachedPlaylistEndRef.current = false;
      const resolvedPlayOrderIds = resolvePlayOrderIds(
        playlistRef.current,
        shuffleOrderIdsRef.current,
      );
      const activeVideoId = currentVideoIdRef.current;

      if (!transientVideo) {
        if (resolvedPlayOrderIds.length === 0) {
          transientResumeVideoIdRef.current = null;
        } else if (isPlaying && activeVideoId) {
          const activePlayIndex = resolvedPlayOrderIds.indexOf(activeVideoId);
          transientResumeVideoIdRef.current =
            activePlayIndex >= 0 &&
            activePlayIndex < resolvedPlayOrderIds.length - 1
              ? resolvedPlayOrderIds[activePlayIndex + 1]
              : null;
        } else {
          transientResumeVideoIdRef.current =
            activeVideoId && resolvedPlayOrderIds.includes(activeVideoId)
              ? activeVideoId
              : (resolvedPlayOrderIds[0] ?? null);
        }
      }

      setTransientVideo(video);
      setIsPlaying(true);
    },
    [isPlaying, transientVideo],
  );

  const handleSetIsPlaying = useCallback(
    (value) => {
      const previousValue = isPlayingRef.current;
      const nextValue =
        typeof value === 'function' ? value(previousValue) : value;
      const resolvedPlayOrderIds = resolvePlayOrderIds(
        playlistRef.current,
        shuffleOrderIdsRef.current,
      );
      const hasPlayableQueue =
        Boolean(transientVideo) || resolvedPlayOrderIds.length > 0;

      if (!hasPlayableQueue) {
        setIsPlaying(false);
        return;
      }

      if (!previousValue && nextValue) {
        if (transientVideo) {
          hasReachedPlaylistEndRef.current = false;
        } else {
          const restartVideoId =
            hasReachedPlaylistEndRef.current && resolvedPlayOrderIds.length > 0
              ? resolvedPlayOrderIds[0]
              : (currentVideoIdRef.current ?? resolvedPlayOrderIds[0] ?? null);

          if (restartVideoId && restartVideoId !== currentVideoIdRef.current) {
            setCurrentVideoId(restartVideoId);
          }
          if (restartVideoId) {
            markVideoStarted(restartVideoId);
          }
          hasReachedPlaylistEndRef.current = false;
        }
      }

      setIsPlaying(nextValue);
    },
    [markVideoStarted, transientVideo],
  );

  const handleNavigate = useCallback(
    (nextPage) => {
      const shouldAnimateDetachedFooter =
        nextPage !== 'player' &&
        Boolean(currentVideoIdRef.current) &&
        isPlayingRef.current;
      const shouldAnimatePlayerReveal =
        nextPage === 'player' &&
        !isMobileLayout &&
        Boolean(currentVideoIdRef.current);

      if (nextPage === 'player' && !isMobileLayout && !isPlaylistCollapsed) {
        if (restoreTransitionFrameRef.current) {
          window.cancelAnimationFrame(restoreTransitionFrameRef.current);
        }
        setSuppressPlaylistRestoreTransition(true);
        restoreTransitionFrameRef.current = window.requestAnimationFrame(() => {
          restoreTransitionFrameRef.current = window.requestAnimationFrame(
            () => {
              restoreTransitionFrameRef.current = 0;
              setSuppressPlaylistRestoreTransition(false);
            },
          );
        });
      }

      if (detachedFooterFrameRef.current) {
        window.cancelAnimationFrame(detachedFooterFrameRef.current);
        detachedFooterFrameRef.current = 0;
      }
      if (playerRevealFrameRef.current) {
        window.cancelAnimationFrame(playerRevealFrameRef.current);
        playerRevealFrameRef.current = 0;
      }
      if (playerRevealTimeoutRef.current) {
        window.clearTimeout(playerRevealTimeoutRef.current);
        playerRevealTimeoutRef.current = 0;
      }

      if (shouldAnimateDetachedFooter) {
        if (detachedFooterTimeoutRef.current) {
          window.clearTimeout(detachedFooterTimeoutRef.current);
        }
        setIsDetachedFooterPending(true);
        setIsDetachedFooterEntering(true);
      } else {
        if (detachedFooterTimeoutRef.current) {
          window.clearTimeout(detachedFooterTimeoutRef.current);
          detachedFooterTimeoutRef.current = 0;
        }
        setIsDetachedFooterPending(false);
        setIsDetachedFooterEntering(false);
      }

      if (shouldAnimatePlayerReveal) {
        setIsPlayerRevealPending(true);
        setIsPlayerRevealing(true);
      } else {
        setIsPlayerRevealPending(false);
        setIsPlayerRevealing(false);
      }

      setActivePage(nextPage);
      setIsMobileNavOpen(false);

      if (shouldAnimateDetachedFooter) {
        detachedFooterFrameRef.current = window.requestAnimationFrame(() => {
          detachedFooterFrameRef.current = window.requestAnimationFrame(() => {
            detachedFooterFrameRef.current = 0;
            setIsDetachedFooterPending(false);
            detachedFooterTimeoutRef.current = window.setTimeout(() => {
              detachedFooterTimeoutRef.current = 0;
              setIsDetachedFooterEntering(false);
            }, 360);
          });
        });
      }

      if (shouldAnimatePlayerReveal) {
        playerRevealFrameRef.current = window.requestAnimationFrame(() => {
          playerRevealFrameRef.current = window.requestAnimationFrame(() => {
            playerRevealFrameRef.current = 0;
            setIsPlayerRevealPending(false);
            playerRevealTimeoutRef.current = window.setTimeout(() => {
              playerRevealTimeoutRef.current = 0;
              setIsPlayerRevealing(false);
            }, 180);
          });
        });
      }
    },
    [isMobileLayout, isPlaylistCollapsed],
  );

  const shellIsCollapsed = isPlaylistCollapsed || !isPlayerPage;
  const shouldRenderPersistentPlayer = isPlayerPage || Boolean(currentVideo);
  const canTogglePlayback = Boolean(transientVideo) || playlist.length > 0;
  const hasDetachedFooter =
    !isPlayerPage && Boolean(currentVideo) && !isDetachedFooterPending;
  const isDesktopDetachedFooter = hasDetachedFooter && !isMobileLayout;
  const isMobileDetachedFooter = hasDetachedFooter && isMobileLayout;
  const playerPresentation = isPlayerPage
    ? isPlayerRevealPending
      ? 'hidden'
      : 'full'
    : hasDetachedFooter
      ? 'mini'
      : 'hidden';
  const persistentPlayer = shouldRenderPersistentPlayer ? (
    <div
      className={`player-surface player-surface-${playerPresentation}${hasDetachedFooter ? ' detached-footer' : ''}${isMobileDetachedFooter ? ' mobile-detached-footer' : ''}${isPlaying ? ' playing' : ''}${isDetachedFooterEntering ? ' entering' : ''}${isPlayerRevealing ? ' revealing' : ''}`}
    >
      <VideoPlayer
        video={currentVideo}
        isPlaying={isPlaying}
        onVideoEnd={handleVideoEnd}
        onPrev={handlePrev}
        onNext={handleNext}
        onTogglePlay={() =>
          handleSetIsPlaying((previousValue) => !previousValue)
        }
        isShuffleEnabled={isShuffleEnabled}
        onShuffle={handleShufflePlaylist}
        isPreviewModeEnabled={isPreviewModeEnabled}
        onTogglePreview={handleTogglePreviewMode}
        isSupported={isCurrentVideoSupported}
        isNominated={isCurrentVideoNominated}
        onToggleSupport={handleToggleSupportFromPlaylist}
        variant={playerPresentation}
        showMetadata={isPlayerPage}
      />

      {isDesktopDetachedFooter && (
        <div className="now-playing-footer">
          <span className="now-playing-footer-dot-slot">
            {isPlaying && <span className="now-playing-dot" />}
          </span>
          <ScrollingText
            className="now-playing-footer-title"
            text={currentVideo.title}
          />
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={`app-frame${isMobileLayout ? ' mobile' : ''}`}>
      {!isMobileLayout && (
        <SiteNavigation activePage={activePage} onNavigate={handleNavigate} />
      )}

      {isMobileLayout && (
        <SiteNavigation
          isMobile
          activePage={activePage}
          onNavigate={handleNavigate}
          isMenuOpen={isMobileNavOpen}
          onToggleMenu={() =>
            setIsMobileNavOpen((previousValue) => !previousValue)
          }
          onCloseMenu={() => setIsMobileNavOpen(false)}
        />
      )}

      <div
        className={`app-shell${shellIsCollapsed ? ' playlist-collapsed' : ''}${isPlayerPage ? '' : ' home-view'}${suppressPlaylistRestoreTransition ? ' playlist-transitionless' : ''}`}
      >
        <TopBar
          isPlaying={isPlaying}
          setIsPlaying={handleSetIsPlaying}
          onPrev={handlePrev}
          onNext={handleNext}
          canTogglePlayback={canTogglePlayback}
          showSupportList={showSupportList}
          setShowSupportList={(value) => {
            if (typeof value === 'function') {
              const nextValue = value(showSupportList);
              if (nextValue) {
                handleOpenSupportList();
              } else {
                handleRequestCloseSupportList();
              }
              return;
            }

            if (value) {
              handleOpenSupportList();
            } else {
              handleRequestCloseSupportList();
            }
          }}
          showNominationsList={showNominationsList}
          setShowNominationsList={(value) => {
            if (typeof value === 'function') {
              const nextValue = value(showNominationsList);
              if (nextValue) {
                handleOpenNominationsList();
              } else {
                handleRequestCloseNominationsList();
              }
              return;
            }

            if (value) {
              handleOpenNominationsList();
            } else {
              handleRequestCloseNominationsList();
            }
          }}
          isShuffleEnabled={isShuffleEnabled}
          onShuffle={handleShufflePlaylist}
          isPreviewModeEnabled={isPreviewModeEnabled}
          onTogglePreview={handleTogglePreviewMode}
          currentVideo={currentVideo}
          isCurrentVideoSupported={isCurrentVideoSupported}
          isCurrentVideoNominated={isCurrentVideoNominated}
          onToggleCurrentVideoSupport={handleToggleSupportFromPlaylist}
          onLoad={handleLoad}
          isPlayerPage={isPlayerPage}
          hasMobileDetachedPlayer={isMobileDetachedFooter}
          onNavigateToPlayer={() => handleNavigate('player')}
          authUser={authUser}
          userProfile={userProfile}
          isAuthAvailable={isSupabaseConfigured}
          onOpenAuthDialog={handleOpenAuthDialog}
          onOpenSettings={handleOpenSettings}
          onLogout={handleLogout}
        />

        <main
          className={`main-content${isPlayerPage ? ' player-view' : ' home-view'}`}
          id="main-content"
        >
          {!isPlayerPage && <HomePage />}

          {persistentPlayer}
        </main>

        {isPlayerPage && (
          <aside
            className={`sidebar app-sidebar${isPlaylistCollapsed ? ' collapsed' : ''}`}
          >
            <PlaylistSidebar
              playlist={displayPlaylist}
              currentIndex={
                currentDisplayIndex < 0 ? null : currentDisplayIndex
              }
              flashVideoIds={flashVideoIds}
              isShuffleEnabled={isShuffleEnabled}
              isPreviewModeEnabled={isPreviewModeEnabled}
              isCollapsed={isPlaylistCollapsed}
              showOriginalOrder={showOriginalOrder}
              onShuffle={handleShufflePlaylist}
              onTogglePreview={handleTogglePreviewMode}
              onToggleCollapse={() =>
                setIsPlaylistCollapsed((previousValue) => !previousValue)
              }
              onToggleOrderView={handleTogglePlaylistOrderView}
              onSelect={goToVideo}
              supportList={supportList}
              nominationList={nominationList}
              listenedStatusById={listenedStatusById}
              onToggleSupport={handleToggleSupportFromPlaylist}
              onAddToSupportList={handleAddToSupportList}
              onRemoveFromPlaylist={handleRemoveFromPlaylist}
            />
            {!isPlaylistCollapsed && apiKeyMissing && (
              <div className="api-key-notice">
                <span>🔑</span>
                <span>
                  Add <code>VITE_YT_API_KEY</code> to <code>.env</code> to
                  enable playlist loading.{' '}
                  <a
                    href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get key
                  </a>
                </span>
              </div>
            )}
          </aside>
        )}
      </div>

      {supportToastMessage && (
        <div
          className="app-toast support-toast"
          role="status"
          aria-live="polite"
        >
          {supportToastMessage}
        </div>
      )}

      {renderSupportList && (
        <FavouritesPanel
          supportList={supportList}
          onReorder={handleReorderSupportList}
          isOpen={showSupportList}
          onClose={handleRequestCloseSupportList}
          onExited={handleSupportListExited}
          onPlayNow={handlePlayNowFromSupportList}
          onAddToPlaylist={handleQueueFromSupportList}
          onRemove={handleRemoveFromSupportList}
          title="Support list"
          titleIcon="🤝"
          tone="support"
          emptyIcon="🤝"
          emptyTitle="No support items yet"
          emptyHint="Double-click an item to queue it, or right-click for Play Now, Add to Current Playlist, and Remove Support."
          itemAriaPrefix="Support"
          removeButtonTitle="Remove from support list"
          removeButtonAriaLabel="Remove from support list"
          contextRemoveLabel="Remove Support"
          closeLabel="Close support list"
          addButtonLabel="Add Supports"
          onAddDirectItems={handleAddManyToSupportList}
        />
      )}

      {renderNominationsList && (
        <FavouritesPanel
          supportList={nominationList}
          onReorder={handleReorderNominationList}
          isOpen={showNominationsList}
          onClose={handleRequestCloseNominationsList}
          onExited={handleNominationsListExited}
          onPlayNow={handlePlayNowFromSupportList}
          onAddToPlaylist={handleQueueFromSupportList}
          onRemove={handleRemoveFromNominationList}
          title="Nominations"
          titleIcon="★"
          tone="nomination"
          emptyIcon="☆"
          emptyTitle="No nominations yet"
          emptyHint="Nominations added elsewhere will appear here, and you can still queue them from this list."
          itemAriaPrefix="Nominate"
          removeButtonTitle="Remove from nominations"
          removeButtonAriaLabel="Remove from nominations"
          contextRemoveLabel="Remove Nomination"
          closeLabel="Close nominations"
          addButtonLabel="Add Nominations"
          onAddDirectItems={handleAddManyToNominationList}
        />
      )}

      <AuthDialog
        isOpen={Boolean(authDialogMode)}
        mode={authDialogMode || 'signin'}
        isConfigured={isSupabaseConfigured}
        isSubmitting={isAuthSubmitting}
        error={authError}
        notice={authMessage}
        onClose={handleCloseAuthDialog}
        onModeChange={setAuthDialogMode}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
      />

      <UserSettingsDialog
        isOpen={isSettingsOpen}
        user={authUser}
        profile={userProfile}
        isSubmitting={isSettingsSubmitting}
        error={settingsError}
        notice={settingsNotice}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
