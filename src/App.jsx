import {
  startTransition,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from 'react';
import TopBar from './components/TopBar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PlaylistSidebar from './components/PlaylistSidebar.jsx';
import FavouritesPanel from './components/FavouritesPanel.jsx';
import AuthDialog from './components/AuthDialog.jsx';
import HomePage from './components/HomePage.jsx';
import GuestImportDialog from './components/GuestImportDialog.jsx';
import MetadataEntryDialog from './components/MetadataEntryDialog.jsx';
import SiteNavigation from './components/SiteNavigation.jsx';
import ListExplorer from './components/ListExplorer.jsx';
import ScrollingText from './components/ScrollingText.jsx';
import UserSettingsDialog from './components/UserSettingsDialog.jsx';
import ListeningHistoryDialog from './components/ListeningHistoryDialog.jsx';
import SupportLevelDropdown from './components/SupportLevelDropdown.jsx';
import ExportVgmcModal from './components/ExportVgmcModal.jsx';
import DeleteAccountConfirmDialog from './components/DeleteAccountConfirmDialog.jsx';
const TrackDatabase = lazy(() => import('./components/TrackDatabase.jsx'));
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
  fetchUserTrackListenStatuses,
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
  recordYouTubeTrackListen,
  saveUserPlayerState,
  saveTrackSupport,
  upsertUserProfile,
  recordTrackHistory,
  getTrackHistory,
  clearTrackHistory,
  LEGACY_SUPPORT_STORAGE_KEY,
} from './lib/playerState.js';
import {
  fetchTrackCatalogByVideoIds,
  ingestYouTubeTrackSources,
} from './lib/trackCatalog.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabase.js';
import {
  getYouTubeThumbnailUrl,
  parseYouTubeInput,
  singleVideoEntry,
} from './utils/youtube.js';

const LOGOUT_TRANSITION_MS = 260;
const DISCORD_OAUTH_SEEN_STORAGE_KEY = 'discord_oauth_seen';
const DISCORD_OAUTH_SILENT_PENDING_KEY = 'discord_oauth_silent_pending';
const AUTH_SYNC_IDLE_MS = 1800;
const AUTH_SYNC_STORAGE_KEY_PREFIX = 'yt_auth_sync';
const THEME_STORAGE_KEY = 'nom-theme';

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
    blockedVideoIds: [...blockedVideoIds],
    duplicateVideoIds: [...duplicateVideoIds],
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

function mergeListenedStatuses(previousStatus, incomingStatus) {
  const nextStatus = { ...previousStatus };
  let changed = false;

  for (const [videoId, status] of Object.entries(incomingStatus || {})) {
    const mergedStatus =
      previousStatus[videoId] === 'complete' || status === 'complete'
        ? 'complete'
        : previousStatus[videoId] === 'partial' || status === 'partial'
          ? 'partial'
          : null;

    if (!mergedStatus || nextStatus[videoId] === mergedStatus) {
      continue;
    }

    nextStatus[videoId] = mergedStatus;
    changed = true;
  }

  return changed ? nextStatus : previousStatus;
}

function createAccountPersistedPlayerState(state) {
  return createPersistedPlayerState({
    playlist: state?.playlist,
    currentVideoId: state?.currentVideoId,
    shuffleOrderIds: state?.shuffleOrderIds,
    showOriginalOrder: state?.showOriginalOrder,
    supportList: state?.supportList,
    nominationList: state?.nominationList,
  });
}

function getAuthSyncStorageKey(userId) {
  return `${AUTH_SYNC_STORAGE_KEY_PREFIX}:${userId}`;
}

function normalizeQueuedTrackListenEvent(event) {
  if (!event || typeof event !== 'object') return null;

  const youtubeVideoId =
    typeof event.youtubeVideoId === 'string' && event.youtubeVideoId.trim()
      ? event.youtubeVideoId.trim()
      : '';
  const listenEvent =
    event.listenEvent === 'completed'
      ? 'completed'
      : event.listenEvent === 'started'
        ? 'started'
        : '';
  const secondsPlayed =
    typeof event.secondsPlayed === 'number' &&
    Number.isFinite(event.secondsPlayed)
      ? Math.max(0, event.secondsPlayed)
      : 0;

  if (!youtubeVideoId || !listenEvent) {
    return null;
  }

  return {
    youtubeVideoId,
    listenEvent,
    secondsPlayed,
  };
}

function buildQueuedListenStatuses(listenEvents) {
  return (Array.isArray(listenEvents) ? listenEvents : []).reduce(
    (statusById, event) => {
      const normalizedEvent = normalizeQueuedTrackListenEvent(event);
      if (!normalizedEvent) return statusById;

      const nextStatus =
        normalizedEvent.listenEvent === 'completed' ? 'complete' : 'partial';
      statusById[normalizedEvent.youtubeVideoId] =
        statusById[normalizedEvent.youtubeVideoId] === 'complete' ||
        nextStatus === 'complete'
          ? 'complete'
          : 'partial';
      return statusById;
    },
    {},
  );
}

function loadPersistedAuthSyncQueue(userId) {
  if (typeof window === 'undefined' || !userId) {
    return {
      playerState: null,
      listenEvents: [],
    };
  }

  try {
    const storedValue = window.localStorage.getItem(
      getAuthSyncStorageKey(userId),
    );
    if (!storedValue) {
      return {
        playerState: null,
        listenEvents: [],
      };
    }

    const parsedValue = JSON.parse(storedValue);
    const playerState = parsedValue?.playerState
      ? createAccountPersistedPlayerState(parsedValue.playerState)
      : null;
    const listenEvents = Array.isArray(parsedValue?.listenEvents)
      ? parsedValue.listenEvents
          .map(normalizeQueuedTrackListenEvent)
          .filter(Boolean)
      : [];

    return {
      playerState,
      listenEvents,
    };
  } catch {
    return {
      playerState: null,
      listenEvents: [],
    };
  }
}

function persistAuthSyncQueue(
  userId,
  { playerState = null, listenEvents = [] } = {},
) {
  if (typeof window === 'undefined' || !userId) return;

  const normalizedPlayerState = playerState
    ? createAccountPersistedPlayerState(playerState)
    : null;
  const normalizedListenEvents = Array.isArray(listenEvents)
    ? listenEvents.map(normalizeQueuedTrackListenEvent).filter(Boolean)
    : [];

  if (!normalizedPlayerState && normalizedListenEvents.length === 0) {
    window.localStorage.removeItem(getAuthSyncStorageKey(userId));
    return;
  }

  window.localStorage.setItem(
    getAuthSyncStorageKey(userId),
    JSON.stringify({
      playerState: normalizedPlayerState,
      listenEvents: normalizedListenEvents,
    }),
  );
}

