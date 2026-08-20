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

// Persistent VGMC/NomPlayer page switch, shown on every page (not just the VGMC
// view itself) so it's always available, not just a one-way trip in from Settings.
// One button that always names *where clicking it takes you*, not where you are.
function VgmcNavToggle({ isOnVgmcPage, onNavigate }) {
  const label = isOnVgmcPage ? 'NomPlayer' : 'VGMC 20';
  const target = isOnVgmcPage ? 'home' : 'vgmcStandings';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Soft light-blue glow, base site only (i.e. while the button reads "VGMC
          20" and is inviting you in), draws the eye without being the same purple
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
// check around isVgmcStandingsPage below), the desktop side-by-side column doesn't
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
            0.25s slide-out finishes, content disappears before the drawer
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
import FooterProgressBar from './components/FooterProgressBar.jsx';
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
import AddToPlaylistDropdown from './components/AddToPlaylistDropdown.jsx';
import ExportVgmcModal from './components/ExportVgmcModal.jsx';
import VgmcSheetSyncPanel from './components/VgmcSheetSyncPanel.jsx';
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
  recordTrackListen,
  saveUserPlayerState,
  saveTrackSupport,
  fetchUserHydratedState,
  upsertUserProfile,
  updateControlsBelowPlayerPreference,
  recordTrackHistory,
  getTrackHistory,
  clearTrackHistory,
  LEGACY_SUPPORT_STORAGE_KEY,
  getDisplayProfileName,
} from './lib/playerState.js';
import {
  fetchTrackCatalogByVideoIds,
  fetchTrackCatalogByTrackIds,
  ingestTrackSources,
  patchCatalogCache,
  getFullCatalog,
  getCachedCatalog,
  mapTrackCatalogEntryToVideo,
  mergeTracks,
  findTrackInCatalog,
  fetchCatalogActivityMap,
} from './lib/trackCatalog.js';
import { fetchUserFeedback } from './lib/feedback.js';
import { fetchDashboardNominationUpdates } from './lib/dashboard.js';
import {
  fetchVgmcPlaylistTracks,
  toPlaylistVideos,
  buildVgmcSupportPointsByVideoId,
} from './lib/vgmcStandings.js';
import {
  fetchPlaylistMeta,
  fetchPlaylistTracks,
} from './lib/communityPlaylists.js';
import { fetchUserPublicLists } from './lib/sharedUserLists.js';
import { reportError } from './lib/errorReporter.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabase.js';
import { getYouTubeThumbnailUrl } from './utils/youtube.js';
import { fetchMediaItems, parseMediaInput } from './utils/media.js';
import {
  PreviousIcon,
  NextIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  FastForwardIcon,
  PlaylistPlusIcon,
  PlayPlusIcon,
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
// Same flag, same default, as HomePage.jsx's VGMC_LIVE_SUPPORTS_ENABLED - kept
// as a separate local const rather than a shared import, matching how
// VGMC_PLAYLIST_ID itself is already duplicated per-file in this codebase.
// Here it gates the two ways a visitor actually lands on the VGMC standings
// page (the auto-redirect below, and VgmcNavToggle's persistent nav button),
// not the page/data itself - the VGMC playlist can still be browsed normally
// (e.g. via Community Playlists) once the nomination period is closed and
// this is flipped to "false", it just stops being pushed on everyone.
const VGMC_LIVE_SUPPORTS_ENABLED =
  import.meta.env.VITE_VGMC_LIVE_SUPPORTS_ENABLED !== 'false';

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

/** "Game - Track" when catalog metadata is available, falling back to the
 * raw YouTube title otherwise. Shared by the now-playing label and the
 * previous-track row so both read a video's display title the same way. */
function getVideoDisplayTitle(video) {
  if (!video) return '';
  const hasTrackTitle =
    typeof video.trackTitle === 'string' && video.trackTitle.trim();
  const hasGameTitle =
    typeof video.gameTitle === 'string' && video.gameTitle.trim();
  if (!hasTrackTitle && !hasGameTitle) return video.title;

  return `${hasGameTitle ? video.gameTitle : ''}${hasGameTitle && hasTrackTitle ? ' - ' : ''}${hasTrackTitle ? video.trackTitle : ''}`;
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
 * apply to this exact set of tracks, e.g. it was computed for a different
 * view, since resolvePlayOrderIds already falls back to original order then. */
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
 * (each group independently randomized), used for the VGMC standings
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

/** Deterministic (no randomizing) version of the same not-started/started
 * split,sinks anything you've already started or finished to the bottom,
 * otherwise leaving everything in its current relative order. Used by the
 * "Move started songs to bottom" button, as distinct from shuffle. */
function moveListenedToBottom(
  videoIds,
  listenedStatusById,
  pinnedVideoId = null,
) {
  const remainingIds = pinnedVideoId
    ? videoIds.filter((id) => id !== pinnedVideoId)
    : [...videoIds];

  const notStartedIds = remainingIds.filter((id) => !listenedStatusById[id]);
  const startedIds = remainingIds.filter((id) => listenedStatusById[id]);
  const orderedRemaining = [...notStartedIds, ...startedIds];

  return pinnedVideoId
    ? [pinnedVideoId, ...orderedRemaining]
    : orderedRemaining;
}

/**
 * Shuffle and "move started to bottom" are two separate, mutually exclusive
 * ways to reorder the queue,turning one on always turns the other off, so
 * shuffleOrderIds only ever holds one axis's order at a time and pressing
 * either button can never leave the other looking (or behaving) active.
 */

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

  const videoId =
    typeof event.videoId === 'string' && event.videoId.trim()
      ? event.videoId.trim()
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

  if (!videoId || !listenEvent) {
    return null;
  }

  return {
    videoId,
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
      statusById[normalizedEvent.videoId] =
        statusById[normalizedEvent.videoId] === 'complete' ||
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

// Query params a share link can land the app on: a specific playlist (see
// buildPlaylistShareUrl in lib/communityPlaylists.js) or, straight from the
// companion Discord bot's "Open in NomPlayer" buttons
// (NomPlayerBot/src/commands/nominations.js / supports.js), someone's
// nominations or support list (see lib/sharedUserLists.js). Each param's
// value is that target's id, `playlist`'s a playlist id, the other two a
// user id - only one is ever expected on a given link.
const SHARED_LIST_URL_PARAMS = ['playlist', 'nominations', 'supports'];

/** Whichever `?<param>=<uuid>` a share link was opened with, as
 * `{ type, id }` (type is the param name), or null. Read once via a lazy
 * useState initializer at the call site rather than on every render, since
 * the param is stripped from the URL as soon as it's been handled. */
function readSharedListLinkFromUrl() {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search);
  for (const type of SHARED_LIST_URL_PARAMS) {
    const id = searchParams.get(type);
    if (id) return { type, id };
  }
  return null;
}

function stripSharedListParamFromUrl() {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  for (const type of SHARED_LIST_URL_PARAMS) {
    url.searchParams.delete(type);
  }
  window.history.replaceState(window.history.state, '', url.toString());
}

export default function App() {
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
  const supabase = getSupabaseClient();
  // Read once on mount, before the param gets stripped from the URL once
  // handled (see the shared-list-link effect further down). A shared link
  // always wins over the default VGMC auto-navigate landing (below), so
  // that effect checks this too rather than racing it. Mirrored into a ref
  // (same "seed a ref from the lazy-initialized state" shape as
  // initialCustomOrderKind/customOrderKindRef below) so effects can read it
  // without listing a useState value in their dependency arrays, that
  // reactive-looking dependency is what defeats the "runs once" analysis
  // react-hooks/set-state-in-effect otherwise applies to those effects.
  const [sharedListLinkFromUrl] = useState(readSharedListLinkFromUrl);
  const sharedListLinkRef = useRef(sharedListLinkFromUrl);
  // Computed once via useState's lazy initializer (React guarantees it runs
  // only on mount, StrictMode double-invoke aside) rather than the
  // read-a-ref-during-render pattern this used to be - same "compute once"
  // behavior, but without touching a ref's .current while rendering.
  const [initialPlayerState] = useState(() =>
    loadLocalPlayerState({
      supportListFallback: loadSupportList(),
      nominationListFallback: loadNominationList(),
    }),
  );
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
  // Whatever's actually playing right now, the personal playlist, or (while
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
  // Which custom order shuffleOrderIds currently holds, null | 'shuffle' |
  // 'listened'. Shuffle and "move started to bottom" are mutually exclusive
  // (see handleShufflePlaylist/handleMoveListenedToBottom below), this is
  // what lets each button know whether it, specifically, is the one active.
  // Both the ref and the state get seeded from this directly, rather than
  // the state reading the ref's .current, so neither has to read a ref
  // during render.
  const initialCustomOrderKind =
    initialPlayerState.shuffleOrderIds.length > 0 ? 'shuffle' : null;
  const customOrderKindRef = useRef(initialCustomOrderKind);
  const [customOrderKind, setCustomOrderKind] = useState(
    initialCustomOrderKind,
  );
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
  // Whether the playback transport controls (shuffle/prev/play/next/preview)
  // are relocated from the top bar down to below the player - see the
  // playback-relocate-btn toggle in TopBar/VideoPlayer.
  const [isPlaybackControlsBelowPlayer, setIsPlaybackControlsBelowPlayer] =
    useState(false);
  // handleToggleControlsPosition is declared further down, once authUser is
  // in scope (its persistence needs the logged-in user's id).
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
  // Declared here rather than by handleNavigateToCommunityPlaylists/the
  // explorer-view state further down - handlePlayCommunityPlaylist (below)
  // needs setLastCommunityPlaylist in scope well before that point.
  const [lastCommunityPlaylist, setLastCommunityPlaylist] = useState(null);
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
  // FavouritesPanel's own level-filter/sort-order state would otherwise
  // reset every time the panel reopens - renderSupportList/
  // renderNominationsList unmount it entirely on close, taking its internal
  // state with it. Lifted here so both survive that, but still start fresh
  // (every level visible, no sort) on an actual page load, since these are
  // just normal useState.
  const [supportListVisibleLevels, setSupportListVisibleLevels] = useState(
    () => new Set([1, 2, 3]),
  );
  const [supportListSortState, setSupportListSortState] = useState({
    by: null,
    direction: null,
  });
  const [nominationListSortState, setNominationListSortState] = useState({
    by: null,
    direction: null,
  });
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

  // VGMC standings view, see src/lib/vgmcStandings.js. `hasLoadedVgmcPlaylistRef`/
  // `hasAutoNavigatedToVgmcRef` survive the view unmounting (switching back to the
  // Classic tab), which is why "load once per session" lives here as refs rather
  // than as local state inside VgmcStandingsView.
  const [vgmcStandingsRows, setVgmcStandingsRows] = useState([]);
  const [isVgmcStandingsLoading, setIsVgmcStandingsLoading] = useState(false);
  const [isVgmcStandingsDrawerOpen, setIsVgmcStandingsDrawerOpen] =
    useState(false);
  // Distinct from isVgmcStandingsLoading, which also covers Refresh, this one only
  // ever flips true once, after the very first load finishes, and drives the
  // full-view loading overlay (Refresh keeps its lighter button-only feedback).
  const [hasVgmcLoadedOnce, setHasVgmcLoadedOnce] = useState(false);
  const [isVgmcSheetSyncOpen, setIsVgmcSheetSyncOpen] = useState(false);
  const hasLoadedVgmcPlaylistRef = useRef(false);
  const hasAutoNavigatedToVgmcRef = useRef(false);
  const hasLoadedSharedListLinkRef = useRef(false);
  // handleLoadVgmcPlaylist/handleRefreshVgmcPlaylist are defined further down, right
  // after handlePlayCommunityPlaylist, they build on it, so they live near it.

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
  // Seed the controls-position toggle from the profile once per login (id
  // change), not on every subsequent profile edit - later edits to other
  // profile fields (username, avatar, ...) shouldn't yank a mid-session
  // toggle back to whatever was last persisted.
  useEffect(() => {
    if (!userProfile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaybackControlsBelowPlayer(
      Boolean(userProfile.controls_below_player),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id]);
  const [userFeedback, setUserFeedback] = useState({});
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0);
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured);
  const [isUserHydrated, setIsUserHydrated] = useState(!isSupabaseConfigured);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState(null);
  // Deliberately refs, not state - see FooterProgressBar.jsx for why.
  const footerProgressRef = useRef({ currentTime: 0, duration: 0 });
  const footerProgressListenersRef = useRef(new Set());
  const subscribeFooterProgress = useCallback((listener) => {
    footerProgressListenersRef.current.add(listener);
    return () => footerProgressListenersRef.current.delete(listener);
  }, []);
  const videoPlayerRef = useRef(null);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFeedbackPanelOpen, setIsFeedbackPanelOpen] = useState(false);
  const [isFeedbackForcedEdit, setIsFeedbackForcedEdit] = useState(false);
  const [feedbackTrack, setFeedbackTrack] = useState(null);
  const [feedbackPosition, setFeedbackPosition] = useState(null);
  const [catalogActivityByVideoId, setCatalogActivityByVideoId] = useState(
    new Map(),
  );
  const [isDeleteAccountConfirmOpen, setIsDeleteAccountConfirmOpen] =
    useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [supportLevelDropdown, setSupportLevelDropdown] = useState(null);
  const [addToPlaylistDropdown, setAddToPlaylistDropdown] = useState(null);
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
    // Which axis produced a persisted custom order isn't itself persisted,
    // so on load a non-empty order is attributed to 'shuffle',matches
    // what this looked like before "move started to bottom" existed.
    const hydratedCustomOrderKind =
      normalizedState.shuffleOrderIds.length > 0 ? 'shuffle' : null;
    customOrderKindRef.current = hydratedCustomOrderKind;
    setCustomOrderKind(hydratedCustomOrderKind);

    setShowOriginalOrder(normalizedState.showOriginalOrder);
    setListenedStatusById(normalizedState.listenedStatusById);
    setSupportList(normalizedState.supportList);
    setNominationList(normalizedState.nominationList);
    setCustomPlaylists(normalizedState.customPlaylists || []);
    setIsPlaying(false);
  }, []);

  const authUser = authSession?.user ?? null;

  const handleToggleControlsPosition = useCallback(() => {
    setIsPlaybackControlsBelowPlayer((previousValue) => {
      const nextValue = !previousValue;
      // Persist for logged-in users only - guests just get the session
      // default each visit, same as every other guest-vs-account split here.
      if (supabase && authUser) {
        updateControlsBelowPlayerPreference(
          supabase,
          authUser.id,
          nextValue,
        ).catch((error) => {
          console.error(
            'Failed to save playback controls position preference',
            error,
          );
        });
      }
      return nextValue;
    });
  }, [supabase, authUser]);

  // Declared here (its first use, syncCatalogForNominationVideos below, needs
  // it in scope) rather than further down near the other list-mutation
  // helpers - only depends on the setters above (stable across renders) and
  // the module-level patchCatalogCache import, so where it lives doesn't
  // matter beyond that ordering constraint.
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

      ingestTrackSources(supabase, videos)
        .then((ingestResult) => {
          if (!Array.isArray(ingestResult) || ingestResult.length === 0) return;
          const updatesMap = {};
          for (const row of ingestResult) {
            if (row.external_id && row.track_id) {
              updatesMap[row.external_id] = { trackId: row.track_id };
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

    ingestTrackSources(supabase, missing)
      .then((ingestResult) => {
        if (!Array.isArray(ingestResult) || ingestResult.length === 0) return;
        const updatesMap = {};
        for (const row of ingestResult) {
          if (row.external_id && row.track_id) {
            updatesMap[row.external_id] = { trackId: row.track_id };
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
      // Clearing local feedback on logout is tied to the same authUser.id
      // change that drives the fetch above, splitting it into a separate
      // "adjust during render" effect would duplicate that condition for no
      // real benefit.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
            const result = await recordTrackListen(
              supabase,
              queuedEvent.videoId,
              queuedEvent.listenEvent,
              queuedEvent.secondsPlayed,
            );

            if (authUserIdRef.current === userId && result?.listenStatus) {
              loadedListenStatusVideoIdsRef.current.add(queuedEvent.videoId);
              startTransition(() => {
                setListenedStatusById((previousStatus) =>
                  mergeListenedStatuses(previousStatus, {
                    [queuedEvent.videoId]: result.listenStatus,
                  }),
                );
              });
            }
          } catch (error) {
            if (isMissingCatalogTrackError(error)) {
              nonCatalogedListenVideoIdsRef.current.add(queuedEvent.videoId);
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

  // Activity badges (homepage, favourites panels) only need a tiny
  // videoId -> 'commented' | 'rated' map, so they're fed straight from a
  // dedicated slim query. This intentionally does NOT warm the full
  // getFullCatalog() snapshot - that's several MB and only actually needed
  // once the user opens the Database view or logs in (hydrateAuthenticatedUser
  // kicks it off then); loading it here would tax every visitor's CPU/RAM up
  // front for a feature that only needs three columns.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    fetchCatalogActivityMap(supabase)
      .then((map) => {
        if (!cancelled) setCatalogActivityByVideoId(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Pure function of catalogActivityByVideoId + userFeedback (nothing else
  // ever set this), so it's derived via useMemo rather than mirrored into
  // its own state through an effect.
  const globalActivityByVideoId = useMemo(() => {
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
    return merged;
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
          await ingestTrackSources(supabase, videosToIngest);
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

  // Personal-queue-specific, feeds displayPlaylist's own reordering only.
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
    // Row order follows shuffle state alone, showOriginalOrder never moves
    // rows, it only changes which number is shown on them (see orderNumber in
    // PlaylistSidebar). Turning shuffle off entirely is what reverts row
    // order back to the playlist's saved order.
    const orderIds = isPersonalShuffleActive
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
  }, [catalogTrackByVideoId, isPersonalShuffleActive, playlist, playOrderIds]);

  // Same GameFAQs-VGMC point/voter lookup HomePage.jsx's leaderboard badge
  // uses (see buildVgmcSupportPointsByVideoId), gated behind the same flag -
  // feeds the equivalent badge on the Support/Nomination list panels below.
  const vgmcSupportPointsByVideoId = useMemo(
    () =>
      VGMC_LIVE_SUPPORTS_ENABLED
        ? buildVgmcSupportPointsByVideoId(vgmcStandingsRows)
        : new Map(),
    [vgmcStandingsRows],
  );

  const enrichedNominationList = useMemo(() => {
    return nominationList.map((nom, index) => {
      const catalogEntry = catalogTrackByVideoId[nom.videoId];
      const gamefaqs = vgmcSupportPointsByVideoId.get(nom.videoId);
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
        gamefaqsPoints: gamefaqs?.points || 0,
        gamefaqsVoters: gamefaqs?.voters || 0,
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
  }, [
    nominationList,
    catalogTrackByVideoId,
    userFeedback,
    vgmcSupportPointsByVideoId,
  ]);

  const enrichedSupportList = useMemo(() => {
    return supportList.map((sup, index) => {
      const catalogEntry = catalogTrackByVideoId[sup.videoId];
      const gamefaqs = vgmcSupportPointsByVideoId.get(sup.videoId);
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
        gamefaqsPoints: gamefaqs?.points || 0,
        gamefaqsVoters: gamefaqs?.voters || 0,
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
  }, [
    supportList,
    catalogTrackByVideoId,
    userFeedback,
    vgmcSupportPointsByVideoId,
  ]);

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
      // toPlaylistVideos (the source of these, for VGMC) has no access to
      // catalogTrackByVideoId/userFeedback, so the user's own rating, what
      // the sidebar badge actually shows, not the community support count,
      // has to get attached here instead, same lookup the other views do.
      tracks = (activePlaylistView.videos || []).map((video) => {
        const catalogEntry = catalogTrackByVideoId[video.videoId];
        const personalRating =
          (catalogEntry?.id && userFeedback[catalogEntry.id]?.rating) ||
          (video.trackId && userFeedback[video.trackId]?.rating);
        return {
          ...video,
          rating: personalRating || video.rating || null,
          trackId: catalogEntry?.trackId ?? video.trackId ?? null,
        };
      });
    }

    // 'personal' (and the community-with-no-match edge case above) falls back
    // to displayPlaylist, which already reflects shuffle order on its own,
    // applying it again here would be redundant, not wrong, but skip it.
    // Every other view type doesn't get shuffle-reordered anywhere else, so it
    // has to happen here for the sidebar to actually show shuffled order
    // (playback advancement resolves its own order separately, at the point
    // handlePrev/handleNext/handleVideoEnd need it).
    if (tracks === undefined) return displayPlaylist;

    // Each track's original position, so a row's displayed number can stay
    // truthful (see PlaylistSidebar's orderNumber, showOriginalOrder) even
    // after shuffle physically moves the row elsewhere. Some branches above
    // (nominations, support) already stamp their own loadIndex; this only
    // fills in a fallback for whichever don't (custom playlists, and any
    // community-playlist whose caller didn't set one).
    const tracksWithStableOrder = tracks.map((video, index) => ({
      ...video,
      loadIndex: Number.isFinite(video.loadIndex) ? video.loadIndex : index,
    }));

    // Row order follows shuffle state alone, showOriginalOrder never moves
    // rows, only the number shown on them. Turning shuffle off (not this
    // toggle) is what reverts row order back to the saved playlist order.
    return applyShuffleOrder(tracksWithStableOrder, shuffleOrderIds);
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

  // General shuffle state, reflects whatever's actually playing right now
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
  const isCustomOrderActive = useMemo(
    () => shuffleOrderIds.length > 0 && currentPlayOrderIds === shuffleOrderIds,
    [currentPlayOrderIds, shuffleOrderIds],
  );
  // Shuffle and "move started to bottom" are mutually exclusive but share
  // the one shuffleOrderIds list (see customOrderKind), so each button's own
  // "am I active" state needs to check which of the two is actually active,
  // not just "is *some* custom order applied right now".
  const isShuffleEnabled = isCustomOrderActive && customOrderKind === 'shuffle';
  const isListenedToBottomActive =
    isCustomOrderActive && customOrderKind === 'listened';
  const isShuffleAvailable = playingTracks.length >= 2;

  const currentDisplayIndex = useMemo(() => {
    const activeVideoId = transientVideo?.videoId || currentVideoId;
    if (!activeVideoId) return null;
    const index = sidebarTracks.findIndex(
      (video) => video.videoId === activeVideoId,
    );
    return index < 0 ? null : index;
  }, [sidebarTracks, transientVideo, currentVideoId]);
  // The track that was actually playing before the current one, per the
  // user's listening history (see recordTrackHistory/getTrackHistory) rather
  // than position in the playlist -- so the player can offer a quick way
  // back to comment on/rate what was really playing a moment ago, even if
  // that track isn't adjacent to (or isn't even in) the current list.
  const previousTrack = useMemo(() => {
    const activeVideoId = transientVideo?.videoId || currentVideoId;
    if (!activeVideoId) return null;
    const history = getTrackHistory();
    const entry = history.find((item) => item.videoId !== activeVideoId);
    if (!entry) return null;
    // Prefer the live track object when it's still around (fresher
    // metadata/support state); fall back to the history snapshot, which
    // already carries enough (videoId/trackId/title/trackTitle/gameTitle)
    // to display and to open comments on.
    return (
      currentContextTracks.find((video) => video.videoId === entry.videoId) ||
      playlist.find((video) => video.videoId === entry.videoId) ||
      entry
    );
    // playlist (state), not playlistRef - this runs during render (useMemo),
    // and playlistRef.current is kept in sync with playlist anyway (see the
    // effect near its declaration), so reading the state directly here is
    // equivalent without touching a ref mid-render.
  }, [currentContextTracks, transientVideo, currentVideoId, playlist]);
  const isPlayerPage = activePage === 'player';
  const isDatabasePage = activePage === 'database';
  const isListExplorerPage = activePage === 'listExplorer';
  // Community Playlists moved out to its own left-nav destination but still
  // renders through ListExplorer (see the shared render block below) - this
  // flag lets the surrounding chrome (main-content class, HomePage hiding)
  // treat it the same way isListExplorerPage already does.
  const isCommunityPlaylistsPage = activePage === 'communityPlaylists';
  // The VGMC standings page reuses the classic player page's full VideoPlayer +
  // persistent sidebar chrome (see PLAYER_LIKE_PAGES in handleNavigate for the
  // matching navigation-animation treatment), it just adds a standings table above
  // it, rendered separately below. Everywhere the player page's layout/chrome used to
  // key off `isPlayerPage` alone now keys off `isPlayerLikePage` instead.
  const isVgmcStandingsPage = activePage === 'vgmcStandings';
  const isPlayerLikePage = isPlayerPage || isVgmcStandingsPage;
  // Desktop shows standings as a side-by-side column; mobile behaves exactly like
  // the classic player page (isPlayerLikePage) and gets a slide-in drawer instead
  // (see VgmcStandingsDrawer), there's no room for a permanent side column there.
  const isVgmcSplitLayout = isVgmcStandingsPage && !isMobileLayout;

  // Feeds VgmcSheetSyncPanel, {videoId: {rating, note}} for every VGMC song
  // with a rating from the signed-in user. Built entirely from state already
  // loaded for the standings view + the existing feedback fetch, so opening
  // the sync panel doesn't trigger any DB reads of its own.
  const vgmcFeedbackByVideoId = useMemo(() => {
    const map = {};
    for (const row of vgmcStandingsRows) {
      if (!row.track_id || !row.external_id) continue;
      const feedback = userFeedback[row.track_id];
      if (!feedback || feedback.rating == null) continue;
      map[row.external_id] = {
        rating: feedback.rating,
        note: feedback.note || '',
      };
    }
    return map;
  }, [vgmcStandingsRows, userFeedback]);

  useEffect(() => {
    if (!isVgmcStandingsPage) {
      // Closing the drawer is a reset tied to navigating away from the VGMC
      // page, not something read during this render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // Zeroing the footer scrubber on track change, ahead of the real
    // progress/duration the player reports once it loads (handleProgressUpdate
    // below) - a reset tied to currentVideo?.videoId changing, not derived
    // from anything read during this render.
    footerProgressRef.current = { currentTime: 0, duration: 0 };
    footerProgressListenersRef.current.forEach((listener) => listener());
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
  // isVideoRetired -> getCatalogTrackForVideo reads catalogTrackByVideoIdRef
  // as a fallback, deliberately - catalogTrackByVideoIdRef.current is
  // written eagerly and can be ahead of the catalogTrackByVideoId state,
  // which is committed via startTransition (see its setter's call site), so
  // reading state alone here could show a stale (non-)retired status.
  const isCurrentVideoRetired = currentVideo
    ? // eslint-disable-next-line react-hooks/refs
      isVideoRetired(currentVideo)
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

      // Kick off catalog in background, may already be loading from the warm
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
      // visible at this point, this just fills in titles/thumbnails.
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
      // Early-exit guard inside the same effect that otherwise subscribes to
      // supabase.auth.onAuthStateChange below - splitting this branch out
      // would duplicate the "no supabase client" condition for no benefit.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Same 'dashboard'-toned toast TopBar and HomePage both fire, as one
  // stable callback shared between them instead of each inlining its own
  // arrow function (which would defeat memoizing those components).
  const handleShowDashboardToneToast = useCallback(
    (message) => showDefaultAppToast(message, 'dashboard'),
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
    // Mount-time effect reacting to sessionStorage/URL state left behind by
    // the OAuth redirect, not to anything read during this render - these
    // just prep UI state ahead of the startDiscordOAuth call below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          videoId: normalizedVideoId,
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
      // Reset tied to the interval this same effect owns below (started only
      // while preview mode is on) - not something derivable from this
      // render alone.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // Restarts the countdown the effect above is ticking down, on track
      // change - same "tied to a sibling effect's timer" reasoning as its
      // own reset branch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      customOrderKindRef.current = null;
      setShuffleOrderIds([]);
      setCustomOrderKind(null);
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
  // *not* touch `playlist`, that's the user's own saved queue, and viewing/playing
  // the VGMC standings must never overwrite it. Leaving the VGMC view (Classic tab,
  // or playing something else) falls back to whatever the user actually had queued,
  // the same way leaving any community playlist already does.
  const handleLoadVgmcPlaylist = useCallback(async () => {
    // Loads once per session, after that, only the explicit Refresh button re-syncs.
    if (hasLoadedVgmcPlaylistRef.current) return;
    hasLoadedVgmcPlaylistRef.current = true;

    if (!supabase || !VGMC_PLAYLIST_ID) {
      // Nothing to load, don't leave the full-view loading overlay stuck up.
      setHasVgmcLoadedOnce(true);
      return;
    }

    setIsVgmcStandingsLoading(true);
    try {
      const rows = await fetchVgmcPlaylistTracks(supabase, VGMC_PLAYLIST_ID);
      setVgmcStandingsRows(rows);
      const videos = toPlaylistVideos(rows);
      if (videos.length > 0) {
        // Land on the first song (in nomination order) the user hasn't heard
        // yet, rather than always the very first nomination. Fetched fresh
        // and scoped to just this video set rather than trusting whatever's
        // already in listenedStatusById, that state's own full-history fetch
        // runs on a separate effect with no ordering guarantee relative to
        // this one, so relying on it here could easily race on a fresh load.
        let startVideoId;
        if (authUserIdRef.current) {
          try {
            const statusByVideoId = await fetchUserTrackListenStatuses(
              supabase,
              videos.map((video) => video.videoId),
            );
            if (Object.keys(statusByVideoId).length > 0) {
              startTransition(() => {
                setListenedStatusById((previousStatus) =>
                  mergeListenedStatuses(previousStatus, statusByVideoId),
                );
              });
            }
            startVideoId = videos.find(
              (video) => !statusByVideoId[video.videoId],
            )?.videoId;
          } catch (error) {
            reportError('Load VGMC listen status', error);
          }
        }

        handlePlayCommunityPlaylist(videos, {
          id: VGMC_PLAYLIST_ID,
          name: 'VGMC 20 Nominations',
          startVideoId,
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

      // Replace outright, `freshVideos` is already in true nomination order
      // (fetchVgmcPlaylistTracks orders by order_index), and a re-sync can add
      // posts *anywhere* in that order, not just at the end (an earlier page can
      // finish syncing after a later one, a removed nomination can get reposted,
      // etc.). An earlier append-only merge here preserved whatever order things
      // happened to be *discovered* in across repeated refreshes rather than the
      // order they were actually posted in, which is exactly the bug reported:
      // the playlist stopped matching the thread. Playback continuity doesn't
      // need special-casing to do this safely, the currently-playing video is
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
  // Shuffle and "move started to bottom" are mutually exclusive,each
  // handler always claims shuffleOrderIds as its own kind (bumping the
  // other off) when turning on, and clears it entirely when turning off, so
  // pressing one never leaves the other looking (or behaving) active.
  const handleShufflePlaylist = useCallback(() => {
    hasReachedPlaylistEndRef.current = false;

    if (customOrderKindRef.current === 'shuffle') {
      shuffleOrderIdsRef.current = [];
      customOrderKindRef.current = null;
      setShuffleOrderIds([]);
      setCustomOrderKind(null);
      setShowOriginalOrder(false);
      return;
    }

    // Shuffle whatever's actually playing right now, a transient
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
    // shuffling surfaces new nominations instead of ones you've already
    // heard,started/finished songs still get shuffled in, just sunk below
    // the not-started ones. Once every song has been started this collapses
    // into a single group, so it's a full shuffle of everything again.
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
    customOrderKindRef.current = 'shuffle';
    setShuffleOrderIds(nextShuffleOrderIds);
    setCustomOrderKind('shuffle');
    setShowOriginalOrder(false);
  }, [transientVideo, playingPlaylistView, listenedStatusById]);

  // Deterministic counterpart to shuffle,VGMC-only, sinks anything you've
  // already started or finished to the bottom, no randomizing, and always
  // acts on the VGMC playlist actually being viewed (the button only ever
  // renders while isVgmcPlaylistView is true, see PlaylistSidebar), not on
  // whatever happens to be playing elsewhere. Mutually exclusive with
  // shuffle,turning this on replaces any active shuffle order rather than
  // combining with it. Reuses the exact same shuffleOrderIds mechanism
  // shuffle does (advance logic, numbering-via-showOriginalOrder, etc. all
  // already handle "some non-default order is active" generically), so
  // nothing else needs to know these are different.
  const handleMoveListenedToBottom = useCallback(() => {
    hasReachedPlaylistEndRef.current = false;

    if (customOrderKindRef.current === 'listened') {
      shuffleOrderIdsRef.current = [];
      customOrderKindRef.current = null;
      setShuffleOrderIds([]);
      setCustomOrderKind(null);
      setShowOriginalOrder(false);
      return;
    }

    const sourceTracks = activePlaylistView.videos || [];
    const originalIds = sourceTracks.map((video) => video.videoId);
    if (originalIds.length < 2) return;

    const activeVideoId = transientVideo
      ? transientVideo.videoId
      : currentVideoIdRef.current;
    const pinnedVideoId =
      activeVideoId && originalIds.includes(activeVideoId)
        ? activeVideoId
        : originalIds[0];

    const nextOrderIds = moveListenedToBottom(
      originalIds,
      listenedStatusById,
      pinnedVideoId,
    );
    shuffleOrderIdsRef.current = nextOrderIds;
    customOrderKindRef.current = 'listened';
    setShuffleOrderIds(nextOrderIds);
    setCustomOrderKind('listened');
    setShowOriginalOrder(false);
  }, [activePlaylistView, transientVideo, listenedStatusById]);

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

  // Adapts the open/close handlers above onto the boolean-or-updater
  // setShowSupportList/setShowNominationsList API TopBar expects (mirroring a
  // useState setter), as stable callbacks - passing a fresh inline function
  // here every render would defeat memoizing TopBar.
  const handleSetShowSupportList = useCallback(
    (value) => {
      const nextValue =
        typeof value === 'function' ? value(showSupportList) : value;
      if (nextValue) {
        handleOpenSupportList();
      } else {
        handleRequestCloseSupportList();
      }
    },
    [showSupportList, handleOpenSupportList, handleRequestCloseSupportList],
  );

  const handleSetShowNominationsList = useCallback(
    (value) => {
      const nextValue =
        typeof value === 'function' ? value(showNominationsList) : value;
      if (nextValue) {
        handleOpenNominationsList();
      } else {
        handleRequestCloseNominationsList();
      }
    },
    [
      showNominationsList,
      handleOpenNominationsList,
      handleRequestCloseNominationsList,
    ],
  );

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
      // 1. Process updates and identify link/provider changes
      const processedUpdates = metadataUpdates.map((update) => {
        let finalVideoId = update.videoId;
        let finalProvider = update.provider || 'youtube';
        let finalUrl = update.currentUrl;

        if (
          update.videoUrl &&
          update.videoUrl.trim() &&
          update.videoUrl !== update.currentUrl
        ) {
          const parsed = parseMediaInput(update.videoUrl);
          if (parsed && parsed.videoId) {
            finalVideoId = parsed.videoId;
            finalProvider = parsed.provider || 'youtube';
            finalUrl = update.videoUrl;
          }
        }

        return {
          ...update,
          videoId: finalVideoId,
          provider: finalProvider,
          submittedUrl: finalUrl,
          hasChangedId: finalVideoId !== update.videoId,
        };
      });

      // 2. Fetch fresh metadata (any provider) for any track where the link changed
      const updatesWithYouTubeMeta = await Promise.all(
        processedUpdates.map(async (update) => {
          if (update.hasChangedId) {
            try {
              const { items } = await fetchMediaItems({
                provider: update.provider,
                videoId: update.videoId,
              });
              const meta = items[0];
              if (meta) {
                return {
                  ...update,
                  title: meta.title,
                  channelTitle: meta.channelTitle,
                  thumbnail: meta.thumbnail,
                };
              }
            } catch (err) {
              console.error(
                'Failed to fetch metadata for',
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
            const ingestResult = await ingestTrackSources(
              supabase,
              newTrackUpdates,
            );
            if (Array.isArray(ingestResult)) {
              ingestResult.forEach((row) => {
                if (row.external_id) {
                  trackIdByVideoId[row.external_id] = row.track_id;
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
                external_id_input: update.videoId,
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
                provider_input: update.provider || 'youtube',
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

  // Shared by every "needs metadata" banner (playlist sidebar, favourites
  // panels) so passing them down doesn't hand memoized components a fresh
  // function each render.
  const handleOpenMetadataBanner = useCallback(() => {
    setShowMetadataDialog(true);
  }, []);

  const handleDismissMetadataBanner = useCallback(() => {
    setTracksNeedingMetadata([]);
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
        customOrderKindRef.current = null;
        setCustomOrderKind(null);
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

  // The sidebar always shows whichever list is "active" (personal queue,
  // nominations, support, or a custom playlist), so reorder/remove need to
  // route to that list's own state. Stable callbacks - PlaylistSidebar is
  // memoized and always mounted, so a fresh inline function here would
  // defeat that on every render.
  const handleReorderActivePlaylistView = useCallback(
    (newTracks) => {
      // A "community-playlist" view is still one of *this* user's own
      // customPlaylists when its id matches one - same ownership check as
      // PlaylistSidebar's isOwnPlaylistViaCommunity, which is what enables
      // the drag handles that get a reorder here in the first place. Route
      // it the same place "custom-playlist" already does (by id), not the
      // fallback below, that's the personal queue and would silently
      // reorder the wrong list.
      const isOwnPlaylistViaCommunity =
        activePlaylistView.type === 'community-playlist' &&
        customPlaylists.some((p) => p.id === activePlaylistView.id);

      if (activePlaylistView.type === 'nominations') {
        handleReorderNominationList(newTracks);
      } else if (activePlaylistView.type === 'support') {
        handleReorderSupportList(newTracks);
      } else if (
        activePlaylistView.type === 'custom-playlist' ||
        isOwnPlaylistViaCommunity
      ) {
        setCustomPlaylists((prev) =>
          prev.map((p) =>
            p.id === activePlaylistView.id ? { ...p, videos: newTracks } : p,
          ),
        );
      } else {
        handleReorderPlaylist(newTracks);
      }
    },
    [
      activePlaylistView.type,
      activePlaylistView.id,
      customPlaylists,
      handleReorderNominationList,
      handleReorderSupportList,
      handleReorderPlaylist,
    ],
  );

  const handleRemoveFromActivePlaylistView = useCallback(
    (videoIdsOrId) => {
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
    },
    [activePlaylistView.type, activePlaylistView.id, handleRemoveFromPlaylist],
  );

  const handlePlaylistSidebarToggleCollapse = useCallback(() => {
    if (isPlayerLikePage) {
      setIsPlaylistCollapsed((previousValue) => !previousValue);
      return;
    }
    setIsDesktopOverlayPlaylistOpen((previousValue) => !previousValue);
  }, [isPlayerLikePage]);

  // The common shape every support dropdown trigger wants (HomePage,
  // ListExplorer, PlaylistSidebar, the support favourites panel): default
  // placement/remove-affordance, overridable via an optional 3rd arg. One
  // stable callback shared between them instead of each inlining its own
  // arrow function, which would defeat memoizing whichever of them are
  // memoized.
  const handleOpenSupportDropdown = useCallback((video, position, options) => {
    setSupportLevelDropdown({
      video,
      position,
      direction: 'down',
      showRemove: false,
      ...options,
    });
  }, []);

  // Shared opener for the "Add to Playlist" popover, same shape as
  // handleOpenSupportDropdown above - one stable callback threaded to every
  // playback-view trigger (VideoPlayer, the detached footer) instead of each
  // inlining its own arrow function.
  const handleOpenAddToPlaylistDropdown = useCallback(
    (videos, position, options) => {
      setAddToPlaylistDropdown({
        videos,
        position,
        direction: 'down',
        ...options,
      });
    },
    [],
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

  // Which list (if any) `video` actually lives in right now, so a transient
  // "play this now" can put the app back into that list's own view instead
  // of leaving playingPlaylistView pointed at whatever it last happened to
  // be (see the bug this fixes: clicking "previous track" played the right
  // song, but once it ended playback fell into the personal queue instead
  // of continuing through the nominations/support/custom playlist it was
  // actually playing from, in that list's own displayed order).
  const resolveSourceViewForVideo = useCallback(
    (video) => {
      if (!video?.videoId) return null;
      if (enrichedNominationList.some((v) => v.videoId === video.videoId)) {
        return { type: 'nominations' };
      }
      if (enrichedSupportList.some((v) => v.videoId === video.videoId)) {
        return { type: 'support' };
      }
      const owningCustomPlaylist = customPlaylists.find((pl) =>
        (pl.videos || []).some((v) => v.videoId === video.videoId),
      );
      if (owningCustomPlaylist) {
        return { type: 'custom-playlist', id: owningCustomPlaylist.id };
      }
      return null;
    },
    [enrichedNominationList, enrichedSupportList, customPlaylists],
  );

  const handlePlayNowFromSupportList = useCallback(
    (video) => {
      const baseVideo = applyCatalogMetadataToVideo(video);
      hasReachedPlaylistEndRef.current = false;
      const resolvedPlayOrderIds = resolvePlayOrderIds(
        playlistRef.current,
        shuffleOrderIdsRef.current,
      );
      const activeVideoId = currentVideoIdRef.current;
      let nextVideo = baseVideo;

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

        // Not already mid-way through some other list's transient session,
        // so this is the moment to (re)establish which list this video is
        // actually playing from -- matching the order the user currently
        // sees it in (nominations/support sort, custom playlist order,
        // etc.), not the queue's. If it doesn't live in any of those, it's
        // a one-off (e.g. VGMC standings), so make sure a stale view from
        // an earlier session isn't left lingering.
        const resolvedSourceView = resolveSourceViewForVideo(baseVideo);
        setPlayingPlaylistView(resolvedSourceView || { type: 'personal' });

        // handleNext/handleVideoEnd only keep advancing within the transient
        // list (instead of falling back to the queue) when the transient
        // video's own `source` marks it as belonging to one -- the exact
        // same `${type}-view` convention handleSidebarSelect and
        // handlePlayCommunityPlaylist already tag their videos with. Without
        // this, the song shown/played is right, but it plays as an
        // untagged one-off, so the moment it ends playback falls through to
        // the queue instead of continuing through this list.
        if (resolvedSourceView) {
          nextVideo = {
            ...baseVideo,
            source: `${resolvedSourceView.type}-view`,
          };
        }
      } else {
        // Already mid a transient session (e.g. clicking "previous" again
        // while deep in Nominations) -- carry that same session's source
        // (and community-view user id, if any) onto the new video so
        // advancement keeps working. playingPlaylistView already correctly
        // names this session and must not be reset here.
        nextVideo = {
          ...baseVideo,
          source: transientVideo.source,
          communityUserId: transientVideo.communityUserId,
        };
      }

      setTransientVideo(nextVideo);
      setIsPlaying(true);
      markVideoStarted(nextVideo.videoId);
    },
    [
      applyCatalogMetadataToVideo,
      isPlaying,
      transientVideo,
      markVideoStarted,
      resolveSourceViewForVideo,
    ],
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
  // per-user setting) whenever VGMC_LIVE_SUPPORTS_ENABLED is on, fires once per
  // session, and never fights a deep link or the user's own later navigation
  // back to Classic, since it only ever fires while still on the default 'home'
  // page.
  //
  // The site loads into the normal home page first, behind a full-screen loading
  // overlay (see hasVgmcLoadedOnce below), navigation to the VGMC page itself only
  // happens *after* the playlist has fully loaded, not before. Mounting the VGMC
  // page's tree while data was still arriving was the source of it rendering blank,
  // deferring the page switch until everything's ready sidesteps that entirely.
  //
  // The load itself always runs, flag or no flag - vgmcStandingsRows still feeds
  // the (separately-gated) home page badges, and the loading overlay's own
  // gate is "has this resolved at all", not "did it redirect", so skipping the
  // fetch outright here would leave that overlay stuck up forever with the
  // flag off. Only the redirect at the end is conditional.
  useEffect(() => {
    if (hasAutoNavigatedToVgmcRef.current) return;
    if (!VGMC_PLAYLIST_ID) return;
    if (activePageRef.current !== 'home') return;
    // A shared list link (below) is an explicit destination the visitor
    // clicked their way in on, it always wins over the generic default
    // landing page, rather than racing it for which navigate() lands last.
    if (sharedListLinkRef.current) return;

    hasAutoNavigatedToVgmcRef.current = true;
    handleLoadVgmcPlaylist().then(() => {
      if (VGMC_LIVE_SUPPORTS_ENABLED) {
        handleNavigate('vgmcStandings');
      }
    });
  }, [handleNavigate, handleLoadVgmcPlaylist]);

  // Opens a shared-link URL (a `?playlist=<uuid>` from buildPlaylistShareUrl
  // in lib/communityPlaylists.js, or a `?nominations=<uuid>` /
  // `?supports=<uuid>` from the companion Discord bot's "Open in NomPlayer"
  // buttons, see lib/sharedUserLists.js) straight into the player, the same
  // transient "now playing" mechanism used for browsing a community
  // playlist, without touching the visitor's own saved queue. Runs once,
  // same shape as the VGMC auto-navigate effect just above, and takes
  // priority over it for where a fresh page load lands.
  useEffect(() => {
    const sharedListLink = sharedListLinkRef.current;
    if (hasLoadedSharedListLinkRef.current) return;
    if (!sharedListLink) return;

    hasLoadedSharedListLinkRef.current = true;

    (async () => {
      try {
        if (!supabase) {
          // Nothing to load, don't leave the full-view loading overlay
          // stuck up forever waiting on a fetch that's never going to
          // happen (see handleLoadVgmcPlaylist's identical guard, above).
          showDefaultAppToast('Failed to load that shared link.');
          return;
        }

        if (sharedListLink.type === 'playlist') {
          const meta = await fetchPlaylistMeta(supabase, sharedListLink.id);
          if (!meta) {
            showDefaultAppToast(
              "That playlist link is private, or doesn't exist anymore.",
            );
            return;
          }

          const videos = await fetchPlaylistTracks(supabase, sharedListLink.id);
          if (!videos.length) {
            showDefaultAppToast('This playlist has no tracks yet.');
            return;
          }

          handlePlayCommunityPlaylist(videos, { id: meta.id, name: meta.name });
          handleNavigate('player');
          return;
        }

        // 'nominations' | 'supports' - sharedListLink.id is a user id here,
        // not a list id, there's only ever one nomination/support list per
        // user so there's nothing else it could point at.
        const lists = await fetchUserPublicLists(supabase, sharedListLink.id);
        if (!lists) {
          showDefaultAppToast("That share link doesn't exist anymore.");
          return;
        }

        const isNominations = sharedListLink.type === 'nominations';
        // get_user_public_lists (see lib/sharedUserLists.js) returns each
        // track's stored source_thumbnail_url as-is, which is empty for
        // tracks that never had one scraped (e.g. some GameFaqs-sourced
        // nominations) - enrichedNominationList/enrichedSupportList (above)
        // fall back to a thumbnail derived from the video ID itself
        // (catalogEntry?.sourceThumbnailUrl || item.thumbnail ||
        // getYouTubeThumbnailUrl(...)) for the same reason, this is that
        // same fallback applied here so shared nomination/support links
        // don't come back with blank thumbnails.
        const videos = (
          isNominations ? lists.nominationList : lists.supportList
        ).map((video) => ({
          ...video,
          thumbnail: video.thumbnail || getYouTubeThumbnailUrl(video.videoId),
        }));
        if (!videos.length) {
          showDefaultAppToast(
            `${lists.username} doesn't have any ${isNominations ? 'nominations' : 'supports'} yet.`,
          );
          return;
        }

        handlePlayCommunityPlaylist(videos, {
          id: `${sharedListLink.type}-${sharedListLink.id}`,
          name: isNominations
            ? `${lists.username}'s Nominations`
            : `${lists.username}'s Support List`,
        });
        handleNavigate('player');
      } catch (error) {
        reportError('Load shared list link', error);
        showDefaultAppToast('Failed to load that shared link.');
      } finally {
        // The full-view loading overlay (see hasVgmcLoadedOnce, below) waits
        // on this the same way it waits on handleLoadVgmcPlaylist, without
        // this the VGMC auto-navigate effect above (skipped whenever a
        // shared link is present) would otherwise have been the only thing
        // that ever clears it, leaving the overlay stuck up permanently.
        setHasVgmcLoadedOnce(true);
        stripSharedListParamFromUrl();
      }
    })();
  }, [
    supabase,
    handlePlayCommunityPlaylist,
    handleNavigate,
    showDefaultAppToast,
  ]);

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

  // Stable handlers for the mobile nav toggle, passed to both SiteNavigation
  // and TopBar - inlining these at each call site (as they were previously)
  // hands memoized children a new function every render, defeating the memo.
  const handleToggleMobileNav = useCallback(() => {
    setIsMobileNavOpen((previousValue) => !previousValue);
  }, []);

  const handleCloseMobileNav = useCallback(() => {
    setIsMobileNavOpen(false);
  }, []);

  const [explorerInitialView, setExplorerInitialView] = useState('lists');
  // Only the nomination-feedback entry point (below) wants the Comments &
  // Ratings page to land with "My Nominations" pre-selected - every other
  // way into the explorer should reset it, same as explorerInitialView.
  const [
    explorerInitialFilterNominations,
    setExplorerInitialFilterNominations,
  ] = useState(false);

  // Community Playlists is its own top-level page now (see NAV_ITEMS in
  // SiteNavigation) rather than an explorerInitialView preset - it no
  // longer shares activePage with 'listExplorer', so the shared render
  // block below derives its initialView from activePage directly.
  const handleNavigateToCommunityPlaylists = useCallback(() => {
    setExplorerInitialFilterNominations(false);
    handleNavigate('communityPlaylists');
  }, [handleNavigate]);

  // SiteNavigation dispatches every nav item through the same onNavigate(id)
  // callback, so route its 'communityPlaylists' click through the same
  // handler as every other entry point into that page (PlaylistSidebar,
  // HomePage's dashboard card) instead of calling handleNavigate directly.
  const handleSiteNavigate = useCallback(
    (page) => {
      if (page === 'communityPlaylists') {
        handleNavigateToCommunityPlaylists();
      } else {
        handleNavigate(page);
      }
    },
    [handleNavigate, handleNavigateToCommunityPlaylists],
  );

  const handleNavigateToExplorer = useCallback(() => {
    setExplorerInitialView('lists');
    setExplorerInitialFilterNominations(false);
    handleNavigate('listExplorer');
  }, [handleNavigate]);

  const handleNavigateToExplorerComments = useCallback(() => {
    setExplorerInitialView('comments');
    setExplorerInitialFilterNominations(false);
    handleNavigate('listExplorer');
  }, [handleNavigate]);

  // VGMC standings page's "Check your Nomination feedback" button - same
  // Comments & Ratings view as handleNavigateToExplorerComments, but also
  // pre-selects the "My Nominations" filter within AllFeedbackView so
  // nominators land straight on feedback for tracks they nominated.
  const handleNavigateToNominationFeedback = useCallback(() => {
    setExplorerInitialView('comments');
    setExplorerInitialFilterNominations(true);
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
  // previousDetachedFooterIntentRef/isPlayingRef are deliberately read here
  // for their previous-render values (both are only written inside effects,
  // one render after the state they mirror changes) - this is detecting a
  // transition, the same "was true, now false" comparison
  // previousDetachedFooterIntentRef exists for, so swapping in the current
  // isPlaying state would change what's being compared.
  /* eslint-disable react-hooks/refs */
  const isCurrentlyBecomingDetached =
    shouldShowDetachedFooter &&
    !previousDetachedFooterIntentRef.current &&
    !isPlayingRef.current;
  /* eslint-enable react-hooks/refs */
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
  const currentVideoDisplayTitle = getVideoDisplayTitle(currentVideo);

  const currentVideoHasFeedback = useMemo(() => {
    if (!currentVideo?.videoId) return false;
    return globalActivityByVideoId.has(currentVideo.videoId);
  }, [currentVideo?.videoId, globalActivityByVideoId]);

  const handleProgressUpdate = useCallback(({ currentTime, duration }) => {
    footerProgressRef.current = { currentTime, duration };
    footerProgressListenersRef.current.forEach((listener) => listener());
  }, []);

  const handleSeek = useCallback((e) => {
    const newTime = parseFloat(e.target.value);
    footerProgressRef.current = {
      ...footerProgressRef.current,
      currentTime: newTime,
    };
    footerProgressListenersRef.current.forEach((listener) => listener());
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
        isShuffleAvailable={isShuffleAvailable}
        onShuffle={handleShufflePlaylist}
        isPreviewModeEnabled={isPreviewModeEnabled}
        previewCountdown={previewCountdown}
        onTogglePreview={handleTogglePreviewMode}
        canTogglePlayback={canTogglePlayback}
        isControlsBelowPlayer={isPlaybackControlsBelowPlayer}
        onToggleControlsPosition={handleToggleControlsPosition}
        isSupported={isCurrentVideoSupported}
        onOpenSupportDropdown={(video, position, options) =>
          setSupportLevelDropdown({ video, position, ...options })
        }
        onOpenAddToPlaylistDropdown={handleOpenAddToPlaylistDropdown}
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
        onOpenVgmcSheetSync={
          isVgmcStandingsPage ? () => setIsVgmcSheetSyncOpen(true) : undefined
        }
        onOpenNominationFeedback={
          isVgmcStandingsPage ? handleNavigateToNominationFeedback : undefined
        }
        supabase={supabase}
        authUser={authUser}
        userProfile={userProfile}
        onShowToast={showDefaultAppToast}
        onFeedbackSaved={handleFeedbackSaved}
        previousTrack={previousTrack}
        onShowComments={handleShowComments}
        // handlePlayNowFromSupportList is the app's generic "play now"
        // handler (see VgmcStandingsView) -- it plays this transiently and
        // remembers whatever was actually playing so it resumes once this
        // ends, so replaying the previous track never disturbs the real
        // queue/position.
        onPlayPreviousTrack={handlePlayNowFromSupportList}
        vgmcSupportPointsByVideoId={vgmcSupportPointsByVideoId}
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
                title={
                  isPlaying
                    ? currentVideo?.provider === 'soundcloud'
                      ? 'Stop'
                      : 'Pause'
                    : 'Play'
                }
              >
                {isPlaying ? (
                  currentVideo?.provider === 'soundcloud' ? (
                    <StopIcon />
                  ) : (
                    <PauseIcon />
                  )
                ) : (
                  <PlayIcon />
                )}
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
            <FooterProgressBar
              progressRef={footerProgressRef}
              subscribe={subscribeFooterProgress}
              onSeek={handleSeek}
            />
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
              <PlayPlusIcon />
            </button>

            <button
              className="btn btn-icon add-to-custom-playlist-btn detached-footer-add-to-custom-playlist-btn"
              type="button"
              onClick={(event) => {
                if (!currentVideo) return;
                const rect = event.currentTarget.getBoundingClientRect();
                setAddToPlaylistDropdown({
                  videos: [currentVideo],
                  position: {
                    top: rect.top,
                    left: rect.left + rect.width / 2,
                  },
                  direction: 'up',
                });
              }}
              aria-label="Add to Playlist"
              title="Add to Playlist"
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
      {(VGMC_PLAYLIST_ID || sharedListLinkFromUrl) && !hasVgmcLoadedOnce && (
        // Full-screen splash while either the default VGMC 20 landing or a
        // shared link (see the two effects above) loads, the site mounts
        // into the normal home page underneath this the whole time; we only
        // navigate to the destination page once loading is completely done,
        // and this comes down at the same moment - both effects resolve
        // through the same hasVgmcLoadedOnce flag. Wording follows whichever
        // of the two is actually happening, a shared link never lands on
        // the VGMC page so it shouldn't claim to.
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
          <div className="database-loading-text">
            {sharedListLinkFromUrl ? 'Loading NomPlayer…' : 'Loading VGMC 20…'}
          </div>
        </div>
      )}

      {!isMobileLayout && (
        <SiteNavigation
          activePage={activePage}
          onNavigate={handleSiteNavigate}
          authUser={authUser}
        />
      )}

      {isMobileLayout && (
        <SiteNavigation
          isMobile
          activePage={activePage}
          onNavigate={handleSiteNavigate}
          authUser={authUser}
          isMenuOpen={isMobileNavOpen}
          onToggleMenu={handleToggleMobileNav}
          onCloseMenu={handleCloseMobileNav}
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
          isControlsBelowPlayer={isPlaybackControlsBelowPlayer}
          onToggleControlsPosition={handleToggleControlsPosition}
          showSupportList={showSupportList}
          setShowSupportList={handleSetShowSupportList}
          showNominationsList={showNominationsList}
          setShowNominationsList={handleSetShowNominationsList}
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
          onNavigateToPlayer={handleNavigateToPlayer}
          authUser={authUser}
          userProfile={userProfile}
          isAuthAvailable={isSupabaseConfigured}
          onOpenAuthDialog={handleOpenAuthDialog}
          onOpenHistory={handleOpenHistory}
          onOpenSettings={handleOpenSettings}
          onLogout={handleLogout}
          isMenuOpen={isMobileNavOpen}
          onToggleMenu={handleToggleMobileNav}
          onExport={handleOpenExportModal}
          onSavePlaylist={handleCreateYTPlaylist}
          customPlaylists={customPlaylists}
          onUpdateCustomPlaylists={setCustomPlaylists}
          onShowToast={handleShowDashboardToneToast}
          nominationList={nominationList}
          supportList={supportList}
          onToggleNomination={handleToggleNominationFromPlaylist}
          onToggleSupport={handleToggleSupportFromPlaylist}
        />

        <main
          className={`main-content${isPlayerLikePage ? ' player-view' : isDatabasePage || isListExplorerPage ? ' home-view' : ' home-view'}${isListExplorerPage || isCommunityPlaylistsPage ? ' list-explorer-view' : ''}${!isPlayerLikePage && isLogoutTransitioning ? ' logout-fade-in' : ''}${hasDetachedFooter && !isPlayerLikePage ? ' has-persistent-player' : ''}`}
          id="main-content"
        >
          {/*
            main-content is `display: flex` with no flex-direction set, i.e. a row
            (see .main-content / .main-content.player-view in index.css), that was
            never a problem when the player was its only real child. Now that a
            persistent nav toggle (and, on the VGMC page, a standings table) needs to
            stack *above* that content instead of sitting beside it, everything below
            is wrapped in one explicit flex-column container. main-content's own
            row/stretch rules then apply to just this single wrapper (harmless, a
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
            {VGMC_PLAYLIST_ID && VGMC_LIVE_SUPPORTS_ENABLED && (
              // Normal flow, reserves its own row so every page's content (the
              // hero, the VGMC split, etc.) renders below it, never under it.
              // Gated on the flag too, not just the playlist id - this button
              // (and the auto-redirect above) are the only two ways in to the
              // VGMC standings page, so with the flag off there's nothing left
              // to point at it with.
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 16px',
                  position: 'relative',
                  // The attention glow below bleeds 34px past the button in every
                  // direction (see .vgmc-toggle-attention-glow), past this row's own
                  // padding and into the page content stacked below it. That content
                  // is also position:relative with no z-index of its own, so without
                  // this the two sit in the same stacking layer and paint in DOM
                  // order - content wins where the glow spills over it. Explicit
                  // z-index here lifts the whole row (button included) above that.
                  zIndex: 1,
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
              flexDirection toggling row/column for the VGMC split, deliberately
              *not* two separately-branched trees like this used to be. Each
              possible child is `key`ed and conditionally rendered side-by-side in
              the same container, so the persistent-player child (key
              "persistent-player") stays the same node across every navigation
              (Home <-> VGMC, VGMC desktop <-> mobile, etc.) instead of being
              unmounted and remounted, that unmount was what silently reloaded
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
                    // Floor is the standings table's own min-width (320px,
                    // see .vgmc-standings-table in index.css) plus
                    // VgmcStandingsView's 16px horizontal padding on each side
                    // (now border-box, so that's included rather than added
                    // on top - see VgmcStandingsView), plus a 16px safety
                    // margin so the table never lands exactly on its own
                    // floor. `overflow: hidden` below means this wrapper
                    // won't grow to fit its content on its own (that's what
                    // the default flex min-content sizing would otherwise
                    // do), so the floor has to be set explicitly here rather
                    // than left to the child to enforce.
                    minWidth: '368px',
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

              {!isPlayerLikePage &&
                !isDatabasePage &&
                !isListExplorerPage &&
                !isCommunityPlaylistsPage && (
                  <div
                    key="home-page"
                    style={{ flex: '1 1 auto', minHeight: 0 }}
                  >
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
                      onOpenSupportDropdown={handleOpenSupportDropdown}
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
                      onOpenNominationsAdding={
                        handleOpenNominationsWithHighlight
                      }
                      onShowToast={handleShowDashboardToneToast}
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
                      vgmcStandingsRows={vgmcStandingsRows}
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
                      /* dbCacheRef deliberately isn't state: it exists so
                         TrackDatabase's tracks/selection survive it
                         unmounting (leaving the database page) without
                         re-rendering this whole app component on every
                         internal change - see onUnmount, which is the only
                         writer. */
                      /* eslint-disable react-hooks/refs */
                      initialTracks={dbCacheRef.current.tracks}
                      initialSelectedVideoId={
                        dbCacheRef.current.selectedVideoId
                      }
                      /* eslint-enable react-hooks/refs */
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

              {(isListExplorerPage || isCommunityPlaylistsPage) && (
                <div
                  // Both pages render the same ListExplorer component, just
                  // landed on a different explorerView - keyed by page so
                  // switching between them remounts it and picks up the
                  // fresh initialView below (ListExplorer only reads that
                  // prop once, on mount).
                  key={
                    isCommunityPlaylistsPage
                      ? 'community-playlists-page'
                      : 'list-explorer-page'
                  }
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
                    onOpenSupportDropdown={handleOpenSupportDropdown}
                    onExport={handleOpenExportModal}
                    onSavePlaylist={handleCreateYTPlaylist}
                    onPlayExplorerList={handlePlayExplorerList}
                    onPlayCommunityListFromTrack={
                      handlePlayCommunityListFromTrack
                    }
                    onPlayCommunityPlaylist={handlePlayCommunityPlaylist}
                    catalogTrackByVideoId={catalogTrackByVideoId}
                    vgmcSupportPointsByVideoId={vgmcSupportPointsByVideoId}
                    initialView={
                      isCommunityPlaylistsPage
                        ? 'community-playlists'
                        : explorerInitialView
                    }
                    initialFilterNominations={explorerInitialFilterNominations}
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
              onMoveListenedToBottom={handleMoveListenedToBottom}
              isListenedToBottomActive={isListenedToBottomActive}
              onTogglePreview={handleTogglePreviewMode}
              onToggleCollapse={handlePlaylistSidebarToggleCollapse}
              onToggleOrderView={handleTogglePlaylistOrderView}
              onSelect={handleSidebarSelect}
              onReorder={handleReorderActivePlaylistView}
              supportList={supportList}
              nominationList={nominationList}
              listenedStatusById={listenedStatusById}
              onToggleSupport={handleToggleSupportFromPlaylist}
              onToggleNomination={handleToggleNominationFromPlaylist}
              onOpenSupportDropdown={handleOpenSupportDropdown}
              onRemoveFromPlaylist={handleRemoveFromActivePlaylistView}
              onAddDirectItems={handleQueueFromSupportList}
              onAddDirectToCustomPlaylist={
                activePlaylistView.type === 'custom-playlist'
                  ? handleAddDirectToCustomPlaylist
                  : null
              }
              retiredVideoIds={retiredVideoIds}
              pendingMetadataCount={tracksNeedingMetadata.length}
              onOpenMetadataDialog={handleOpenMetadataBanner}
              onDismissMetadataBanner={handleDismissMetadataBanner}
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
              onNavigateToCommunityPlaylists={
                handleNavigateToCommunityPlaylists
              }
              customPlaylists={customPlaylists}
              onUpdateCustomPlaylists={setCustomPlaylists}
              onShowToast={handleShowDashboardToneToast}
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
          supabase={supabase}
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
          emptyHint="Double-click an item to queue it, or right-click for Play Now, Add to My Queue, and Remove Support."
          itemAriaPrefix="Support"
          removeButtonTitle="Remove from support list"
          removeButtonAriaLabel="Remove from support list"
          contextRemoveLabel="Remove Support"
          closeLabel="Close support list"
          addButtonLabel="Add Supports"
          onAddDirectItems={handleAddManyToSupportList}
          pendingMetadataCount={tracksNeedingMetadata.length}
          onOpenMetadataDialog={handleOpenMetadataBanner}
          onDismissMetadataBanner={handleDismissMetadataBanner}
          onUpdateMetadata={handleOpenMetadataUpdate}
          onOpenSupportDropdown={handleOpenSupportDropdown}
          authUser={authUser}
          onExport={handleOpenExportModal}
          onSavePlaylist={handleCreateYTPlaylist}
          onPlayList={() => handlePlayExplorerList('support')}
          globalActivityByVideoId={globalActivityByVideoId}
          onShowComments={handleShowComments}
          customPlaylists={customPlaylists}
          onUpdateCustomPlaylists={setCustomPlaylists}
          visibleSupportLevels={supportListVisibleLevels}
          onVisibleSupportLevelsChange={setSupportListVisibleLevels}
          sortState={supportListSortState}
          onSortStateChange={setSupportListSortState}
        />
      )}

      {renderNominationsList && (
        <FavouritesPanel
          supabase={supabase}
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
          onOpenMetadataDialog={handleOpenMetadataBanner}
          onDismissMetadataBanner={handleDismissMetadataBanner}
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
          sortState={nominationListSortState}
          onSortStateChange={setNominationListSortState}
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
          currentLevel={
            supportLevelDropdown.supportLevel ??
            supportLevelDropdown.video?.supportLevel ??
            1
          }
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

      {addToPlaylistDropdown && (
        <AddToPlaylistDropdown
          videos={addToPlaylistDropdown.videos}
          position={addToPlaylistDropdown.position}
          direction={addToPlaylistDropdown.direction}
          customPlaylists={customPlaylists}
          onUpdateCustomPlaylists={setCustomPlaylists}
          onShowToast={showDefaultAppToast}
          onClose={() => setAddToPlaylistDropdown(null)}
        />
      )}

      <ExportVgmcModal
        isOpen={isExportModalOpen}
        tracks={exportTracks}
        onClose={handleRequestCloseExportModal}
      />

      <VgmcSheetSyncPanel
        isOpen={isVgmcSheetSyncOpen}
        onClose={() => setIsVgmcSheetSyncOpen(false)}
        supabase={supabase}
        feedbackByVideoId={vgmcFeedbackByVideoId}
      />

      {isFeedbackPanelOpen &&
        (feedbackTrack || currentVideo) &&
        (() => {
          const feedbackPanelTrack = feedbackTrack || currentVideo;
          // Nominated tracks can't be supported (handleToggleSupportFromPlaylist
          // no-ops on them), so the "Your Support" control only makes sense, and
          // only renders (see onSetSupportLevel in FooterFeedbackPanel), when the
          // open track isn't one of those.
          const feedbackPanelIsNominated = nominationList.some(
            (entry) => entry.videoId === feedbackPanelTrack.videoId,
          );
          const feedbackPanelSupportLevel = feedbackPanelIsNominated
            ? 0
            : supportList.find(
                (entry) => entry.videoId === feedbackPanelTrack.videoId,
              )?.supportLevel || 0;

          return (
            <ModalPortal>
              <FooterFeedbackPanel
                track={feedbackPanelTrack}
                supabase={supabase}
                authUser={authUser}
                userProfile={userProfile}
                anchorRect={feedbackPosition}
                initialIsEditing={isFeedbackForcedEdit}
                onClose={handleCloseFeedbackPanel}
                onShowToast={showDefaultAppToast}
                onUpdate={refreshUserFeedback}
                onFeedbackSaved={handleFeedbackSaved}
                supportLevel={feedbackPanelSupportLevel}
                onSetSupportLevel={
                  feedbackPanelIsNominated
                    ? undefined
                    : // This callback only ever runs later, from
                      // FooterFeedbackPanel's own event handlers, never
                      // during this render - the compiler is tracing the ref
                      // read inside handleToggleSupportFromPlaylist's own
                      // call chain (partitionRetiredVideos -> isVideoRetired
                      // -> catalogTrackByVideoIdRef, see the disabled line
                      // near isCurrentVideoRetired above) through to here.
                      /* eslint-disable react-hooks/refs */
                      (level) =>
                        handleToggleSupportFromPlaylist(
                          feedbackPanelTrack,
                          level,
                        )
                  /* eslint-enable react-hooks/refs */
                }
                vgmcSupportPointsByVideoId={vgmcSupportPointsByVideoId}
              />
            </ModalPortal>
          );
        })()}
    </div>
  );
}
