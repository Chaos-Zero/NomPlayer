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
import { createPortal } from 'react-dom';
import TopBar from './components/TopBar.jsx';

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  const target = document.getElementById('modal-root');
  if (!target) return null;
  return createPortal(children, target);
}

// Persistent VGMC/NomPlayer page switch — shown on every page (not just the VGMC
// view itself) so it's always available, not just a one-way trip in from Settings.
// One button that always names *where clicking it takes you*, not where you are.
function VgmcNavToggle({ isOnVgmcPage, onNavigate }) {
  const label = isOnVgmcPage ? 'NomPlayer' : 'VGMC 20';
  const target = isOnVgmcPage ? 'home' : 'vgmcStandings';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Soft light-blue glow, base site only (i.e. while the button reads "VGMC
          20" and is inviting you in) — draws the eye without being the same purple
          used for hover/press feedback. Gone once you're already on the VGMC page. */}
      {!isOnVgmcPage && (
        <div className="vgmc-toggle-attention-glow" aria-hidden="true" />
      )}
      <button
        type="button"
        className="vgmc-toggle-btn"
        onClick={() => onNavigate(target)}
        style={{ position: 'relative', zIndex: 1 }}
      >
        {label}
      </button>
    </div>
  );
}

// Mobile-only slide-in drawer for the VGMC standings table. On mobile the VGMC page
// otherwise behaves exactly like the classic player page (see the isMobileLayout
// check around isVgmcStandingsPage below) — the desktop side-by-side column doesn't
// fit a phone screen, so standings live behind this drawer instead.
function VgmcStandingsDrawer({
  isOpen,
  onClose,
  rows,
  isLoading,
  onRefresh,
  onPlayNow,
}) {
  return (
    <>
      {isOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={onClose}
          style={{
            zIndex: 1700,
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            padding: 0,
          }}
        />
      )}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100%',
          width: 'min(85vw, 360px)',
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          zIndex: 1701,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isOpen ? '4px 0 24px rgba(0, 0, 0, 0.35)' : 'none',
        }}
        aria-hidden={!isOpen}
      >
        {/* Fades out quickly (0.12s) on its own, well before the panel's slower
            0.25s slide-out finishes — content disappears before the drawer
            withdraws, instead of visibly dragging text off-screen with it. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            opacity: isOpen ? 1 : 0,
            transition: 'opacity 0.12s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <strong style={{ color: 'var(--text)' }}>VGMC 20 Standings</strong>
            <button
              className="btn-close"
              type="button"
              onClick={onClose}
              aria-label="Close standings"
              title="Close standings"
            >
              ✕
            </button>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
            <VgmcStandingsView
              rows={rows}
              isLoading={isLoading}
              onRefresh={onRefresh}
              onPlayNow={onPlayNow}
            />
          </div>
        </div>
      </div>
    </>
  );
}
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
import FooterFeedbackPanel from './components/FooterFeedbackPanel.jsx';
import VgmcStandingsView from './components/VgmcStandingsView.jsx';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
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
  fetchUserHydratedState,
  upsertUserProfile,
  recordTrackHistory,
  getTrackHistory,
  clearTrackHistory,
  LEGACY_SUPPORT_STORAGE_KEY,
  getDisplayProfileName,
} from './lib/playerState.js';
import {
  fetchTrackCatalogByVideoIds,
  fetchTrackCatalogByTrackIds,
  ingestYouTubeTrackSources,
  patchCatalogCache,
  getFullCatalog,
  getCachedCatalog,
  mapTrackCatalogEntryToVideo,
  mergeTracks,
  findTrackInCatalog,
} from './lib/trackCatalog.js';
import { fetchUserFeedback } from './lib/feedback.js';
import { fetchDashboardNominationUpdates } from './lib/dashboard.js';
import {
  fetchVgmcPlaylistTracks,
  toPlaylistVideos,
} from './lib/vgmcStandings.js';
import { reportError } from './lib/errorReporter.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabase.js';
import {
  formatTime,
  getYouTubeThumbnailUrl,
  parseYouTubeInput,
  singleVideoEntry,
} from './utils/youtube.js';
import {
  PreviousIcon,
  NextIcon,
  PlayIcon,
  PauseIcon,
  FastForwardIcon,
  PlaylistPlusIcon,
  ShuffleIcon,
  StopwatchIcon,
  HeartIcon as SupportIcon,
  HeartEmptyIcon,
  StarIcon,
  LockIcon,
  SpeechBubbleIcon,
} from './components/Icons.jsx';

const LOGOUT_TRANSITION_MS = 260;
const DISCORD_OAUTH_SEEN_STORAGE_KEY = 'discord_oauth_seen';
const DISCORD_OAUTH_SILENT_PENDING_KEY = 'discord_oauth_silent_pending';
const AUTH_SYNC_IDLE_MS = 1800;
const AUTH_SYNC_STORAGE_KEY_PREFIX = 'yt_auth_sync';
const THEME_STORAGE_KEY = 'nom-theme';
const SIDEBAR_VIEW_STORAGE_KEY = 'nom-active-sidebar-view';
// Pages that show the classic player page's full VideoPlayer + persistent sidebar
// chrome (see isPlayerLikePage). Used both for render-time layout decisions and
// inside handleNavigate's page-transition animation logic.
const PLAYER_LIKE_PAGES = new Set(['player', 'vgmcStandings']);
const VGMC_PLAYLIST_ID = import.meta.env.VITE_VGMC_PLAYLIST_ID || '';

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

/** Reorders `tracks` to match the active shuffle order, for display. A no-op
 * (returns tracks in their existing order) whenever shuffleOrderIds doesn't
 * apply to this exact set of tracks — e.g. it was computed for a different
 * view — since resolvePlayOrderIds already falls back to original order then. */
function applyShuffleOrder(tracks, shuffleOrderIds) {
  const orderIds = resolvePlayOrderIds(tracks, shuffleOrderIds);
  if (orderIds === shuffleOrderIds) {
    const byId = new Map(tracks.map((video) => [video.videoId, video]));
    return orderIds.map((id) => byId.get(id)).filter(Boolean);
  }
  return tracks;
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

/** Same shuffle as shuffleVideoIds, but groups never-listened-to videos first
 * (each group independently randomized) — used for the VGMC standings
 * playlist so shuffling surfaces songs you haven't heard yet before ones
 * you've already started or finished. */
function shuffleVideoIdsNotStartedFirst(
  videoIds,
  listenedStatusById,
  pinnedVideoId = null,
) {
  const remainingIds = pinnedVideoId
    ? videoIds.filter((id) => id !== pinnedVideoId)
    : [...videoIds];

  const notStartedIds = remainingIds.filter((id) => !listenedStatusById[id]);
  const startedIds = remainingIds.filter((id) => listenedStatusById[id]);

  const orderedRemaining = [
    ...shuffleVideoIds(notStartedIds),
    ...shuffleVideoIds(startedIds),
  ];

  return pinnedVideoId
    ? [pinnedVideoId, ...orderedRemaining]
    : orderedRemaining;
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
    customPlaylists: state?.customPlaylists,
    transientVideo: state?.transientVideo,
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
  // Whatever's actually playing right now — the personal playlist, or (while
  // transientVideo is set) a community/nominations/support/custom-playlist view.
  // Synced below, after playingTracks is defined. Used by shuffle so it can
  // operate on whichever of those is currently relevant, not just the personal
  // queue.
  const playingTracksRef = useRef([]);
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
  const [transientVideo, setTransientVideo] = useState(
    initialPlayerState.transientVideo,
  );
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
  const [activePlaylistView, setActivePlaylistView] = useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
      return stored ? JSON.parse(stored) : { type: 'personal' };
    } catch {
      return { type: 'personal' };
    }
  });
  const [playingPlaylistView, setPlayingPlaylistView] = useState({
    type: 'personal',
  });
  const [communityNominations, setCommunityNominations] = useState([]);
  const [nominationRefreshToken, setNominationRefreshToken] = useState(0);
  const hasReachedPlaylistEndRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_VIEW_STORAGE_KEY,
      JSON.stringify(activePlaylistView),
    );
  }, [activePlaylistView]);

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
  const [showNominationsList, setShowNominationsList] = useState(false);
  const [renderNominationsList, setRenderNominationsList] = useState(false);
  const [customPlaylists, setCustomPlaylists] = useState(
    initialPlayerState.customPlaylists || [],
  );
  const supportListRef = useRef(supportList);
  const nominationListRef = useRef(nominationList);

  // VGMC standings view — see src/lib/vgmcStandings.js. `hasLoadedVgmcPlaylistRef`/
  // `hasAutoNavigatedToVgmcRef` survive the view unmounting (switching back to the
  // Classic tab), which is why "load once per session" lives here as refs rather
  // than as local state inside VgmcStandingsView.
  const [vgmcStandingsRows, setVgmcStandingsRows] = useState([]);
  const [isVgmcStandingsLoading, setIsVgmcStandingsLoading] = useState(false);
  const [isVgmcStandingsDrawerOpen, setIsVgmcStandingsDrawerOpen] =
    useState(false);
  // Distinct from isVgmcStandingsLoading, which also covers Refresh — this one only
  // ever flips true once, after the very first load finishes, and drives the
  // full-view loading overlay (Refresh keeps its lighter button-only feedback).
  const [hasVgmcLoadedOnce, setHasVgmcLoadedOnce] = useState(false);
  const hasLoadedVgmcPlaylistRef = useRef(false);
  const hasAutoNavigatedToVgmcRef = useRef(false);
  // handleLoadVgmcPlaylist/handleRefreshVgmcPlaylist are defined further down, right
  // after handlePlayCommunityPlaylist — they build on it, so they live near it.

  useEffect(() => {
    supportListRef.current = supportList;
  }, [supportList]);

  useEffect(() => {
    nominationListRef.current = nominationList;
  }, [nominationList]);
  const [supportToastMessage, setSupportToastMessage] = useState('');
  const [appToastMessage, setAppToastMessage] = useState('');
  const [appToastTone, setAppToastTone] = useState('default');
  const [tracksNeedingMetadata, setTracksNeedingMetadata] = useState([]);
  const [manualMetadataTracks, setManualMetadataTracks] = useState(null);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [lastMetadataUpdateBatch, setLastMetadataUpdateBatch] = useState(null);
  const [isDetachedFooterEntering, setIsDetachedFooterEntering] =
    useState(false);
  const [isDetachedFooterPending, setIsDetachedFooterPending] = useState(false);
  const [isPlayerRevealPending, setIsPlayerRevealPending] = useState(false);
  const [isPlayerRevealing, setIsPlayerRevealing] = useState(false);
  const [isDetachedFooterSettling, setIsDetachedFooterSettling] =
    useState(false);
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
  const detachedFooterSettlingDelayTimeoutRef = useRef(0);
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
  const lastSyncedNominationListRef = useRef(null);
  const lastSyncedSupportListRef = useRef(null);
  const lastSyncedPlaylistRef = useRef(null);
  const lastSyncedCustomPlaylistsRef = useRef(null);
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
  const [userFeedback, setUserFeedback] = useState({});
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0);
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured);
  const [isUserHydrated, setIsUserHydrated] = useState(!isSupabaseConfigured);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState(null);
  const [footerCurrentTime, setFooterCurrentTime] = useState(0);
  const [footerDuration, setFooterDuration] = useState(0);
  const videoPlayerRef = useRef(null);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFeedbackPanelOpen, setIsFeedbackPanelOpen] = useState(false);
  const [isFeedbackForcedEdit, setIsFeedbackForcedEdit] = useState(false);
  const [feedbackTrack, setFeedbackTrack] = useState(null);
  const [feedbackPosition, setFeedbackPosition] = useState(null);
  const [globalActivityByVideoId, setGlobalActivityByVideoId] = useState(
    new Map(),
  );
  const [catalogActivityByVideoId, setCatalogActivityByVideoId] = useState(
    new Map(),
  );
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
  const [discordAuthUrl, setDiscordAuthUrl] = useState('');
  const [isAddNominationHighlighted, setIsAddNominationHighlighted] =
    useState(false);
  const authUserIdRef = useRef(null);

  const handleNominationsLoaded = useCallback((updates) => {
    setCommunityNominations(updates);
  }, []);

  useEffect(() => {
    if (!isAuthReady || !supabase) return;
    let cancelled = false;
    fetchDashboardNominationUpdates(supabase, null)
      .then((data) => {
        if (!cancelled) setCommunityNominations(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthReady, supabase, nominationRefreshToken]);

  const handleFeedbackSaved = useCallback((videoId, { rating, note }) => {
    if (!videoId) return;
    const trackId = catalogTrackByVideoIdRef.current[videoId]?.trackId;
    if (trackId) {
      setUserFeedback((prev) => {
        const next = { ...prev };
        if (rating || note?.trim()) {
          next[trackId] = {
            rating: rating || null,
            note: note || null,
            videoId,
          };
        } else {
          delete next[trackId];
        }
        return next;
      });
    }
  }, []);

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
    activePageRef.current = activePage;
  }, [activePage]);

  useEffect(() => {
    catalogTrackByVideoIdRef.current = catalogTrackByVideoId;
  }, [catalogTrackByVideoId]);

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
        transientVideo,
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
      transientVideo,
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

      ingestYouTubeTrackSources(supabase, videos)
        .then((ingestResult) => {
          if (!Array.isArray(ingestResult) || ingestResult.length === 0) return;
          const updatesMap = {};
          for (const row of ingestResult) {
            if (row.youtube_video_id && row.track_id) {
              updatesMap[row.youtube_video_id] = { trackId: row.track_id };
            }
          }
          if (Object.keys(updatesMap).length > 0) {
            forceImmediateSyncRef.current = true;
            applyUpdatesToList(updatesMap);
          }
        })
        .catch((error) => {
          reportError('Sync nomination tracks to catalog', error);
          setAuthError('Database error. Your nominations are saved locally.');
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase],
  );

  useEffect(() => {
    if (!supabase || !authUser?.id || nominationList.length === 0) return;
    const missing = nominationList.filter((v) => !v.trackId);
    if (missing.length === 0) return;
    syncCatalogForNominationVideos(missing);
  }, [nominationList, authUser?.id, syncCatalogForNominationVideos, supabase]);

  useEffect(() => {
    if (!supabase || !authUser?.id || supportList.length === 0) return;
    const missing = supportList.filter((v) => !v.trackId);
    if (missing.length === 0) return;

    ingestYouTubeTrackSources(supabase, missing)
      .then((ingestResult) => {
        if (!Array.isArray(ingestResult) || ingestResult.length === 0) return;
        const updatesMap = {};
        for (const row of ingestResult) {
          if (row.youtube_video_id && row.track_id) {
            updatesMap[row.youtube_video_id] = { trackId: row.track_id };
          }
        }
        if (Object.keys(updatesMap).length > 0) {
          forceImmediateSyncRef.current = true;
          applyUpdatesToList(updatesMap);
        }
      })
      .catch((error) => {
        reportError('Sync support tracks to catalog', error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, authUser?.id, supportList]);

  useEffect(() => {
    authUserIdRef.current = authUser?.id ?? null;
  }, [authUser]);

  const refreshUserFeedback = useCallback(async () => {
    if (!supabase || !authUserIdRef.current) {
      setUserFeedback({});
      return;
    }
    try {
      const feedback = await fetchUserFeedback(supabase, authUserIdRef.current);
      setUserFeedback(feedback || {});
      setFeedbackRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to fetch user feedback:', error);
    }
  }, [supabase]);

  useEffect(() => {
    if (authUser?.id) {
      refreshUserFeedback();
    } else {
      setUserFeedback({});
    }
  }, [authUser?.id, refreshUserFeedback]);

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
              {
                nominationList: lastSyncedNominationListRef.current,
                supportList: lastSyncedSupportListRef.current,
                playlist: lastSyncedPlaylistRef.current,
                customPlaylists: lastSyncedCustomPlaylistsRef.current,
              },
            );

            if (authUserIdRef.current === userId) {
              lastSyncedPlayerStateRef.current = JSON.stringify(savedSnapshot);
              lastSyncedNominationListRef.current =
                savedSnapshot.nominationList ?? null;
              lastSyncedSupportListRef.current =
                savedSnapshot.supportList ?? null;
              lastSyncedPlaylistRef.current = savedSnapshot.playlist ?? null;
              lastSyncedCustomPlaylistsRef.current =
                savedSnapshot.customPlaylists ?? null;
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
    if (!supabase || !authUser?.id || !isUserHydrated) {
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
    isUserHydrated,
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

  // Warm the catalog cache as early as possible so it's ready before login.
  // getFullCatalog is idempotent — subsequent calls return the cached result instantly.
  useEffect(() => {
    if (supabase) getFullCatalog(supabase).catch(() => {});
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    getFullCatalog(supabase)
      .then((catalog) => {
        const map = new Map();
        for (const entry of catalog) {
          if (entry.commentCount > 0) {
            map.set(entry.videoId, 'commented');
          } else if (entry.avgRating != null) {
            map.set(entry.videoId, 'rated');
          }
        }
        setCatalogActivityByVideoId(map);
      })
      .catch(() => {});
  }, [supabase]);

  useEffect(() => {
    const merged = new Map(catalogActivityByVideoId);
    for (const fb of Object.values(userFeedback)) {
      if (!fb.videoId) continue;
      const personal = fb.note?.trim()
        ? 'commented'
        : fb.rating
          ? 'rated'
          : null;
      if (!personal) continue;
      if (personal === 'commented' || merged.get(fb.videoId) !== 'commented') {
        merged.set(fb.videoId, personal);
      }
    }
    setGlobalActivityByVideoId(merged);
  }, [catalogActivityByVideoId, userFeedback]);

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
        supportCount1: summary.supportCount1 ?? 0,
        supportCount2: summary.supportCount2 ?? 0,
        supportCount3: summary.supportCount3 ?? 0,
        isRetired: Boolean(summary.isRetired),
        retiredByTournamentName: summary.retiredByTournamentName ?? '',
        tournaments: summary.tournaments ?? [],
      };
    }

    if (Object.keys(updates).length === 0) {
      return {};
    }

    const nextValue = {
      ...catalogTrackByVideoIdRef.current,
      ...updates,
    };

    const keys = Object.keys(nextValue);
    if (keys.length > 2000) {
      // Retain the newest 1600 to prevent constant eviction thrashing
      const keysToRemove = keys.slice(0, keys.length - 1600);
      for (const key of keysToRemove) {
        delete nextValue[key];
      }
    }

    catalogTrackByVideoIdRef.current = nextValue;

    startTransition(() => {
      setCatalogTrackByVideoId(nextValue);
    });

    return updates;
  }, []);

  const ensureCatalogEntriesForVideoIds = useCallback(
    async (videoIdsOrVideos) => {
      const videos = Array.isArray(videoIdsOrVideos) ? videoIdsOrVideos : [];
      const normalizedVideoIds = Array.from(
        new Set(
          videos
            .map((v) => (typeof v === 'string' ? v : v?.videoId))
            .filter(
              (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id),
            ),
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
        // Optimization: For missing IDs, if we have the full video objects, ingest them first.
        // This ensures trackId existence for new nominations immediately.
        const videosToIngest = videos.filter(
          (v) =>
            typeof v === 'object' &&
            v?.videoId &&
            missingVideoIds.includes(v.videoId),
        );

        if (videosToIngest.length > 0) {
          await ingestYouTubeTrackSources(supabase, videosToIngest);
        }

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
              supportCount1: entry.supportCount1 || 0,
              supportCount2: entry.supportCount2 || 0,
              supportCount3: entry.supportCount3 || 0,
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
            supportCount1: 0,
            supportCount2: 0,
            supportCount3: 0,
            isRetired: false,
            retiredByTournamentName: '',
          }));

        const freshCatalog = {
          ...knownEntries,
          ...Object.fromEntries(fetchedById),
          ...Object.fromEntries(fallbackEntries.map((e) => [e.videoId, e])),
        };

        mergeCatalogTrackSummaries([
          ...fetchedById.values(),
          ...fallbackEntries,
        ]);

        return freshCatalog;
      } finally {
        missingVideoIds.forEach((videoId) => {
          catalogLookupPendingVideoIdsRef.current.delete(videoId);
        });
      }
    },
    [mergeCatalogTrackSummaries, supabase],
  );

  // Pre-populate catalog with supported tracks on mount so the leaderboard
  // renders immediately with correct support counts from the live DB view.
  // Supabase Realtime: refresh support counts when track_supports rows change.
  // Debounces rapid changes into a single batch re-fetch of the track_catalog view.
  useEffect(() => {
    if (!supabase) return;

    const pendingTrackIds = new Set();
    let debounceTimer = null;

    const flush = () => {
      debounceTimer = null;
      if (pendingTrackIds.size === 0) return;
      const ids = Array.from(pendingTrackIds);
      pendingTrackIds.clear();

      fetchTrackCatalogByTrackIds(supabase, ids)
        .then((refreshed) => {
          mergeCatalogTrackSummaries(refreshed);
        })
        .catch((err) => {
          console.warn('Realtime catalog refresh error:', err);
        });
    };

    const schedule = (trackId) => {
      if (trackId) pendingTrackIds.add(trackId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, 2000);
    };

    const channel = supabase
      .channel('track_supports_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'track_supports' },
        (payload) => {
          const trackId =
            payload.new?.track_id ?? payload.old?.track_id ?? null;
          schedule(trackId);
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase, mergeCatalogTrackSummaries]);

  // Supabase Realtime: refresh community nominations when any track_nominations
  // row changes. Debounces to avoid hammering get_community_nominations_catalog
  // when a user saves multiple nominations in quick succession.
  useEffect(() => {
    if (!supabase) return;

    let debounceTimer = null;

    const schedule = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setNominationRefreshToken((t) => t + 1);
      }, 3000);
    };

    const channel = supabase
      .channel('track_nominations_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'track_nominations' },
        schedule,
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

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

  // Personal-queue-specific — feeds displayPlaylist's own reordering only.
  // isShuffleEnabled (general, reflects whatever's actually playing right now)
  // is defined below, once playingTracks exists.
  const isPersonalShuffleActive = useMemo(
    () => shuffleOrderIds.length > 0 && playOrderIds === shuffleOrderIds,
    [playOrderIds, shuffleOrderIds],
  );

  const supportStatusById = useMemo(() => {
    const status = {};
    supportList.forEach((video) => {
      status[video.videoId] = {
        isSupported: true,
        isNominated: false,
        supportLevel: video.supportLevel || 1,
      };
    });
    nominationList.forEach((video) => {
      status[video.videoId] = {
        isSupported: false,
        isNominated: true,
        supportLevel: video.supportLevel || 1,
      };
    });
    return status;
  }, [supportList, nominationList]);

  const displayPlaylist = useMemo(() => {
    const loadIndexById = new Map(
      playlist.map((video, index) => [video.videoId, index]),
    );
    const orderIds =
      isPersonalShuffleActive && !showOriginalOrder
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
    isPersonalShuffleActive,
    playlist,
    playOrderIds,
    showOriginalOrder,
  ]);

  const enrichedNominationList = useMemo(() => {
    return nominationList.map((nom, index) => {
      const catalogEntry = catalogTrackByVideoId[nom.videoId];
      const personalRating =
        (catalogEntry?.id && userFeedback[catalogEntry.id]?.rating) ||
        (nom.trackId && userFeedback[nom.trackId]?.rating);
      return {
        ...nom,
        loadIndex: index,
        rating: personalRating || nom.rating || null,
        supportCount1: catalogEntry?.supportCount1 || 0,
        supportCount2: catalogEntry?.supportCount2 || 0,
        supportCount3: catalogEntry?.supportCount3 || 0,
        title:
          catalogEntry?.displayTitle ||
          catalogEntry?.sourceTitle ||
          nom.title ||
          nom.videoId,
        thumbnail:
          catalogEntry?.sourceThumbnailUrl ||
          nom.thumbnail ||
          getYouTubeThumbnailUrl(nom.videoId),
        channelTitle:
          catalogEntry?.sourceChannelTitle || nom.channelTitle || '',
        trackId: catalogEntry?.trackId ?? null,
        gameTitle: catalogEntry?.gameTitle || nom.gameTitle || '',
        trackTitle: catalogEntry?.trackTitle || nom.trackTitle || '',
        displayTitle: catalogEntry?.displayTitle || nom.displayTitle || '',
        isRetired: Boolean(catalogEntry?.isRetired),
        retiredByTournamentName:
          catalogEntry?.retiredByTournamentName ||
          nom.retiredByTournamentName ||
          '',
      };
    });
  }, [nominationList, catalogTrackByVideoId, userFeedback]);

  const enrichedSupportList = useMemo(() => {
    return supportList.map((sup, index) => {
      const catalogEntry = catalogTrackByVideoId[sup.videoId];
      const personalRating =
        (catalogEntry?.id && userFeedback[catalogEntry.id]?.rating) ||
        (sup.trackId && userFeedback[sup.trackId]?.rating);
      return {
        ...sup,
        loadIndex: index,
        rating: personalRating || sup.rating || null,
        supportCount1: catalogEntry?.supportCount1 || 0,
        supportCount2: catalogEntry?.supportCount2 || 0,
        supportCount3: catalogEntry?.supportCount3 || 0,
        title:
          catalogEntry?.displayTitle ||
          catalogEntry?.sourceTitle ||
          sup.title ||
          sup.videoId,
        thumbnail:
          catalogEntry?.sourceThumbnailUrl ||
          sup.thumbnail ||
          getYouTubeThumbnailUrl(sup.videoId),
        channelTitle:
          catalogEntry?.sourceChannelTitle || sup.channelTitle || '',
        trackId: catalogEntry?.trackId ?? null,
        gameTitle: catalogEntry?.gameTitle || sup.gameTitle || '',
        trackTitle: catalogEntry?.trackTitle || sup.trackTitle || '',
        displayTitle: catalogEntry?.displayTitle || sup.displayTitle || '',
        isRetired: Boolean(catalogEntry?.isRetired),
        retiredByTournamentName:
          catalogEntry?.retiredByTournamentName ||
          sup.retiredByTournamentName ||
          '',
      };
    });
  }, [supportList, catalogTrackByVideoId, userFeedback]);

  const sidebarTracks = useMemo(() => {
    let tracks;

    if (activePlaylistView.type === 'community') {
      const communityUser = communityNominations.find(
        (u) => u.userId === activePlaylistView.userId,
      );
      if (communityUser) {
        tracks = communityUser.nominations.map((nom, index) => {
          const catalogEntry = catalogTrackByVideoId[nom.videoId];
          const personalRating =
            (catalogEntry?.id && userFeedback[catalogEntry.id]?.rating) ||
            (nom.trackId && userFeedback[nom.trackId]?.rating);
          return {
            ...nom,
            loadIndex: index,
            rating: personalRating || nom.rating || null,
            title:
              catalogEntry?.displayTitle ||
              catalogEntry?.sourceTitle ||
              nom.title ||
              nom.videoId,
            thumbnail:
              catalogEntry?.sourceThumbnailUrl ||
              nom.thumbnail ||
              getYouTubeThumbnailUrl(nom.videoId),
            channelTitle:
              catalogEntry?.sourceChannelTitle || nom.channelTitle || '',
            trackId: catalogEntry?.trackId ?? null,
            gameTitle: catalogEntry?.gameTitle ?? nom.gameTitle ?? '',
            trackTitle: catalogEntry?.trackTitle ?? nom.trackTitle ?? '',
            displayTitle: catalogEntry?.displayTitle ?? nom.displayTitle ?? '',
            supportCount1: catalogEntry?.supportCount1 || 0,
            supportCount2: catalogEntry?.supportCount2 || 0,
            supportCount3: catalogEntry?.supportCount3 || 0,
            isRetired: Boolean(catalogEntry?.isRetired),
            retiredByTournamentName:
              catalogEntry?.retiredByTournamentName ||
              nom.retiredByTournamentName ||
              '',
          };
        });
      }
    } else if (activePlaylistView.type === 'nominations') {
      tracks = enrichedNominationList;
    } else if (activePlaylistView.type === 'support') {
      tracks = enrichedSupportList;
    } else if (activePlaylistView.type === 'custom-playlist') {
      tracks =
        customPlaylists.find((p) => p.id === activePlaylistView.id)?.videos ||
        [];
    } else if (activePlaylistView.type === 'community-playlist') {
      tracks = activePlaylistView.videos || [];
    }

    // 'personal' (and the community-with-no-match edge case above) falls back
    // to displayPlaylist, which already reflects shuffle order on its own —
    // applying it again here would be redundant, not wrong, but skip it.
    // Every other view type doesn't get shuffle-reordered anywhere else, so it
    // has to happen here for the sidebar to actually show shuffled order
    // (playback advancement resolves its own order separately, at the point
    // handlePrev/handleNext/handleVideoEnd need it).
    if (tracks === undefined) return displayPlaylist;
    return applyShuffleOrder(tracks, shuffleOrderIds);
  }, [
    activePlaylistView,
    communityNominations,
    catalogTrackByVideoId,
    userFeedback,
    enrichedNominationList,
    enrichedSupportList,
    displayPlaylist,
    customPlaylists,
    shuffleOrderIds,
  ]);

  const playingTracks = useMemo(() => {
    if (playingPlaylistView.type === 'community') {
      const communityUser = communityNominations.find(
        (u) => u.userId === playingPlaylistView.userId,
      );
      if (communityUser) {
        return communityUser.nominations.map((nom, index) => {
          const catalogEntry = catalogTrackByVideoId[nom.videoId];
          const personalRating =
            (catalogEntry?.trackId &&
              userFeedback[catalogEntry.trackId]?.rating) ||
            (nom.trackId && userFeedback[nom.trackId]?.rating);
          return {
            ...nom,
            loadIndex: index,
            rating: personalRating || nom.rating || null,
            title:
              catalogEntry?.displayTitle ||
              catalogEntry?.sourceTitle ||
              nom.title ||
              nom.videoId,
            thumbnail:
              catalogEntry?.sourceThumbnailUrl ||
              nom.thumbnail ||
              getYouTubeThumbnailUrl(nom.videoId),
            channelTitle:
              catalogEntry?.sourceChannelTitle || nom.channelTitle || '',
            trackId: catalogEntry?.trackId ?? null,
            gameTitle: catalogEntry?.gameTitle ?? nom.gameTitle ?? '',
            trackTitle: catalogEntry?.trackTitle ?? nom.trackTitle ?? '',
            displayTitle: catalogEntry?.displayTitle ?? nom.displayTitle ?? '',
            supportCount1: catalogEntry?.supportCount1 || 0,
            supportCount2: catalogEntry?.supportCount2 || 0,
            supportCount3: catalogEntry?.supportCount3 || 0,
            isRetired: Boolean(catalogEntry?.isRetired),
            retiredByTournamentName:
              catalogEntry?.retiredByTournamentName ||
              nom.retiredByTournamentName ||
              '',
          };
        });
      }
    } else if (playingPlaylistView.type === 'nominations') {
      return enrichedNominationList;
    } else if (playingPlaylistView.type === 'support') {
      return enrichedSupportList;
    } else if (playingPlaylistView.type === 'custom-playlist') {
      return (
        customPlaylists.find((p) => p.id === playingPlaylistView.id)?.videos ||
        []
      );
    } else if (playingPlaylistView.type === 'community-playlist') {
      return playingPlaylistView.videos || [];
    }
    return displayPlaylist;
  }, [
    playingPlaylistView,
    communityNominations,
    catalogTrackByVideoId,
    userFeedback,
    enrichedNominationList,
    enrichedSupportList,
    displayPlaylist,
    customPlaylists,
  ]);

  useEffect(() => {
    playingTracksRef.current = playingTracks;
  }, [playingTracks]);

  // General shuffle state — reflects whatever's actually playing right now
  // (a transient community/nominations/support/custom-playlist view, or the
  // personal queue when there's no transient video). This drives the shuffle
  // button's own active/available state and playback advancement; it's
  // deliberately separate from isPersonalShuffleActive above, which only ever
  // describes the personal queue and only feeds displayPlaylist's ordering.
  const currentContextTracks = transientVideo ? playingTracks : playlist;
  const currentPlayOrderIds = useMemo(
    () => resolvePlayOrderIds(currentContextTracks, shuffleOrderIds),
    [currentContextTracks, shuffleOrderIds],
  );
  const isShuffleEnabled = useMemo(
    () => shuffleOrderIds.length > 0 && currentPlayOrderIds === shuffleOrderIds,
    [currentPlayOrderIds, shuffleOrderIds],
  );
  const isShuffleAvailable = playingTracks.length >= 2;

  const currentDisplayIndex = useMemo(() => {
    const activeVideoId = transientVideo?.videoId || currentVideoId;
    if (!activeVideoId) return null;
    const index = sidebarTracks.findIndex(
      (video) => video.videoId === activeVideoId,
    );
    return index < 0 ? null : index;
  }, [sidebarTracks, transientVideo, currentVideoId]);
  const isPlayerPage = activePage === 'player';
  const isDatabasePage = activePage === 'database';
  const isListExplorerPage = activePage === 'listExplorer';
  // The VGMC standings page reuses the classic player page's full VideoPlayer +
  // persistent sidebar chrome (see PLAYER_LIKE_PAGES in handleNavigate for the
  // matching navigation-animation treatment) — it just adds a standings table above
  // it, rendered separately below. Everywhere the player page's layout/chrome used to
  // key off `isPlayerPage` alone now keys off `isPlayerLikePage` instead.
  const isVgmcStandingsPage = activePage === 'vgmcStandings';
  const isPlayerLikePage = isPlayerPage || isVgmcStandingsPage;
  // Desktop shows standings as a side-by-side column; mobile behaves exactly like
  // the classic player page (isPlayerLikePage) and gets a slide-in drawer instead
  // (see VgmcStandingsDrawer) — there's no room for a permanent side column there.
  const isVgmcSplitLayout = isVgmcStandingsPage && !isMobileLayout;

  useEffect(() => {
    if (!isVgmcStandingsPage) {
      setIsVgmcStandingsDrawerOpen(false);
    }
  }, [isVgmcStandingsPage]);
  const dbCacheRef = useRef({ tracks: [], selectedVideoId: null });
  const shouldRenderDesktopPlaylistOverlay =
    !isMobileLayout && !isPlayerLikePage;
  const effectivePlaylistCollapsed = isPlayerLikePage
    ? isPlaylistCollapsed
    : !isDesktopOverlayPlaylistOpen;

  const currentPlaylistVideo =
    playlist.find((video) => video.videoId === currentVideoId) || null;
  const currentVideo = transientVideo || currentPlaylistVideo;

  useEffect(() => {
    setFooterCurrentTime(0);
    setFooterDuration(0);
  }, [currentVideo?.videoId]);
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
  const currentSupportGlyph = isCurrentVideoNominated ? (
    <StarIcon />
  ) : isCurrentVideoSupported ? (
    currentSupportLevel === 3 ? (
      <LockIcon />
    ) : (
      <SupportIcon />
    )
  ) : (
    <HeartEmptyIcon />
  );
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

      // Kick off catalog in background — may already be loading from the warm
      // effect. We do NOT await it here; phase 1 completes without it.
      const catalogPromise = getFullCatalog(supabase);
      let rawHydratedDbState = null;

      try {
        // ── Phase 1: fast DB queries only ────────────────────────────────────
        // Resolves in ~1s. UI becomes interactive as soon as this completes.
        const [profile, remoteState, hydratedDbState] = await Promise.all([
          ensureUserProfile(
            user,
            preferredUsername,
            preferredGamefaqsUsername,
            preferredAvatarUrl,
          ),
          fetchUserPlayerState(supabase, user.id),
          fetchUserHydratedState(supabase, user.id),
        ]);
        setUserProfile(profile);
        rawHydratedDbState = hydratedDbState;

        // Use whatever catalog is already in memory (may be fully loaded if the
        // warm effect finished first, or empty if still loading).
        const buildEnrichedState = (catalog) => {
          const catalogByTrackId = new Map(
            (catalog || []).map((entry) => [entry.trackId, entry]),
          );
          const enrichItem = (item) => {
            if (!item?.trackId) return item;
            const entry = catalogByTrackId.get(item.trackId);
            if (!entry) return item;
            const video = mapTrackCatalogEntryToVideo(entry);
            return video ? { ...video, ...item } : item;
          };
          return {
            nominationList: (hydratedDbState.nominationList || []).map(
              enrichItem,
            ),
            supportList: (hydratedDbState.supportList || []).map(enrichItem),
            playlist: (hydratedDbState.playlist || []).map(enrichItem),
            customPlaylists: (hydratedDbState.customPlaylists || []).map(
              (pl) => ({
                ...pl,
                videos: (pl.videos || []).map(enrichItem),
              }),
            ),
          };
        };

        const enrichedDbState = buildEnrichedState(getCachedCatalog());

        const normalizedState = normalizePersistedPlayerState(remoteState);
        const persistedQueue = loadPersistedAuthSyncQueue(user.id);

        // Build the nomination list: start with DB-resolved entries, then append
        // any unresolved (no trackId) entries from the JSONB state that aren't
        // already represented. The JSONB state is the only place URL-only
        // nominations (pending metadata) are stored.
        const latestJsonbNominationList =
          persistedQueue.playerState?.nominationList ??
          normalizedState.nominationList ??
          [];
        const dbNominationList = enrichedDbState.nominationList;
        const dbVideoIdSet = new Set(dbNominationList.map((v) => v.videoId));
        const unresolvedNominationEntries = latestJsonbNominationList.filter(
          (v) => !v.trackId && !dbVideoIdSet.has(v.videoId),
        );
        const mergedNominationList = [
          ...dbNominationList,
          ...unresolvedNominationEntries,
        ];

        // Merge custom playlists: DB is the source of truth for resolved tracks,
        // but JSONB preserves videos that never got a trackId (e.g. queue-only tracks).
        // For each DB playlist, append any JSONB videos with the same id that are
        // absent from the DB version.  New playlists that exist only in JSONB (not
        // yet flushed to DB) are appended wholesale.
        const latestJsonbCustomPlaylists =
          persistedQueue.playerState?.customPlaylists ??
          normalizedState.customPlaylists ??
          [];
        const dbCustomPlaylistIds = new Set(
          enrichedDbState.customPlaylists.map((p) => p.id),
        );
        const mergedCustomPlaylists = enrichedDbState.customPlaylists.map(
          (dbPl) => {
            const jsonbPl = latestJsonbCustomPlaylists.find(
              (p) => p.id === dbPl.id,
            );
            if (!jsonbPl) return dbPl;
            const dbVideoIds = new Set(dbPl.videos.map((v) => v.videoId));
            const unresolvedVideos = jsonbPl.videos.filter(
              (v) => !v.trackId && !dbVideoIds.has(v.videoId),
            );
            return unresolvedVideos.length
              ? { ...dbPl, videos: [...dbPl.videos, ...unresolvedVideos] }
              : dbPl;
          },
        );
        // Append any playlists that exist in JSONB but not yet in the DB
        for (const jsonbPl of latestJsonbCustomPlaylists) {
          if (!dbCustomPlaylistIds.has(jsonbPl.id)) {
            mergedCustomPlaylists.push(jsonbPl);
          }
        }

        const baseHydratedState = normalizePersistedPlayerState({
          ...normalizedState,
          ...(persistedQueue.playerState || {}),
          playlist: enrichedDbState.playlist,
          customPlaylists: mergedCustomPlaylists,
          supportList: enrichedDbState.supportList,
          nominationList: mergedNominationList,
          listenedStatusById: normalizedState.listenedStatusById,
        });

        const hydratedState = normalizePersistedPlayerState({
          ...baseHydratedState,
          listenedStatusById: mergeListenedStatuses(
            baseHydratedState.listenedStatusById,
            buildQueuedListenStatuses(persistedQueue.listenEvents),
          ),
        });

        applyPersistedPlayerState(hydratedState);

        // Don't flag these true sources of truth as "dirty" unpersisted state
        const stateToPersist =
          createAccountPersistedPlayerState(normalizedState);
        stateToPersist.playlist = hydratedState.playlist;
        stateToPersist.customPlaylists = hydratedState.customPlaylists;
        stateToPersist.supportList = hydratedState.supportList;
        stateToPersist.nominationList = hydratedState.nominationList;

        lastSyncedPlayerStateRef.current = JSON.stringify(stateToPersist);
        lastSyncedNominationListRef.current =
          hydratedState.nominationList ?? null;
        lastSyncedSupportListRef.current = hydratedState.supportList ?? null;
        lastSyncedPlaylistRef.current = hydratedState.playlist ?? null;
        // If JSONB had playlists/tracks not yet in the DB, point the ref at the
        // DB-only snapshot so the next sync sees a diff and re-saves them.
        const hasUnsyncedCustomData =
          mergedCustomPlaylists.length !==
            enrichedDbState.customPlaylists.length ||
          mergedCustomPlaylists.some((pl) => {
            const dbPl = enrichedDbState.customPlaylists.find(
              (p) => p.id === pl.id,
            );
            return !dbPl || pl.videos.length !== dbPl.videos.length;
          });
        lastSyncedCustomPlaylistsRef.current = hasUnsyncedCustomData
          ? enrichedDbState.customPlaylists
          : (hydratedState.customPlaylists ?? null);
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
        setIsUserHydrated(true);
      } catch (error) {
        reportError('Load account data on login', error);
        setAuthError('Database error. Failed to load your account data.');
      }

      // ── Phase 2: catalog enrichment (background) ─────────────────────────
      // Only needed if catalog wasn't loaded during phase 1. UI is already
      // visible at this point — this just fills in titles/thumbnails.
      const catalogWasReady = Boolean(getCachedCatalog());
      try {
        const catalog = await catalogPromise;
        const supportedTracks = catalog.filter(
          (e) =>
            e.supportCount1 > 0 || e.supportCount2 > 0 || e.supportCount3 > 0,
        );
        if (supportedTracks.length) mergeCatalogTrackSummaries(supportedTracks);

        // Only re-enrich if catalog wasn't available during phase 1
        if (!catalogWasReady && rawHydratedDbState) {
          const catalogByTrackId = new Map(catalog.map((e) => [e.trackId, e]));
          const enrichItem = (item) => {
            if (!item?.trackId) return item;
            const entry = catalogByTrackId.get(item.trackId);
            if (!entry) return item;
            const video = mapTrackCatalogEntryToVideo(entry);
            return video ? { ...video, ...item } : item;
          };
          const enrichedNoms = (rawHydratedDbState.nominationList || []).map(
            enrichItem,
          );
          const enrichedSupports = (rawHydratedDbState.supportList || []).map(
            enrichItem,
          );
          const enrichedPlaylist = (rawHydratedDbState.playlist || []).map(
            enrichItem,
          );
          const byVideoId = (arr) => new Map(arr.map((e) => [e.videoId, e]));
          const nomMap = byVideoId(enrichedNoms);
          const supMap = byVideoId(enrichedSupports);
          const plMap = byVideoId(enrichedPlaylist);
          setNominationList((prev) =>
            prev.map((item) => nomMap.get(item.videoId) || item),
          );
          setSupportList((prev) =>
            prev.map((item) => supMap.get(item.videoId) || item),
          );
          setPlaylist((prev) =>
            prev.map((item) => plMap.get(item.videoId) || item),
          );
          setCustomPlaylists((prev) =>
            prev.map((pl) => {
              const enrichedVideos = (pl.videos || []).map((v) => {
                const enriched = rawHydratedDbState.customPlaylists
                  ?.find((p) => p.id === pl.id)
                  ?.videos?.find((e) => e.videoId === v.videoId);
                return enriched ? enrichItem(enriched) : v;
              });
              return { ...pl, videos: enrichedVideos };
            }),
          );
        }
      } catch {
        // Catalog enrichment failure is non-fatal
      }
    },
    [
      applyPersistedPlayerState,
      ensureUserProfile,
      mergeCatalogTrackSummaries,
      supabase,
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (!isActive) return;
        setAuthSession(session);
        if (session?.user) {
          setIsUserHydrated(false);
          setIsAuthReady(true);
          hydrateAuthenticatedUserRef.current?.(session.user);
        } else {
          setUserProfile(null);
          setIsAuthReady(true);
        }
        return;
      }

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
        lastSyncedNominationListRef.current = null;
        lastSyncedSupportListRef.current = null;
        lastSyncedPlaylistRef.current = null;
        lastSyncedCustomPlaylistsRef.current = null;
        setUserProfile(null);
        setIsSettingsOpen(false);
        setGuestImportState(null);
        setGuestImportSelections(null);
        setIsUserHydrated(false);
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

      setIsUserHydrated(false);
      setIsAuthReady(true);
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
    if (!supabase || !authUser || !isUserHydrated) {
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
    isUserHydrated,
    scheduleQueuedAuthSyncFlush,
    supabase,
  ]);

  const handleOpenAuthDialog = useCallback(
    (mode = 'signin') => {
      setAuthError('');
      setAuthMessage('');
      setAuthDialogMode(mode);

      // Pre-calculate Discord URL to enable a real <a> link for Universal Link support.
      // Doing this as soon as the dialog opens increases the chance of a successful app hand-off.
      if (supabase) {
        setDiscordAuthUrl('');
        void supabase.auth
          .signInWithOAuth({
            provider: 'discord',
            options: {
              redirectTo: getAppRedirectPath(),
              skipBrowserRedirect: true,
            },
          })
          .then(({ data }) => {
            if (data?.url) {
              setDiscordAuthUrl(data.url);
            }
          })
          .catch((err) => {
            console.error('Failed to pre-calculate Discord URL:', err);
          });
      }
    },
    [supabase],
  );

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
    (message, type = 'success') => {
      showDefaultAppToast(message, type);
    },
    [showDefaultAppToast],
  );

  const applyUpdatesToList = useCallback((updatesMap) => {
    const transform = (item) => {
      const update =
        updatesMap[item.videoId] || (item.trackId && updatesMap[item.trackId]);
      if (!update) return item;
      const newVideoId = update.videoId || item.videoId;
      return {
        ...item,
        videoId: newVideoId,
        trackId: update.trackId || item.trackId,
        gameTitle:
          update.gameTitle !== undefined ? update.gameTitle : item.gameTitle,
        trackTitle:
          update.trackTitle !== undefined ? update.trackTitle : item.trackTitle,
        displayTitle:
          update.gameTitle && update.trackTitle
            ? `${update.gameTitle} - ${update.trackTitle}`
            : item.displayTitle,
        thumbnail: update.thumbnail || item.thumbnail,
        channelTitle: update.channelTitle || item.channelTitle,
        sourceUrl:
          update.submittedUrl ||
          item.sourceUrl ||
          `https://www.youtube.com/watch?v=${newVideoId}`,
        submittedUrl:
          update.submittedUrl ||
          item.submittedUrl ||
          `https://www.youtube.com/watch?v=${newVideoId}`,
      };
    };

    setSupportList((prev) => prev.map(transform));
    setNominationList((prev) => prev.map(transform));
    setPlaylist((prev) => prev.map(transform));
    setCustomPlaylists((prev) =>
      prev.map((pl) => ({
        ...pl,
        videos: (pl.videos || []).map(transform),
      })),
    );
    patchCatalogCache(Object.values(updatesMap));
  }, []);

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
    (video, freshCatalog = null) => {
      const videoId = video?.videoId || '';
      const catalogEntry =
        (freshCatalog && freshCatalog[videoId]) ||
        catalogTrackByVideoId[videoId];

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
    [catalogTrackByVideoId],
  );

  const partitionRetiredVideos = useCallback(
    async (videos) => {
      const normalizedVideos = Array.isArray(videos)
        ? videos.filter(Boolean)
        : [];
      if (normalizedVideos.length === 0) {
        return { allowedVideos: [], retiredVideos: [] };
      }

      const freshCatalog =
        await ensureCatalogEntriesForVideoIds(normalizedVideos);

      const allowedVideos = [];
      const retiredVideos = [];

      for (const video of normalizedVideos) {
        const enrichedVideo = applyCatalogMetadataToVideo(video, freshCatalog);
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
        reportError('Login', error);
        setAuthError('Database error. Failed to log in.');
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
        reportError('Create account', error);
        setAuthError('Database error. Failed to create your account.');
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
        reportError('Send password reset email', error);
        setAuthError('Database error. Failed to send a password reset email.');
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
      reportError('Discord OAuth (initiate)', error);
      setAuthError('Database error. Failed to continue with Discord.');
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
        reportError('Discord OAuth (callback)', error);
        setAuthError('Database error. Failed to continue with Discord.');
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
        reportError('Update password', error);
        setAuthError('Database error. Failed to update your password.');
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
      reportError('Log out', error);
      setAuthError('Database error. Failed to log out.');
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
      reportError('Delete account', error);
      setAuthError('Database error. Failed to delete your account.');
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
        reportError('Save user settings', error);
        setSettingsError('Database error. Failed to save your settings.');
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
    clearLocalGuestPlayerState();
    pendingGuestImportStateRef.current = null;
    setGuestImportState(null);
    setGuestImportSelections(null);
  }, [
    applyPersistedPlayerState,
    createPlayerStateSnapshot,
    guestImportSelections,
    guestImportState,
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
    (videoId, forcePlay = false) => {
      // Check sidebarTracks instead of playlistRef if we want to allow playing from community view
      if (!playlistRef.current.some((video) => video.videoId === videoId))
        return;

      transientResumeVideoIdRef.current = null;
      setTransientVideo(null);
      hasReachedPlaylistEndRef.current = false;

      const shouldPlay = isPlaying || forcePlay;
      if (shouldPlay) {
        markVideoStarted(videoId);
        setIsPlaying(true);
      }
      setCurrentVideoId(videoId);
    },
    [isPlaying, markVideoStarted],
  );

  const handleSidebarSelect = useCallback(
    (videoId, forcePlay = false) => {
      if (activePlaylistView.type !== 'personal') {
        const track = sidebarTracks.find((t) => t.videoId === videoId);
        if (track) {
          if (!transientVideo) {
            transientResumeVideoIdRef.current = currentVideoIdRef.current;
          }
          setTransientVideo({
            ...track,
            source: activePlaylistView.type + '-view',
            communityUserId: activePlaylistView.userId || null,
          });
          setPlayingPlaylistView(activePlaylistView);
          setCurrentVideoId(null);

          const shouldPlay = isPlaying || forcePlay;
          if (shouldPlay) {
            markVideoStarted(videoId);
            setIsPlaying(true);
          }
        }
      } else {
        setPlayingPlaylistView({ type: 'personal' });
        goToVideo(videoId, forcePlay);
      }
    },
    [
      activePlaylistView,
      sidebarTracks,
      isPlaying,
      markVideoStarted,
      goToVideo,
      transientVideo,
    ],
  );

  const handlePlayCommunityPlaylist = useCallback(
    (videos, meta) => {
      if (!videos.length) return;
      const view = {
        type: 'community-playlist',
        videos,
        name: meta?.name,
        id: meta?.id,
      };
      setActivePlaylistView(view);
      setPlayingPlaylistView(view);
      if (meta?.id)
        setLastCommunityPlaylist({
          id: meta.id,
          name: meta.name,
          videos,
          type: 'community-playlist',
        });
      if (!transientVideo) {
        transientResumeVideoIdRef.current = currentVideoIdRef.current;
      }
      const startVideo = meta?.startVideoId
        ? videos.find((v) => (v.videoId || v.id) === meta.startVideoId) ||
          videos[0]
        : videos[0];
      setTransientVideo({ ...startVideo, source: 'community-playlist-view' });
      setCurrentVideoId(null);
      if (meta?.autoplay) {
        markVideoStarted(startVideo.videoId || startVideo.id);
        setIsPlaying(true);
      }
    },
    [currentVideoIdRef, markVideoStarted, transientVideo],
  );

  // Loads the VGMC nomination playlist the same way viewing any other public
  // playlist works: activePlaylistView/playingPlaylistView + a transient "now
  // playing" video (handlePlayCommunityPlaylist, above). This deliberately does
  // *not* touch `playlist` — that's the user's own saved queue, and viewing/playing
  // the VGMC standings must never overwrite it. Leaving the VGMC view (Classic tab,
  // or playing something else) falls back to whatever the user actually had queued,
  // the same way leaving any community playlist already does.
  const handleLoadVgmcPlaylist = useCallback(async () => {
    // Loads once per session — after that, only the explicit Refresh button re-syncs.
    if (hasLoadedVgmcPlaylistRef.current) return;
    hasLoadedVgmcPlaylistRef.current = true;

    if (!supabase || !VGMC_PLAYLIST_ID) {
      // Nothing to load — don't leave the full-view loading overlay stuck up.
      setHasVgmcLoadedOnce(true);
      return;
    }

    setIsVgmcStandingsLoading(true);
    try {
      const rows = await fetchVgmcPlaylistTracks(supabase, VGMC_PLAYLIST_ID);
      setVgmcStandingsRows(rows);
      const videos = toPlaylistVideos(rows);
      if (videos.length > 0) {
        handlePlayCommunityPlaylist(videos, {
          id: VGMC_PLAYLIST_ID,
          name: 'VGMC 20 Nominations',
        });
      }
    } catch (error) {
      reportError('Load VGMC playlist', error);
    } finally {
      setIsVgmcStandingsLoading(false);
      setHasVgmcLoadedOnce(true);
    }
  }, [supabase, handlePlayCommunityPlaylist]);

  const handleRefreshVgmcPlaylist = useCallback(async () => {
    if (!supabase || !VGMC_PLAYLIST_ID) return;

    setIsVgmcStandingsLoading(true);
    try {
      const rows = await fetchVgmcPlaylistTracks(supabase, VGMC_PLAYLIST_ID);
      setVgmcStandingsRows(rows);
      const freshVideos = toPlaylistVideos(rows);

      // Replace outright — `freshVideos` is already in true nomination order
      // (fetchVgmcPlaylistTracks orders by order_index), and a re-sync can add
      // posts *anywhere* in that order, not just at the end (an earlier page can
      // finish syncing after a later one, a removed nomination can get reposted,
      // etc.). An earlier append-only merge here preserved whatever order things
      // happened to be *discovered* in across repeated refreshes rather than the
      // order they were actually posted in, which is exactly the bug reported:
      // the playlist stopped matching the thread. Playback continuity doesn't
      // need special-casing to do this safely — the currently-playing video is
      // tracked by id (currentVideoIdRef), not array position, and "next" is
      // resolved fresh off this array at the moment of advancing, so replacing
      // it mid-playback doesn't interrupt anything already playing. If the VGMC
      // view isn't the active/playing view right now, leave those alone
      // entirely; the fresh rows are still reflected in the standings table via
      // vgmcStandingsRows.
      const mergeIntoVgmcView = (view) =>
        view?.type === 'community-playlist' && view.id === VGMC_PLAYLIST_ID
          ? { ...view, videos: freshVideos }
          : view;

      setActivePlaylistView(mergeIntoVgmcView);
      setPlayingPlaylistView(mergeIntoVgmcView);
    } catch (error) {
      reportError('Refresh VGMC playlist', error);
    } finally {
      setIsVgmcStandingsLoading(false);
    }
  }, [supabase]);

  const handlePlayCommunityList = useCallback(
    (userId) => {
      const communityUser = communityNominations.find(
        (u) => u.userId === userId,
      );
      if (!communityUser || communityUser.nominations.length === 0) return;

      // Switch to community view and start playback
      setActivePlaylistView({ type: 'community', userId });
      setPlayingPlaylistView({ type: 'community', userId });

      const track = communityUser.nominations[0];
      const trackWithProperId = {
        ...track,
        videoId: track.videoId || track.video_id || track.id,
      };

      if (!transientVideo) {
        transientResumeVideoIdRef.current = currentVideoIdRef.current;
      }

      setTransientVideo({
        ...trackWithProperId,
        source: 'community-view',
        communityUserId: userId,
      });
      setCurrentVideoId(null);
      markVideoStarted(trackWithProperId.videoId);
      setIsPlaying(true);
    },
    [communityNominations, currentVideoIdRef, markVideoStarted, transientVideo],
  );

  const handlePlayCommunityListFromTrack = useCallback(
    (userId, startVideoId, nominations, userMetadata = null) => {
      let communityUser = communityNominations.find((u) => u.userId === userId);

      if (nominations?.length > 0 || userMetadata) {
        // If we have an existing user entry, preserve its metadata (username, avatar, etc.)
        // If userMetadata is provided, merge it in as well.
        communityUser = {
          ...communityUser,
          ...userMetadata,
          userId,
          ...(nominations?.length > 0 ? { nominations } : {}),
        };

        setCommunityNominations((prev) => {
          const exists = prev.some((u) => u.userId === userId);
          if (exists) {
            return prev.map((u) => (u.userId === userId ? communityUser : u));
          }
          return [...prev, communityUser];
        });
      }

      if (!communityUser || communityUser.nominations.length === 0) return;

      setActivePlaylistView({ type: 'community', userId });
      setPlayingPlaylistView({ type: 'community', userId });

      const track =
        communityUser.nominations.find(
          (n) => (n.videoId || n.video_id || n.id) === startVideoId,
        ) || communityUser.nominations[0];

      const trackWithProperId = {
        ...track,
        videoId: track.videoId || track.video_id || track.id,
      };

      if (!transientVideo) {
        transientResumeVideoIdRef.current = currentVideoIdRef.current;
      }

      setTransientVideo({
        ...trackWithProperId,
        source: 'community-view',
        communityUserId: userId,
      });
      setCurrentVideoId(null);
      markVideoStarted(trackWithProperId.videoId);
      setIsPlaying(true);
    },
    [communityNominations, currentVideoIdRef, markVideoStarted, transientVideo],
  );

  const handlePlayExplorerList = useCallback(
    (id, startVideoId = null) => {
      const resolvedStartVideoId = startVideoId;

      if (id.startsWith('peer-')) {
        handlePlayCommunityList(id.replace('peer-', ''));
      } else if (id === 'nominations') {
        if (nominationList.length === 0) return;
        setActivePlaylistView({ type: 'nominations' });
        setPlayingPlaylistView({ type: 'nominations' });
        const startNom =
          (resolvedStartVideoId &&
            nominationList.find((v) => v.videoId === resolvedStartVideoId)) ||
          nominationList[0];
        if (!transientVideo) {
          transientResumeVideoIdRef.current = currentVideoIdRef.current;
        }
        setTransientVideo({ ...startNom, source: 'nominations-view' });
        setCurrentVideoId(null);
        markVideoStarted(startNom.videoId);
        setIsPlaying(true);
      } else if (id === 'support') {
        if (supportList.length === 0) return;
        setActivePlaylistView({ type: 'support' });
        setPlayingPlaylistView({ type: 'support' });
        const startSup =
          (resolvedStartVideoId &&
            supportList.find((v) => v.videoId === resolvedStartVideoId)) ||
          supportList[0];
        if (!transientVideo) {
          transientResumeVideoIdRef.current = currentVideoIdRef.current;
        }
        setTransientVideo({ ...startSup, source: 'support-view' });
        setCurrentVideoId(null);
        markVideoStarted(startSup.videoId);
        setIsPlaying(true);
      } else if (id === 'current' || id === 'personal') {
        if (playlist.length === 0) return;
        setActivePlaylistView({ type: 'personal' });
        setPlayingPlaylistView({ type: 'personal' });
        const targetVideoId =
          resolvedStartVideoId &&
          playlist.some((v) => v.videoId === resolvedStartVideoId)
            ? resolvedStartVideoId
            : playlist[0].videoId;
        goToVideo(targetVideoId, true);
      } else {
        const customPlaylist = customPlaylists.find((p) => p.id === id);
        if (!customPlaylist || customPlaylist.videos.length === 0) return;
        const { videos } = customPlaylist;
        const startVideo =
          (resolvedStartVideoId &&
            videos.find((v) => v.videoId === resolvedStartVideoId)) ||
          videos[0];
        const view = {
          type: 'custom-playlist',
          name: customPlaylist.name,
          id: customPlaylist.id,
        };
        setActivePlaylistView(view);
        setPlayingPlaylistView(view);
        setLastCommunityPlaylist({
          id: customPlaylist.id,
          name: customPlaylist.name,
          type: 'custom-playlist',
        });
        if (!transientVideo) {
          transientResumeVideoIdRef.current = currentVideoIdRef.current;
        }
        setTransientVideo({ ...startVideo, source: 'custom-playlist-view' });
        setCurrentVideoId(null);
        markVideoStarted(startVideo.videoId);
        setIsPlaying(true);
      }
    },
    [
      handlePlayCommunityList,
      nominationList,
      supportList,
      playlist,
      customPlaylists,
      goToVideo,
      currentVideoIdRef,
      markVideoStarted,
      transientVideo,
    ],
  );

  const handlePlayFromNominationList = useCallback(
    (video) => {
      if (!video || nominationList.length === 0) return;
      setActivePlaylistView({ type: 'nominations' });
      setPlayingPlaylistView({ type: 'nominations' });
      if (!transientVideo) {
        transientResumeVideoIdRef.current = currentVideoIdRef.current;
      }
      setTransientVideo({ ...video, source: 'nominations-view' });
      setCurrentVideoId(null);
      markVideoStarted(video.videoId);
      setIsPlaying(true);
    },
    [nominationList, transientVideo, currentVideoIdRef, markVideoStarted],
  );

  const handlePlayFromSupportList = useCallback(
    (video) => {
      if (!video || supportList.length === 0) return;
      setActivePlaylistView({ type: 'support' });
      setPlayingPlaylistView({ type: 'support' });
      if (!transientVideo) {
        transientResumeVideoIdRef.current = currentVideoIdRef.current;
      }
      setTransientVideo({ ...video, source: 'support-view' });
      setCurrentVideoId(null);
      markVideoStarted(video.videoId);
      setIsPlaying(true);
    },
    [supportList, transientVideo, currentVideoIdRef, markVideoStarted],
  );

  const handlePrev = useCallback(() => {
    if (
      transientVideo?.source?.endsWith('-view') ||
      transientVideo?.source === 'community-playlist'
    ) {
      const resolvedTransientIds = resolvePlayOrderIds(
        playingTracks,
        shuffleOrderIdsRef.current,
      );
      const currentIndex = resolvedTransientIds.indexOf(transientVideo.videoId);
      if (currentIndex > 0) {
        const prevTrack = playingTracks.find(
          (v) => v.videoId === resolvedTransientIds[currentIndex - 1],
        );
        if (prevTrack) {
          setTransientVideo({
            ...prevTrack,
            source: transientVideo.source,
            communityUserId: transientVideo.communityUserId,
          });
          if (isPlaying) {
            markVideoStarted(prevTrack.videoId);
          }
          return;
        }
      }
    }

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
  }, [playingTracks, transientVideo, isPlaying, markVideoStarted]);

  const handleNext = useCallback(() => {
    if (
      transientVideo?.source?.endsWith('-view') ||
      transientVideo?.source === 'community-playlist'
    ) {
      const resolvedTransientIds = resolvePlayOrderIds(
        playingTracks,
        shuffleOrderIdsRef.current,
      );
      const currentIndex = resolvedTransientIds.indexOf(transientVideo.videoId);
      if (currentIndex >= 0 && currentIndex < resolvedTransientIds.length - 1) {
        const nextTrack = playingTracks.find(
          (v) => v.videoId === resolvedTransientIds[currentIndex + 1],
        );
        if (nextTrack) {
          setTransientVideo({
            ...nextTrack,
            source: transientVideo.source,
            communityUserId: transientVideo.communityUserId,
          });
          if (isPlaying) {
            markVideoStarted(nextTrack.videoId);
          }
          return;
        }
      }
    }

    const resolvedPlayOrderIds = resolvePlayOrderIds(
      playlistRef.current,
      shuffleOrderIdsRef.current,
    );
    if (resolvedPlayOrderIds.length === 0) return;

    const resumeVideoId = transientResumeVideoIdRef.current;
    transientResumeVideoIdRef.current = null;
    setTransientVideo(null);
    hasReachedPlaylistEndRef.current = false;

    const activeVideoId =
      (transientVideo ? resumeVideoId : currentVideoIdRef.current) ??
      resolvedPlayOrderIds[0];
    const currentPlayIndex = Math.max(
      0,
      resolvedPlayOrderIds.indexOf(activeVideoId),
    );

    // If we're resuming, use the resume point directly. Otherwise advance.
    const nextVideoId = transientVideo
      ? activeVideoId
      : resolvedPlayOrderIds[
          Math.min(currentPlayIndex + 1, resolvedPlayOrderIds.length - 1)
        ];

    if (isPlaying) {
      markVideoStarted(nextVideoId);
    }
    setCurrentVideoId(nextVideoId);
  }, [playingTracks, transientVideo, isPlaying, markVideoStarted]);

  const handleVideoEnd = useCallback(() => {
    if (!isPlaying) return;

    if (transientVideo) {
      if (!isPreviewModeEnabled) {
        markVideoCompleted(transientVideo.videoId);
      }

      // Check if we can advance within the community view
      if (
        transientVideo.source?.endsWith('-view') ||
        transientVideo.source === 'community-playlist'
      ) {
        const resolvedTransientIds = resolvePlayOrderIds(
          playingTracks,
          shuffleOrderIdsRef.current,
        );
        const currentIndex = resolvedTransientIds.indexOf(
          transientVideo.videoId,
        );
        if (
          currentIndex >= 0 &&
          currentIndex < resolvedTransientIds.length - 1
        ) {
          const nextTrack = playingTracks.find(
            (v) => v.videoId === resolvedTransientIds[currentIndex + 1],
          );
          if (nextTrack) {
            setTransientVideo({
              ...nextTrack,
              source: transientVideo.source,
              communityUserId: transientVideo.communityUserId,
            });
            markVideoStarted(nextTrack.videoId);
            setIsPlaying(true);
            return;
          }
        }
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
    playingTracks,
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

    // Shuffle whatever's actually playing right now — a transient
    // community/nominations/support/custom-playlist view (VGMC included), or
    // the personal queue when there isn't one. Mirrors the same transientVideo
    // branch handlePrev/handleNext/handleVideoEnd already use.
    const sourceTracks = transientVideo
      ? playingTracksRef.current
      : playlistRef.current;
    const originalIds = sourceTracks.map((video) => video.videoId);
    if (originalIds.length < 2) return;

    const activeVideoId = transientVideo
      ? transientVideo.videoId
      : currentVideoIdRef.current;
    const pinnedVideoId =
      activeVideoId && originalIds.includes(activeVideoId)
        ? activeVideoId
        : originalIds[0];

    // VGMC specifically prioritizes songs you haven't listened to yet, so
    // shuffling surfaces new nominations instead of ones you've already heard.
    const isVgmcShuffle =
      Boolean(VGMC_PLAYLIST_ID) &&
      playingPlaylistView.type === 'community-playlist' &&
      playingPlaylistView.id === VGMC_PLAYLIST_ID;

    const nextShuffleOrderIds = isVgmcShuffle
      ? shuffleVideoIdsNotStartedFirst(
          originalIds,
          listenedStatusById,
          pinnedVideoId,
        )
      : shuffleVideoIds(originalIds, pinnedVideoId);
    shuffleOrderIdsRef.current = nextShuffleOrderIds;
    setShuffleOrderIds(nextShuffleOrderIds);
    setShowOriginalOrder(false);
  }, [transientVideo, playingPlaylistView, listenedStatusById]);

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

  const handleOpenNominationsWithHighlight = useCallback(() => {
    handleOpenNominationsList();
    setIsAddNominationHighlighted(true);
    // Auto-clear highlight after 5 seconds
    setTimeout(() => setIsAddNominationHighlighted(false), 5000);
  }, [handleOpenNominationsList]);

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

      // Optimistically update community counts in the catalog map
      setCatalogTrackByVideoId((prev) => {
        const next = { ...prev };
        allowedVideos.forEach((v) => {
          const entry = next[v.videoId];
          if (!entry) return;

          // Find current user's previous level for this track
          const prevItem = supportList.find(
            (item) => item.videoId === v.videoId,
          );
          const oldLevel = prevItem?.supportLevel || 0;
          const newLevel = level === 0 ? 0 : level !== null ? level : 1;

          if (oldLevel === newLevel) return;

          const updatedEntry = { ...entry };

          // Decrement old level count
          if (oldLevel === 1 && updatedEntry.supportCount1 > 0)
            updatedEntry.supportCount1--;
          else if (oldLevel === 2 && updatedEntry.supportCount2 > 0)
            updatedEntry.supportCount2--;
          else if (oldLevel === 3 && updatedEntry.supportCount3 > 0)
            updatedEntry.supportCount3--;

          // Increment new level count
          if (newLevel === 1)
            updatedEntry.supportCount1 = (updatedEntry.supportCount1 || 0) + 1;
          else if (newLevel === 2)
            updatedEntry.supportCount2 = (updatedEntry.supportCount2 || 0) + 1;
          else if (newLevel === 3)
            updatedEntry.supportCount3 = (updatedEntry.supportCount3 || 0) + 1;

          next[v.videoId] = updatedEntry;
        });
        return next;
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
              ? 'Added to Likely Support'
              : level === 3
                ? 'Added to Definite Support'
                : 'Added to Possible Support',
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

  const handleShowComments = useCallback(
    (video, position = null, forceEdit = false) => {
      setFeedbackTrack(video);
      setFeedbackPosition(position);
      setIsFeedbackForcedEdit(forceEdit);
      setIsFeedbackPanelOpen(true);
    },
    [],
  );

  const handleCloseFeedbackPanel = useCallback(() => {
    setIsFeedbackPanelOpen(false);
    setIsFeedbackForcedEdit(false);
    setFeedbackTrack(null);
    setFeedbackPosition(null);
  }, []);

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

      const currentCatalog = catalogTrackByVideoIdRef.current;

      const currentSupportList = supportListRef.current;
      const currentNominationList = nominationListRef.current;

      const result = appendUniqueVideos(
        currentSupportList,
        allowedVideos,
        new Set(currentNominationList.map((entry) => entry.videoId)),
      );

      const resultSummary = {
        addedCount: result.addedCount,
        blockedNominationCount: result.blockedCount,
        blockedRetiredCount: retiredVideos.length,
      };

      if (result.addedCount > 0) {
        setSupportList(result.nextList);

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

        showSupportToast(
          resultSummary.addedCount === 1
            ? 'Added 1 song to Support list'
            : `Added ${resultSummary.addedCount} songs to Support list`,
        );
      }

      return resultSummary;
    },
    [partitionRetiredVideos, showSupportToast],
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

      const currentCatalog = catalogTrackByVideoIdRef.current;

      const currentNominationList = nominationListRef.current;

      const nominationResult = appendUniqueVideos(
        currentNominationList,
        allowedVideos,
      );

      const resultSummary = {
        addedCount: nominationResult.addedCount,
        blockedNominationCount: nominationResult.blockedVideoIds.length,
        blockedRetiredCount: retiredVideos.length,
      };

      if (nominationResult.addedCount > 0) {
        setNominationList(nominationResult.nextList);

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

        // After updating nominations, we need to ensure they are removed from the support list
        setSupportList((previousList) => {
          return previousList.filter((entry) => {
            return !allowedVideos.some((v) => v.videoId === entry.videoId);
          });
        });
      }

      return resultSummary;
    },
    [partitionRetiredVideos],
  );

  const handleToggleNominationFromPlaylist = useCallback(
    async (videoOrVideos) => {
      if (!videoOrVideos) return;
      const videos = Array.isArray(videoOrVideos)
        ? videoOrVideos
        : [videoOrVideos];
      if (videos.length === 0) return;

      const result = await handleAddManyToNominationList(videos);

      if (result.addedCount > 0) {
        showSupportToast(
          result.addedCount === 1
            ? 'Nominated!'
            : `Added ${result.addedCount} nominations!`,
        );
      } else if (result.blockedRetiredCount > 0 && result.addedCount === 0) {
        showRetiredSongToast();
      }
    },
    [handleAddManyToNominationList, showSupportToast, showRetiredSongToast],
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

      const trackIdByVideoId = {};

      if (supabase && authUser) {
        try {
          // 3. Ingest YouTube metadata ONLY for completely new tracks to avoid duplication
          const newTrackUpdates = updatesWithYouTubeMeta.filter(
            (u) => !u.trackId,
          );
          if (newTrackUpdates.length > 0) {
            const ingestResult = await ingestYouTubeTrackSources(
              supabase,
              newTrackUpdates,
            );
            if (Array.isArray(ingestResult)) {
              ingestResult.forEach((row) => {
                if (row.youtube_video_id) {
                  trackIdByVideoId[row.youtube_video_id] = row.track_id;
                }
              });
            }
          }

          // 4. Call internal RPC for VGMC metadata (now handle YouTube title/thumb too)
          const savePromises = updatesWithYouTubeMeta.map(async (update) => {
            if (update.hasChangedId && update.trackId) {
              const existingTrackWithUrl = await findTrackInCatalog(
                supabase,
                update.videoId,
              );
              if (
                existingTrackWithUrl &&
                existingTrackWithUrl.trackId !== update.trackId
              ) {
                console.log(
                  'handleSaveTrackMetadata: Conflict detected, merging tracks to prevent data loss',
                  {
                    target: update.trackId,
                    source: existingTrackWithUrl.trackId,
                  },
                );
                await mergeTracks(
                  supabase,
                  {
                    trackId: update.trackId,
                    gameTitle: update.gameTitle,
                    trackTitle: update.trackTitle,
                    sourceUrl: update.currentUrl,
                  },
                  [existingTrackWithUrl],
                  update,
                );
                return update.trackId;
              }
            }

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
                track_id_input: update.trackId,
                cached_title_input: update.title || null,
                cached_channel_title_input: update.channelTitle || null,
                cached_thumbnail_url_input: update.thumbnail || null,
              },
            );

            if (error) {
              console.error('RPC Error details:', error);
              reportError('Save track metadata', error);
              handleShowDashboardToast('Database error. Failed to save track.');
            }

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

      // 5. Update local state lists with comprehensive metadata (single-pass)
      const updatesMap = {};
      for (const update of updatesWithYouTubeMeta) {
        const trackId = trackIdByVideoId[update.videoId] || update.trackId;
        const matchKey = update.oldVideoId || update.videoId;
        updatesMap[matchKey] = { ...update, trackId: trackId || null };
      }

      applyUpdatesToList(updatesMap);

      setManualMetadataTracks(null);
      setTracksNeedingMetadata([]);

      // Emit update batch so HomePage can patch its discovery items
      setLastMetadataUpdateBatch(
        updatesWithYouTubeMeta.map((u) => ({
          trackId: u.trackId,
          oldVideoId: u.oldVideoId,
          videoId: u.videoId,
          gameTitle: u.gameTitle,
          trackTitle: u.trackTitle,
          thumbnail: u.thumbnail,
          channelTitle: u.channelTitle,
          displayTitle: `${u.gameTitle} - ${u.trackTitle}`,
        })),
      );

      forceImmediateSyncRef.current = true;
    },
    [authUser, handleShowDashboardToast, supabase, applyUpdatesToList],
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

  const handleReorderPlaylist = useCallback(
    (newOrder) => {
      if (!Array.isArray(newOrder)) return;

      if (activePlaylistView.type === 'personal') {
        if (newOrder.length !== playlistRef.current.length) return;
        playlistRef.current = newOrder;
        setPlaylist(newOrder);
        hasReachedPlaylistEndRef.current = false;
      } else if (activePlaylistView.type === 'nominations') {
        if (newOrder.length !== nominationList.length) return;
        setNominationList(newOrder);
      } else if (activePlaylistView.type === 'support') {
        if (newOrder.length !== supportList.length) return;
        setSupportList(newOrder);
      }
    },
    [activePlaylistView.type, nominationList.length, supportList.length],
  );

  const handleQueueFromSupportList = useCallback(
    (videos) => {
      return appendVideosToPlaylist(
        videos.map((video) => applyCatalogMetadataToVideo(video)),
        { flashResolved: true },
      );
    },
    [appendVideosToPlaylist, applyCatalogMetadataToVideo],
  );

  const handleAddDirectToCustomPlaylist = useCallback(
    (items) => {
      // Compute newVideos synchronously from current state so we can return
      // addedCount before React's async commit runs the setCustomPlaylists updater.
      const currentPl = customPlaylists.find(
        (pl) => pl.id === activePlaylistView.id,
      );
      const existingIds = new Set(
        (currentPl?.videos || []).map((v) => v.videoId),
      );
      const newVideos = items.filter((item) => !existingIds.has(item.videoId));
      if (newVideos.length > 0) {
        setCustomPlaylists((prev) =>
          prev.map((pl) =>
            pl.id === activePlaylistView.id
              ? { ...pl, videos: [...pl.videos, ...newVideos] }
              : pl,
          ),
        );
      }
      return {
        addedCount: newVideos.length,
        blockedNominationCount: 0,
        blockedRetiredCount: 0,
      };
    },
    [activePlaylistView.id, customPlaylists, setCustomPlaylists],
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

    if (detachedFooterSettlingDelayTimeoutRef.current) {
      window.clearTimeout(detachedFooterSettlingDelayTimeoutRef.current);
      detachedFooterSettlingDelayTimeoutRef.current = 0;
    }

    setIsDetachedFooterSettling(false);
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
    !isPlayerLikePage && Boolean(currentVideo) && isPlaying;
  const previousDetachedFooterIntentRef = useRef(shouldShowDetachedFooter);

  useEffect(() => {
    const previousDetachedFooterIntent =
      previousDetachedFooterIntentRef.current;
    previousDetachedFooterIntentRef.current = shouldShowDetachedFooter;

    if (
      !previousDetachedFooterIntent &&
      shouldShowDetachedFooter &&
      !isDetachedFooterPending &&
      !isDetachedFooterEntering &&
      !isDetachedFooterSettling
    ) {
      const wasStartedOutside = !isPlayingRef.current;
      if (wasStartedOutside) {
        if (detachedFooterSettlingDelayTimeoutRef.current) {
          window.clearTimeout(detachedFooterSettlingDelayTimeoutRef.current);
        }
        setIsDetachedFooterSettling(true);
        detachedFooterSettlingDelayTimeoutRef.current = window.setTimeout(
          () => {
            detachedFooterSettlingDelayTimeoutRef.current = 0;
            setIsDetachedFooterSettling(false);
            startDetachedFooterEntrance();
          },
          250,
        );
      } else {
        startDetachedFooterEntrance();
      }
      return;
    }

    if (
      previousDetachedFooterIntent &&
      !shouldShowDetachedFooter &&
      (isDetachedFooterPending ||
        isDetachedFooterEntering ||
        isDetachedFooterSettling)
    ) {
      if (detachedFooterSettlingDelayTimeoutRef.current) {
        window.clearTimeout(detachedFooterSettlingDelayTimeoutRef.current);
        detachedFooterSettlingDelayTimeoutRef.current = 0;
      }
      setIsDetachedFooterSettling(false);
      clearDetachedFooterEntrance();
    }
  }, [
    clearDetachedFooterEntrance,
    isDetachedFooterEntering,
    isDetachedFooterPending,
    isDetachedFooterSettling,
    shouldShowDetachedFooter,
    startDetachedFooterEntrance,
  ]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const handleNavigate = useCallback(
    (nextPage) => {
      // The VGMC standings page gets the same player-reveal/detached-footer
      // animation treatment as the classic player page (see isPlayerLikePage above)
      // since it reuses the same full VideoPlayer + persistent sidebar chrome.
      const isNextPagePlayerLike = PLAYER_LIKE_PAGES.has(nextPage);
      const isCurrentPagePlayerLike = PLAYER_LIKE_PAGES.has(
        activePageRef.current,
      );
      const shouldAnimateDetachedFooter =
        !isNextPagePlayerLike &&
        isCurrentPagePlayerLike &&
        Boolean(currentVideoIdRef.current) &&
        isPlayingRef.current;
      const shouldAnimatePlayerReveal =
        isNextPagePlayerLike &&
        !isMobileLayout &&
        Boolean(currentVideoIdRef.current);

      if (isNextPagePlayerLike && !isMobileLayout && !isPlaylistCollapsed) {
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
        setIsDetachedFooterSettling(false);
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
      setIsFeedbackPanelOpen(false);
      setIsMobileNavOpen(false);
      if (!isMobileLayout && !isNextPagePlayerLike) {
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

  // VGMC 20 is the default landing page for everyone for now (not gated on any
  // per-user setting) — fires once per session, and never fights a deep link or
  // the user's own later navigation back to Classic, since it only ever fires
  // while still on the default 'home' page.
  //
  // The site loads into the normal home page first, behind a full-screen loading
  // overlay (see hasVgmcLoadedOnce below) — navigation to the VGMC page itself only
  // happens *after* the playlist has fully loaded, not before. Mounting the VGMC
  // page's tree while data was still arriving was the source of it rendering blank —
  // deferring the page switch until everything's ready sidesteps that entirely.
  useEffect(() => {
    if (hasAutoNavigatedToVgmcRef.current) return;
    if (!VGMC_PLAYLIST_ID) return;
    if (activePageRef.current !== 'home') return;

    hasAutoNavigatedToVgmcRef.current = true;
    handleLoadVgmcPlaylist().then(() => {
      handleNavigate('vgmcStandings');
    });
  }, [handleNavigate, handleLoadVgmcPlaylist]);

  const handleTogglePlaylist = useCallback(() => {
    // If we're on the dashboard/other home views, we toggle the Desktop Overlay state
    if (!isPlayerLikePage) {
      setIsDesktopOverlayPlaylistOpen((prev) => !prev);
      // Ensure it's never starting in a collapsed state when opened from here
      setIsPlaylistCollapsed(false);
    } else {
      // If we're on the player (or VGMC) page, we just toggle the regular collapse state
      setIsPlaylistCollapsed((prev) => !prev);
    }
    // ensure we are looking at personal view
    setActivePlaylistView({ type: 'personal' });
  }, [isPlayerLikePage]);

  // True when playing from a named list; false for one-off "play now" transients.
  const isPlayingFromList =
    !transientVideo ||
    transientVideo.source?.endsWith('-view') === true ||
    transientVideo.source === 'community-playlist';

  const playingListLabel = useMemo(() => {
    if (!isPlayingFromList) return null;
    if (playingPlaylistView.type === 'nominations') return 'My Nominations';
    if (playingPlaylistView.type === 'support') return 'My Support List';
    if (playingPlaylistView.type === 'community') {
      const communityUser = communityNominations.find(
        (u) => u.userId === playingPlaylistView.userId,
      );
      const displayName = communityUser?.username
        ? getDisplayProfileName(communityUser.username)
        : null;
      return displayName
        ? `${displayName}'s Nominations`
        : 'Community Nominations';
    }
    if (playingPlaylistView.type === 'community-playlist') {
      const playlistName = playingPlaylistView.name || 'Playlist';
      const isOwnPlaylist = customPlaylists.some(
        (p) => p.id === playingPlaylistView.id,
      );
      if (isOwnPlaylist && userProfile?.username) {
        const displayName = getDisplayProfileName(userProfile.username);
        return `${displayName}'s ${playlistName}`;
      }
      return playlistName;
    }
    if (playingPlaylistView.type === 'custom-playlist') {
      const customPlaylist = customPlaylists.find(
        (p) => p.id === playingPlaylistView.id,
      );
      return customPlaylist?.name || 'My Playlist';
    }
    return 'My Queue';
  }, [
    isPlayingFromList,
    playingPlaylistView,
    communityNominations,
    customPlaylists,
    userProfile,
  ]);

  // activePlaylistView is already set to the correct type when a list plays,
  // so we only need to open/uncollapse the sidebar here.
  const handleOpenPlayingList = useCallback(() => {
    if (!isPlayerLikePage) {
      setIsDesktopOverlayPlaylistOpen(true);
      setIsPlaylistCollapsed(false);
    } else {
      setIsPlaylistCollapsed(false);
    }
  }, [isPlayerLikePage]);

  const handleNavigateToPlayer = useCallback(() => {
    handleNavigate('player');
  }, [handleNavigate]);

  const [explorerInitialView, setExplorerInitialView] = useState('lists');
  const [lastCommunityPlaylist, setLastCommunityPlaylist] = useState(null);

  const handleNavigateToCommunityPlaylists = useCallback(() => {
    setExplorerInitialView('community-playlists');
    handleNavigate('listExplorer');
  }, [handleNavigate]);

  const handleNavigateToExplorer = useCallback(() => {
    setExplorerInitialView('lists');
    handleNavigate('listExplorer');
  }, [handleNavigate]);

  const handleNavigateToExplorerComments = useCallback(() => {
    setExplorerInitialView('comments');
    handleNavigate('listExplorer');
  }, [handleNavigate]);

  const handleNavigateToDatabase = useCallback(() => {
    handleNavigate('database');
  }, [handleNavigate]);

  const shellIsCollapsed =
    isPlaylistCollapsed ||
    !isPlayerLikePage ||
    isDatabasePage ||
    isListExplorerPage;
  const shouldRenderPersistentPlayer =
    isPlayerLikePage || Boolean(currentVideo);
  const canTogglePlayback = Boolean(transientVideo) || playlist.length > 0;
  const isCurrentlyBecomingDetached =
    shouldShowDetachedFooter &&
    !previousDetachedFooterIntentRef.current &&
    !isPlayingRef.current;
  const isActuallySettling =
    isDetachedFooterSettling || isCurrentlyBecomingDetached;

  const hasDetachedFooter =
    shouldShowDetachedFooter &&
    (!isDetachedFooterPending || isActuallySettling);
  const isDesktopDetachedFooter = hasDetachedFooter && !isMobileLayout;
  const isMobileDetachedFooter = hasDetachedFooter && isMobileLayout;
  const playerPresentation = isPlayerLikePage
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

  const currentVideoHasFeedback = useMemo(() => {
    if (!currentVideo?.videoId) return false;
    return globalActivityByVideoId.has(currentVideo.videoId);
  }, [currentVideo?.videoId, globalActivityByVideoId]);

  const handleProgressUpdate = useCallback(({ currentTime, duration }) => {
    setFooterCurrentTime(currentTime);
    setFooterDuration(duration);
  }, []);

  const handleSeek = useCallback((e) => {
    const newTime = parseFloat(e.target.value);
    setFooterCurrentTime(newTime);
    videoPlayerRef.current?.seekTo(newTime);
  }, []);

  const persistentPlayer = shouldRenderPersistentPlayer ? (
    <div
      key="persistent-player-surface"
      className={`player-surface player-surface-${playerPresentation}${hasDetachedFooter ? ' detached-footer' : ''}${isMobileDetachedFooter ? ' mobile-detached-footer' : ''}${isPlaying && !isActuallySettling ? ' playing' : ''}${isDetachedFooterEntering ? ' entering' : ''}${isActuallySettling ? ' settling' : ''}${isPlayerRevealing ? ' revealing' : ''}${isLogoutTransitioning ? ' logging-out' : ''}`}
    >
      <VideoPlayer
        ref={videoPlayerRef}
        video={currentVideo}
        isPlaying={isPlaying}
        onVideoEnd={handleVideoEnd}
        onPlaybackChange={handlePlayerPlaybackChange}
        onProgressUpdate={handleProgressUpdate}
        onPrev={handlePrev}
        onNext={handleNext}
        onTogglePlay={() =>
          handleSetIsPlaying((previousValue) => !previousValue)
        }
        isShuffleEnabled={isShuffleEnabled}
        onShuffle={handleShufflePlaylist}
        isPreviewModeEnabled={isPreviewModeEnabled}
        previewCountdown={previewCountdown}
        onTogglePreview={handleTogglePreviewMode}
        isSupported={isCurrentVideoSupported}
        onOpenSupportDropdown={(video, position) =>
          setSupportLevelDropdown({ video, position })
        }
        isNominated={isCurrentVideoNominated}
        onToggleSupport={handleToggleSupportFromPlaylist}
        onToggleNomination={handleToggleNominationFromPlaylist}
        supportLevel={currentSupportLevel}
        isCurrentVideoInPlaylist={isCurrentVideoInPlaylist}
        onAddToPlaylist={handleQueueFromSupportList}
        variant={playerPresentation}
        showMetadata={isPlayerLikePage}
        playingListLabel={playingListLabel}
        onOpenPlayingList={handleOpenPlayingList}
        supabase={supabase}
        authUser={authUser}
        userProfile={userProfile}
        onShowToast={showDefaultAppToast}
        onFeedbackSaved={handleFeedbackSaved}
      />

      {isDesktopDetachedFooter && (
        <div className="detached-footer-premium-container">
          {/* Full-width label row */}
          <div className="detached-footer-list-label">
            {playingListLabel ? (
              <>
                <span className="now-playing-list-prefix">
                  Now Playing List:{' '}
                </span>
                <button
                  className="now-playing-list-btn"
                  type="button"
                  onClick={handleOpenPlayingList}
                >
                  {playingListLabel}
                </button>
              </>
            ) : (
              <span className="now-playing-list-prefix">Now Playing</span>
            )}
          </div>

          {/* Left Block: Now Playing */}
          <div className="detached-footer-left">
            <div className="now-playing-footer">
              <span className="now-playing-footer-dot-slot">
                {isPlaying && <span className="now-playing-dot" />}
              </span>
              <ScrollingText
                className="now-playing-footer-title"
                text={currentVideoDisplayTitle}
              />
            </div>
          </div>

          {/* Center Block: Controls & Progress */}
          <div className="detached-footer-center">
            <div className="footer-playback-controls">
              <button
                className={`footer-control-btn shuffle${isShuffleEnabled ? ' active' : ''}${!isShuffleAvailable ? ' disabled' : ''}`}
                onClick={isShuffleAvailable ? handleShufflePlaylist : undefined}
                title={
                  isShuffleAvailable
                    ? 'Shuffle'
                    : 'Add at least 2 tracks to shuffle'
                }
                disabled={!isShuffleAvailable}
              >
                <ShuffleIcon />
              </button>
              <button
                className="footer-control-btn"
                onClick={handlePrev}
                title="Previous"
              >
                <PreviousIcon />
              </button>
              <button
                className="footer-control-btn play-pause"
                onClick={() => handleSetIsPlaying((p) => !p)}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                className="footer-control-btn"
                onClick={handleNext}
                title="Next"
              >
                <NextIcon />
              </button>
              <button
                className={`footer-control-btn preview${isPreviewModeEnabled ? ' active' : ''}`}
                onClick={handleTogglePreviewMode}
                title="Preview"
              >
                <StopwatchIcon
                  countdown={previewCountdown}
                  className="transport-icon transport-icon-preview"
                />
              </button>
            </div>
            <div className="footer-progress-row">
              <span className="footer-time-label">
                {formatTime(footerCurrentTime)}
              </span>
              <input
                type="range"
                className="footer-progress-slider"
                min={0}
                max={footerDuration || 0}
                step={0.1}
                value={footerCurrentTime}
                onChange={handleSeek}
              />
              <span className="footer-time-label">
                {formatTime(footerDuration)}
              </span>
            </div>
          </div>

          {/* Right Block: Actions */}
          <div className="detached-footer-right">
            <button
              className={`btn btn-icon add-to-playlist-btn detached-footer-add-btn${isCurrentVideoInPlaylist ? ' hidden' : ''}`}
              type="button"
              onClick={() => handleQueueFromSupportList([currentVideo])}
              aria-label="Add to Queue"
              title="Add to Queue"
              disabled={!currentVideo}
            >
              <PlaylistPlusIcon />
            </button>

            <button
              className={`btn btn-icon detached-footer-feedback-btn ${isFeedbackPanelOpen ? 'active' : ''} ${currentVideoHasFeedback ? 'has-feedback' : ''}`}
              type="button"
              onClick={(e) => {
                if (isFeedbackPanelOpen) {
                  handleCloseFeedbackPanel();
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleShowComments(currentVideo, {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                  });
                }
              }}
              aria-label="View feedback and community activity"
              title="View feedback and community activity"
              disabled={!currentVideo}
            >
              <SpeechBubbleIcon />
            </button>

            <button
              className={`btn btn-icon detached-footer-support-btn${currentSupportClassName}`}
              type="button"
              onClick={(event) => {
                if (!currentVideo) return;
                const rect = event.currentTarget.getBoundingClientRect();
                setSupportLevelDropdown({
                  video: {
                    ...currentVideo,
                    supportLevel: currentSupportLevel || 1,
                  },
                  position: {
                    top: rect.top,
                    left: rect.left + rect.width / 2,
                  },
                  direction: 'up',
                  showRemove: isCurrentVideoSupported,
                });
              }}
              title={currentSupportTooltip}
              aria-label={currentSupportLabel}
              disabled={!currentVideo || isCurrentVideoNominated}
            >
              {currentSupportGlyph}
            </button>
          </div>
        </div>
      )}

      {/* Feedback panel moved out of footer so it can be anchored anywhere */}
    </div>
  ) : null;

  return (
    <div className={`app-frame${isMobileLayout ? ' mobile' : ''}`}>
      {VGMC_PLAYLIST_ID && !hasVgmcLoadedOnce && (
        // Full-screen splash while the default VGMC 20 landing loads — the site
        // mounts into the normal home page underneath this the whole time; we only
        // navigate to the VGMC page (see the auto-navigate effect above) once
        // loading is completely done, and this comes down at the same moment.
        <div
          className="database-loading-overlay initial"
          style={{ position: 'fixed', inset: 0, zIndex: 2000 }}
        >
          <div className="lottie-player-container">
            <DotLottieReact
              src="/loading.lottie"
              autoplay
              loop
              style={{ width: 'min(220px, 70vw)', height: 'min(220px, 70vw)' }}
            />
          </div>
          <div className="database-loading-text">Loading VGMC 20…</div>
        </div>
      )}

      {!isMobileLayout && (
        <SiteNavigation
          activePage={activePage}
          onNavigate={handleNavigate}
          authUser={authUser}
        />
      )}

      {isMobileLayout && (
        <SiteNavigation
          isMobile
          activePage={activePage}
          onNavigate={handleNavigate}
          authUser={authUser}
          isMenuOpen={isMobileNavOpen}
          onToggleMenu={() =>
            setIsMobileNavOpen((previousValue) => !previousValue)
          }
          onCloseMenu={() => setIsMobileNavOpen(false)}
        />
      )}

      <div
        className={`app-shell${shellIsCollapsed ? ' playlist-collapsed' : ''}${isPlayerLikePage ? '' : ' home-view'}${suppressPlaylistRestoreTransition ? ' playlist-transitionless' : ''}`}
      >
        <TopBar
          theme={theme}
          onToggleTheme={handleToggleTheme}
          isPlaying={isPlaying}
          hidePlaybackControls={
            isPlaying &&
            !isPlayerLikePage &&
            !isMobileLayout &&
            !showSupportList &&
            !showNominationsList
          }
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
          isShuffleAvailable={isShuffleAvailable}
          onShuffle={handleShufflePlaylist}
          isPreviewModeEnabled={isPreviewModeEnabled}
          previewCountdown={previewCountdown}
          onTogglePreview={handleTogglePreviewMode}
          currentVideo={currentVideo}
          isCurrentVideoSupported={isCurrentVideoSupported}
          isCurrentVideoNominated={isCurrentVideoNominated}
          currentSupportLevel={currentSupportLevel}
          onToggleCurrentVideoSupport={handleToggleSupportFromPlaylist}
          onToggleNomination={handleToggleNominationFromPlaylist}
          isCurrentVideoInPlaylist={isCurrentVideoInPlaylist}
          onAddToPlaylist={handleQueueFromSupportList}
          onLoad={handleLoad}
          supabase={supabase}
          onCatalogPlayNow={handlePlayCatalogTrack}
          onAddCatalogToPlaylist={handleQueueFromSupportList}
          isPlayerPage={isPlayerLikePage}
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
          customPlaylists={customPlaylists}
          onUpdateCustomPlaylists={setCustomPlaylists}
          onShowToast={(msg) => showDefaultAppToast(msg, 'dashboard')}
        />

        <main
          className={`main-content${isPlayerLikePage ? ' player-view' : isDatabasePage || isListExplorerPage ? ' home-view' : ' home-view'}${isListExplorerPage ? ' list-explorer-view' : ''}${!isPlayerLikePage && isLogoutTransitioning ? ' logout-fade-in' : ''}${hasDetachedFooter && !isPlayerLikePage ? ' has-persistent-player' : ''}`}
          id="main-content"
        >
          {/*
            main-content is `display: flex` with no flex-direction set, i.e. a row
            (see .main-content / .main-content.player-view in index.css) — that was
            never a problem when the player was its only real child. Now that a
            persistent nav toggle (and, on the VGMC page, a standings table) needs to
            stack *above* that content instead of sitting beside it, everything below
            is wrapped in one explicit flex-column container. main-content's own
            row/stretch rules then apply to just this single wrapper (harmless — a
            lone flex child fills the box the same way regardless of direction), and
            this wrapper controls the real internal stacking.
          */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              minHeight: 0,
            }}
          >
            {VGMC_PLAYLIST_ID && (
              // Normal flow — reserves its own row so every page's content (the
              // hero, the VGMC split, etc.) renders below it, never under it.
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 16px',
                  position: 'relative',
                }}
              >
                {/* Centered regardless of whether the mobile Standings trigger
                    (pinned to the left, below) is present. */}
                <VgmcNavToggle
                  isOnVgmcPage={isVgmcStandingsPage}
                  onNavigate={handleNavigate}
                />
                {isMobileLayout && isVgmcStandingsPage && (
                  <button
                    type="button"
                    className="vgmc-toggle-btn"
                    onClick={() => setIsVgmcStandingsDrawerOpen(true)}
                    style={{ position: 'absolute', left: '16px' }}
                  >
                    Standings
                  </button>
                )}
              </div>
            )}

            {/*
              One flex container for every page's main content + the player,
              flexDirection toggling row/column for the VGMC split — deliberately
              *not* two separately-branched trees like this used to be. Each
              possible child is `key`ed and conditionally rendered side-by-side in
              the same container, so the persistent-player child (key
              "persistent-player") stays the same node across every navigation
              (Home <-> VGMC, VGMC desktop <-> mobile, etc.) instead of being
              unmounted and remounted — that unmount was what silently reloaded
              (restarted) playback whenever you switched to or from this page.
            */}
            <div
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                display: 'flex',
                flexDirection: isVgmcSplitLayout ? 'row' : 'column',
                width: '100%',
                position: 'relative',
              }}
            >
              {isVgmcSplitLayout && (
                <div
                  key="vgmc-standings"
                  style={{
                    width: '33%',
                    minWidth: '280px',
                    maxWidth: '420px',
                    flexShrink: 0,
                    borderRight: '1px solid var(--border)',
                    overflow: 'hidden',
                    display: 'flex',
                  }}
                >
                  <VgmcStandingsView
                    rows={vgmcStandingsRows}
                    isLoading={isVgmcStandingsLoading}
                    onRefresh={handleRefreshVgmcPlaylist}
                    onPlayNow={handlePlayNowFromSupportList}
                  />
                </div>
              )}

              {!isPlayerLikePage && !isDatabasePage && !isListExplorerPage && (
                <div key="home-page" style={{ flex: '1 1 auto', minHeight: 0 }}>
                  <HomePage
                    supabase={supabase}
                    authUser={authUser}
                    isAuthReady={isAuthReady}
                    currentPlaylist={playlist}
                    supportStatusById={supportStatusById}
                    globalActivityByVideoId={globalActivityByVideoId}
                    listenedStatusById={listenedStatusById}
                    isFeedbackPanelOpen={isFeedbackPanelOpen}
                    onAddToPlaylist={handleQueueFromSupportList}
                    onPlayNow={handlePlayNowFromSupportList}
                    onPlayPlaylist={handlePlayCommunityPlaylist}
                    onToggleSupport={handleToggleSupportFromPlaylist}
                    onToggleNomination={handleToggleNominationFromPlaylist}
                    onOpenSupportDropdown={(video, position) =>
                      setSupportLevelDropdown({
                        video,
                        position,
                        direction: 'down',
                        showRemove: false,
                      })
                    }
                    onShowComments={handleShowComments}
                    onNavigateToPlayer={handleNavigateToPlayer}
                    onNavigateToExplorer={handleNavigateToExplorer}
                    onNavigateToCommunityPlaylists={
                      handleNavigateToCommunityPlaylists
                    }
                    onNavigateToExplorerComments={
                      handleNavigateToExplorerComments
                    }
                    onNavigateToDatabase={handleNavigateToDatabase}
                    onOpenPlaylist={handleTogglePlaylist}
                    onOpenNominationsAdding={handleOpenNominationsWithHighlight}
                    onShowToast={(message) =>
                      showDefaultAppToast(message, 'dashboard')
                    }
                    onUpdateMetadata={handleOpenMetadataUpdate}
                    catalogMetadata={catalogTrackByVideoId}
                    lastMetadataUpdateBatch={lastMetadataUpdateBatch}
                    onPlayCommunityListFromTrack={
                      handlePlayCommunityListFromTrack
                    }
                    onPlayFromNominationList={handlePlayFromNominationList}
                    onPlayFromSupportList={handlePlayFromSupportList}
                    userProfile={userProfile}
                    nominationList={nominationList}
                    onNominationsLoaded={handleNominationsLoaded}
                    nominationRefreshToken={nominationRefreshToken}
                    customPlaylists={customPlaylists}
                    onUpdateCustomPlaylists={setCustomPlaylists}
                  />
                </div>
              )}

              {isDatabasePage && (
                <div
                  key="database-page"
                  style={{ flex: '1 1 auto', minHeight: 0 }}
                >
                  <Suspense fallback={null}>
                    <TrackDatabase
                      supabase={supabase}
                      authUser={authUser}
                      onAddToPlaylist={handleQueueFromSupportList}
                      onPlayNow={handlePlayNowFromSupportList}
                      onShowToast={handleShowDashboardToast}
                      hasPlayer={Boolean(currentVideo)}
                      listenedStatusById={listenedStatusById}
                      onRefreshFeedback={refreshUserFeedback}
                      onTrackSaved={(trackId, updates) => {
                        applyUpdatesToList(trackId, updates);
                      }}
                      onUpdateMetadata={handleOpenMetadataUpdate}
                      onToggleNomination={handleToggleNominationFromPlaylist}
                      onOpenSupportDropdown={(video, position) =>
                        setSupportLevelDropdown({ video, position })
                      }
                      initialTracks={dbCacheRef.current.tracks}
                      initialSelectedVideoId={
                        dbCacheRef.current.selectedVideoId
                      }
                      onUnmount={(tracks, selectedVideoId) => {
                        dbCacheRef.current = { tracks, selectedVideoId };
                      }}
                      onFeedbackSaved={handleFeedbackSaved}
                      customPlaylists={customPlaylists}
                      onUpdateCustomPlaylists={setCustomPlaylists}
                    />
                  </Suspense>
                </div>
              )}

              {activePage === 'listExplorer' && (
                <div
                  key="list-explorer-page"
                  style={{ flex: '1 1 auto', minHeight: 0 }}
                >
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
                    onAddToPlaylist={(videos) =>
                      handleQueueFromSupportList(videos)
                    }
                    onRemoveFromPlaylist={handleRemoveFromPlaylist}
                    onToggleSupport={handleToggleSupportFromPlaylist}
                    onToggleNomination={handleToggleNominationFromPlaylist}
                    onShowToast={handleShowDashboardToast}
                    authUser={authUser}
                    userProfile={userProfile}
                    supabase={supabase}
                    onUpdateMetadata={handleOpenMetadataUpdate}
                    onOpenSupportDropdown={(video, position) =>
                      setSupportLevelDropdown({
                        video,
                        position,
                        direction: 'down',
                        showRemove: false,
                      })
                    }
                    onExport={handleOpenExportModal}
                    onSavePlaylist={handleCreateYTPlaylist}
                    onPlayExplorerList={handlePlayExplorerList}
                    onPlayCommunityListFromTrack={
                      handlePlayCommunityListFromTrack
                    }
                    onPlayCommunityPlaylist={handlePlayCommunityPlaylist}
                    catalogTrackByVideoId={catalogTrackByVideoId}
                    initialView={explorerInitialView}
                    onRefreshFeedback={refreshUserFeedback}
                    refreshKey={feedbackRefreshKey}
                    onShowComments={handleShowComments}
                    onFeedbackSaved={handleFeedbackSaved}
                  />
                </div>
              )}

              {shouldRenderPersistentPlayer && (
                <div
                  key="persistent-player"
                  className={
                    isVgmcSplitLayout ? 'vgmc-player-column' : undefined
                  }
                  style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}
                >
                  {persistentPlayer}
                </div>
              )}
            </div>
          </div>
        </main>

        {isMobileLayout && isVgmcStandingsPage && (
          <VgmcStandingsDrawer
            isOpen={isVgmcStandingsDrawerOpen}
            onClose={() => setIsVgmcStandingsDrawerOpen(false)}
            rows={vgmcStandingsRows}
            isLoading={isVgmcStandingsLoading}
            onRefresh={handleRefreshVgmcPlaylist}
            onPlayNow={handlePlayNowFromSupportList}
          />
        )}

        {(isPlayerLikePage || shouldRenderDesktopPlaylistOverlay) && (
          <aside
            className={`sidebar app-sidebar${effectivePlaylistCollapsed ? ' collapsed' : ''}${shouldRenderDesktopPlaylistOverlay ? ' overlay-sidebar' : ''}`}
          >
            <PlaylistSidebar
              playlist={sidebarTracks}
              currentIndex={currentDisplayIndex}
              flashVideoIds={flashVideoIds}
              isShuffleEnabled={isShuffleEnabled}
              isShuffleAvailable={isShuffleAvailable}
              isPreviewModeEnabled={isPreviewModeEnabled}
              isCollapsed={effectivePlaylistCollapsed}
              showOriginalOrder={showOriginalOrder}
              onShuffle={handleShufflePlaylist}
              onTogglePreview={handleTogglePreviewMode}
              onToggleCollapse={() => {
                if (isPlayerLikePage) {
                  setIsPlaylistCollapsed((previousValue) => !previousValue);
                  return;
                }

                setIsDesktopOverlayPlaylistOpen(
                  (previousValue) => !previousValue,
                );
              }}
              onToggleOrderView={handleTogglePlaylistOrderView}
              onSelect={handleSidebarSelect}
              onReorder={(newTracks) => {
                if (activePlaylistView.type === 'nominations') {
                  handleReorderNominationList(newTracks);
                } else if (activePlaylistView.type === 'support') {
                  handleReorderSupportList(newTracks);
                } else if (activePlaylistView.type === 'custom-playlist') {
                  setCustomPlaylists((prev) =>
                    prev.map((p) =>
                      p.id === activePlaylistView.id
                        ? { ...p, videos: newTracks }
                        : p,
                    ),
                  );
                } else {
                  handleReorderPlaylist(newTracks);
                }
              }}
              supportList={supportList}
              nominationList={nominationList}
              listenedStatusById={listenedStatusById}
              onToggleSupport={handleToggleSupportFromPlaylist}
              onToggleNomination={handleToggleNominationFromPlaylist}
              onOpenSupportDropdown={(video, position) =>
                setSupportLevelDropdown({
                  video,
                  position,
                  direction: 'down',
                  showRemove: false,
                })
              }
              onRemoveFromPlaylist={(videoIdsOrId) => {
                if (activePlaylistView.type === 'custom-playlist') {
                  const ids = new Set(
                    Array.isArray(videoIdsOrId) ? videoIdsOrId : [videoIdsOrId],
                  );
                  setCustomPlaylists((prev) =>
                    prev.map((p) =>
                      p.id === activePlaylistView.id
                        ? {
                            ...p,
                            videos: p.videos.filter((v) => !ids.has(v.videoId)),
                          }
                        : p,
                    ),
                  );
                } else {
                  handleRemoveFromPlaylist(videoIdsOrId);
                }
              }}
              onAddDirectItems={handleQueueFromSupportList}
              onAddDirectToCustomPlaylist={
                activePlaylistView.type === 'custom-playlist'
                  ? handleAddDirectToCustomPlaylist
                  : null
              }
              retiredVideoIds={retiredVideoIds}
              pendingMetadataCount={tracksNeedingMetadata.length}
              onOpenMetadataDialog={() => setShowMetadataDialog(true)}
              onDismissMetadataBanner={() => setTracksNeedingMetadata([])}
              onUpdateMetadata={handleOpenMetadataUpdate}
              authUser={authUser}
              onExport={handleOpenExportModal}
              onSavePlaylist={handleCreateYTPlaylist}
              activePage={activePage}
              activePlaylistView={activePlaylistView}
              onSwitchView={setActivePlaylistView}
              communityNominations={communityNominations}
              globalActivityByVideoId={globalActivityByVideoId}
              onShowComments={handleShowComments}
              supabase={supabase}
              lastCommunityPlaylist={lastCommunityPlaylist}
              onPlayCustomPlaylist={handlePlayExplorerList}
              onNavigateToCommunityPlaylists={
                handleNavigateToCommunityPlaylists
              }
              customPlaylists={customPlaylists}
              onUpdateCustomPlaylists={setCustomPlaylists}
              onShowToast={(msg) => showDefaultAppToast(msg, 'dashboard')}
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
          supportList={enrichedSupportList}
          onReorder={handleReorderSupportList}
          isOpen={showSupportList}
          onClose={handleRequestCloseSupportList}
          onExited={handleSupportListExited}
          onPlayNow={handlePlayFromSupportList}
          onAddToPlaylist={handleQueueFromSupportList}
          onRemove={handleRemoveFromSupportList}
          onToggleSupport={handleToggleSupportFromPlaylist}
          onToggleNomination={handleToggleNominationFromPlaylist}
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
            setSupportLevelDropdown({
              video,
              position,
              direction: 'down',
              showRemove: false,
            })
          }
          authUser={authUser}
          onExport={handleOpenExportModal}
          onSavePlaylist={handleCreateYTPlaylist}
          onPlayList={() => handlePlayExplorerList('support')}
          globalActivityByVideoId={globalActivityByVideoId}
          onShowComments={handleShowComments}
          customPlaylists={customPlaylists}
          onUpdateCustomPlaylists={setCustomPlaylists}
        />
      )}

      {renderNominationsList && (
        <FavouritesPanel
          supportList={enrichedNominationList}
          onReorder={handleReorderNominationList}
          isOpen={showNominationsList}
          onClose={handleRequestCloseNominationsList}
          onExited={handleNominationsListExited}
          onPlayNow={handlePlayFromNominationList}
          onAddToPlaylist={handleQueueFromSupportList}
          onRemove={handleRemoveFromNominationList}
          onToggleSupport={handleToggleSupportFromPlaylist}
          onToggleNomination={handleToggleNominationFromPlaylist}
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
          onPlayList={() => handlePlayExplorerList('nominations')}
          highlightAdd={isAddNominationHighlighted}
          globalActivityByVideoId={globalActivityByVideoId}
          onShowComments={handleShowComments}
          customPlaylists={customPlaylists}
          onUpdateCustomPlaylists={setCustomPlaylists}
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
        discordAuthUrl={discordAuthUrl}
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
        supabase={supabase}
        authUser={authUser}
        onAddToPlaylist={handleQueueFromSupportList}
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
          showRemove={supportLevelDropdown.showRemove !== false}
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

      {isFeedbackPanelOpen && (feedbackTrack || currentVideo) && (
        <ModalPortal>
          <FooterFeedbackPanel
            track={feedbackTrack || currentVideo}
            supabase={supabase}
            authUser={authUser}
            userProfile={userProfile}
            anchorRect={feedbackPosition}
            initialIsEditing={isFeedbackForcedEdit}
            onClose={handleCloseFeedbackPanel}
            onShowToast={showDefaultAppToast}
            onUpdate={refreshUserFeedback}
            onFeedbackSaved={handleFeedbackSaved}
          />
        </ModalPortal>
      )}
    </div>
  );
}