function isMissingCatalogTrackError(error) {
  const message =
    typeof error?.message === 'string' ? error.message.toLowerCase() : '';

  return error?.code === 'P0002' || message.includes('no catalog track found');
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

function PlaylistPlusIcon() {
  return (
    <svg
      className="collection-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
    </svg>
  );
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
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_STORAGE_KEY) || 'dark',
  );
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
  const activePageRef = useRef('home');
  const hasReachedPlaylistEndRef = useRef(false);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewCountdown, setPreviewCountdown] = useState(30);

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
  const [customPlaylists, setCustomPlaylists] = useState(
    initialPlayerState.customPlaylists || [],
  );
  const [supportToastMessage, setSupportToastMessage] = useState('');
  const [appToastMessage, setAppToastMessage] = useState('');
  const [appToastTone, setAppToastTone] = useState('default');
  const [tracksNeedingMetadata, setTracksNeedingMetadata] = useState([]);
  const [manualMetadataTracks, setManualMetadataTracks] = useState(null);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [isDetachedFooterEntering, setIsDetachedFooterEntering] =
    useState(false);
  const [isDetachedFooterPending, setIsDetachedFooterPending] = useState(false);
  const [isPlayerRevealPending, setIsPlayerRevealPending] = useState(false);
  const [isPlayerRevealing, setIsPlayerRevealing] = useState(false);
  const [isLogoutTransitioning, setIsLogoutTransitioning] = useState(false);
  const supportToastTimeoutRef = useRef(null);
  const appToastTimeoutRef = useRef(null);
  const restoreTransitionFrameRef = useRef(0);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);
  const detachedFooterTimeoutRef = useRef(0);
  const detachedFooterFrameRef = useRef(0);
  const playerRevealTimeoutRef = useRef(0);
  const playerRevealFrameRef = useRef(0);
  const logoutTransitionTimeoutRef = useRef(0);
  const guestSyncTimeoutRef = useRef(0);
  const authSyncFlushTimeoutRef = useRef(0);
  const authSyncIdleCallbackRef = useRef(0);
  const forceImmediateSyncRef = useRef(false);
  const authSyncFlushPromiseRef = useRef(null);
  const flushQueuedAuthSyncRef = useRef(null);
  const queuedSyncUserIdRef = useRef(null);
  const queuedPlayerStateRef = useRef(null);
  const queuedTrackListenEventsRef = useRef([]);
  const inFlightQueuedPlayerStateRef = useRef(null);
  const inFlightQueuedTrackListenEventsRef = useRef([]);
  const currentAccountPlayerStateRef = useRef(null);
  const currentAccountPlayerStateSerializedRef = useRef('');
  const pendingGuestImportStateRef = useRef(null);
  const pendingPreferredUsernameRef = useRef('');
  const pendingGamefaqsUsernameRef = useRef('');
  const lastSyncedPlayerStateRef = useRef('');
  const hydrateAuthenticatedUserRef = useRef(null);
  const loadedListenStatusVideoIdsRef = useRef(new Set());
  const inFlightListenStatusVideoIdsRef = useRef(new Set());
  const nonCatalogedListenVideoIdsRef = useRef(new Set());
  const didFullListenStatusFetchRef = useRef(false);
  const trackListenSessionRef = useRef({
    videoId: null,
    startedPersisted: false,
    completedPersisted: false,
  });
  const [catalogTrackByVideoId, setCatalogTrackByVideoId] = useState({});
  const catalogTrackByVideoIdRef = useRef({});
  const catalogLookupPendingVideoIdsRef = useRef(new Set());
  const [authSession, setAuthSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState(null);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteAccountConfirmOpen, setIsDeleteAccountConfirmOpen] =
    useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [supportLevelDropdown, setSupportLevelDropdown] = useState(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTracks, setExportTracks] = useState([]);
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
      if (guestSyncTimeoutRef.current) {
        window.clearTimeout(guestSyncTimeoutRef.current);
      }
      if (authSyncFlushTimeoutRef.current) {
        window.clearTimeout(authSyncFlushTimeoutRef.current);
      }
      if (
        authSyncIdleCallbackRef.current &&
        typeof window !== 'undefined' &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(authSyncIdleCallbackRef.current);
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
    activePageRef.current = activePage;
  }, [activePage]);

  useEffect(() => {
    catalogTrackByVideoIdRef.current = catalogTrackByVideoId;
  }, [catalogTrackByVideoId]);

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
        customPlaylists,
      }),
    [
      playlist,
      currentVideoId,
      shuffleOrderIds,
      showOriginalOrder,
      listenedStatusById,
      supportList,
      nominationList,
      customPlaylists,
    ],
  );

  const createAccountPlayerStateSnapshot = useCallback(
    () =>
      createAccountPersistedPlayerState({
        playlist,
        currentVideoId,
        shuffleOrderIds,
        showOriginalOrder,
        supportList,
        nominationList,
        customPlaylists,
      }),
    [
      playlist,
      currentVideoId,
      shuffleOrderIds,
      showOriginalOrder,
      supportList,
      nominationList,
      customPlaylists,
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
    setCustomPlaylists(normalizedState.customPlaylists || []);
    setIsPlaying(false);
  }, []);

  const authUser = authSession?.user ?? null;

  const syncCatalogForNominationVideos = useCallback(
    (videos, { userId = authUserIdRef.current } = {}) => {
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
    [supabase],
  );

  useEffect(() => {
    authUserIdRef.current = authUser?.id ?? null;
  }, [authUser]);

  const cancelQueuedAuthSyncFlush = useCallback(() => {
    if (authSyncFlushTimeoutRef.current) {
      window.clearTimeout(authSyncFlushTimeoutRef.current);
      authSyncFlushTimeoutRef.current = 0;
    }
    if (
      authSyncIdleCallbackRef.current &&
      typeof window !== 'undefined' &&
      typeof window.cancelIdleCallback === 'function'
    ) {
      window.cancelIdleCallback(authSyncIdleCallbackRef.current);
      authSyncIdleCallbackRef.current = 0;
    }
  }, []);

  const persistQueuedAuthSyncToStorage = useCallback(
    (userId = queuedSyncUserIdRef.current) => {
      if (!userId) return;

      const playerStateToPersist =
        queuedPlayerStateRef.current || inFlightQueuedPlayerStateRef.current;
      const listenEventsToPersist = [
        ...inFlightQueuedTrackListenEventsRef.current,
        ...queuedTrackListenEventsRef.current,
      ];

      persistAuthSyncQueue(userId, {
        playerState: playerStateToPersist,
        listenEvents: listenEventsToPersist,
      });
    },
    [],
  );

  const scheduleQueuedAuthSyncFlush = useCallback(
    (delay = AUTH_SYNC_IDLE_MS) => {
      if (!supabase || !queuedSyncUserIdRef.current) {
        return;
      }

      cancelQueuedAuthSyncFlush();

      authSyncFlushTimeoutRef.current = window.setTimeout(() => {
        authSyncFlushTimeoutRef.current = 0;

        const runFlush = () => {
          authSyncIdleCallbackRef.current = 0;
          void flushQueuedAuthSyncRef.current?.();
        };

        if (
          typeof window !== 'undefined' &&
          typeof window.requestIdleCallback === 'function'
        ) {
          authSyncIdleCallbackRef.current = window.requestIdleCallback(
            runFlush,
            { timeout: AUTH_SYNC_IDLE_MS },
          );
          return;
        }

        runFlush();
      }, delay);
    },
    [cancelQueuedAuthSyncFlush, supabase],
  );

  const flushQueuedAuthSync = useCallback(
    async (userId = queuedSyncUserIdRef.current) => {
      if (!supabase || !userId) {
        return;
      }

      if (authSyncFlushPromiseRef.current) {
        await authSyncFlushPromiseRef.current;
        return;
      }

      const queuedPlayerState = queuedPlayerStateRef.current;
      const queuedListenEvents = [...queuedTrackListenEventsRef.current];

      if (!queuedPlayerState && queuedListenEvents.length === 0) {
        persistAuthSyncQueue(userId, {
          playerState: null,
          listenEvents: [],
        });
        return;
      }

      persistQueuedAuthSyncToStorage(userId);
      inFlightQueuedPlayerStateRef.current = queuedPlayerState;
      inFlightQueuedTrackListenEventsRef.current = queuedListenEvents;
      queuedPlayerStateRef.current = null;
      queuedTrackListenEventsRef.current = [];

      const flushPromise = (async () => {
        let unsavedPlayerState = null;
        const unsentListenEvents = [];

        if (queuedPlayerState) {
          try {
            const savedSnapshot = await saveUserPlayerState(
              supabase,
              userId,
              queuedPlayerState,
            );

            if (authUserIdRef.current === userId) {
              lastSyncedPlayerStateRef.current = JSON.stringify(savedSnapshot);
            }
          } catch (error) {
            unsavedPlayerState = queuedPlayerState;
            console.error('Failed to flush queued player state.', error);
          }
        }

        for (let index = 0; index < queuedListenEvents.length; index += 1) {
          const queuedEvent = queuedListenEvents[index];

          try {
            const result = await recordYouTubeTrackListen(
              supabase,
              queuedEvent.youtubeVideoId,
              queuedEvent.listenEvent,
              queuedEvent.secondsPlayed,
            );

            if (authUserIdRef.current === userId && result?.listenStatus) {
              loadedListenStatusVideoIdsRef.current.add(
                queuedEvent.youtubeVideoId,
              );
              startTransition(() => {
                setListenedStatusById((previousStatus) =>
                  mergeListenedStatuses(previousStatus, {
                    [queuedEvent.youtubeVideoId]: result.listenStatus,
                  }),
                );
              });
            }
          } catch (error) {
            if (isMissingCatalogTrackError(error)) {
              nonCatalogedListenVideoIdsRef.current.add(
                queuedEvent.youtubeVideoId,
              );
              continue;
            }

            unsentListenEvents.push(...queuedListenEvents.slice(index));
            console.error('Failed to flush queued track listen events.', error);
            break;
          }
        }

        authSyncFlushPromiseRef.current = null;
        inFlightQueuedPlayerStateRef.current = null;
        inFlightQueuedTrackListenEventsRef.current = [];

        if (queuedSyncUserIdRef.current !== userId) {
          persistAuthSyncQueue(userId, {
            playerState: unsavedPlayerState,
            listenEvents: unsentListenEvents,
          });
          return;
        }

        if (unsavedPlayerState && !queuedPlayerStateRef.current) {
          queuedPlayerStateRef.current = unsavedPlayerState;
        }
        if (unsentListenEvents.length > 0) {
          queuedTrackListenEventsRef.current = [
            ...unsentListenEvents,
            ...queuedTrackListenEventsRef.current,
          ];
        }

        if (
          currentAccountPlayerStateSerializedRef.current &&
          currentAccountPlayerStateSerializedRef.current !==
            lastSyncedPlayerStateRef.current
        ) {
          queuedPlayerStateRef.current = currentAccountPlayerStateRef.current;
        }

        persistQueuedAuthSyncToStorage(userId);

        if (
          queuedPlayerStateRef.current ||
          queuedTrackListenEventsRef.current.length > 0
        ) {
          scheduleQueuedAuthSyncFlush(AUTH_SYNC_IDLE_MS);
        }
      })();

      authSyncFlushPromiseRef.current = flushPromise;
      await flushPromise;
    },
    [persistQueuedAuthSyncToStorage, scheduleQueuedAuthSyncFlush, supabase],
  );

  useEffect(() => {
    flushQueuedAuthSyncRef.current = flushQueuedAuthSync;
  }, [flushQueuedAuthSync]);

  useEffect(() => {
    const nextUserId = authUser?.id ?? null;
    const previousUserId = queuedSyncUserIdRef.current;

    if (previousUserId && previousUserId !== nextUserId) {
      persistQueuedAuthSyncToStorage(previousUserId);
    }

    cancelQueuedAuthSyncFlush();
    queuedSyncUserIdRef.current = nextUserId;
    queuedPlayerStateRef.current = null;
    queuedTrackListenEventsRef.current = [];
    inFlightQueuedPlayerStateRef.current = null;
    inFlightQueuedTrackListenEventsRef.current = [];

    if (!nextUserId) {
      return;
    }

    const persistedQueue = loadPersistedAuthSyncQueue(nextUserId);
    queuedPlayerStateRef.current = persistedQueue.playerState;
    queuedTrackListenEventsRef.current = persistedQueue.listenEvents;

    if (persistedQueue.playerState || persistedQueue.listenEvents.length > 0) {
      scheduleQueuedAuthSyncFlush(900);
    }
  }, [
    authUser?.id,
    cancelQueuedAuthSyncFlush,
    persistQueuedAuthSyncToStorage,
    scheduleQueuedAuthSyncFlush,
  ]);

  useEffect(() => {
    if (!authUser?.id) {
      return undefined;
    }

    const currentUserId = authUser.id;

    const handleVisibilityChange = () => {
      persistQueuedAuthSyncToStorage(currentUserId);

      if (document.visibilityState === 'hidden') {
        cancelQueuedAuthSyncFlush();
        void flushQueuedAuthSyncRef.current?.(currentUserId);
      }
    };

    const handlePageHide = () => {
      persistQueuedAuthSyncToStorage(currentUserId);
      cancelQueuedAuthSyncFlush();
      void flushQueuedAuthSyncRef.current?.(currentUserId);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [authUser?.id, cancelQueuedAuthSyncFlush, persistQueuedAuthSyncToStorage]);

  useEffect(() => {
    loadedListenStatusVideoIdsRef.current = new Set();
    inFlightListenStatusVideoIdsRef.current = new Set();
    didFullListenStatusFetchRef.current = false;
    trackListenSessionRef.current = {
      videoId: null,
      startedPersisted: false,
      completedPersisted: false,
    };
  }, [authUser?.id]);

  useEffect(() => {
    if (!supabase || !authUser?.id || !isAuthReady) {
      return;
    }

    const userId = authUser.id;
    const shouldDoFullFetch = !didFullListenStatusFetchRef.current;

    const allVideos = [...playlist, ...supportList, ...nominationList];
    const requestedVideoIds = [];

    if (shouldDoFullFetch) {
      didFullListenStatusFetchRef.current = true;
    } else {
      for (const video of allVideos) {
        const videoId = video.videoId;
        if (
          loadedListenStatusVideoIdsRef.current.has(videoId) ||
          inFlightListenStatusVideoIdsRef.current.has(videoId)
        ) {
          continue;
        }
        requestedVideoIds.push(videoId);
      }

      if (requestedVideoIds.length === 0) {
        return;
      }

      requestedVideoIds.forEach((videoId) => {
        inFlightListenStatusVideoIdsRef.current.add(videoId);
      });
    }

    const fetchPromise = shouldDoFullFetch
      ? fetchUserTrackListenStatuses(supabase, null)
      : fetchUserTrackListenStatuses(supabase, requestedVideoIds);

    fetchPromise
      .then((remoteStatuses) => {
        if (authUserIdRef.current !== userId) return;

        if (!shouldDoFullFetch) {
          requestedVideoIds.forEach((videoId) => {
            inFlightListenStatusVideoIdsRef.current.delete(videoId);
            loadedListenStatusVideoIdsRef.current.add(videoId);
          });
        } else {
          // If full fetch, mark all currently tracked IDs as loaded
          allVideos.forEach((video) => {
            loadedListenStatusVideoIdsRef.current.add(video.videoId);
          });
        }

        if (Object.keys(remoteStatuses).length === 0) {
          return;
        }

        startTransition(() => {
          setListenedStatusById((previousStatus) =>
            mergeListenedStatuses(previousStatus, remoteStatuses),
          );
        });
      })
      .catch((error) => {
        if (!shouldDoFullFetch) {
          requestedVideoIds.forEach((videoId) => {
            inFlightListenStatusVideoIdsRef.current.delete(videoId);
          });
        }
        if (authUserIdRef.current !== userId) return;
        console.error('Failed to fetch track listen history.', error);
      });
  }, [
    authUser?.id,
    isAuthReady,
    playlist,
    supportList,
    nominationList,
    supabase,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !authUser) return;

    if (isDiscordAuthUser(authUser)) {
      window.localStorage.setItem(DISCORD_OAUTH_SEEN_STORAGE_KEY, '1');
      window.sessionStorage.removeItem(DISCORD_OAUTH_SILENT_PENDING_KEY);
    }
  }, [authUser]);

  const mergeCatalogTrackSummaries = useCallback((summaries) => {
    if (!summaries.length) {
      return {};
    }

    const updates = {};
    for (const summary of summaries) {
      if (!summary?.videoId) continue;

      updates[summary.videoId] = {
        videoId: summary.videoId,
        trackId: summary.trackId ?? null,
        gameTitle: summary.gameTitle ?? '',
        trackTitle: summary.trackTitle ?? '',
        displayTitle: summary.displayTitle ?? '',
        sourceTitle: summary.sourceTitle ?? '',
        sourceChannelTitle: summary.sourceChannelTitle ?? '',
        sourceThumbnailUrl: summary.sourceThumbnailUrl ?? '',
        isRetired: Boolean(summary.isRetired),
        retiredByTournamentName: summary.retiredByTournamentName ?? '',
      };
    }

    if (Object.keys(updates).length === 0) {
      return {};
    }

    catalogTrackByVideoIdRef.current = {
      ...catalogTrackByVideoIdRef.current,
      ...updates,
    };

    startTransition(() => {
      setCatalogTrackByVideoId((previousValue) => ({
        ...previousValue,
        ...updates,
      }));
    });

    return updates;
  }, []);

  const ensureCatalogEntriesForVideoIds = useCallback(
    async (videoIds) => {
      const normalizedVideoIds = Array.from(
        new Set(
          Array.isArray(videoIds)
            ? videoIds.filter(
                (videoId) =>
                  typeof videoId === 'string' &&
                  /^[A-Za-z0-9_-]{11}$/.test(videoId),
              )
            : [],
        ),
      );

      const knownEntries = catalogTrackByVideoIdRef.current;
      if (!supabase || normalizedVideoIds.length === 0) {
        return knownEntries;
      }

      const missingVideoIds = normalizedVideoIds.filter(
        (videoId) =>
          !(videoId in knownEntries) &&
          !catalogLookupPendingVideoIdsRef.current.has(videoId),
      );

      if (missingVideoIds.length === 0) {
        return knownEntries;
      }

      missingVideoIds.forEach((videoId) => {
        catalogLookupPendingVideoIdsRef.current.add(videoId);
      });

      try {
        const fetchedEntries = await fetchTrackCatalogByVideoIds(
          supabase,
          missingVideoIds,
        );
        const fetchedById = new Map(
          fetchedEntries.map((entry) => [
            entry.videoId,
            {
              videoId: entry.videoId,
              trackId: entry.trackId,
              gameTitle: entry.gameTitle,
              trackTitle: entry.trackTitle,
              displayTitle: entry.displayTitle,
              sourceTitle: entry.sourceTitle,
              sourceChannelTitle: entry.sourceChannelTitle,
              sourceThumbnailUrl:
                entry.sourceThumbnailUrl ||
                getYouTubeThumbnailUrl(entry.videoId),
              isRetired: entry.isRetired,
              retiredByTournamentName: entry.retiredByTournamentName,
            },
          ]),
        );

        const fallbackEntries = missingVideoIds
          .filter((videoId) => !fetchedById.has(videoId))
          .map((videoId) => ({
            videoId,
            trackId: null,
            gameTitle: '',
            trackTitle: '',
            displayTitle: '',
            sourceTitle: '',
            sourceChannelTitle: '',
            sourceThumbnailUrl: getYouTubeThumbnailUrl(videoId),
            isRetired: false,
            retiredByTournamentName: '',
          }));

        mergeCatalogTrackSummaries([
          ...fetchedById.values(),
          ...fallbackEntries,
        ]);
        return catalogTrackByVideoIdRef.current;
      } finally {
        missingVideoIds.forEach((videoId) => {
          catalogLookupPendingVideoIdsRef.current.delete(videoId);
        });
      }
    },
    [mergeCatalogTrackSummaries, supabase],
  );

  useEffect(() => {
    const activeCatalogVideoId =
      transientVideo?.videoId || currentVideoId || null;
    const requestedVideoIds = [
      ...new Set(
        [
          activeCatalogVideoId,
          ...playlist.map((video) => video.videoId),
          ...supportList.map((video) => video.videoId),
          ...nominationList.map((video) => video.videoId),
        ].filter(Boolean),
      ),
    ];
    if (requestedVideoIds.length === 0) {
      return undefined;
    }

    ensureCatalogEntriesForVideoIds(requestedVideoIds)
      .then((catalog) => {
        if (!catalog) return;

        const syncItem = (item) => {
          const meta = catalog[item.videoId];
          if (!meta) return item;

          const hasNewGame =
            meta.gameTitle && meta.gameTitle !== item.gameTitle;
          const hasNewTrack =
            meta.trackTitle && meta.trackTitle !== item.trackTitle;
          const hasNewDisplay =
            meta.displayTitle && meta.displayTitle !== item.displayTitle;
          const hasNewTrackId = meta.trackId && meta.trackId !== item.trackId;
          const hasNewThumbnail =
            meta.sourceThumbnailUrl &&
            meta.sourceThumbnailUrl !== item.thumbnail;

          if (
            hasNewGame ||
            hasNewTrack ||
            hasNewDisplay ||
            hasNewTrackId ||
            hasNewThumbnail
          ) {
            return {
              ...item,
              trackId: meta.trackId || item.trackId,
              gameTitle: meta.gameTitle || item.gameTitle,
              trackTitle: meta.trackTitle || item.trackTitle,
              displayTitle: meta.displayTitle || item.displayTitle,
              thumbnail: meta.sourceThumbnailUrl || item.thumbnail,
            };
          }
          return item;
        };

        setPlaylist((current) => {
          const next = current.map(syncItem);
          return JSON.stringify(current) === JSON.stringify(next)
            ? current
            : next;
        });
        setSupportList((current) => {
          const next = current.map(syncItem);
          return JSON.stringify(current) === JSON.stringify(next)
            ? current
            : next;
        });
        setNominationList((current) => {
          const next = current.map(syncItem);
          return JSON.stringify(current) === JSON.stringify(next)
            ? current
            : next;
        });
      })
      .catch((error) => {
        console.error('Failed to resolve track catalog entries:', error);
      });

    return undefined;
  }, [
    currentVideoId,
    ensureCatalogEntriesForVideoIds,
    nominationList,
    playlist,
    setNominationList,
    setPlaylist,
    setSupportList,
    supportList,
    transientVideo?.videoId,
  ]);

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

        const catalogEntry = catalogTrackByVideoId[video.videoId];
        const enrichedVideo = catalogEntry
          ? {
              ...video,
              title:
                catalogEntry.displayTitle ||
                catalogEntry.sourceTitle ||
                video.title ||
                video.videoId,
              thumbnail:
                catalogEntry.sourceThumbnailUrl ||
                video.thumbnail ||
                getYouTubeThumbnailUrl(video.videoId),
              channelTitle:
                catalogEntry.sourceChannelTitle || video.channelTitle || '',
              trackId: catalogEntry.trackId ?? null,
              gameTitle: catalogEntry.gameTitle ?? video.gameTitle ?? '',
              trackTitle: catalogEntry.trackTitle ?? video.trackTitle ?? '',
              displayTitle:
                catalogEntry.displayTitle ?? video.displayTitle ?? '',
              isRetired:
                typeof video.isRetired === 'boolean'
                  ? video.isRetired
                  : Boolean(catalogEntry.isRetired),
              retiredByTournamentName:
                video.retiredByTournamentName ||
                catalogEntry.retiredByTournamentName ||
                '',
            }
          : video;

        return {
          ...enrichedVideo,
          loadIndex: loadIndexById.get(videoId) ?? 0,
        };
      })
      .filter(Boolean);
  }, [
    catalogTrackByVideoId,
    isShuffleEnabled,
    playlist,
    playOrderIds,
    showOriginalOrder,
  ]);

  const currentDisplayIndex = transientVideo
    ? null
    : displayPlaylist.findIndex((video) => video.videoId === currentVideoId);
  const isPlayerPage = activePage === 'player';
  const isDatabasePage = activePage === 'database';
  const isListExplorerPage = activePage === 'listExplorer';
  const shouldRenderDesktopPlaylistOverlay = !isMobileLayout && !isPlayerPage;
  const effectivePlaylistCollapsed = isPlayerPage
    ? isPlaylistCollapsed
    : !isDesktopOverlayPlaylistOpen;

  const currentPlaylistVideo =
    playlist.find((video) => video.videoId === currentVideoId) || null;
  const currentVideo = transientVideo || currentPlaylistVideo;
  const getCatalogTrackForVideo = useCallback(
    (video) => {
      if (!video?.videoId) {
        return null;
      }

      const catalogEntry =
        catalogTrackByVideoId[video.videoId] ||
        catalogTrackByVideoIdRef.current[video.videoId];
      if (catalogEntry) {
        return catalogEntry;
      }

      if (
        typeof video.trackId === 'string' ||
        typeof video.gameTitle === 'string' ||
        typeof video.trackTitle === 'string' ||
        typeof video.displayTitle === 'string' ||
        typeof video.title === 'string' ||
        typeof video.channelTitle === 'string' ||
        typeof video.thumbnail === 'string' ||
        typeof video.retiredByTournamentName === 'string' ||
        typeof video.isRetired === 'boolean'
      ) {
        return {
          videoId: video.videoId,
          trackId: video.trackId ?? null,
          gameTitle: video.gameTitle ?? '',
          trackTitle: video.trackTitle ?? '',
          displayTitle: video.displayTitle ?? '',
          sourceTitle: video.title ?? '',
          sourceChannelTitle: video.channelTitle ?? '',
          sourceThumbnailUrl:
            video.thumbnail || getYouTubeThumbnailUrl(video.videoId),
          isRetired: Boolean(video.isRetired),
          retiredByTournamentName: video.retiredByTournamentName ?? '',
        };
      }

      return null;
    },
    [catalogTrackByVideoId],
  );
  const isVideoRetired = useCallback(
    (video) => Boolean(getCatalogTrackForVideo(video)?.isRetired),
    [getCatalogTrackForVideo],
  );
  const retiredVideoIds = useMemo(
    () =>
      new Set(
        Object.entries(catalogTrackByVideoId)
          .filter(([, entry]) => entry?.isRetired)
          .map(([videoId]) => videoId),
      ),
    [catalogTrackByVideoId],
  );
  const currentVideoSupportEntry = currentVideo
    ? supportList.find((entry) => entry.videoId === currentVideo.videoId)
    : null;
  const isCurrentVideoSupported = Boolean(currentVideoSupportEntry);
  const isCurrentVideoNominated = currentVideo
    ? nominationList.some((entry) => entry.videoId === currentVideo.videoId)
    : false;
  const isCurrentVideoRetired = currentVideo
    ? isVideoRetired(currentVideo)
    : false;
  const isCurrentVideoInPlaylist = currentVideo
    ? playlist.some((entry) => entry.videoId === currentVideo.videoId)
    : false;
  const currentSupportLabel = !currentVideo
    ? 'No current video to support'
    : isCurrentVideoNominated
      ? 'Nomination tracks cannot be changed from the player'
      : isCurrentVideoRetired
        ? 'This song is retired'
        : isCurrentVideoSupported
          ? 'Remove from support list'
          : 'Add to support list';
  const currentSupportTooltip = !currentVideo
    ? 'No current video'
    : isCurrentVideoNominated
      ? 'In Nomination List'
      : isCurrentVideoRetired
        ? 'This song is retired'
        : isCurrentVideoSupported
          ? 'Remove Support'
          : 'Add to support list';
  const currentSupportLevel = currentVideoSupportEntry?.supportLevel || 1;
  const currentSupportClassName = isCurrentVideoNominated
    ? ' nominated locked'
    : isCurrentVideoRetired
      ? ' retired-blocked'
      : isCurrentVideoSupported
        ? ` supported level-${currentSupportLevel}`
        : '';
  const currentSupportGlyph = isCurrentVideoNominated
    ? '★'
    : isCurrentVideoSupported
      ? currentSupportLevel === 3
        ? '🔒'
        : '♥'
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

    const snapshot = createPlayerStateSnapshot();

    if (guestSyncTimeoutRef.current) {
      window.clearTimeout(guestSyncTimeoutRef.current);
    }

    guestSyncTimeoutRef.current = window.setTimeout(() => {
      guestSyncTimeoutRef.current = 0;
      persistLocalGuestPlayerState(snapshot);
    }, 200);

    return () => {
      if (guestSyncTimeoutRef.current) {
        window.clearTimeout(guestSyncTimeoutRef.current);
        guestSyncTimeoutRef.current = 0;
      }
    };
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
      const nextUsername = deriveProfileUsername(
        user,
        preferredUsername || existingProfile?.username || '',
      );
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
        const persistedQueue = loadPersistedAuthSyncQueue(user.id);
        const baseHydratedState = persistedQueue.playerState
          ? normalizePersistedPlayerState({
              ...persistedQueue.playerState,
              listenedStatusById: normalizedState.listenedStatusById,
            })
          : normalizedState;
        const hydratedState = normalizePersistedPlayerState({
          ...baseHydratedState,
          listenedStatusById: mergeListenedStatuses(
            baseHydratedState.listenedStatusById,
            buildQueuedListenStatuses(persistedQueue.listenEvents),
          ),
        });

        applyPersistedPlayerState(hydratedState);
        lastSyncedPlayerStateRef.current = JSON.stringify(
          createAccountPersistedPlayerState(normalizedState),
        );
        syncCatalogForNominationVideos(hydratedState.nominationList, {
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
    hydrateAuthenticatedUserRef.current = hydrateAuthenticatedUser;
  }, [hydrateAuthenticatedUser]);

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
          await hydrateAuthenticatedUserRef.current?.(session.user);
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
        hydrateAuthenticatedUserRef.current?.(session.user, {
          preferredUsername,
          preferredGamefaqsUsername,
        });
      }, 0);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !authUser || !isAuthReady) {
      return undefined;
    }

    const snapshot = createAccountPlayerStateSnapshot();
    const serializedSnapshot = JSON.stringify(snapshot);
    currentAccountPlayerStateRef.current = snapshot;
    currentAccountPlayerStateSerializedRef.current = serializedSnapshot;

    if (serializedSnapshot === lastSyncedPlayerStateRef.current) {
      queuedPlayerStateRef.current = null;
      return undefined;
    }

    queuedPlayerStateRef.current = snapshot;

    if (forceImmediateSyncRef.current) {
      scheduleQueuedAuthSyncFlush(0);
      forceImmediateSyncRef.current = false;
    } else {
      scheduleQueuedAuthSyncFlush(AUTH_SYNC_IDLE_MS);
    }

    return undefined;
  }, [
    authUser,
    createAccountPlayerStateSnapshot,
    isAuthReady,
    scheduleQueuedAuthSyncFlush,
    supabase,
  ]);

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

  const showDefaultAppToast = useCallback(
    (message, tone = 'default') => {
      setAppToastTone(tone);
      setAppToastMessage(message);

      if (appToastTimeoutRef.current) {
        window.clearTimeout(appToastTimeoutRef.current);
      }

      appToastTimeoutRef.current = window.setTimeout(() => {
        appToastTimeoutRef.current = null;
        setAppToastMessage('');
      }, 3200);
    },
    [setAppToastMessage, setAppToastTone],
  );

  const handleShowDashboardToast = useCallback(
    (message) => {
      showDefaultAppToast(message, 'dashboard');
    },
    [showDefaultAppToast],
  );

  const showRetiredSongToast = useCallback(() => {
    showDefaultAppToast(
      'This song is retired. It can still be added to the current playlist.',
    );
  }, [showDefaultAppToast]);

  const handleOpenExportModal = useCallback((tracks) => {
    setExportTracks(tracks);
    setIsExportModalOpen(true);
  }, []);

  const handleCreateYTPlaylist = useCallback(
    (tracks) => {
      const videoIds = tracks
        .map((t) => t.videoId || t.id)
        .filter((id) => id && id.length === 11);

      if (videoIds.length === 0) {
        showDefaultAppToast('No valid YouTube videos to export.', 'dashboard');
        return;
      }

      if (videoIds.length > 50) {
        showDefaultAppToast(
          'YouTube limited to first 50 tracks for temporary playlists.',
          'dashboard',
        );
      }

      const limitedIds = videoIds.slice(0, 50);
      const url = `https://www.youtube.com/watch_videos?video_ids=${limitedIds.join(',')}`;

      window.open(url, '_blank');
    },
    [showDefaultAppToast],
  );

  const handleRequestCloseExportModal = useCallback(() => {
    setIsExportModalOpen(false);
  }, []);

  const applyCatalogMetadataToVideo = useCallback(
    (video) => {
      if (!video?.videoId) {
        return video;
      }

      const catalogEntry = getCatalogTrackForVideo(video);
      if (!catalogEntry) {
        return video;
      }

      return {
        ...video,
        title:
          video.title ||
          catalogEntry.sourceTitle ||
          catalogEntry.displayTitle ||
          video.videoId,
        thumbnail:
          video.thumbnail ||
          catalogEntry.sourceThumbnailUrl ||
          getYouTubeThumbnailUrl(video.videoId),
        channelTitle:
          video.channelTitle || catalogEntry.sourceChannelTitle || '',
        trackId: catalogEntry.trackId ?? null,
        gameTitle: catalogEntry.gameTitle ?? video.gameTitle ?? '',
        trackTitle: catalogEntry.trackTitle ?? video.trackTitle ?? '',
        displayTitle: catalogEntry.displayTitle ?? video.displayTitle ?? '',
        isRetired:
          typeof video.isRetired === 'boolean'
            ? video.isRetired
            : Boolean(catalogEntry.isRetired),
        retiredByTournamentName:
          video.retiredByTournamentName ||
          catalogEntry.retiredByTournamentName ||
          '',
      };
    },
    [getCatalogTrackForVideo],
  );

  const partitionRetiredVideos = useCallback(
    async (videos) => {
      const normalizedVideos = Array.isArray(videos)
        ? videos.filter(Boolean)
        : [];
      if (normalizedVideos.length === 0) {
        return { allowedVideos: [], retiredVideos: [] };
      }

      await ensureCatalogEntriesForVideoIds(
        normalizedVideos.map((video) => video.videoId),
      );

      const allowedVideos = [];
      const retiredVideos = [];

      for (const video of normalizedVideos) {
        const enrichedVideo = applyCatalogMetadataToVideo(video);
        if (isVideoRetired(enrichedVideo)) {
          retiredVideos.push(enrichedVideo);
          continue;
        }

        allowedVideos.push(enrichedVideo);
      }

      return { allowedVideos, retiredVideos };
    },
    [
      applyCatalogMetadataToVideo,
      ensureCatalogEntriesForVideoIds,
      isVideoRetired,
    ],
  );

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

  const handleDeleteAccountConfirm = useCallback(async () => {
    if (!supabase) return;

    setIsDeletingAccount(true);
    try {
      const { error } = await supabase.rpc('delete_own_user');
      if (error) throw error;

      // Clear all local state
      clearLocalGuestPlayerState();
      applyPersistedPlayerState({});
      localStorage.clear();

      // Sign out to clear session
      await supabase.auth.signOut();

      // Reset UI state
      setIsDeleteAccountConfirmOpen(false);
      setIsSettingsOpen(false);
      setActivePage('home');

      setAppToastTone('logout');
      setAppToastMessage('Account deleted successfully.');
      if (appToastTimeoutRef.current) {
        window.clearTimeout(appToastTimeoutRef.current);
      }
      appToastTimeoutRef.current = window.setTimeout(() => {
        appToastTimeoutRef.current = null;
        setAppToastMessage('');
        setAppToastTone('default');
      }, 3000);
    } catch (error) {
      console.error('Account deletion failed:', error);
      setAuthError(error.message || 'Failed to delete account.');
      setIsDeleteAccountConfirmOpen(false);
    } finally {
      setIsDeletingAccount(false);
    }
  }, [applyPersistedPlayerState, supabase]);

  const handleOpenHistory = useCallback(() => {
    setIsHistoryOpen(true);
  }, []);

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

  const persistTrackListenEvent = useCallback(
    (videoId, listenEvent) => {
      const normalizedVideoId =
        typeof videoId === 'string' ? videoId.trim() : '';

      if (
        !supabase ||
        !authUserIdRef.current ||
        !normalizedVideoId ||
        nonCatalogedListenVideoIdsRef.current.has(normalizedVideoId)
      ) {
        return;
      }

      const currentSession = trackListenSessionRef.current;

      if (listenEvent === 'started') {
        if (
          currentSession.videoId === normalizedVideoId &&
          currentSession.startedPersisted &&
          !currentSession.completedPersisted
        ) {
          return;
        }

        trackListenSessionRef.current = {
          videoId: normalizedVideoId,
          startedPersisted: true,
          completedPersisted: false,
        };
      } else if (listenEvent === 'completed') {
        if (
          currentSession.videoId === normalizedVideoId &&
          currentSession.completedPersisted
        ) {
          return;
        }

        trackListenSessionRef.current = {
          videoId: normalizedVideoId,
          startedPersisted: true,
          completedPersisted: true,
        };
      } else {
        return;
      }

      loadedListenStatusVideoIdsRef.current.add(normalizedVideoId);
      queuedTrackListenEventsRef.current = [
        ...queuedTrackListenEventsRef.current,
        {
          youtubeVideoId: normalizedVideoId,
          listenEvent,
          secondsPlayed: 0,
        },
      ];
      scheduleQueuedAuthSyncFlush(AUTH_SYNC_IDLE_MS);
    },
    [scheduleQueuedAuthSyncFlush, supabase],
  );

  const markVideoCompleted = useCallback(
    (videoId) => {
      if (!videoId) return;

      setListenedStatusById((previousStatus) => {
        if (previousStatus[videoId] === 'complete') return previousStatus;
        return {
          ...previousStatus,
          [videoId]: 'complete',
        };
      });

      persistTrackListenEvent(videoId, 'completed');
    },
    [persistTrackListenEvent],
  );

  const markVideoStarted = useCallback(
    (videoId) => {
      if (!videoId) return;

      setListenedStatusById((previousStatus) => {
        if (previousStatus[videoId]) return previousStatus;
        return {
          ...previousStatus,
          [videoId]: 'partial',
        };
      });

      persistTrackListenEvent(videoId, 'started');

      const video =
        playlistRef.current.find((v) => v.videoId === videoId) ||
        (transientVideo?.videoId === videoId ? transientVideo : null);

      if (video) {
        const catalogEntry = getCatalogTrackForVideo(video);
        recordTrackHistory({
          videoId: video.videoId,
          title: video.title || catalogEntry?.sourceTitle || '',
          trackTitle: catalogEntry?.trackTitle || video.trackTitle || '',
          gameTitle: catalogEntry?.gameTitle || video.gameTitle || '',
          trackId: catalogEntry?.trackId || video.trackId || null,
        });
      }
    },
    [persistTrackListenEvent, getCatalogTrackForVideo, transientVideo],
  );

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
    if (!isPreviewModeEnabled) {
      setPreviewCountdown(30);
      return undefined;
    }

    if (!isPlaying || !currentVideo?.videoId) return undefined;

    const intervalId = window.setInterval(() => {
      setPreviewCountdown((prev) => {
        if (prev <= 1) {
          handleAdvancePreview();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    currentVideo?.videoId,
    handleAdvancePreview,
    isPlaying,
    isPreviewModeEnabled,
  ]);

  useEffect(() => {
    if (isPreviewModeEnabled) {
      setPreviewCountdown(30);
    }
  }, [currentVideoId, isPreviewModeEnabled]);

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
      if (!authUserIdRef.current) {
        setListenedStatusById({});
      }

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
      if (!isPreviewModeEnabled) {
        markVideoCompleted(transientVideo.videoId);
      }
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
    async (videoOrVideos, level = null) => {
      if (!videoOrVideos) return;
      const videos = Array.isArray(videoOrVideos)
        ? videoOrVideos
        : [videoOrVideos];
      if (videos.length === 0) return;

      const allowedVideosToProcess = videos.filter(
        (v) => !nominationList.some((entry) => entry.videoId === v.videoId),
      );

      if (allowedVideosToProcess.length === 0) return;

      const { allowedVideos, retiredVideos } = await partitionRetiredVideos(
        allowedVideosToProcess,
      );

      if (allowedVideos.length === 0) {
        if (retiredVideos.length > 0) {
          showRetiredSongToast();
        }
        return;
      }

      setSupportList((previousList) => {
        let nextList = [...previousList];

        allowedVideos.forEach((nextVideo) => {
          const exists = previousList.some(
            (entry) => entry.videoId === nextVideo.videoId,
          );

          if (level === 0) {
            nextList = nextList.filter(
              (entry) => entry.videoId !== nextVideo.videoId,
            );
          } else if (exists) {
            if (level !== null) {
              nextList = nextList.map((entry) =>
                entry.videoId === nextVideo.videoId
                  ? { ...entry, supportLevel: level }
                  : entry,
              );
            } else {
              nextList = nextList.filter(
                (entry) => entry.videoId !== nextVideo.videoId,
              );
            }
          } else {
            nextList.push({
              ...nextVideo,
              supportLevel: level !== null ? level : 1,
            });
          }
        });

        return nextList;
      });

      if (authUser) {
        allowedVideos.forEach((v) => {
          const exists = supportList.some(
            (entry) => entry.videoId === v.videoId,
          );
          const isRemoving = level === 0 || (exists && level === null);
          const nextLevel = isRemoving ? 0 : level !== null ? level : 1;
          if (v.trackId) {
            saveTrackSupport(supabase, authUser.id, v, nextLevel).catch(
              (error) => {
                console.error('Failed to sync support level to DB:', error);
              },
            );
          }
        });
      }

      if (allowedVideos.length === 1) {
        const nextVideo = allowedVideos[0];
        const exists = supportList.some(
          (entry) => entry.videoId === nextVideo.videoId,
        );
        const isRemoving = level === 0 || (exists && level === null);
        if (!isRemoving) {
          showSupportToast(
            level === 2
              ? 'Added to High Support'
              : level === 3
                ? 'Added to Definite Support'
                : 'Added to Support list',
          );
        }
      } else {
        showSupportToast(`Updated support for ${allowedVideos.length} tracks`);
      }
    },
    [
      nominationList,
      partitionRetiredVideos,
      showRetiredSongToast,
      showSupportToast,
      supportList,
      authUser,
      supabase,
    ],
  );

  const handleAddManyToSupportList = useCallback(
    async (videos) => {
      if (!videos.length) {
        return {
          addedCount: 0,
          blockedNominationCount: 0,
          blockedRetiredCount: 0,
        };
      }

      const { allowedVideos, retiredVideos } =
        await partitionRetiredVideos(videos);

      let resultSummary = {
        addedCount: 0,
        blockedNominationCount: 0,
        blockedRetiredCount: retiredVideos.length,
      };

      const currentCatalog = catalogTrackByVideoIdRef.current;

      setSupportList((previousList) => {
        const result = appendUniqueVideos(
          previousList,
          allowedVideos,
          new Set(nominationList.map((entry) => entry.videoId)),
        );

        const newTracksMissingMetadata = result.addedVideos.filter((video) => {
          const catalogItem = currentCatalog[video.videoId];
          return (
            (!catalogItem ||
              (!catalogItem.gameTitle && !catalogItem.trackTitle)) &&
            !video.gameTitle &&
            !video.trackTitle
          );
        });

        if (newTracksMissingMetadata.length > 0) {
          setTracksNeedingMetadata((prev) => {
            const existingIds = new Set(prev.map((v) => v.videoId));
            const uniqueNew = newTracksMissingMetadata.filter(
              (v) => !existingIds.has(v.videoId),
            );
            return [...prev, ...uniqueNew];
          });
        }

        resultSummary = {
          addedCount: result.addedCount,
          blockedNominationCount: result.blockedCount,
          blockedRetiredCount: retiredVideos.length,
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
    [nominationList, partitionRetiredVideos, showSupportToast],
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
    async (videos) => {
      if (!videos.length) {
        return {
          addedCount: 0,
          blockedNominationCount: 0,
          blockedRetiredCount: 0,
        };
      }

      const { allowedVideos, retiredVideos } =
        await partitionRetiredVideos(videos);

      const nominationResult = appendUniqueVideos(
        nominationListRef.current,
        allowedVideos,
      );

      if (!nominationResult.addedCount) {
        return {
          addedCount: 0,
          blockedNominationCount: 0,
          blockedRetiredCount: retiredVideos.length,
        };
      }

      const incomingIds = new Set(
        nominationResult.addedVideos.map((video) => video.videoId),
      );

      const currentCatalog = catalogTrackByVideoIdRef.current;
      const newTracksMissingMetadata = nominationResult.addedVideos.filter(
        (video) => {
          const catalogItem = currentCatalog[video.videoId];
          return (
            (!catalogItem ||
              (!catalogItem.gameTitle && !catalogItem.trackTitle)) &&
            !video.gameTitle &&
            !video.trackTitle
          );
        },
      );

      if (newTracksMissingMetadata.length > 0) {
        setTracksNeedingMetadata((prev) => {
          const existingIds = new Set(prev.map((v) => v.videoId));
          const uniqueNew = newTracksMissingMetadata.filter(
            (v) => !existingIds.has(v.videoId),
          );
          return [...prev, ...uniqueNew];
        });
      }

      setSupportList((previousList) =>
        previousList.filter((entry) => !incomingIds.has(entry.videoId)),
      );
      setNominationList(nominationResult.nextList);
      syncCatalogForNominationVideos(nominationResult.addedVideos);

      return {
        addedCount: nominationResult.addedCount,
        blockedNominationCount: 0,
        blockedRetiredCount: retiredVideos.length,
      };
    },
    [partitionRetiredVideos, syncCatalogForNominationVideos],
  );

  const handleSaveTrackMetadata = useCallback(
    async (metadataUpdates) => {
      // 1. Process updates and identify YouTube ID changes
      const processedUpdates = metadataUpdates.map((update) => {
        let finalVideoId = update.videoId;
        let finalUrl = update.currentUrl;

        if (
          update.videoUrl &&
          update.videoUrl.trim() &&
          update.videoUrl !== update.currentUrl
        ) {
          const parsed = parseYouTubeInput(update.videoUrl);
          if (parsed && parsed.videoId) {
            finalVideoId = parsed.videoId;
            finalUrl = update.videoUrl;
          }
        }

        return {
          ...update,
          videoId: finalVideoId,
          submittedUrl: finalUrl,
          hasChangedId: finalVideoId !== update.videoId,
        };
      });

      // 2. Fetch fresh YouTube metadata for any track where the ID changed
      const updatesWithYouTubeMeta = await Promise.all(
        processedUpdates.map(async (update) => {
          if (update.hasChangedId) {
            try {
              const ytMeta = await singleVideoEntry(update.videoId);
              return {
                ...update,
                title: ytMeta.title,
                channelTitle: ytMeta.channelTitle,
                thumbnail: ytMeta.thumbnail,
              };
            } catch (err) {
              console.error(
                'Failed to fetch YouTube metadata for',
                update.videoId,
                err,
              );
            }
          }
          return update;
        }),
      );

      // 3. Update the catalog cache overlay
      mergeCatalogTrackSummaries(updatesWithYouTubeMeta);

      const trackIdByVideoId = {};

      if (supabase && authUser) {
        try {
          // 4. Ingest YouTube metadata first to ensure track_sources entries exist
          const ingestResult = await ingestYouTubeTrackSources(
            supabase,
            updatesWithYouTubeMeta,
          );
          if (Array.isArray(ingestResult)) {
            ingestResult.forEach((row) => {
              if (row.youtube_video_id) {
                trackIdByVideoId[row.youtube_video_id] = row.track_id;
              }
            });
          }

          // 5. Call internal RPC for VGMC metadata
          const savePromises = updatesWithYouTubeMeta.map(async (update) => {
            const { data: trackId, error } = await supabase.rpc(
              'import_vgmc_catalog_row',
              {
                canonical_game_title_input: update.gameTitle,
                canonical_track_title_input: update.trackTitle,
                youtube_video_id_input: update.videoId,
                submitted_url_input: update.submittedUrl,
                nomination_contest_number: null,
                is_retired_input: false,
                retiree_contest_number: null,
                retiree_placement: null,
                highest_round_input: null,
              },
            );

            if (trackId && !error) {
              trackIdByVideoId[update.videoId] = trackId;
            }

            return { error };
          });

          const results = await Promise.all(savePromises);
          const errors = results.filter((r) => r.error);
          if (errors.length > 0) {
            console.error(
              'Some metadata updates failed to sync to Supabase:',
              errors,
            );
          }
        } catch (err) {
          console.error('Failed to sync metadata to Supabase:', err);
        }
      }

      // 6. Update local state lists with comprehensive metadata
      const applyUpdatesToList = (list) => {
        let nextList = [...list];
        updatesWithYouTubeMeta.forEach((update) => {
          const trackId = trackIdByVideoId[update.videoId] || update.trackId;
          nextList = nextList.map((item) => {
            const isMatch = update.oldVideoId
              ? item.videoId === update.oldVideoId
              : item.videoId === update.videoId;

            if (isMatch) {
              return {
                ...item,
                videoId: update.videoId,
                trackId: trackId || item.trackId,
                gameTitle: update.gameTitle,
                trackTitle: update.trackTitle,
                displayTitle: `${update.gameTitle} - ${update.trackTitle}`,
                title: update.title || item.title,
                thumbnail: update.thumbnail || item.thumbnail,
                channelTitle: update.channelTitle || item.channelTitle,
              };
            }
            return item;
          });
        });
        return nextList;
      };

      setSupportList(applyUpdatesToList);
      setNominationList(applyUpdatesToList);
      setPlaylist(applyUpdatesToList);

      setTracksNeedingMetadata((prev) =>
        prev.filter(
          (track) =>
            !metadataUpdates.some((u) => u.oldVideoId === track.videoId),
        ),
      );
      setManualMetadataTracks(null);

      forceImmediateSyncRef.current = true;
      mergeCatalogTrackSummaries(updatesWithYouTubeMeta);
    },
    [
      mergeCatalogTrackSummaries,
      supabase,
      setSupportList,
      setNominationList,
      setPlaylist,
      authUser,
    ],
  );

  const handleOpenMetadataUpdate = useCallback((videosOrVideo) => {
    const videos = Array.isArray(videosOrVideo)
      ? videosOrVideo
      : [videosOrVideo];
    setManualMetadataTracks(
      videos.map((video) => ({
        ...video,
        gameTitle: video.gameTitle || '',
        trackTitle: video.trackTitle || '',
      })),
    );
    setShowMetadataDialog(true);
  }, []);

  const handleDismissMetadataDialog = useCallback(() => {
    setShowMetadataDialog(false);
    setManualMetadataTracks(null);
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

      if (!authUserIdRef.current) {
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
      }

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
      return appendVideosToPlaylist(
        videos.map((video) => applyCatalogMetadataToVideo(video)),
        { flashResolved: true },
      );
    },
    [appendVideosToPlaylist, applyCatalogMetadataToVideo],
  );

  const handlePlayCatalogTrack = useCallback(
    (video) => {
      const nextVideo = applyCatalogMetadataToVideo(video);

      // If we are playing from the playlist, remember where to resume
      if (!transientVideo && currentVideoIdRef.current) {
        transientResumeVideoIdRef.current = currentVideoIdRef.current;
      }

      setTransientVideo(nextVideo);
      setIsPlaying(true);
      hasReachedPlaylistEndRef.current = false;
      markVideoStarted(nextVideo.videoId);
    },
    [applyCatalogMetadataToVideo, markVideoStarted, transientVideo],
  );

  const handlePlayNowFromSupportList = useCallback(
    (video) => {
      const nextVideo = applyCatalogMetadataToVideo(video);
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

      setTransientVideo(nextVideo);
      setIsPlaying(true);
      markVideoStarted(nextVideo.videoId);
    },
    [applyCatalogMetadataToVideo, isPlaying, transientVideo, markVideoStarted],
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

        if (transientVideo) {
          markVideoStarted(transientVideo.videoId);
        } else if (currentVideoIdRef.current) {
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
        activePageRef.current === 'player' &&
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

  const shellIsCollapsed =
    isPlaylistCollapsed ||
    !isPlayerPage ||
    isDatabasePage ||
    isListExplorerPage;
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
  const currentVideoDisplayTitle = (() => {
    if (!currentVideo) return '';
    const hasTrackTitle =
      typeof currentVideo.trackTitle === 'string' &&
      currentVideo.trackTitle.trim();
    const hasGameTitle =
      typeof currentVideo.gameTitle === 'string' &&
      currentVideo.gameTitle.trim();
    if (!hasTrackTitle && !hasGameTitle) return currentVideo.title;

    return `${hasGameTitle ? currentVideo.gameTitle : ''}${hasGameTitle && hasTrackTitle ? ' - ' : ''}${hasTrackTitle ? currentVideo.trackTitle : ''}`;
  })();

  const persistentPlayer = shouldRenderPersistentPlayer ? (
    <div
      key="persistent-player-surface"
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
        onOpenSupportDropdown={(video, position) =>
          setSupportLevelDropdown({ video, position })
        }
        isNominated={isCurrentVideoNominated}
        onToggleSupport={handleToggleSupportFromPlaylist}
        supportLevel={currentSupportLevel}
        isCurrentVideoInPlaylist={isCurrentVideoInPlaylist}
        onAddToPlaylist={handleQueueFromSupportList}
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
              text={currentVideoDisplayTitle}
            />
          </div>

          <div className="detached-footer-actions">
            <button
              className={`btn btn-icon add-to-playlist-btn detached-footer-add-btn${isCurrentVideoInPlaylist ? ' hidden' : ''}`}
              type="button"
              onClick={() => handleQueueFromSupportList([currentVideo])}
              aria-label="Add to current playlist"
              title="Add to current playlist"
              disabled={!currentVideo}
            >
              <PlaylistPlusIcon />
            </button>

            <button
              className={`btn btn-icon detached-footer-support-btn${currentSupportClassName}`}
              type="button"
              onClick={(event) => {
                if (!isCurrentVideoSupported) {
                  handleToggleSupportFromPlaylist(currentVideo);
                  const rect = event.currentTarget.getBoundingClientRect();
                  setSupportLevelDropdown({
                    video: currentVideo,
                    position: {
                      top: rect.top,
                      left: rect.left + rect.width / 2,
                    },
                    direction: 'up',
                  });
                } else {
                  handleToggleSupportFromPlaylist(currentVideo);
                }
              }}
              title={currentSupportTooltip}
              aria-label={currentSupportLabel}
              disabled={!currentVideo || isCurrentVideoNominated}
            >
              {currentSupportGlyph}
            </button>
          </div>
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
          theme={theme}
          onToggleTheme={handleToggleTheme}
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
          previewCountdown={previewCountdown}
          onTogglePreview={handleTogglePreviewMode}
          currentVideo={currentVideo}
          isCurrentVideoSupported={isCurrentVideoSupported}
          isCurrentVideoNominated={isCurrentVideoNominated}
          currentSupportLevel={currentSupportLevel}
          onToggleCurrentVideoSupport={handleToggleSupportFromPlaylist}
          isCurrentVideoInPlaylist={isCurrentVideoInPlaylist}
          onAddToPlaylist={handleQueueFromSupportList}
          onLoad={handleLoad}
          supabase={supabase}
          onCatalogPlayNow={handlePlayCatalogTrack}
          onAddCatalogToPlaylist={handleQueueFromSupportList}
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
          onOpenHistory={handleOpenHistory}
          onOpenSettings={handleOpenSettings}
          onLogout={handleLogout}
          isMenuOpen={isMobileNavOpen}
          onToggleMenu={() =>
            setIsMobileNavOpen((previousValue) => !previousValue)
          }
          onExport={handleOpenExportModal}
          onSavePlaylist={handleCreateYTPlaylist}
        />

        <main
          className={`main-content${isPlayerPage ? ' player-view' : isDatabasePage || isListExplorerPage ? ' home-view' : ' home-view'}${isListExplorerPage ? ' list-explorer-view' : ''}${!isPlayerPage && isLogoutTransitioning ? ' logout-fade-in' : ''}${hasDetachedFooter && !isPlayerPage ? ' has-persistent-player' : ''}`}
          id="main-content"
        >
          {!isPlayerPage && !isDatabasePage && !isListExplorerPage && (
            <HomePage
              supabase={supabase}
              authUser={authUser}
              isAuthReady={isAuthReady}
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

          {isDatabasePage && (
            <Suspense fallback={null}>
              <TrackDatabase
                supabase={supabase}
                authUser={authUser}
                onAddToPlaylist={handleQueueFromSupportList}
                onPlayNow={handlePlayNowFromSupportList}
                onShowToast={handleShowDashboardToast}
                hasPlayer={Boolean(currentVideo)}
                listenedStatusById={listenedStatusById}
              />
            </Suspense>
          )}

          {activePage === 'listExplorer' && (
            <ListExplorer
              playlist={playlist}
              supportList={supportList}
              nominationList={nominationList}
              customPlaylists={customPlaylists}
              onUpdatePlaylist={setPlaylist}
              onUpdateSupportList={setSupportList}
              onUpdateNominationList={setNominationList}
              onUpdateCustomPlaylists={setCustomPlaylists}
              onPlayNow={(video) => handlePlayNowFromSupportList(video)}
              onAddToPlaylist={(videos) => handleQueueFromSupportList(videos)}
              onRemoveFromPlaylist={handleRemoveFromPlaylist}
              onToggleSupport={handleToggleSupportFromPlaylist}
              onShowToast={handleShowDashboardToast}
              authUser={authUser}
              supabase={supabase}
              onUpdateMetadata={handleOpenMetadataUpdate}
              onOpenSupportDropdown={(video, position) =>
                setSupportLevelDropdown({ video, position, direction: 'down' })
              }
              onExport={handleOpenExportModal}
              onSavePlaylist={handleCreateYTPlaylist}
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
              onOpenSupportDropdown={(video, position) =>
                setSupportLevelDropdown({ video, position, direction: 'down' })
              }
              onRemoveFromPlaylist={handleRemoveFromPlaylist}
              onAddDirectItems={handleQueueFromSupportList}
              retiredVideoIds={retiredVideoIds}
              pendingMetadataCount={tracksNeedingMetadata.length}
              onOpenMetadataDialog={() => setShowMetadataDialog(true)}
              onDismissMetadataBanner={() => setTracksNeedingMetadata([])}
              onUpdateMetadata={handleOpenMetadataUpdate}
              authUser={authUser}
              onExport={handleOpenExportModal}
              onSavePlaylist={handleCreateYTPlaylist}
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
          onToggleSupport={handleToggleSupportFromPlaylist}
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
          pendingMetadataCount={tracksNeedingMetadata.length}
          onOpenMetadataDialog={() => setShowMetadataDialog(true)}
          onDismissMetadataBanner={() => setTracksNeedingMetadata([])}
          onUpdateMetadata={handleOpenMetadataUpdate}
          onOpenSupportDropdown={(video, position) =>
            setSupportLevelDropdown({ video, position, direction: 'down' })
          }
          authUser={authUser}
          onExport={handleOpenExportModal}
          onSavePlaylist={handleCreateYTPlaylist}
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
          onToggleSupport={handleToggleSupportFromPlaylist}
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
          pendingMetadataCount={tracksNeedingMetadata.length}
          onOpenMetadataDialog={() => setShowMetadataDialog(true)}
          onDismissMetadataBanner={() => setTracksNeedingMetadata([])}
          onUpdateMetadata={handleOpenMetadataUpdate}
          authUser={authUser}
          onExport={handleOpenExportModal}
          onSavePlaylist={handleCreateYTPlaylist}
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
        onDeleteAccount={() => setIsDeleteAccountConfirmOpen(true)}
      />

      <DeleteAccountConfirmDialog
        isOpen={isDeleteAccountConfirmOpen}
        isSubmitting={isDeletingAccount}
        onClose={() => setIsDeleteAccountConfirmOpen(false)}
        onConfirm={handleDeleteAccountConfirm}
      />

      <ListeningHistoryDialog
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onPlayTrack={handlePlayCatalogTrack}
        getTrackHistory={getTrackHistory}
        onClearHistory={clearTrackHistory}
      />

      <GuestImportDialog
        isOpen={Boolean(guestImportState && guestImportSelections)}
        selections={guestImportSelections}
        counts={guestImportCounts}
        onToggle={handleToggleGuestImportSelection}
        onImport={handleImportGuestCollections}
        onSkip={handleSkipGuestImport}
      />

      {showMetadataDialog && (
        <MetadataEntryDialog
          isOpen={showMetadataDialog}
          onClose={handleDismissMetadataDialog}
          tracks={manualMetadataTracks || tracksNeedingMetadata}
          onSave={handleSaveTrackMetadata}
        />
      )}

      {supportLevelDropdown && (
        <SupportLevelDropdown
          video={supportLevelDropdown.video}
          videos={supportLevelDropdown.videos}
          position={supportLevelDropdown.position}
          direction={supportLevelDropdown.direction}
          currentLevel={supportLevelDropdown.video?.supportLevel || 1}
          onClose={() => setSupportLevelDropdown(null)}
          onSelect={(level) => {
            handleToggleSupportFromPlaylist(
              supportLevelDropdown.videos || supportLevelDropdown.video,
              level,
            );
            setSupportLevelDropdown(null);
          }}
        />
      )}

      <ExportVgmcModal
        isOpen={isExportModalOpen}
        tracks={exportTracks}
        onClose={handleRequestCloseExportModal}
      />
    </div>
  );
}
