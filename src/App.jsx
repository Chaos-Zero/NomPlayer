import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import TopBar from './components/TopBar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PlaylistSidebar from './components/PlaylistSidebar.jsx';
import FavouritesPanel from './components/FavouritesPanel.jsx';
import AuthDialog from './components/AuthDialog.jsx';
import HomePage from './components/HomePage.jsx';
import GuestImportDialog from './components/GuestImportDialog.jsx';
import SiteNavigation from './components/SiteNavigation.jsx';
import ScrollingText from './components/ScrollingText.jsx';
import UserSettingsDialog from './components/UserSettingsDialog.jsx';
import useMediaQuery from './hooks/useMediaQuery.js';
import {
  clearLocalGuestPlayerState,
  NOMINATION_LIST_STORAGE_KEY,
  SUPPORT_LIST_STORAGE_KEY,
  createGuestImportSelectionState,
  createPersistedPlayerState,
  checkSignupAvailability,
  deriveProfileAvatarUrl,
  deriveProfileUsername,
  fetchUserPlayerState,
  fetchUserProfile,
  hasImportableGuestCollections,
  hasMeaningfulPlayerState,
  isDiscordAuthUser,
  loadLocalPlayerState,
  mergeGuestCollectionsIntoPlayerState,
  normalizeOptionalProfileValue,
  normalizePersistedPlayerState,
  persistLocalGuestPlayerState,
  saveUserPlayerState,
  upsertUserProfile,
  LEGACY_SUPPORT_STORAGE_KEY,
} from './lib/playerState.js';
import { ingestYouTubeTrackSources } from './lib/trackCatalog.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabase.js';

const PREVIEW_DURATION_MS = 31_000;
const LOGOUT_TRANSITION_MS = 260;
const DISCORD_OAUTH_SEEN_STORAGE_KEY = 'discord_oauth_seen';
const DISCORD_OAUTH_SILENT_PENDING_KEY = 'discord_oauth_silent_pending';

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
  return loadStoredList(SUPPORT_LIST_STORAGE_KEY, LEGACY_SUPPORT_STORAGE_KEY);
}

function loadNominationList() {
  return loadStoredList(NOMINATION_LIST_STORAGE_KEY);
}

function appendUniqueVideos(list, videos, blockedIds = new Set()) {
  const existingIds = new Set(list.map((entry) => entry.videoId));
  const nextList = [...list];
  let addedCount = 0;
  const addedVideos = [];
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
    addedVideos.push(video);
    addedCount += 1;
  }

  return {
    nextList: addedCount > 0 ? nextList : list,
    addedCount,
    addedVideos,
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

function getAppRedirectPath() {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

function getUrlParamsFromHash(hashValue) {
  if (typeof hashValue !== 'string' || hashValue.length <= 1) {
    return new URLSearchParams();
  }

  return new URLSearchParams(hashValue.slice(1));
}

function readOAuthCallbackErrorFromUrl() {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = getUrlParamsFromHash(window.location.hash);
  const error =
    searchParams.get('error') ||
    hashParams.get('error') ||
    searchParams.get('error_description') ||
    hashParams.get('error_description') ||
    searchParams.get('error_code') ||
    hashParams.get('error_code');

  if (!error) return null;

  return {
    searchParams,
    hashParams,
  };
}

function stripOAuthErrorParamsFromUrl() {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const hashParams = getUrlParamsFromHash(url.hash);
  const oauthErrorKeys = ['error', 'error_description', 'error_code'];

  for (const key of oauthErrorKeys) {
    url.searchParams.delete(key);
    hashParams.delete(key);
  }

  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : '';

  window.history.replaceState(window.history.state, '', url.toString());
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
  const [isDesktopOverlayPlaylistOpen, setIsDesktopOverlayPlaylistOpen] =
    useState(false);
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
  const nominationListRef = useRef(initialPlayerState.nominationList);
  const [showNominationsList, setShowNominationsList] = useState(false);
  const [renderNominationsList, setRenderNominationsList] = useState(false);
  const [supportToastMessage, setSupportToastMessage] = useState('');
  const [appToastMessage, setAppToastMessage] = useState('');
  const [appToastTone, setAppToastTone] = useState('default');
  const [isDetachedFooterEntering, setIsDetachedFooterEntering] =
    useState(false);
  const [isDetachedFooterPending, setIsDetachedFooterPending] = useState(false);
  const [isPlayerRevealPending, setIsPlayerRevealPending] = useState(false);
  const [isPlayerRevealing, setIsPlayerRevealing] = useState(false);
  const [isLogoutTransitioning, setIsLogoutTransitioning] = useState(false);
  const supportToastTimeoutRef = useRef(null);
  const appToastTimeoutRef = useRef(null);
  const restoreTransitionFrameRef = useRef(0);
  const detachedFooterTimeoutRef = useRef(0);
  const detachedFooterFrameRef = useRef(0);
  const playerRevealTimeoutRef = useRef(0);
  const playerRevealFrameRef = useRef(0);
  const logoutTransitionTimeoutRef = useRef(0);
  const syncTimeoutRef = useRef(0);
  const pendingGuestImportStateRef = useRef(null);
  const pendingPreferredUsernameRef = useRef('');
  const pendingGamefaqsUsernameRef = useRef('');
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
  const [guestImportState, setGuestImportState] = useState(null);
  const [guestImportSelections, setGuestImportSelections] = useState(null);
  const authUserIdRef = useRef(null);

  useEffect(
    () => () => {
      if (supportToastTimeoutRef.current) {
        window.clearTimeout(supportToastTimeoutRef.current);
      }
      if (appToastTimeoutRef.current) {
        window.clearTimeout(appToastTimeoutRef.current);
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
      if (logoutTransitionTimeoutRef.current) {
        window.clearTimeout(logoutTransitionTimeoutRef.current);
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
    nominationListRef.current = nominationList;
  }, [nominationList]);

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

  const syncCatalogForNominationVideos = useCallback(
    (videos, { userId = authUser?.id ?? null } = {}) => {
      if (
        !supabase ||
        !userId ||
        !Array.isArray(videos) ||
        videos.length === 0
      ) {
        return;
      }

      ingestYouTubeTrackSources(supabase, videos).catch((error) => {
        setAuthError(error.message || 'Failed to sync nomination tracks.');
      });
    },
    [authUser, supabase],
  );

  useEffect(() => {
    authUserIdRef.current = authUser?.id ?? null;
  }, [authUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !authUser) return;

    if (isDiscordAuthUser(authUser)) {
      window.localStorage.setItem(DISCORD_OAUTH_SEEN_STORAGE_KEY, '1');
      window.sessionStorage.removeItem(DISCORD_OAUTH_SILENT_PENDING_KEY);
    }
  }, [authUser]);

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
  const shouldRenderDesktopPlaylistOverlay = !isMobileLayout && !isPlayerPage;
  const effectivePlaylistCollapsed = isPlayerPage
    ? isPlaylistCollapsed
    : !isDesktopOverlayPlaylistOpen;

  const currentPlaylistVideo =
    playlist.find((video) => video.videoId === currentVideoId) || null;
  const currentVideo = transientVideo || currentPlaylistVideo;
  const isCurrentVideoSupported = currentVideo
    ? supportList.some((entry) => entry.videoId === currentVideo.videoId)
    : false;
  const isCurrentVideoNominated = currentVideo
    ? nominationList.some((entry) => entry.videoId === currentVideo.videoId)
    : false;
  const currentSupportLabel = !currentVideo
    ? 'No current video to support'
    : isCurrentVideoNominated
      ? 'Nomination tracks cannot be changed from the player'
      : isCurrentVideoSupported
        ? 'Remove from support list'
        : 'Add to support list';
  const currentSupportTooltip = !currentVideo
    ? 'No current video'
    : isCurrentVideoNominated
      ? 'In Nomination List'
      : isCurrentVideoSupported
        ? 'Remove Support'
        : 'Add to support list';
  const currentSupportClassName = isCurrentVideoNominated
    ? ' nominated locked'
    : isCurrentVideoSupported
      ? ' supported'
      : '';
  const currentSupportGlyph = isCurrentVideoNominated
    ? '★'
    : isCurrentVideoSupported
      ? '♥'
      : '♡';
  const apiKeyMissing = !import.meta.env.VITE_YT_API_KEY;
  const guestImportCounts = guestImportState
    ? {
        playlist: guestImportState.playlist.length,
        supportList: guestImportState.supportList.length,
        nominationList: guestImportState.nominationList.length,
      }
    : null;

  useEffect(() => {
    if (authUser) return;

    persistLocalGuestPlayerState(createPlayerStateSnapshot());
  }, [authUser, createPlayerStateSnapshot]);

  const ensureUserProfile = useCallback(
    async (
      user,
      preferredUsername = '',
      preferredGamefaqsUsername = '',
      preferredAvatarUrl = '',
    ) => {
      if (!supabase || !user) return null;

      const existingProfile = await fetchUserProfile(supabase, user.id);
      const nextUsername = deriveProfileUsername(user, preferredUsername);
      const nextGamefaqsUsername = normalizeOptionalProfileValue(
        preferredGamefaqsUsername || existingProfile?.gamefaqs_username || '',
      );
      const nextAvatarUrl = normalizeOptionalProfileValue(
        deriveProfileAvatarUrl(
          user,
          preferredAvatarUrl || existingProfile?.avatar_url || '',
        ),
      );

      if (
        existingProfile &&
        existingProfile.username === nextUsername &&
        existingProfile.email === (user.email || '') &&
        (existingProfile.gamefaqs_username || null) === nextGamefaqsUsername &&
        (existingProfile.avatar_url || null) === nextAvatarUrl
      ) {
        return existingProfile;
      }

      return upsertUserProfile(supabase, {
        id: user.id,
        username: nextUsername,
        email: user.email || '',
        gamefaqs_username: nextGamefaqsUsername,
        avatar_url: nextAvatarUrl,
      });
    },
    [supabase],
  );

  const hydrateAuthenticatedUser = useCallback(
    async (
      user,
      {
        preferredUsername = '',
        preferredGamefaqsUsername = '',
        preferredAvatarUrl = '',
      } = {},
    ) => {
      if (!supabase || !user) return;

      setIsAuthReady(false);

      try {
        const profile = await ensureUserProfile(
          user,
          preferredUsername,
          preferredGamefaqsUsername,
          preferredAvatarUrl,
        );
        setUserProfile(profile);
        const remoteState = await fetchUserPlayerState(supabase, user.id);
        const normalizedState = normalizePersistedPlayerState(remoteState);
        applyPersistedPlayerState(normalizedState);
        lastSyncedPlayerStateRef.current = JSON.stringify(normalizedState);
        syncCatalogForNominationVideos(normalizedState.nominationList, {
          userId: user.id,
        });

        const pendingGuestImportState = pendingGuestImportStateRef.current;
        pendingGuestImportStateRef.current = null;

        if (hasImportableGuestCollections(pendingGuestImportState)) {
          setGuestImportState(
            normalizePersistedPlayerState(pendingGuestImportState),
          );
          setGuestImportSelections(
            createGuestImportSelectionState(pendingGuestImportState),
          );
        } else {
          setGuestImportState(null);
          setGuestImportSelections(null);
        }
      } catch (error) {
        setAuthError(error.message || 'Failed to load your account data.');
      } finally {
        setIsAuthReady(true);
      }
    },
    [
      applyPersistedPlayerState,
      ensureUserProfile,
      supabase,
      syncCatalogForNominationVideos,
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

      if (event === 'PASSWORD_RECOVERY') {
        setAuthDialogMode('recovery');
        setAuthError('');
        setAuthMessage('Enter your new password to finish resetting it.');
      }

      if (!session?.user) {
        pendingGuestImportStateRef.current = null;
        pendingPreferredUsernameRef.current = '';
        pendingGamefaqsUsernameRef.current = '';
        lastSyncedPlayerStateRef.current = '';
        setUserProfile(null);
        setIsSettingsOpen(false);
        setGuestImportState(null);
        setGuestImportSelections(null);
        setIsAuthReady(true);
        return;
      }

      const preferredUsername = pendingPreferredUsernameRef.current;
      const preferredGamefaqsUsername = pendingGamefaqsUsernameRef.current;
      const hasPendingGuestImport = Boolean(pendingGuestImportStateRef.current);
      const hasPendingProfileValues = Boolean(
        preferredUsername || preferredGamefaqsUsername,
      );
      const isSameAuthenticatedUser = authUserIdRef.current === session.user.id;
      pendingPreferredUsernameRef.current = '';
      pendingGamefaqsUsernameRef.current = '';

      const shouldHydrateAuthenticatedUser =
        !isSameAuthenticatedUser ||
        hasPendingGuestImport ||
        hasPendingProfileValues ||
        event === 'USER_UPDATED';

      if (!shouldHydrateAuthenticatedUser) {
        setIsAuthReady(true);
        return;
      }

      window.setTimeout(() => {
        if (!isActive) return;
        hydrateAuthenticatedUser(session.user, {
          preferredUsername,
          preferredGamefaqsUsername,
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

  const showDefaultAppToast = useCallback((message, tone = 'default') => {
    setAppToastTone(tone);
    setAppToastMessage(message);

    if (appToastTimeoutRef.current) {
      window.clearTimeout(appToastTimeoutRef.current);
    }

    appToastTimeoutRef.current = window.setTimeout(() => {
      appToastTimeoutRef.current = null;
      setAppToastMessage('');
    }, 3200);
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
      pendingGuestImportStateRef.current = hasMeaningfulPlayerState(
        createPlayerStateSnapshot(),
      )
        ? createPlayerStateSnapshot()
        : null;
      pendingPreferredUsernameRef.current = '';
      pendingGamefaqsUsernameRef.current = '';

      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setAuthDialogMode(null);
      } catch (error) {
        pendingGuestImportStateRef.current = null;
        setAuthError(error.message || 'Failed to log in.');
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [createPlayerStateSnapshot, supabase],
  );

  const handleSignUp = useCallback(
    async ({ email, password, username, gamefaqsUsername }) => {
      if (!supabase) {
        setAuthError('Supabase is not configured yet.');
        return;
      }

      setIsAuthSubmitting(true);
      setAuthError('');
      setAuthMessage('');
      pendingGuestImportStateRef.current = hasMeaningfulPlayerState(
        createPlayerStateSnapshot(),
      )
        ? createPlayerStateSnapshot()
        : null;
      pendingPreferredUsernameRef.current = username.trim();
      pendingGamefaqsUsernameRef.current = gamefaqsUsername.trim();

      try {
        const availability = await checkSignupAvailability(supabase, {
          email,
          username,
        });

        if (!availability.emailAvailable) {
          setAuthError('That email address is already registered.');
          pendingGuestImportStateRef.current = null;
          pendingPreferredUsernameRef.current = '';
          pendingGamefaqsUsernameRef.current = '';
          return;
        }

        if (!availability.usernameAvailable) {
          setAuthError('That username is already in use.');
          pendingGuestImportStateRef.current = null;
          pendingPreferredUsernameRef.current = '';
          pendingGamefaqsUsernameRef.current = '';
          return;
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username.trim(),
              gamefaqs_username: gamefaqsUsername.trim(),
            },
          },
        });

        if (error) throw error;

        if (!session) {
          pendingGuestImportStateRef.current = null;
          pendingPreferredUsernameRef.current = '';
          pendingGamefaqsUsernameRef.current = '';
          setAuthDialogMode('signin');
          setAuthMessage(
            'Check your email to activate your account, then log in.',
          );
          return;
        }

        setAuthDialogMode(null);
      } catch (error) {
        pendingGuestImportStateRef.current = null;
        pendingPreferredUsernameRef.current = '';
        pendingGamefaqsUsernameRef.current = '';
        setAuthError(error.message || 'Failed to create your account.');
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [createPlayerStateSnapshot, supabase],
  );

  const handleRequestPasswordReset = useCallback(
    async ({ email }) => {
      if (!supabase) {
        setAuthError('Supabase is not configured yet.');
        return;
      }

      setIsAuthSubmitting(true);
      setAuthError('');
      setAuthMessage('');

      try {
        const redirectTo =
          typeof window === 'undefined'
            ? undefined
            : `${window.location.origin}${window.location.pathname}`;

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (error) throw error;

        setAuthDialogMode('signin');
        setAuthMessage('Check your email for a password reset link.');
      } catch (error) {
        setAuthError(error.message || 'Failed to send a password reset email.');
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [supabase],
  );

  const startDiscordOAuth = useCallback(
    async ({ silent = false } = {}) => {
      if (!supabase) {
        throw new Error('Supabase is not configured yet.');
      }

      const redirectTo = getAppRedirectPath();

      if (typeof window !== 'undefined') {
        if (silent) {
          window.sessionStorage.setItem(DISCORD_OAUTH_SILENT_PENDING_KEY, '1');
        } else {
          window.sessionStorage.removeItem(DISCORD_OAUTH_SILENT_PENDING_KEY);
        }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo,
          queryParams: silent ? { prompt: 'none' } : undefined,
        },
      });

      if (error) {
        throw error;
      }
    },
    [supabase],
  );

  const handleContinueWithDiscord = useCallback(async () => {
    if (!supabase) {
      setAuthError('Supabase is not configured yet.');
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError('');
    setAuthMessage('');
    pendingGuestImportStateRef.current = hasMeaningfulPlayerState(
      createPlayerStateSnapshot(),
    )
      ? createPlayerStateSnapshot()
      : null;
    pendingPreferredUsernameRef.current = '';
    pendingGamefaqsUsernameRef.current = '';

    try {
      const shouldTrySilent =
        typeof window !== 'undefined' &&
        window.localStorage.getItem(DISCORD_OAUTH_SEEN_STORAGE_KEY) === '1';

      await startDiscordOAuth({ silent: shouldTrySilent });
    } catch (error) {
      pendingGuestImportStateRef.current = null;
      pendingPreferredUsernameRef.current = '';
      pendingGamefaqsUsernameRef.current = '';
      setAuthError(error.message || 'Failed to continue with Discord.');
      setIsAuthSubmitting(false);
    }
  }, [createPlayerStateSnapshot, startDiscordOAuth, supabase]);

  useEffect(() => {
    if (typeof window === 'undefined' || !supabase) return;
    if (
      window.sessionStorage.getItem(DISCORD_OAUTH_SILENT_PENDING_KEY) !== '1'
    ) {
      return;
    }

    if (!readOAuthCallbackErrorFromUrl()) {
      return;
    }

    window.sessionStorage.removeItem(DISCORD_OAUTH_SILENT_PENDING_KEY);
    stripOAuthErrorParamsFromUrl();
    setIsAuthSubmitting(true);
    setAuthError('');
    setAuthMessage('');

    window.setTimeout(() => {
      startDiscordOAuth({ silent: false }).catch((error) => {
        setAuthError(error.message || 'Failed to continue with Discord.');
        setIsAuthSubmitting(false);
      });
    }, 0);
  }, [startDiscordOAuth, supabase]);

  const handleUpdateRecoveredPassword = useCallback(
    async ({ password, confirmPassword }) => {
      if (!supabase) {
        setAuthError('Supabase is not configured yet.');
        return;
      }

      if (password !== confirmPassword) {
        setAuthError('Passwords do not match.');
        return;
      }

      setIsAuthSubmitting(true);
      setAuthError('');
      setAuthMessage('');

      try {
        const { error } = await supabase.auth.updateUser({
          password,
        });

        if (error) throw error;

        setAuthDialogMode(null);
        showDefaultAppToast('Password updated.');
      } catch (error) {
        setAuthError(error.message || 'Failed to update your password.');
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [showDefaultAppToast, supabase],
  );

  const handleLogout = useCallback(async () => {
    if (!supabase) return;

    setAuthError('');
    setAuthMessage('');

    const finalizeLogout = () => {
      clearLocalGuestPlayerState();
      applyPersistedPlayerState({});
      setIsPreviewModeEnabled(false);
      setShowSupportList(false);
      setRenderSupportList(false);
      setShowNominationsList(false);
      setRenderNominationsList(false);
      setGuestImportState(null);
      setGuestImportSelections(null);
      setSupportToastMessage('');
      setIsLogoutTransitioning(false);
      setAppToastTone('logout');
      setAppToastMessage('Logout successful.');

      if (appToastTimeoutRef.current) {
        window.clearTimeout(appToastTimeoutRef.current);
      }
      appToastTimeoutRef.current = window.setTimeout(() => {
        appToastTimeoutRef.current = null;
        setAppToastMessage('');
        setAppToastTone('default');
      }, 1800);
    };

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setActivePage('home');
      setIsMobileNavOpen(false);
      setAuthDialogMode(null);
      setIsSettingsOpen(false);
      setIsDetachedFooterPending(false);
      setIsDetachedFooterEntering(false);
      setIsPlayerRevealPending(false);
      setIsPlayerRevealing(false);

      if (logoutTransitionTimeoutRef.current) {
        window.clearTimeout(logoutTransitionTimeoutRef.current);
      }

      if (currentVideo && isPlayingRef.current) {
        setIsLogoutTransitioning(true);
        logoutTransitionTimeoutRef.current = window.setTimeout(() => {
          logoutTransitionTimeoutRef.current = 0;
          finalizeLogout();
        }, LOGOUT_TRANSITION_MS);
        return;
      }

      finalizeLogout();
    } catch (error) {
      setIsLogoutTransitioning(false);
      setAuthError(error.message || 'Failed to log out.');
    }
  }, [applyPersistedPlayerState, currentVideo, supabase]);

  const handleOpenSettings = useCallback(() => {
    setSettingsError('');
    setSettingsNotice('');
    setIsSettingsOpen(true);
  }, []);

  const handleSaveSettings = useCallback(
    async ({ username, gamefaqsUsername, avatarUrl }) => {
      if (!supabase || !authUser) return;

      setIsSettingsSubmitting(true);
      setSettingsError('');
      setSettingsNotice('');

      try {
        const profile = await upsertUserProfile(supabase, {
          id: authUser.id,
          username: deriveProfileUsername(authUser, username),
          email: authUser.email || '',
          gamefaqs_username: normalizeOptionalProfileValue(gamefaqsUsername),
          avatar_url: normalizeOptionalProfileValue(avatarUrl),
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

  const handleToggleGuestImportSelection = useCallback((key) => {
    setGuestImportSelections((previousSelections) => {
      if (!previousSelections || !(key in previousSelections)) {
        return previousSelections;
      }

      return {
        ...previousSelections,
        [key]: !previousSelections[key],
      };
    });
  }, []);

  const handleSkipGuestImport = useCallback(() => {
    clearLocalGuestPlayerState();
    pendingGuestImportStateRef.current = null;
    setGuestImportState(null);
    setGuestImportSelections(null);
  }, []);

  const handleImportGuestCollections = useCallback(() => {
    if (!guestImportState || !guestImportSelections) return;

    const mergedState = mergeGuestCollectionsIntoPlayerState(
      createPlayerStateSnapshot(),
      guestImportState,
      guestImportSelections,
    );

    applyPersistedPlayerState(mergedState);
    if (guestImportSelections.nominationList) {
      syncCatalogForNominationVideos(mergedState.nominationList);
    }
    clearLocalGuestPlayerState();
    pendingGuestImportStateRef.current = null;
    setGuestImportState(null);
    setGuestImportSelections(null);
  }, [
    applyPersistedPlayerState,
    createPlayerStateSnapshot,
    guestImportSelections,
    guestImportState,
    syncCatalogForNominationVideos,
  ]);

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

  const handleAddManyToNominationList = useCallback(
    (videos) => {
      if (!videos.length) {
        return { addedCount: 0, blockedNominationCount: 0 };
      }

      const nominationResult = appendUniqueVideos(
        nominationListRef.current,
        videos,
      );

      if (!nominationResult.addedCount) {
        return { addedCount: 0, blockedNominationCount: 0 };
      }

      const incomingIds = new Set(videos.map((video) => video.videoId));
      setSupportList((previousList) =>
        previousList.filter((entry) => !incomingIds.has(entry.videoId)),
      );
      setNominationList(nominationResult.nextList);
      syncCatalogForNominationVideos(nominationResult.addedVideos);

      return {
        addedCount: nominationResult.addedCount,
        blockedNominationCount: 0,
      };
    },
    [syncCatalogForNominationVideos],
  );

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
    (videoIdsOrId) => {
      hasReachedPlaylistEndRef.current = false;
      const videoIds = Array.isArray(videoIdsOrId)
        ? videoIdsOrId
        : [videoIdsOrId];
      const idSet = new Set(videoIds);
      const previousPlaylist = playlistRef.current;
      const removeIndex = previousPlaylist.findIndex((video) =>
        idSet.has(video.videoId),
      );
      if (removeIndex < 0) return;

      const previousPlayOrderIds = resolvePlayOrderIds(
        previousPlaylist,
        shuffleOrderIdsRef.current,
      );
      const removedPlayIndex = previousPlayOrderIds.findIndex((id) =>
        idSet.has(id),
      );
      const nextPlaylist = previousPlaylist.filter(
        (video) => !idSet.has(video.videoId),
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
        const hasTrackedIds = videoIds.some(
          (videoId) => videoId in previousStatus,
        );
        if (!hasTrackedIds) return previousStatus;

        const nextStatus = { ...previousStatus };
        videoIds.forEach((videoId) => {
          delete nextStatus[videoId];
        });
        return nextStatus;
      });

      if (
        transientResumeVideoIdRef.current &&
        idSet.has(transientResumeVideoIdRef.current)
      ) {
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

      if (
        !transientVideo &&
        currentVideoIdRef.current &&
        idSet.has(currentVideoIdRef.current)
      ) {
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

  const handleReorderPlaylist = useCallback((newOrder) => {
    if (
      !Array.isArray(newOrder) ||
      newOrder.length !== playlistRef.current.length
    ) {
      return;
    }

    playlistRef.current = newOrder;
    setPlaylist(newOrder);
    hasReachedPlaylistEndRef.current = false;
  }, []);

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

  const handlePlayerPlaybackChange = useCallback(
    (nextIsPlaying) => {
      if (typeof nextIsPlaying !== 'boolean') return;

      if (nextIsPlaying) {
        hasReachedPlaylistEndRef.current = false;

        if (!transientVideo && currentVideoIdRef.current) {
          markVideoStarted(currentVideoIdRef.current);
        }
      }

      setIsPlaying(nextIsPlaying);
    },
    [markVideoStarted, transientVideo],
  );

  const clearDetachedFooterEntrance = useCallback(() => {
    if (detachedFooterFrameRef.current) {
      window.cancelAnimationFrame(detachedFooterFrameRef.current);
      detachedFooterFrameRef.current = 0;
    }

    if (detachedFooterTimeoutRef.current) {
      window.clearTimeout(detachedFooterTimeoutRef.current);
      detachedFooterTimeoutRef.current = 0;
    }

    setIsDetachedFooterPending(false);
    setIsDetachedFooterEntering(false);
  }, []);

  const startDetachedFooterEntrance = useCallback(() => {
    if (detachedFooterFrameRef.current) {
      window.cancelAnimationFrame(detachedFooterFrameRef.current);
      detachedFooterFrameRef.current = 0;
    }

    if (detachedFooterTimeoutRef.current) {
      window.clearTimeout(detachedFooterTimeoutRef.current);
      detachedFooterTimeoutRef.current = 0;
    }

    setIsDetachedFooterPending(true);
    setIsDetachedFooterEntering(true);

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
  }, []);

  const shouldShowDetachedFooter =
    !isPlayerPage && Boolean(currentVideo) && isPlaying;
  const previousDetachedFooterIntentRef = useRef(shouldShowDetachedFooter);

  useEffect(() => {
    const previousDetachedFooterIntent =
      previousDetachedFooterIntentRef.current;
    previousDetachedFooterIntentRef.current = shouldShowDetachedFooter;

    if (
      !previousDetachedFooterIntent &&
      shouldShowDetachedFooter &&
      !isDetachedFooterPending &&
      !isDetachedFooterEntering
    ) {
      startDetachedFooterEntrance();
      return;
    }

    if (
      previousDetachedFooterIntent &&
      !shouldShowDetachedFooter &&
      (isDetachedFooterPending || isDetachedFooterEntering)
    ) {
      clearDetachedFooterEntrance();
    }
  }, [
    clearDetachedFooterEntrance,
    isDetachedFooterEntering,
    isDetachedFooterPending,
    shouldShowDetachedFooter,
    startDetachedFooterEntrance,
  ]);

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
        startDetachedFooterEntrance();
      } else {
        clearDetachedFooterEntrance();
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
      if (!isMobileLayout && nextPage !== 'player') {
        setIsDesktopOverlayPlaylistOpen(false);
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
    [
      clearDetachedFooterEntrance,
      isMobileLayout,
      isPlaylistCollapsed,
      startDetachedFooterEntrance,
    ],
  );

  const shellIsCollapsed = isPlaylistCollapsed || !isPlayerPage;
  const shouldRenderPersistentPlayer = isPlayerPage || Boolean(currentVideo);
  const canTogglePlayback = Boolean(transientVideo) || playlist.length > 0;
  const hasDetachedFooter =
    shouldShowDetachedFooter && !isDetachedFooterPending;
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
      className={`player-surface player-surface-${playerPresentation}${hasDetachedFooter ? ' detached-footer' : ''}${isMobileDetachedFooter ? ' mobile-detached-footer' : ''}${isPlaying ? ' playing' : ''}${isDetachedFooterEntering ? ' entering' : ''}${isPlayerRevealing ? ' revealing' : ''}${isLogoutTransitioning ? ' logging-out' : ''}`}
    >
      <VideoPlayer
        video={currentVideo}
        isPlaying={isPlaying}
        onVideoEnd={handleVideoEnd}
        onPlaybackChange={handlePlayerPlaybackChange}
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
        <>
          <div className="now-playing-footer">
            <span className="now-playing-footer-dot-slot">
              {isPlaying && <span className="now-playing-dot" />}
            </span>
            <ScrollingText
              className="now-playing-footer-title"
              text={currentVideo.title}
            />
          </div>

          <button
            className={`btn btn-icon detached-footer-support-btn${currentSupportClassName}`}
            type="button"
            onClick={() => handleToggleSupportFromPlaylist(currentVideo)}
            title={currentSupportTooltip}
            aria-label={currentSupportLabel}
            disabled={!currentVideo || isCurrentVideoNominated}
          >
            {currentSupportGlyph}
          </button>
        </>
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
          isMobileDetachedPlayerEntering={
            isMobileDetachedFooter && isDetachedFooterEntering
          }
          onNavigateToPlayer={() => handleNavigate('player')}
          authUser={authUser}
          userProfile={userProfile}
          isAuthAvailable={isSupabaseConfigured}
          onOpenAuthDialog={handleOpenAuthDialog}
          onOpenSettings={handleOpenSettings}
          onLogout={handleLogout}
        />

        <main
          className={`main-content${isPlayerPage ? ' player-view' : ' home-view'}${!isPlayerPage && isLogoutTransitioning ? ' logout-fade-in' : ''}`}
          id="main-content"
        >
          {!isPlayerPage && (
            <HomePage
              supabase={supabase}
              authUser={authUser}
              currentPlaylist={playlist}
              listenedStatusById={listenedStatusById}
              onAddToPlaylist={handleQueueFromSupportList}
              onPlayNow={handlePlayNowFromSupportList}
              onNavigateToPlayer={() => handleNavigate('player')}
              onShowToast={(message) =>
                showDefaultAppToast(message, 'dashboard')
              }
            />
          )}

          {persistentPlayer}
        </main>

        {(isPlayerPage || shouldRenderDesktopPlaylistOverlay) && (
          <aside
            className={`sidebar app-sidebar${effectivePlaylistCollapsed ? ' collapsed' : ''}${shouldRenderDesktopPlaylistOverlay ? ' overlay-sidebar' : ''}`}
          >
            <PlaylistSidebar
              playlist={displayPlaylist}
              currentIndex={
                currentDisplayIndex < 0 ? null : currentDisplayIndex
              }
              flashVideoIds={flashVideoIds}
              isShuffleEnabled={isShuffleEnabled}
              isPreviewModeEnabled={isPreviewModeEnabled}
              isCollapsed={effectivePlaylistCollapsed}
              showOriginalOrder={showOriginalOrder}
              onShuffle={handleShufflePlaylist}
              onTogglePreview={handleTogglePreviewMode}
              onToggleCollapse={() => {
                if (isPlayerPage) {
                  setIsPlaylistCollapsed((previousValue) => !previousValue);
                  return;
                }

                setIsDesktopOverlayPlaylistOpen(
                  (previousValue) => !previousValue,
                );
              }}
              onToggleOrderView={handleTogglePlaylistOrderView}
              onSelect={goToVideo}
              onReorder={handleReorderPlaylist}
              supportList={supportList}
              nominationList={nominationList}
              listenedStatusById={listenedStatusById}
              onToggleSupport={handleToggleSupportFromPlaylist}
              onAddToSupportList={handleAddToSupportList}
              onRemoveFromPlaylist={handleRemoveFromPlaylist}
            />
            {!effectivePlaylistCollapsed && apiKeyMissing && (
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

      {appToastMessage && (
        <div
          className={`app-toast${appToastTone === 'logout' ? ' logout-toast' : ''}${appToastTone === 'dashboard' ? ' dashboard-toast' : ''}`}
          role="status"
          aria-live="polite"
        >
          {appToastMessage}
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
        onContinueWithDiscord={handleContinueWithDiscord}
        onRequestPasswordReset={handleRequestPasswordReset}
        onUpdatePassword={handleUpdateRecoveredPassword}
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

      <GuestImportDialog
        isOpen={Boolean(guestImportState && guestImportSelections)}
        selections={guestImportSelections}
        counts={guestImportCounts}
        onToggle={handleToggleGuestImportSelection}
        onImport={handleImportGuestCollections}
        onSkip={handleSkipGuestImport}
      />
    </div>
  );
}
