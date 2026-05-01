import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DiscordIcon from './DiscordIcon.jsx';
import ScrollingText from './ScrollingText.jsx';
import { getYouTubeThumbnailUrl } from '../utils/youtube.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import {
  buildDiscoveryCandidates,
  fetchDashboardNominationUpdates,
  getFastSpotlightCandidate,
  loadStaticNominationUpdates,
  pickNextDiscoveryCandidate,
} from '../lib/dashboard.js';
import {
  getDisplayProfileName,
  parseStoredProfileUsername,
} from '../lib/playerState.js';
import {
  fetchPagedTracks,
  mapTrackCatalogEntryToVideo,
  fetchRandomUnplacedVgmcTrack,
  fetchTrackCatalogByVideoIds,
  fetchMaxVgmcNumber,
} from '../lib/trackCatalog.js';
import ThreeDCarousel from './ThreeDCarousel.jsx';
import { ContextMenuPortal } from './ContextMenuPortal.jsx';
import TiltedCard from './TiltedCard.jsx';
import DiscoveryMarqueeGrid from './DiscoveryMarqueeGrid.jsx';
import {
  HeartIcon,
  LockIcon,
  MusicIcon,
  SearchIcon,
  DatabaseIcon,
  PlaylistPlusIcon,
  PlayIcon,
  SpeechBubbleIcon,
  StarIcon,
  UsersIcon,
} from './Icons.jsx';

import { AnimatedGridPattern } from './AnimatedGridPattern.jsx';
import TextType from './TextType.jsx';
import Dock from './Dock.jsx';
import CustomPlaylistSubmenu from './CustomPlaylistSubmenu.jsx';
const DASHBOARD_REFRESH_LIMIT = 8;
const HOME_CPL_PAGE_SIZE = 12;

const HOME_CPL_GRADIENTS = [
  ['#7c3aed', '#3b1d6e'],
  ['#0ea5e9', '#1d4ed8'],
  ['#f59e0b', '#92400e'],
  ['#10b981', '#0ea5e9'],
  ['#ec4899', '#7c3aed'],
  ['#ef4444', '#7c3aed'],
  ['#6366f1', '#ec4899'],
  ['#f472b6', '#f59e0b'],
  ['#1d4ed8', '#10b981'],
  ['#38bdf8', '#7c3aed'],
];

function homeCplGradient(id = '') {
  const num = parseInt(id.replace(/-/g, '').slice(0, 8), 16) || 0;
  const [a, b] = HOME_CPL_GRADIENTS[Math.abs(num) % HOME_CPL_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function homeCplTimeAgo(dateStr) {
  const d = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  if (d < 1) return 'today';
  if (d < 2) return '1d ago';
  if (d < 7) return `${Math.floor(d)}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

async function fetchHomeCplPage(supabase, authUserId, page) {
  let query = supabase
    .from('user_playlists')
    .select(
      'id, name, is_public, created_at, user_id, user_playlist_tracks(count)',
    )
    .eq('is_active_queue', false)
    .order('created_at', { ascending: false })
    .range(page * HOME_CPL_PAGE_SIZE, (page + 1) * HOME_CPL_PAGE_SIZE - 1);

  if (authUserId) {
    query = query.or(`is_public.eq.true,user_id.eq.${authUserId}`);
  } else {
    query = query.eq('is_public', true);
  }

  const { data: rawPls, error } = await query;
  if (error) throw error;

  const playlistIds = (rawPls || []).map((p) => p.id);
  const userIds = [...new Set((rawPls || []).map((p) => p.user_id))];
  let profileMap = {};
  let thumbnailMap = {};

  await Promise.all([
    userIds.length > 0 &&
      supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds)
        .then(({ data }) => {
          (data || []).forEach((p) => {
            profileMap[p.id] = p;
          });
        }),
    playlistIds.length > 0 &&
      supabase
        .from('user_playlist_tracks')
        .select(
          'playlist_id, order_index, tracks(track_sources(external_id, cached_thumbnail_url, is_primary))',
        )
        .in('playlist_id', playlistIds)
        .order('order_index', { ascending: true })
        .limit(playlistIds.length * 5)
        .then(({ data }) => {
          for (const pt of data || []) {
            if (thumbnailMap[pt.playlist_id]) continue;
            const src =
              pt.tracks?.track_sources?.find((s) => s.is_primary) ??
              pt.tracks?.track_sources?.[0];
            if (src) {
              thumbnailMap[pt.playlist_id] =
                src.cached_thumbnail_url ||
                `https://i.ytimg.com/vi/${src.external_id}/mqdefault.jpg`;
            }
          }
        }),
  ]);

  return (rawPls || []).map((pl) => ({
    ...pl,
    trackCount: Number(pl.user_playlist_tracks?.[0]?.count ?? 0),
    profile: profileMap[pl.user_id] || null,
    firstThumbnail: thumbnailMap[pl.id] || null,
  }));
}

async function fetchHomeCplTracks(supabase, playlistId) {
  const { data, error } = await supabase
    .from('user_playlist_tracks')
    .select(
      `order_index, track_id,
       tracks (
         id, canonical_game_title, canonical_track_title,
         track_sources (
           external_id, cached_title, cached_channel_title,
           cached_thumbnail_url, is_primary
         )
       )`,
    )
    .eq('playlist_id', playlistId)
    .order('order_index');
  if (error) throw error;
  return (data || [])
    .map((pt) => {
      const track = pt.tracks;
      const src =
        track?.track_sources?.find((s) => s.is_primary) ??
        track?.track_sources?.[0];
      if (!src) return null;
      return {
        videoId: src.external_id,
        trackId: pt.track_id,
        title:
          src.cached_title ||
          [track.canonical_game_title, track.canonical_track_title]
            .filter(Boolean)
            .join(' – '),
        displayTitle:
          track.canonical_track_title || src.cached_title || src.external_id,
        channelTitle: src.cached_channel_title || 'YouTube',
        thumbnail:
          src.cached_thumbnail_url ||
          `https://i.ytimg.com/vi/${src.external_id}/mqdefault.jpg`,
        gameTitle: track.canonical_game_title,
        trackTitle: track.canonical_track_title,
        comment: '',
        addedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

const HOME_CPL_CARD_WIDTH = 175;
const HOME_CPL_CARD_GAP = 12;

function HomeCommunityPlaylistsStrip({
  supabase,
  authUser,
  onPlayPlaylist,
  onAddToPlaylist,
  onShowToast,
  isAuthReady,
}) {
  const [playlists, setPlaylists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(6);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [isLoadingPanel, setIsLoadingPanel] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const gridRef = useRef(null);
  const authUserId = authUser?.id ?? null;

  useEffect(() => {
    if (!isAuthReady || !supabase) return;
    let isActive = true;
    setIsLoading(true);
    fetchHomeCplPage(supabase, authUserId, 0)
      .then((data) => {
        if (!isActive) return;
        setPlaylists(data);
        setHasMore(data.length === HOME_CPL_PAGE_SIZE);
        setPage(1);
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [supabase, authUserId, isAuthReady]);

  // Recalculate how many cards fit when the grid container resizes
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const size = Math.max(
        2,
        Math.floor(
          (w + HOME_CPL_CARD_GAP) / (HOME_CPL_CARD_WIDTH + HOME_CPL_CARD_GAP),
        ),
      );
      setPageSize((prev) => {
        if (prev !== size) setPageIndex(0); // reset to first page on resize
        return size;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadMore = useCallback(async () => {
    if (isFetchingMore || !hasMore || !supabase) return;
    setIsFetchingMore(true);
    try {
      const data = await fetchHomeCplPage(supabase, authUserId, page);
      setPlaylists((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        return [...prev, ...data.filter((p) => !existingIds.has(p.id))];
      });
      setHasMore(data.length === HOME_CPL_PAGE_SIZE);
      setPage((p) => p + 1);
    } catch {
      // Intentionally silent - error is handled implicitly or doesn't require UI feedback here
    } finally {
      setIsFetchingMore(false);
    }
  }, [supabase, authUserId, page, hasMore, isFetchingMore]);

  const canGoBack = pageIndex > 0;
  const canGoForward = pageIndex + pageSize < playlists.length || hasMore;

  async function handleNextPage() {
    const nextIndex = pageIndex + pageSize;
    if (nextIndex < playlists.length) {
      setPageIndex(nextIndex);
    } else if (hasMore) {
      await loadMore();
      setPageIndex(nextIndex);
    }
  }

  function handlePrevPage() {
    setPageIndex(Math.max(0, pageIndex - pageSize));
  }

  async function handleSelectPlaylist(playlist) {
    if (selectedPlaylist?.id === playlist.id) {
      setSelectedPlaylist(null);
      return;
    }
    setSelectedPlaylist(playlist);
    setSelectedTracks([]);
    setIsLoadingPanel(true);
    try {
      const tracks = await fetchHomeCplTracks(supabase, playlist.id);
      setSelectedTracks(tracks);
    } catch {
      onShowToast?.('Failed to load playlist tracks');
    } finally {
      setIsLoadingPanel(false);
    }
  }

  async function handlePlay(playlist) {
    setLoadingId(playlist.id);
    try {
      const tracks =
        selectedTracks.length && selectedPlaylist?.id === playlist.id
          ? selectedTracks
          : await fetchHomeCplTracks(supabase, playlist.id);
      if (!tracks.length) {
        onShowToast?.('This playlist has no tracks');
        return;
      }
      if (onPlayPlaylist) {
        onPlayPlaylist(tracks, {
          id: playlist.id,
          name: playlist.name,
          autoplay: true,
        });
      } else {
        onAddToPlaylist(tracks);
      }
      onShowToast?.(`Playing "${playlist.name}" — ${tracks.length} tracks`);
    } catch {
      onShowToast?.('Failed to load playlist');
    } finally {
      setLoadingId(null);
    }
  }

  function handlePlayFromTrack(track) {
    if (!selectedPlaylist || !selectedTracks.length) return;
    if (onPlayPlaylist) {
      onPlayPlaylist(selectedTracks, {
        id: selectedPlaylist.id,
        name: selectedPlaylist.name,
        autoplay: true,
        startVideoId: track.videoId,
      });
    } else {
      onAddToPlaylist(selectedTracks);
    }
  }

  async function handleAdd(playlist) {
    setLoadingId(playlist.id);
    try {
      const tracks =
        selectedTracks.length && selectedPlaylist?.id === playlist.id
          ? selectedTracks
          : await fetchHomeCplTracks(supabase, playlist.id);
      if (!tracks.length) {
        onShowToast?.('This playlist has no tracks');
        return;
      }
      onAddToPlaylist(tracks);
      onShowToast?.(`Added ${tracks.length} tracks to your queue`);
    } catch {
      onShowToast?.('Failed to load playlist');
    } finally {
      setLoadingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="home-cpl-loading">
        <div className="hero-loader-spinner" aria-label="Loading playlists" />
      </div>
    );
  }

  if (!playlists.length) {
    return (
      <div className="home-cpl-empty">No public community playlists yet.</div>
    );
  }

  const visiblePlaylists = playlists.slice(pageIndex, pageIndex + pageSize);

  return (
    <div className="home-cpl-content">
      <div className="home-cpl-main">
        <div className="home-cpl-page-wrapper">
          <button
            className="home-cpl-nav-btn"
            onClick={handlePrevPage}
            disabled={!canGoBack}
            style={{ visibility: canGoBack ? 'visible' : 'hidden' }}
            aria-label="Previous playlists"
            type="button"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              width="18"
              height="18"
              aria-hidden
            >
              <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" />
            </svg>
          </button>

          <div
            ref={gridRef}
            className="home-cpl-page"
            style={{ gridTemplateColumns: `repeat(${pageSize}, 1fr)` }}
          >
            {visiblePlaylists.map((pl) => (
              <div
                key={pl.id}
                className={`cpl-new-card home-cpl-new-card${selectedPlaylist?.id === pl.id ? ' home-cpl-card-selected' : ''}`}
                onClick={() => handleSelectPlaylist(pl)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleSelectPlaylist(pl)}
                title={`View "${pl.name}"`}
              >
                <div className="cpl-new-cover">
                  {pl.firstThumbnail ? (
                    <img
                      src={pl.firstThumbnail}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: homeCplGradient(pl.id),
                      }}
                    />
                  )}
                  <span className="cpl-track-badge cpl-track-badge-sm">
                    {pl.trackCount}
                  </span>
                  <button
                    className="home-cpl-card-play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(pl);
                    }}
                    aria-label={`Play ${pl.name}`}
                    type="button"
                    disabled={loadingId === pl.id}
                  >
                    {loadingId === pl.id ? (
                      <div
                        className="hero-loader-spinner"
                        style={{ width: 14, height: 14 }}
                      />
                    ) : (
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        width="14"
                        height="14"
                        aria-hidden
                      >
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="cpl-new-body">
                  <div className="cpl-new-name">{pl.name}</div>
                  <div className="cpl-new-meta">
                    <div
                      className="cpl-avatar cpl-avatar-xs"
                      style={
                        pl.profile?.avatar_url
                          ? {}
                          : { background: homeCplGradient(pl.user_id || '') }
                      }
                      aria-hidden
                    >
                      {pl.profile?.avatar_url ? (
                        <img
                          src={pl.profile.avatar_url}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: 'inherit',
                          }}
                        />
                      ) : (
                        (getDisplayProfileName(pl.profile?.username) || '?')
                          .slice(0, 2)
                          .toUpperCase()
                      )}
                    </div>
                    <span>
                      {getDisplayProfileName(pl.profile?.username)} ·{' '}
                      {homeCplTimeAgo(pl.created_at)}
                    </span>
                  </div>
                  <div className="home-cpl-card-actions">
                    <button
                      className="home-cpl-card-action-btn home-cpl-card-action-btn-play"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlay(pl);
                      }}
                      type="button"
                      disabled={loadingId === pl.id}
                    >
                      Play
                    </button>
                    <button
                      className="home-cpl-card-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdd(pl);
                      }}
                      type="button"
                      disabled={loadingId === pl.id}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {isFetchingMore && (
              <div className="home-cpl-page-loading-slot">
                <div
                  className="hero-loader-spinner"
                  style={{ width: 20, height: 20 }}
                />
              </div>
            )}
          </div>

          <button
            className="home-cpl-nav-btn"
            onClick={handleNextPage}
            disabled={!canGoForward || isFetchingMore}
            style={{ visibility: canGoForward ? 'visible' : 'hidden' }}
            aria-label="Next playlists"
            type="button"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              width="18"
              height="18"
              aria-hidden
            >
              <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
            </svg>
          </button>
        </div>
      </div>

      {selectedPlaylist && (
        <div className="home-cpl-side-panel">
          <div className="home-cpl-panel-header">
            <button
              className="home-cpl-panel-close"
              onClick={() => setSelectedPlaylist(null)}
              aria-label="Close playlist panel"
              type="button"
            >
              ✕
            </button>
            <p className="home-cpl-panel-header-creator">
              by {getDisplayProfileName(selectedPlaylist.profile?.username)}
            </p>
            <h3 className="home-cpl-panel-header-name">
              {selectedPlaylist.name}
            </h3>
            <span className="home-cpl-panel-hero-badge">
              {selectedPlaylist.trackCount} tracks
            </span>
          </div>
          <div className="home-cpl-panel-actions">
            <button
              className="btn btn-primary"
              onClick={() => handlePlay(selectedPlaylist)}
              disabled={loadingId === selectedPlaylist.id}
              type="button"
              style={{ flex: 1 }}
            >
              {loadingId === selectedPlaylist.id ? '…' : 'Play Playlist'}
            </button>
            <button
              className="btn"
              onClick={() => handleAdd(selectedPlaylist)}
              disabled={loadingId === selectedPlaylist.id}
              type="button"
              style={{ flex: 1 }}
            >
              Add to Queue
            </button>
          </div>
          {isLoadingPanel ? (
            <div className="home-cpl-panel-loading">
              <div
                className="hero-loader-spinner"
                style={{ width: 18, height: 18 }}
              />
              <span>Loading tracks…</span>
            </div>
          ) : selectedTracks.length > 0 ? (
            <div className="home-cpl-panel-tracks">
              {selectedTracks.map((t, i) => (
                <div
                  key={i}
                  className="home-cpl-panel-track"
                  onDoubleClick={() => handlePlayFromTrack(t)}
                  title="Double-click to play from here"
                >
                  {t.thumbnail ? (
                    <div className="home-cpl-panel-track-thumb-wrap">
                      <img
                        src={t.thumbnail}
                        alt=""
                        className="home-cpl-panel-track-thumb"
                      />
                      <button
                        className="home-cpl-panel-track-play-btn"
                        onClick={() => handlePlayFromTrack(t)}
                        aria-label={`Play from ${t.trackTitle || t.displayTitle}`}
                        type="button"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          width="10"
                          height="10"
                          aria-hidden
                        >
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                  <div className="home-cpl-panel-track-info">
                    <span className="home-cpl-panel-track-title">
                      {t.trackTitle || t.displayTitle}
                    </span>
                    <span className="home-cpl-panel-track-game">
                      {t.gameTitle || t.channelTitle}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const MOBILE_DASHBOARD_COLLAPSE_DEFAULTS = {
  overview: false,
  nominations: false,
  discover: true,
};
const DESKTOP_DASHBOARD_COLLAPSE_DEFAULTS = {
  overview: false,
  nominations: false,
  discover: false,
};

function DashboardSection({
  title,
  eyebrow,
  children,
  actions = null,
  caption = null,
  className = '',
  isMobileLayout = false,
  isCollapsed = false,
  onToggleCollapse = null,
  summary = '',
  backgroundContent = null,
}) {
  return (
    <section
      className={`dashboard-section-feed ${className}`}
      aria-label={title}
    >
      {backgroundContent}
      <div className="dashboard-pane-shell">
        <div className="dashboard-pane-header">
          <div className="dashboard-pane-heading">
            <span className="dashboard-pane-eyebrow">{eyebrow}</span>
            <h2 className="dashboard-pane-title">{title}</h2>
            {caption && <p className="dashboard-pane-copy">{caption}</p>}
          </div>

          {actions && <div className="dashboard-pane-actions">{actions}</div>}
        </div>

        {isMobileLayout && onToggleCollapse && (
          <button
            className={`dashboard-mobile-toggle${isCollapsed ? ' collapsed' : ''}`}
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${title}`}
            onClick={onToggleCollapse}
          >
            <span className="dashboard-mobile-toggle-copy">
              <span className="dashboard-mobile-toggle-label">
                {isCollapsed ? 'Expand section' : 'Collapse section'}
              </span>
              {summary && (
                <span className="dashboard-mobile-toggle-summary">
                  {summary}
                </span>
              )}
            </span>
            <span className="dashboard-mobile-toggle-icon" aria-hidden="true">
              ▾
            </span>
          </button>
        )}

        {!isCollapsed && <div className="dashboard-pane-body">{children}</div>}
      </div>
    </section>
  );
}

function DashboardMessage({ children, tone = 'muted' }) {
  return (
    <div className={`dashboard-message dashboard-message-${tone}`}>
      {children}
    </div>
  );
}

function DashboardAvatar({ update }) {
  const displayName = getDisplayProfileName(update.username, 'U');

  if (update.avatarUrl) {
    return (
      <img
        className="dashboard-avatar"
        src={update.avatarUrl}
        alt=""
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="dashboard-avatar dashboard-avatar-fallback"
      aria-hidden="true"
    >
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function NominationEmptyCard() {
  return (
    <article className="dashboard-update-card dashboard-update-card-empty">
      <div className="dashboard-update-empty-shell">
        <div className="dashboard-update-empty-icon" aria-hidden="true">
          +
        </div>
        <p className="dashboard-update-empty-text">Refresh to find updates</p>
      </div>
    </article>
  );
}

function NominationUpdateSkeleton() {
  return (
    <div className="dashboard-update-peek-container">
      <div className="dashboard-update-skeleton-row">
        <div className="dashboard-update-skeleton-item" />
        <div className="dashboard-update-skeleton-item medium" />
        <div className="dashboard-update-skeleton-item short" />
      </div>
    </div>
  );
}

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  const target = document.getElementById('modal-root');
  if (!target) return null;
  return createPortal(children, target);
}

export function NominationUpdateCard({
  update,
  metadataById = {},
  isExpanded = false,
  onToggleExpand,
  onAddWholeList,
  onAddUpdates,
  onPlayTrack,
  onAddTrack,
  onShowComments,
  onToggleSupport,
  onOpenSupportDropdown,
  supportStatusById = {},
  globalActivityByVideoId = new Map(),
  isFeedbackPanelOpen = false,
  resolveTrack,
  isMetadataLoading = false,
  onContextMenu,
}) {
  const displayIdentity = parseStoredProfileUsername(update.username);
  const nominationCount = update.nominations.length;
  const [supportTooltip, setSupportTooltip] = useState(null);

  useEffect(() => {
    if (!supportTooltip) return;
    const close = () => setSupportTooltip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [supportTooltip]);

  const renderPeekRowActivity = (video, index) => {
    const activity = globalActivityByVideoId.get(video.videoId);
    const hasComments = activity === 'commented';
    const hasRating = activity === 'rated';
    const meta = metadataById[video.videoId];
    const sc1 = meta?.supportCount1 || 0;
    const sc2 = meta?.supportCount2 || 0;
    const sc3 = meta?.supportCount3 || 0;
    const totalSupport = sc1 + sc2 + sc3;
    const hasActivity = totalSupport > 0 || !!activity;
    const isTooltipOpen = supportTooltip?.videoId === video.videoId;

    return (
      <div
        key={video.videoId}
        className={`dashboard-update-peek-row ${hasActivity ? 'has-activity' : ''}`}
        onMouseLeave={() => {
          if (supportTooltip?.videoId === video.videoId)
            setSupportTooltip(null);
        }}
        onClick={(e) => {
          if (isFeedbackPanelOpen) {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onShowComments?.(resolveTrack(video), {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            });
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onPlayTrack(resolveTrack(video), update);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu({
            x: e.clientX,
            y: e.clientY,
            video,
          });
        }}
      >
        <span className="dashboard-update-peek-index" aria-hidden="true">
          {index + 1}
        </span>
        <div className="dashboard-update-peek-content">
          <span className="dashboard-update-peek-game">
            {metadataById[video.videoId]?.gameTitle || 'Metadata Needed'}
          </span>
          <span className="dashboard-update-peek-title">
            {metadataById[video.videoId]?.trackTitle || video.title}
          </span>
        </div>

        <div className="dashboard-update-peek-actions">
          <button
            className="peek-action-btn peek-action-btn-add"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddTrack([resolveTrack(video)]);
            }}
            title="Add to Queue"
          >
            <PlaylistPlusIcon size={20} />
          </button>
          <button
            className={`peek-action-btn peek-action-btn-support ${
              supportStatusById[video.videoId]?.isSupported
                ? 'active has-feedback'
                : ''
            }`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const resolved = resolveTrack(video);
              const rect = e.currentTarget.getBoundingClientRect();

              if (!supportStatusById[video.videoId]?.isSupported) {
                // If not supported yet, toggle on default support first
                onToggleSupport?.(resolved);
              }

              // Always open the menu to allow changing level or removing
              onOpenSupportDropdown?.(resolved, {
                top: rect.top,
                left: rect.left + rect.width / 2,
              });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const resolved = resolveTrack(video);
              const rect = e.currentTarget.getBoundingClientRect();
              onOpenSupportDropdown?.(resolved, {
                top: rect.top,
                left: rect.left + rect.width / 2,
              });
            }}
            title={
              supportStatusById[video.videoId]?.isSupported
                ? 'Change or remove support'
                : 'Support this track'
            }
          >
            {supportStatusById[video.videoId]?.isNominated ? (
              '★'
            ) : supportStatusById[video.videoId]?.supportLevel === 3 ? (
              <LockIcon size={20} />
            ) : supportStatusById[video.videoId]?.isSupported ? (
              <HeartIcon size={20} />
            ) : (
              '♡'
            )}
          </button>
          <button
            className="peek-action-btn peek-action-btn-play"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlayTrack(resolveTrack(video), update);
            }}
            title="Play now"
          >
            <PlayIcon size={20} />
          </button>

          {totalSupport > 0 && (
            <button
              className={`peek-support-chip${isTooltipOpen ? ' expanded' : ''}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isTooltipOpen) {
                  setSupportTooltip(null);
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setSupportTooltip({
                    videoId: video.videoId,
                    top: rect.bottom + 6,
                    left: rect.left + rect.width / 2,
                    sc1,
                    sc2,
                    sc3,
                  });
                }
              }}
              title={`${totalSupport} support${totalSupport !== 1 ? 's' : ''} (Click for details)`}
            >
              <HeartIcon className="peek-chip-icon" />
              <span>{totalSupport}</span>
            </button>
          )}

          <button
            className={`peek-action-btn peek-action-btn-comments${hasComments ? ' has-comments' : hasRating ? ' has-rated' : ''}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onShowComments?.(resolveTrack(video), {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              });
            }}
            title={
              hasComments ? 'View comments and activity' : 'No comments yet'
            }
          >
            <SpeechBubbleIcon size={18} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <article
        className={`dashboard-update-card ${isExpanded ? 'dashboard-card-expanded' : ''}`}
      >
        {isExpanded ? (
          <ModalPortal>
            <div className="dashboard-card-modal-content">
              <div className="dashboard-update-header dashboard-modal-header">
                <div className="dashboard-update-user-context">
                  <DashboardAvatar update={update} />
                </div>
                <div className="dashboard-update-heading">
                  <h3 className="dashboard-update-title">
                    <span className="profile-name-inline">
                      {displayIdentity.provider === 'discord' && (
                        <DiscordIcon className="profile-provider-icon dashboard-provider-icon" />
                      )}
                      <span>{displayIdentity.displayName}</span>
                    </span>
                  </h3>
                  <p className="dashboard-update-count">
                    {nominationCount} {nominationCount === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <button
                  className="dashboard-card-close-btn"
                  type="button"
                  aria-label="Close expanded list"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(null);
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="dashboard-update-peek-container dashboard-modal-body">
                {isMetadataLoading ? (
                  <NominationUpdateSkeleton />
                ) : update.nominations && update.nominations.length > 0 ? (
                  <div className="dashboard-update-peek-list">
                    {update.nominations.map((video, index) =>
                      renderPeekRowActivity(video, index),
                    )}
                  </div>
                ) : (
                  <div className="dashboard-modal-loading-container">
                    <div className="hero-loader-spinner" />
                  </div>
                )}
              </div>

              <div className="dashboard-update-footer">
                <div className="dashboard-update-actions">
                  <button
                    className="dashboard-action-btn dashboard-action-btn-muted"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddUpdates(update);
                    }}
                    title="Add unheard nominations"
                  >
                    Add Unheard
                  </button>
                  <button
                    className="dashboard-action-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddWholeList(update);
                    }}
                    title="Add entire list"
                  >
                    Add whole list
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        ) : (
          <>
            <div className="dashboard-update-header">
              <div className="dashboard-update-heading">
                <h3 className="dashboard-update-title">
                  <span className="profile-name-inline">
                    {displayIdentity.provider === 'discord' && (
                      <DiscordIcon className="profile-provider-icon dashboard-provider-icon" />
                    )}
                    <span>{displayIdentity.displayName}</span>
                  </span>
                </h3>
                <p className="dashboard-update-count">
                  {update.gamefaqsUsername && (
                    <>
                      <span className="dashboard-update-gf-user">
                        {update.gamefaqsUsername}
                      </span>
                      {' - '}
                    </>
                  )}
                  {nominationCount} {nominationCount === 1 ? 'item' : 'items'}
                </p>
              </div>
              <div className="dashboard-update-user-context">
                <DashboardAvatar update={update} />
              </div>
            </div>

            <div className="dashboard-update-peek-container">
              {isMetadataLoading ? (
                <NominationUpdateSkeleton />
              ) : (
                <div className="dashboard-update-peek-list">
                  {update.nominations
                    .slice(0, 20)
                    .map((video, index) => renderPeekRowActivity(video, index))}
                </div>
              )}
            </div>

            <div className="dashboard-update-footer">
              <div className="dashboard-update-actions">
                <button
                  className="dashboard-action-btn dashboard-action-btn-muted"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddUpdates(update);
                  }}
                  title="Add unheard nominations"
                >
                  Add Unheard
                </button>
                <button
                  className="dashboard-action-btn"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddWholeList(update);
                  }}
                  title="Add entire list"
                >
                  Add whole list
                </button>
              </div>
              <button
                className="dashboard-update-expand-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(update.userId);
                }}
                title="View full nomination list"
              >
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </article>

      {supportTooltip && (
        <ModalPortal>
          <div
            className="peek-support-tooltip"
            style={{ top: supportTooltip.top, left: supportTooltip.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {supportTooltip.sc1 > 0 && (
              <span className="stat-badge normal">
                <HeartIcon className="peek-chip-icon" />
                {supportTooltip.sc1}
              </span>
            )}
            {supportTooltip.sc2 > 0 && (
              <span className="stat-badge strong">
                <HeartIcon className="peek-chip-icon" />
                {supportTooltip.sc2}
              </span>
            )}
            {supportTooltip.sc3 > 0 && (
              <span className="stat-badge highest">
                <LockIcon className="peek-chip-icon" />
                {supportTooltip.sc3}
              </span>
            )}
          </div>
        </ModalPortal>
      )}
    </>
  );
}

function DiscoveryGridItem({ candidate, metadata, onPlayNow, onContextMenu }) {
  const title =
    metadata?.trackTitle || candidate?.trackTitle
      ? `${metadata?.gameTitle || candidate?.gameTitle || ''} - ${metadata?.trackTitle || candidate?.trackTitle}`.replace(
          /^ - /,
          '',
        )
      : metadata?.displayTitle ||
        candidate?.displayTitle ||
        candidate?.title ||
        'Unknown Track';

  const { supportCount1, supportCount2, supportCount3 } = metadata || {};

  return (
    <div
      className="discovery-grid-card-wrapper"
      title="Double-click to play (Right-click for options)"
      onDoubleClick={() => onPlayNow(candidate)}
      onContextMenu={(e) => onContextMenu(e, candidate)}
    >
      <TiltedCard
        imageSrc={candidate.thumbnail}
        altText={title}
        containerHeight="260px"
        containerWidth="100%"
        imageHeight="260px"
        imageWidth="100%"
        rotateAmplitude={5}
        scaleOnHover={1.05}
        showMobileWarning={false}
        showTooltip={false}
        displayOverlayContent={true}
        overlayContent={
          <div className="discovery-card-overlay">
            <div className="discovery-card-top">
              <h3 className="discovery-card-title">{title}</h3>
            </div>

            <div className="discovery-card-bottom">
              <div className="discovery-card-support-row">
                {candidate.nominationCount > 1 && (
                  <div
                    className="discovery-support-stat nominators"
                    title={`${candidate.nominationCount} Users Nominated`}
                  >
                    <UsersIcon />
                    <span>{candidate.nominationCount}</span>
                  </div>
                )}
                {supportCount1 > 0 && (
                  <div
                    className="discovery-support-stat normal"
                    title={`${supportCount1} Possible Supports`}
                  >
                    <HeartIcon />
                    <span>{supportCount1}</span>
                  </div>
                )}
                {supportCount2 > 0 && (
                  <div
                    className="discovery-support-stat strong"
                    title={`${supportCount2} Likely Supports`}
                  >
                    <HeartIcon />
                    <span>{supportCount2}</span>
                  </div>
                )}
                {supportCount3 > 0 && (
                  <div
                    className="discovery-support-stat highest"
                    title={`${supportCount3} Definite Supports`}
                  >
                    <LockIcon />
                    <span>{supportCount3}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}

function HeroLeaderboard({
  yourNominations,
  yourSupports,
  globalLeaderboard,
  authUser,
  isLoading,
  globalActivityByVideoId,
  resolveTrack,
  onShowComments,
  isFeedbackPanelOpen,
  onPlayTrack,
  onPlayFromNominationList,
  onPlayFromSupportList,
  onContextMenu,
}) {
  const [currentView, setCurrentView] = useState(
    authUser ? 'nominations' : 'global',
  );
  const [showAllGlobal, setShowAllGlobal] = useState(false);
  const [prevAuthUser, setPrevAuthUser] = useState(authUser);

  if (authUser !== prevAuthUser) {
    setPrevAuthUser(authUser);
    setCurrentView(authUser ? 'nominations' : 'global');
    setShowAllGlobal(false);
  }

  const switchView = (view) => {
    setCurrentView(view);
    setShowAllGlobal(false);
  };

  let data = [];
  let title = '';
  if (currentView === 'global') {
    data = globalLeaderboard;
    title = 'Top Global Supports';
  } else if (currentView === 'nominations') {
    data = yourNominations;
    title = 'Your Nominations';
  } else if (currentView === 'supports') {
    data = yourSupports;
    title = 'Your Supports';
  }

  const GLOBAL_PREVIEW_LIMIT = 20;
  const displayData =
    currentView === 'global' && !showAllGlobal
      ? data.slice(0, GLOBAL_PREVIEW_LIMIT)
      : data;

  return (
    <article className="dashboard-feature-card dashboard-feature-card-hero hero-leaderboard-card animate-fade-in">
      <div className="hero-leaderboard-header">
        <h3 className="hero-leaderboard-title">{title}</h3>
        <div className="hero-leaderboard-tabs">
          {authUser && (
            <>
              <button
                className={`hero-leaderboard-tab ${currentView === 'nominations' ? 'active' : ''}`}
                onClick={() => switchView('nominations')}
                title="Your Nominations"
              >
                Noms
              </button>
              <button
                className={`hero-leaderboard-tab ${currentView === 'supports' ? 'active' : ''}`}
                onClick={() => switchView('supports')}
                title="Your Supports"
              >
                Supports
              </button>
            </>
          )}
          <button
            className={`hero-leaderboard-tab ${currentView === 'global' ? 'active' : ''}`}
            onClick={() => switchView('global')}
            title="Global Leaderboard"
          >
            Global
          </button>
        </div>
      </div>

      <div className="hero-leaderboard-list">
        {isLoading ? (
          <div className="hero-leaderboard-empty">
            <div className="hero-loader-spinner" style={{ margin: 'auto' }} />
          </div>
        ) : data.length === 0 ? (
          <div className="hero-leaderboard-empty">
            <p>No tracks available for this view.</p>
          </div>
        ) : (
          <>
            {displayData.map((track, idx) => (
              <div
                key={track.videoId}
                className="hero-leaderboard-row"
                onDoubleClick={() => {
                  if (currentView === 'nominations') {
                    onPlayFromNominationList?.(resolveTrack(track));
                  } else if (currentView === 'supports') {
                    onPlayFromSupportList?.(resolveTrack(track));
                  } else {
                    onPlayTrack(track);
                  }
                }}
                onClick={(e) => {
                  if (isFeedbackPanelOpen) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    onShowComments?.(resolveTrack(track), {
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height,
                    });
                  }
                }}
                onContextMenu={(e) => onContextMenu(e, track, currentView)}
                title="Double-click to play (Right-click for options)"
              >
                <span className="hero-leaderboard-rank">{idx + 1}</span>
                <img
                  src={track.thumbnail}
                  alt=""
                  className="hero-leaderboard-thumb"
                  loading="lazy"
                />
                <div className="hero-leaderboard-info">
                  <div className="hero-leaderboard-info-top">
                    <span className="hero-leaderboard-track-title">
                      {track.title}
                    </span>
                    {(() => {
                      const a = globalActivityByVideoId?.get(track.videoId);
                      return a ? (
                        <button
                          className={`hero-leaderboard-comment-btn${a === 'commented' ? ' has-comments' : ' has-rated'}`}
                          title="View Comments"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            onShowComments?.(resolveTrack(track), {
                              top: rect.top,
                              left: rect.left,
                              width: rect.width,
                              height: rect.height,
                            });
                          }}
                        >
                          <SpeechBubbleIcon size={14} />
                        </button>
                      ) : null;
                    })()}
                  </div>
                  <div className="hero-leaderboard-stats">
                    {track.totalSupport > 0 && (
                      <span className="hero-leaderboard-total-stat">
                        Total: {track.totalSupport}
                      </span>
                    )}
                    {track.totalSupport > 0 && (
                      <div className="hero-leaderboard-stat-icons">
                        {track.supportCount3 > 0 && (
                          <span
                            className="stat-badge highest"
                            title="Definite Supports"
                          >
                            <LockIcon size={10} /> {track.supportCount3}
                          </span>
                        )}
                        {track.supportCount2 > 0 && (
                          <span
                            className="stat-badge strong"
                            title="Likely Supports"
                          >
                            <HeartIcon size={10} /> {track.supportCount2}
                          </span>
                        )}
                        {track.supportCount1 > 0 && (
                          <span
                            className="stat-badge normal"
                            title="Possible Supports"
                          >
                            <HeartIcon size={10} /> {track.supportCount1}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {currentView === 'global' &&
              !showAllGlobal &&
              data.length > GLOBAL_PREVIEW_LIMIT && (
                <button
                  className="hero-leaderboard-show-all"
                  onClick={() => setShowAllGlobal(true)}
                >
                  Show all {data.length} nominations
                </button>
              )}
          </>
        )}
      </div>
    </article>
  );
}

export default function HomePage({
  supabase,
  authUser = null,
  currentPlaylist = [],
  listenedStatusById = {},
  onAddToPlaylist,
  onPlayNow,
  onPlayPlaylist,
  onShowComments,
  onNavigateToPlayer,
  onNavigateToExplorer,
  onNavigateToCommunityPlaylists,
  onNavigateToExplorerComments,
  onNavigateToDatabase,
  onOpenPlaylist,
  onOpenNominationsAdding,
  onToggleSupport,
  onToggleNomination,
  onPlayCommunityListFromTrack,
  onPlayFromNominationList,
  onPlayFromSupportList,

  onOpenSupportDropdown,
  supportStatusById = {},
  isFeedbackPanelOpen = false,
  globalActivityByVideoId = new Map(),
  onShowToast,
  onUpdateMetadata,
  catalogMetadata = {},
  lastMetadataUpdateBatch = null,
  isAuthReady = true,
  userProfile = null,
  nominationList = [],
  onNominationsLoaded = null,
  nominationRefreshToken = 0,
  customPlaylists,
  onUpdateCustomPlaylists,
}) {
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
  const [nominationUpdates, setNominationUpdates] = useState([]);

  // Build a live entry for the current user from local nomination state so the
  // leaderboard and carousel update immediately without a page reload.
  const liveUserEntry = useMemo(() => {
    if (!authUser || nominationList.length === 0) return null;
    return {
      userId: authUser.id,
      username: userProfile?.username || authUser.email || 'You',
      gamefaqsUsername: userProfile?.gamefaqs_username ?? null,
      avatarUrl: userProfile?.avatar_url ?? null,
      updatedAt: null,
      nominations: nominationList.map((v) => ({
        videoId: v.videoId,
        title: v.title || v.displayTitle || 'Untitled video',
        thumbnail: v.thumbnail || '',
        channelTitle: v.channelTitle || '',
      })),
    };
  }, [authUser, nominationList, userProfile]);

  // Merge liveUserEntry into nominationUpdates, replacing any stale DB entry
  // for the current user so the carousel and leaderboard stay in sync.
  const mergedNominationUpdates = useMemo(() => {
    if (!liveUserEntry) return nominationUpdates;
    const withoutUser = nominationUpdates.filter(
      (u) => u.userId !== liveUserEntry.userId,
    );
    return [liveUserEntry, ...withoutUser];
  }, [liveUserEntry, nominationUpdates]);

  // Silently re-fetch community nominations when the Realtime subscription
  // detects a track_nominations change (token incremented by App.jsx).
  useEffect(() => {
    if (nominationRefreshToken === 0 || !supabase) return;
    let isActive = true;
    fetchDashboardNominationUpdates(supabase, null)
      .then((data) => {
        if (!isActive) return;
        setNominationUpdates(data);
        onNominationsLoaded?.(data);
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [nominationRefreshToken, supabase, onNominationsLoaded]);

  const [unplacedFallbackTracks, setUnplacedFallbackTracks] = useState([]);
  const [persistentDiscoveryItems, setPersistentDiscoveryItems] = useState([]);
  const [dashboardError, setDashboardError] = useState('');
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isExtraLoading, setIsExtraLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [featuredDiscoveryId, setFeaturedDiscoveryId] = useState(null);
  const [fastSpotlightCandidate, setFastSpotlightCandidate] = useState(null);
  const [dbUnlistenedCount, setDbUnlistenedCount] = useState(null);
  const [prospectiveFallbackTrack, setProspectiveFallbackTrack] =
    useState(null);
  const [mobileCollapsedSections, setMobileCollapsedSections] = useState(
    MOBILE_DASHBOARD_COLLAPSE_DEFAULTS,
  );
  const [maxVgmcNumber, setMaxVgmcNumber] = useState(24);
  const [discoveryContextMenu, setDiscoveryContextMenu] = useState(null);
  const [nominationContextMenu, setNominationContextMenu] = useState(null);
  const [isHidingOwnNominations, setIsHidingOwnNominations] = useState(false);
  const lastAppliedBatchRef = useRef(null);

  // Patch discovery items when metadata is saved (handles both title changes and URL/videoId changes)
  useEffect(() => {
    if (
      !lastMetadataUpdateBatch ||
      lastMetadataUpdateBatch === lastAppliedBatchRef.current
    )
      return;
    lastAppliedBatchRef.current = lastMetadataUpdateBatch;

    const updateMap = new Map();
    for (const u of lastMetadataUpdateBatch) {
      updateMap.set(u.oldVideoId || u.videoId, u);
    }

    setPersistentDiscoveryItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const update = updateMap.get(item.videoId);
        if (!update) return item;
        changed = true;
        return {
          ...item,
          videoId: update.videoId,
          gameTitle: update.gameTitle || item.gameTitle,
          trackTitle: update.trackTitle || item.trackTitle,
          displayTitle: update.displayTitle || item.displayTitle,
          title: update.title || item.title,
          thumbnail: update.thumbnail || item.thumbnail,
        };
      });
      return changed ? next : prev;
    });

    // Update featuredDiscoveryId if it was changed
    setFeaturedDiscoveryId((prev) => {
      if (!prev) return prev;
      const update = updateMap.get(prev);
      return update && update.videoId !== prev ? update.videoId : prev;
    });

    // Patch nominationUpdates list
    setNominationUpdates((prev) => {
      let changed = false;
      const next = prev.map((update) => {
        if (!update.nominations) return update;
        let nominationsChanged = false;
        const nextNominations = update.nominations.map((item) => {
          const match = updateMap.get(item.videoId);
          if (!match) return item;
          nominationsChanged = true;
          return {
            ...item,
            videoId: match.videoId,
            gameTitle: match.gameTitle || item.gameTitle,
            trackTitle: match.trackTitle || item.trackTitle,
            thumbnail: match.thumbnail || item.thumbnail,
            title: match.title || item.title,
          };
        });

        if (nominationsChanged) {
          changed = true;
          return { ...update, nominations: nextNominations };
        }
        return update;
      });
      return changed ? next : prev;
    });

    // Patch fastSpotlightCandidate
    setFastSpotlightCandidate((prev) => {
      if (!prev) return prev;
      const update = updateMap.get(prev.videoId);
      if (!update) return prev;
      return {
        ...prev,
        videoId: update.videoId,
        gameTitle: update.gameTitle || prev.gameTitle,
        trackTitle: update.trackTitle || prev.trackTitle,
        title: update.title || prev.title,
        thumbnail: update.thumbnail || prev.thumbnail,
      };
    });

    // Patch prospectiveFallbackTrack
    setProspectiveFallbackTrack((prev) => {
      if (!prev) return prev;
      const update = updateMap.get(prev.videoId);
      if (!update) return prev;
      return {
        ...prev,
        videoId: update.videoId,
        gameTitle: update.gameTitle || prev.gameTitle,
        trackTitle: update.trackTitle || prev.trackTitle,
        title: update.title || prev.title,
        thumbnail: update.thumbnail || prev.thumbnail,
      };
    });
  }, [lastMetadataUpdateBatch]);

  const dockItems = useMemo(
    () => [
      {
        icon: <PlayIcon />,
        label: 'Player',
        onClick: onNavigateToPlayer,
        className: 'dashboard-action-btn-primary',
      },
      {
        icon: <StarIcon />,
        label: 'Add Nominations',
        onClick: onOpenNominationsAdding,
        className: 'dashboard-action-btn-secondary',
      },
      {
        icon: <PlaylistPlusIcon />,
        label: 'View Queue',
        onClick: onOpenPlaylist,
        className: 'dashboard-action-btn-secondary',
      },
      {
        icon: <SearchIcon />,
        label: 'Manage Lists',
        onClick: onNavigateToExplorer,
        className: 'dashboard-action-btn-tertiary',
      },
      {
        icon: (
          <svg className="dock-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
          </svg>
        ),
        label: 'Comments',
        onClick: onNavigateToExplorerComments,
        className: 'dashboard-action-btn-tertiary',
      },
      {
        icon: <DatabaseIcon />,
        label: 'View DB',
        onClick: onNavigateToDatabase,
        className: 'dashboard-action-btn-tertiary',
      },
    ],
    [
      onNavigateToPlayer,
      onOpenNominationsAdding,
      onOpenPlaylist,
      onNavigateToExplorer,
      onNavigateToExplorerComments,
      onNavigateToDatabase,
    ],
  );
  const [trackMetadataById, setTrackMetadataById] = useState({});
  const [isShowingFallback, setIsShowingFallback] = useState(false);
  const [isMetadataLoading, setIsMetadataLoading] = useState(true);

  const mergedMetadata = useMemo(
    () => ({
      ...trackMetadataById,
      ...catalogMetadata,
    }),
    [trackMetadataById, catalogMetadata],
  );

  const resolveTrack = useCallback(
    (video) => {
      const meta = mergedMetadata[video.videoId];
      if (!meta) return video;
      return {
        ...video,
        trackTitle: meta.trackTitle || video.trackTitle,
        gameTitle: meta.gameTitle || video.gameTitle,
        title: meta.trackTitle
          ? `${meta.gameTitle} - ${meta.trackTitle}`
          : video.title || meta.trackTitle || 'Unknown Track',
      };
    },
    [mergedMetadata],
  );

  const currentPlaylistIds = useMemo(
    () => new Set(currentPlaylist.map((video) => video.videoId)),
    [currentPlaylist],
  );

  const visibleNominationUpdates = useMemo(() => {
    if (isHidingOwnNominations) {
      return mergedNominationUpdates.filter(
        (update) => update.userId !== authUser?.id,
      );
    }
    return mergedNominationUpdates;
  }, [authUser?.id, mergedNominationUpdates, isHidingOwnNominations]);

  const globalLeaderboard = useMemo(() => {
    return Object.values(mergedMetadata)
      .map((meta) => {
        const s1 = meta.supportCount1 || 0;
        const s2 = meta.supportCount2 || 0;
        const s3 = meta.supportCount3 || 0;
        return {
          videoId: meta.videoId,
          title: meta.trackTitle
            ? `${meta.gameTitle} - ${meta.trackTitle}`
            : meta.displayTitle || 'Unknown Track',
          thumbnail:
            meta.sourceThumbnailUrl || getYouTubeThumbnailUrl(meta.videoId),
          supportCount1: s1,
          supportCount2: s2,
          supportCount3: s3,
          totalSupport: s1 + s2 + s3,
        };
      })
      .filter((t) => t.totalSupport > 0)
      .sort((a, b) => {
        if (b.totalSupport !== a.totalSupport)
          return b.totalSupport - a.totalSupport;
        if (b.supportCount3 !== a.supportCount3)
          return b.supportCount3 - a.supportCount3;
        if (b.supportCount2 !== a.supportCount2)
          return b.supportCount2 - a.supportCount2;
        return b.supportCount1 - a.supportCount1;
      });
  }, [mergedMetadata]);

  const yourNominations = useMemo(() => {
    if (!authUser) return [];
    const myUpdate = mergedNominationUpdates.find(
      (u) => u.userId === authUser.id,
    );
    if (!myUpdate) return [];

    return myUpdate.nominations
      .map((video) => {
        const meta = mergedMetadata[video.videoId] || {};
        const s1 = meta.supportCount1 || 0;
        const s2 = meta.supportCount2 || 0;
        const s3 = meta.supportCount3 || 0;
        return {
          ...video,
          title: meta.trackTitle
            ? `${meta.gameTitle} - ${meta.trackTitle}`
            : video.title || meta.displayTitle || 'Unknown Track',
          thumbnail:
            meta.sourceThumbnailUrl ||
            video.thumbnail ||
            getYouTubeThumbnailUrl(video.videoId),
          supportCount1: s1,
          supportCount2: s2,
          supportCount3: s3,
          totalSupport: s1 + s2 + s3,
        };
      })
      .sort((a, b) => {
        if (b.totalSupport !== a.totalSupport)
          return b.totalSupport - a.totalSupport;
        if (b.supportCount3 !== a.supportCount3)
          return b.supportCount3 - a.supportCount3;
        if (b.supportCount2 !== a.supportCount2)
          return b.supportCount2 - a.supportCount2;
        return b.supportCount1 - a.supportCount1;
      });
  }, [authUser, mergedNominationUpdates, mergedMetadata]);

  const yourSupports = useMemo(() => {
    if (!authUser) return [];
    const supportedIds = Object.keys(supportStatusById).filter(
      (id) => supportStatusById[id]?.isSupported,
    );
    return supportedIds
      .map((id) => {
        const meta = mergedMetadata[id];
        if (!meta) return null;
        const s1 = meta.supportCount1 || 0;
        const s2 = meta.supportCount2 || 0;
        const s3 = meta.supportCount3 || 0;
        return {
          videoId: id,
          title: meta.trackTitle
            ? `${meta.gameTitle} - ${meta.trackTitle}`
            : meta.displayTitle || 'Unknown Track',
          thumbnail: meta.sourceThumbnailUrl || getYouTubeThumbnailUrl(id),
          supportCount1: s1,
          supportCount2: s2,
          supportCount3: s3,
          totalSupport: s1 + s2 + s3,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.totalSupport !== a.totalSupport)
          return b.totalSupport - a.totalSupport;
        if (b.supportCount3 !== a.supportCount3)
          return b.supportCount3 - a.supportCount3;
        if (b.supportCount2 !== a.supportCount2)
          return b.supportCount2 - a.supportCount2;
        return b.supportCount1 - a.supportCount1;
      });
  }, [authUser, supportStatusById, mergedMetadata]);

  const discoveryCandidates = useMemo(() => {
    const rawCandidates = buildDiscoveryCandidates(visibleNominationUpdates, {
      currentPlaylistIds,
      excludeUserId: authUser?.id ?? null,
      limit: 44,
    });

    const unlistenedCandidates = rawCandidates.filter((item) => {
      const status = listenedStatusById[item.videoId];
      return !status || (status !== 'complete' && status !== 'partial');
    });

    return unlistenedCandidates;
  }, [
    authUser?.id,
    currentPlaylistIds,
    listenedStatusById,
    visibleNominationUpdates,
  ]);

  // Handle persistent Discovery population (only once per load/refresh)
  useEffect(() => {
    if (persistentDiscoveryItems.length > 0) return;
    if (discoveryCandidates.length === 0 && unplacedFallbackTracks.length === 0)
      return;

    // 1. Separate candidates and fallbacks
    const nominationPool = [...discoveryCandidates].filter((item) => {
      const status = listenedStatusById[item.videoId];
      return !status || (status !== 'complete' && status !== 'partial');
    });

    const fallbackPool = unplacedFallbackTracks
      .map((track) => ({
        videoId: track.videoId,
        title: track.displayTitle,
        thumbnail:
          track.sourceThumbnailUrl || getYouTubeThumbnailUrl(track.videoId),
        isFallback: true,
        supportCount1: track.supportCount1,
        supportCount2: track.supportCount2,
        supportCount3: track.supportCount3,
        gameTitle: track.gameTitle,
        trackTitle: track.trackTitle,
        displayTitle: track.displayTitle,
      }))
      .filter((item) => {
        const status = listenedStatusById[item.videoId];
        return !status || (status !== 'complete' && status !== 'partial');
      });

    // 2. Shuffle both independently (Fisher-Yates)
    const shuffleArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const shuffledNominations = shuffleArray(nominationPool);
    const shuffledFallbacks = shuffleArray(fallbackPool);

    // 3. Combine with prioritization (Nominations first, then fill with fallbacks)
    const combinedPool = [...shuffledNominations, ...shuffledFallbacks];

    // 4. De-duplicate (in case a track is in both lists)
    const uniqueMap = new Map();
    combinedPool.forEach((item) => {
      if (!uniqueMap.has(item.videoId)) uniqueMap.set(item.videoId, item);
    });
    const uniquePool = Array.from(uniqueMap.values());

    // 5. Commit to persistent state
    setPersistentDiscoveryItems(uniquePool.slice(0, 44));
  }, [
    discoveryCandidates,
    unplacedFallbackTracks,
    persistentDiscoveryItems.length,
    listenedStatusById,
  ]);

  const spotlightPool = useMemo(
    () =>
      persistentDiscoveryItems.length > 0
        ? persistentDiscoveryItems.filter((item) => !item.isFallback)
        : discoveryCandidates,
    [persistentDiscoveryItems, discoveryCandidates],
  );

  // Pin the first spotlight pool entry as the featured one; re-pin when the
  // current ID is no longer in the pool (list changed or track was listened).
  useEffect(() => {
    if (spotlightPool.length === 0 || isShowingFallback) return;
    const isValid = spotlightPool.some(
      (c) => c.videoId === featuredDiscoveryId,
    );
    if (!isValid) {
      setFeaturedDiscoveryId(spotlightPool[0].videoId);
    }
  }, [spotlightPool, featuredDiscoveryId, isShowingFallback]);

  const featuredDiscoveryCandidate = useMemo(() => {
    if (isShowingFallback || spotlightPool.length === 0) return null;
    return (
      spotlightPool.find(
        (candidate) => candidate.videoId === featuredDiscoveryId,
      ) ?? spotlightPool[0]
    );
  }, [spotlightPool, featuredDiscoveryId, isShowingFallback]);

  const totalVisibleNominationCount = useMemo(
    () =>
      visibleNominationUpdates.reduce(
        (sum, update) => sum + update.nominations.length,
        0,
      ),
    [visibleNominationUpdates],
  );

  useEffect(() => {
    if (!isAuthReady) return undefined;
    let isActive = true;

    async function loadDashboardUpdates() {
      // 1. Load fast spotlight candidate
      const fastCandidate = await getFastSpotlightCandidate();
      if (isActive && fastCandidate) {
        setFastSpotlightCandidate(fastCandidate);
      }

      // 2. Load static snapshot instantly
      const staticData = await loadStaticNominationUpdates();
      if (isActive && staticData.length > 0) {
        setNominationUpdates(staticData);
        setIsDashboardLoading(false);
      }

      // 3. Refresh quietly in the background
      try {
        const data = await fetchDashboardNominationUpdates(
          supabase,
          null, // Fetch all for catalog usage
        );
        if (!isActive) return;
        setNominationUpdates(data);
        onNominationsLoaded?.(data);
        setDashboardError('');
      } catch (error) {
        if (!isActive) return;
        setDashboardError(
          error.message || 'Could not load public nomination activity.',
        );
      } finally {
        if (isActive) {
          setIsDashboardLoading(false);
        }
      }
    }

    loadDashboardUpdates();

    // Fetch several unplaced tracks for grid fallback, starting at a random
    // offset so the Discover grid shows different tracks each page load.
    async function loadMarqueeFallbacks() {
      if (!supabase) return;
      try {
        const { totalCount } = await fetchPagedTracks(supabase, {
          viewMode: 'unplaced',
          limit: 1,
        });
        const randomOffset =
          totalCount > 30 ? Math.floor(Math.random() * (totalCount - 30)) : 0;
        const { data } = await fetchPagedTracks(supabase, {
          viewMode: 'unplaced',
          limit: 30,
          offset: randomOffset,
        });
        if (isActive && data) {
          setUnplacedFallbackTracks(data);
        }
      } catch (err) {
        console.warn('Failed to load marquee fallbacks:', err);
      }
    }
    loadMarqueeFallbacks();

    return () => {
      isActive = false;
    };
  }, [supabase, isAuthReady, onNominationsLoaded]);

  useEffect(() => {
    if (!isAuthReady) return undefined;
    let isActive = true;

    async function loadExtraHomeData() {
      if (!supabase) return;
      if (!prospectiveFallbackTrack) {
        setIsExtraLoading(true);
      }

      try {
        const { totalCount } = await fetchPagedTracks(supabase, { limit: 1 });
        const listenedCount = Object.values(listenedStatusById || {}).filter(
          (status) => status === 'complete' || status === 'partial',
        ).length;

        if (isActive) {
          setDbUnlistenedCount(Math.max(0, totalCount - listenedCount));
          // Only load a fallback if we don't have one yet, to prevent jumping during playback
          if (prospectiveFallbackTrack && !isDashboardLoading) {
            setIsExtraLoading(false);
            return;
          }

          const excludeIds = Object.keys(listenedStatusById || {});
          const unplacedTrack = await fetchRandomUnplacedVgmcTrack(
            supabase,
            excludeIds,
          );

          if (isActive && unplacedTrack) {
            const mappedTrack = mapTrackCatalogEntryToVideo(unplacedTrack);
            setProspectiveFallbackTrack({
              ...mappedTrack,
              tournaments: unplacedTrack.tournaments || [],
              isVgmcUnplaced: true,
            });
          }
          setIsExtraLoading(false);
        }
      } catch {
        // Ignore error
      } finally {
        if (isActive) {
          setIsExtraLoading(false);
        }
      }
    }

    loadExtraHomeData();

    return () => {
      isActive = false;
    };
  }, [
    supabase,
    listenedStatusById,
    isAuthReady,
    isDashboardLoading,
    prospectiveFallbackTrack,
  ]);

  useEffect(() => {
    if (!isAuthReady) return undefined;
    let isActive = true;
    async function loadMaxVgmc() {
      if (!supabase) return;
      try {
        const maxVal = await fetchMaxVgmcNumber(supabase);
        if (isActive) setMaxVgmcNumber(maxVal);
      } catch (err) {
        console.error('Failed to fetch max VGMC:', err);
      }
    }
    loadMaxVgmc();
    return () => {
      isActive = false;
    };
  }, [supabase, isAuthReady]);

  useEffect(() => {
    if (!isAuthReady) return undefined;
    let isActive = true;
    async function enrichTrackMetadata() {
      if (!supabase) return;
      const discoveryIds = discoveryCandidates.map((c) => c.videoId);
      const updateIds = visibleNominationUpdates.flatMap((u) =>
        u.nominations.map((n) => n.videoId),
      );
      const allVideoIds = [...new Set([...discoveryIds, ...updateIds])];

      if (allVideoIds.length === 0) return;

      try {
        const metadataList = await fetchTrackCatalogByVideoIds(
          supabase,
          allVideoIds,
        );
        if (!isActive) return;
        const metaMap = {};
        metadataList.forEach((track) => {
          metaMap[track.videoId] = track;
        });
        setTrackMetadataById((prev) => ({ ...prev, ...metaMap }));
      } catch (err) {
        console.error('Failed to enrich track metadata:', err);
      } finally {
        if (isActive) {
          setIsMetadataLoading(false);
        }
      }
    }
    enrichTrackMetadata();
    return () => {
      isActive = false;
    };
  }, [supabase, discoveryCandidates, visibleNominationUpdates, isAuthReady]);

  const handleAddDiscoveryCandidate = useCallback(
    (videoOrArray) => {
      const videos = Array.isArray(videoOrArray)
        ? videoOrArray
        : [videoOrArray];
      const resolved = videos.map((v) => resolveTrack(v));
      onAddToPlaylist?.(resolved);
      onShowToast?.(
        `${resolved.length} ${resolved.length === 1 ? 'song' : 'songs'} added to queue`,
      );
    },
    [onAddToPlaylist, onShowToast, resolveTrack],
  );

  const handlePlayDiscoveryCandidate = useCallback(
    (video, update) => {
      if (update?.userId && onPlayCommunityListFromTrack) {
        onPlayCommunityListFromTrack(
          update.userId,
          video.videoId,
          update.nominations,
        );
      } else {
        onPlayNow?.(resolveTrack(video));
      }
    },
    [onPlayNow, onPlayCommunityListFromTrack, resolveTrack],
  );

  const handleAddWholeList = useCallback(
    (update) => {
      const resolved = update.nominations.map((v) => resolveTrack(v));
      onAddToPlaylist?.(resolved);
      onShowToast?.(`Added all ${resolved.length} songs to queue`);
    },
    [onAddToPlaylist, onShowToast, resolveTrack],
  );

  const handleAddUpdates = useCallback(
    (update) => {
      const unplaced = update.nominations.filter(
        (v) => !currentPlaylistIds.has(v.videoId),
      );

      if (unplaced.length === 0) {
        onShowToast?.('All songs from this list are already in your queue');
        return;
      }

      const resolved = unplaced.map((v) => resolveTrack(v));
      onAddToPlaylist?.(resolved);
      onShowToast?.(
        `Added ${resolved.length} new ${resolved.length === 1 ? 'song' : 'songs'} to queue`,
      );
    },
    [currentPlaylistIds, onAddToPlaylist, onShowToast, resolveTrack],
  );

  const handleFindNewSong = useCallback(async () => {
    setFastSpotlightCandidate(null);

    const nextCandidate = pickNextDiscoveryCandidate(
      spotlightPool,
      featuredDiscoveryId,
    );

    if (nextCandidate) {
      setIsShowingFallback(false);
      setFeaturedDiscoveryId(nextCandidate.videoId);
      return;
    }

    const excludeIds = Object.keys(listenedStatusById || {});
    if (supabase) {
      try {
        const unplacedTrack = await fetchRandomUnplacedVgmcTrack(
          supabase,
          excludeIds,
        );
        if (unplacedTrack) {
          const mappedTrack = mapTrackCatalogEntryToVideo(unplacedTrack);
          setProspectiveFallbackTrack({
            ...mappedTrack,
            tournaments: unplacedTrack.tournaments || [],
            isVgmcUnplaced: true,
          });
          setIsShowingFallback(true);
          onShowToast?.('Showcasing a random unplaced VGMC track!');
          return;
        }
      } catch {
        onShowToast?.('Failed to fetch a random unplaced track.');
      }
    }

    onShowToast?.('No fresh nomination picks are available right now.');
  }, [
    featuredDiscoveryId,
    spotlightPool,
    onShowToast,
    listenedStatusById,
    supabase,
  ]);

  const dashboardStats = useMemo(
    () => [
      {
        label: 'Nomination Lists',
        value: visibleNominationUpdates.length,
        accent: 'purple',
      },
      {
        label: 'New Nominations',
        value: totalVisibleNominationCount,
        accent: 'orange',
      },
      {
        label: authUser ? 'Unheard from DB' : 'VGMC Nominations',
        value: dbUnlistenedCount || 0,
        accent: 'blue',
      },
    ],
    [
      visibleNominationUpdates.length,
      totalVisibleNominationCount,
      authUser,
      dbUnlistenedCount,
    ],
  );

  const dashboardStatTexts = useMemo(
    () => dashboardStats.map((s) => `${s.value} ${s.label}`),
    [dashboardStats],
  );

  const sectionSummaries = useMemo(
    () => ({
      overview:
        !isAuthReady || isDashboardLoading
          ? 'Loading current dashboard stats'
          : `${visibleNominationUpdates.length} lists, ${discoveryCandidates.length} picks`,
      discover:
        !isAuthReady || isDashboardLoading
          ? 'Loading picks'
          : discoveryCandidates.length === 0
            ? 'You are caught up'
            : `${discoveryCandidates.length} discovery picks`,
    }),
    [
      discoveryCandidates.length,
      isDashboardLoading,
      visibleNominationUpdates.length,
      isAuthReady,
    ],
  );

  useEffect(() => {
    setMobileCollapsedSections(
      isMobileLayout
        ? MOBILE_DASHBOARD_COLLAPSE_DEFAULTS
        : DESKTOP_DASHBOARD_COLLAPSE_DEFAULTS,
    );
  }, [isMobileLayout]);

  const toggleMobileSection = useCallback((sectionKey) => {
    setMobileCollapsedSections((previousState) => ({
      ...previousState,
      [sectionKey]: !previousState[sectionKey],
    }));
  }, []);

  const handleDiscoveryContextAction = useCallback(
    (action, candidate, e) => {
      setDiscoveryContextMenu(null);
      const resolved = resolveTrack(candidate);

      if (action === 'play') {
        onPlayNow?.(resolved);
      } else if (action === 'add') {
        onAddToPlaylist?.([resolved]);
        onShowToast?.('Added to queue');
      } else if (action === 'support') {
        const videoId = candidate.videoId;
        if (!supportStatusById[videoId]?.isSupported) {
          onToggleSupport?.(resolved);
          if (onOpenSupportDropdown && e) {
            onOpenSupportDropdown(resolved, {
              top: e.clientY,
              left: e.clientX,
            });
          }
        } else {
          onToggleSupport?.(resolved);
        }
      } else if (action === 'comments') {
        onShowComments?.(resolved, {
          top: e.clientY,
          left: e.clientX,
          width: 0,
          height: 0,
        });
      } else if (action === 'nominate') {
        onToggleNomination?.(resolved);
      } else if (action === 'metadata') {
        onUpdateMetadata?.(resolved);
      }
    },
    [
      onPlayNow,
      onAddToPlaylist,
      onShowToast,
      onToggleSupport,
      onToggleNomination,
      onOpenSupportDropdown,
      onShowComments,
      onUpdateMetadata,
      resolveTrack,
      supportStatusById,
    ],
  );

  const handleNominationContextAction = useCallback(
    (action, e, video) => {
      setNominationContextMenu(null);
      const resolved = resolveTrack(video);
      if (action === 'play') onPlayNow?.(resolved);
      else if (action === 'add') onAddToPlaylist?.([resolved]);
      else if (action === 'support') {
        if (!supportStatusById[video.videoId]?.isSupported) {
          onToggleSupport?.(resolved);
          if (onOpenSupportDropdown && e) {
            onOpenSupportDropdown(resolved, {
              top: e.clientY,
              left: e.clientX,
            });
          }
        } else {
          onToggleSupport?.(resolved);
        }
      } else if (action === 'comments' && e) {
        onShowComments?.(resolved, {
          top: e.clientY,
          left: e.clientX,
          width: 0,
          height: 0,
        });
      } else if (action === 'nominate') {
        onToggleNomination?.(resolved);
      }
    },
    [
      onPlayNow,
      onAddToPlaylist,
      onToggleSupport,
      onToggleNomination,
      onOpenSupportDropdown,
      onShowComments,
      resolveTrack,
      supportStatusById,
    ],
  );

  return (
    <div className="home-shell dashboard-home-shell">
      <section className="dashboard-hero" aria-label="Dashboard overview">
        <div className="dashboard-hero-bg">
          <AnimatedGridPattern
            numSquares={30}
            maxOpacity={0.15}
            duration={3}
            repeatDelay={1}
            className="dashboard-hero-animated-grid"
          />
        </div>
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-badge">Community Dashboard</span>
          <h1 className="dashboard-hero-title">NomPlayer</h1>

          <p className="dashboard-hero-description">
            Track recently refreshed nomination lists, find songs you might have
            missed, and discover older tracks from the VGMC archives.
          </p>

          <div className="dashboard-hero-footer">
            <div className="dashboard-hero-start-hint">
              Start here <span className="dashboard-hero-start-arrow">↓</span>
            </div>
            <div className="dashboard-hero-actions">
              <Dock items={dockItems} />
            </div>

            <div className="dashboard-stat-strip dynamic-stat-strip">
              <div className={`dashboard-stat-card-consolidated`}>
                <div className="dashboard-stat-label-box">
                  {!isDashboardLoading ? (
                    <TextType
                      key={dashboardStatTexts.join('|')}
                      text={dashboardStatTexts}
                      className="dashboard-stat-label-rotation"
                      typingSpeed={60}
                      deletingSpeed={30}
                      pauseDuration={5000}
                      showCursor={true}
                      cursorCharacter="_"
                      loop={true}
                    />
                  ) : (
                    <TextType
                      text={['']}
                      className="dashboard-stat-label-rotation"
                      showCursor={true}
                      cursorCharacter="_"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-hero-leaderboard-container">
          <HeroLeaderboard
            yourNominations={yourNominations}
            yourSupports={yourSupports}
            globalLeaderboard={globalLeaderboard}
            authUser={authUser}
            isLoading={isDashboardLoading || isMetadataLoading}
            globalActivityByVideoId={globalActivityByVideoId}
            resolveTrack={resolveTrack}
            onShowComments={onShowComments}
            isFeedbackPanelOpen={isFeedbackPanelOpen}
            onPlayTrack={handlePlayDiscoveryCandidate}
            onPlayFromNominationList={onPlayFromNominationList}
            onPlayFromSupportList={onPlayFromSupportList}
            onContextMenu={(e, item, source) => {
              e.preventDefault();
              setDiscoveryContextMenu({
                x: e.clientX,
                y: e.clientY,
                candidate: item,
                source: source,
              });
            }}
          />
        </div>

        {!isMobileLayout && (
          <div className="dashboard-hero-spotlight">
            {!isAuthReady ||
            ((isDashboardLoading || isExtraLoading) &&
              !fastSpotlightCandidate &&
              !featuredDiscoveryCandidate) ? (
              <div className="dashboard-feature-card dashboard-feature-card-hero dashboard-hero-loader-placeholder">
                <div className="hero-loader-image-skeleton">
                  <div
                    className="hero-loader-spinner"
                    aria-label="Loading hero showcase"
                  />
                </div>
                <div className="hero-loader-copy-skeleton">
                  <div className="skeleton-line kicker" />
                  <div className="skeleton-line title" />
                  <div className="skeleton-line meta" />
                  <div className="skeleton-actions-skeleton">
                    <div className="skeleton-button" />
                    <div className="skeleton-button" />
                    <div className="skeleton-button" />
                  </div>
                </div>
              </div>
            ) : featuredDiscoveryCandidate || fastSpotlightCandidate ? (
              <article className="dashboard-feature-card dashboard-feature-card-hero animate-fade-in">
                {isMobileLayout && (
                  <div className="dashboard-feature-mobile-header">
                    <span className="dashboard-feature-meta-vgmc">
                      VGMC {maxVgmcNumber + 1}
                    </span>
                    <button
                      className="dashboard-action-btn dashboard-action-btn-muted dashboard-action-btn-inline"
                      type="button"
                      onClick={() =>
                        handlePlayDiscoveryCandidate(
                          featuredDiscoveryCandidate || fastSpotlightCandidate,
                        )
                      }
                    >
                      Listen Now
                    </button>
                  </div>
                )}
                <img
                  className="dashboard-feature-thumb"
                  src={
                    (featuredDiscoveryCandidate || fastSpotlightCandidate)
                      .thumbnail
                  }
                  alt=""
                  loading="lazy"
                  title="Right-click for options"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setDiscoveryContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      candidate:
                        featuredDiscoveryCandidate || fastSpotlightCandidate,
                      source: 'spotlight',
                    });
                  }}
                />

                <div className="dashboard-feature-copy">
                  <span className="dashboard-feature-kicker">
                    New Nomination
                  </span>
                  <h2 className="dashboard-feature-title">
                    <ScrollingText
                      text={(() => {
                        const spotlightVideo =
                          featuredDiscoveryCandidate || fastSpotlightCandidate;
                        const meta = mergedMetadata[spotlightVideo.videoId];
                        return meta
                          ? `${meta.gameTitle} - ${meta.trackTitle}`
                          : spotlightVideo.title;
                      })()}
                      truncateWhenStatic={true}
                    />
                  </h2>
                  <div className="dashboard-feature-meta">
                    {!isMobileLayout && (
                      <p className="dashboard-feature-meta-vgmc">
                        VGMC {maxVgmcNumber + 1}
                      </p>
                    )}
                    <p className="dashboard-feature-meta-nominators">
                      Nominated by{' '}
                      {(
                        featuredDiscoveryCandidate || fastSpotlightCandidate
                      ).nominators
                        .map((nominator) =>
                          getDisplayProfileName(nominator.username),
                        )
                        .join(', ')}
                    </p>
                  </div>
                  <div className="dashboard-feature-actions">
                    {!isMobileLayout && (
                      <button
                        className="dashboard-action-btn dashboard-action-btn-muted"
                        type="button"
                        onClick={() =>
                          handlePlayDiscoveryCandidate(
                            fastSpotlightCandidate ||
                              featuredDiscoveryCandidate,
                          )
                        }
                      >
                        Listen Now
                      </button>
                    )}
                    <button
                      className="dashboard-action-btn"
                      type="button"
                      onClick={() =>
                        handleAddDiscoveryCandidate(
                          featuredDiscoveryCandidate || fastSpotlightCandidate,
                        )
                      }
                    >
                      Add to Queue
                    </button>
                    <button
                      className="dashboard-action-btn dashboard-action-btn-muted"
                      type="button"
                      onClick={handleFindNewSong}
                    >
                      New Song
                    </button>
                  </div>
                </div>
              </article>
            ) : prospectiveFallbackTrack ? (
              <article className="dashboard-feature-card dashboard-feature-card-hero animate-fade-in">
                {isMobileLayout && (
                  <div className="dashboard-feature-mobile-header">
                    <span className="dashboard-feature-meta-vgmc">
                      {(() => {
                        const sequenceNumbers = [
                          ...new Set(
                            (prospectiveFallbackTrack.tournaments || [])
                              .map((t) => t.sequenceNumber || t.sequence_number)
                              .filter((n) => Number.isInteger(n)),
                          ),
                        ].sort((a, b) => a - b);
                        return sequenceNumbers.length > 0
                          ? `VGMC ${sequenceNumbers.join(', ')}`
                          : 'VGMC Unplaced';
                      })()}
                    </span>
                    <button
                      className="dashboard-action-btn dashboard-action-btn-muted dashboard-action-btn-inline"
                      type="button"
                      onClick={() =>
                        handlePlayDiscoveryCandidate(prospectiveFallbackTrack)
                      }
                    >
                      Listen Now
                    </button>
                  </div>
                )}
                <img
                  className="dashboard-feature-thumb"
                  src={prospectiveFallbackTrack.thumbnail}
                  alt=""
                  loading="lazy"
                  title="Right-click for options"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setDiscoveryContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      candidate: prospectiveFallbackTrack,
                      source: 'spotlight',
                    });
                  }}
                />

                <div className="dashboard-feature-copy">
                  <span className="dashboard-feature-kicker">
                    VGMC Unplaced
                  </span>
                  <h2 className="dashboard-feature-title">
                    <ScrollingText
                      text={
                        prospectiveFallbackTrack.gameTitle &&
                        prospectiveFallbackTrack.trackTitle
                          ? `${prospectiveFallbackTrack.gameTitle} - ${prospectiveFallbackTrack.trackTitle}`
                          : prospectiveFallbackTrack.title
                      }
                      truncateWhenStatic={true}
                    />
                  </h2>
                  <div className="dashboard-feature-meta">
                    {!isMobileLayout && (
                      <p className="dashboard-feature-meta-vgmc">
                        {(() => {
                          const sequenceNumbers = [
                            ...new Set(
                              (prospectiveFallbackTrack.tournaments || [])
                                .map(
                                  (t) => t.sequenceNumber || t.sequence_number,
                                )
                                .filter((n) => Number.isInteger(n)),
                            ),
                          ].sort((a, b) => a - b);
                          return sequenceNumbers.length > 0
                            ? `VGMC ${sequenceNumbers.join(', ')}`
                            : 'VGMC Unplaced';
                        })()}
                      </p>
                    )}
                  </div>
                  <div className="dashboard-feature-actions">
                    {!isMobileLayout && (
                      <button
                        className="dashboard-action-btn dashboard-action-btn-muted"
                        type="button"
                        onClick={() =>
                          handlePlayDiscoveryCandidate(prospectiveFallbackTrack)
                        }
                      >
                        Listen Now
                      </button>
                    )}
                    <button
                      className="dashboard-action-btn"
                      type="button"
                      onClick={() =>
                        handleAddDiscoveryCandidate(prospectiveFallbackTrack)
                      }
                    >
                      Add to Queue
                    </button>
                    <button
                      className="dashboard-action-btn dashboard-action-btn-muted"
                      type="button"
                      onClick={handleFindNewSong}
                    >
                      New Song
                    </button>
                  </div>
                </div>
              </article>
            ) : (
              <DashboardMessage>
                No featured discovery pick is available yet.
              </DashboardMessage>
            )}
          </div>
        )}
      </section>

      <div className="home-sections">
        <DashboardSection
          title="Updated Nominations"
          eyebrow="Community"
          tone="discover"
          caption="Recently refreshed nomination lists from other users."
          className="dashboard-nominations-section"
          isMobileLayout={isMobileLayout}
          isCollapsed={isMobileLayout && mobileCollapsedSections.nominations}
          onToggleCollapse={() => toggleMobileSection('nominations')}
          summary={sectionSummaries.nominations}
          actions={
            authUser && (
              <button
                className={`dashboard-nominations-user-toggle ${
                  isHidingOwnNominations ? 'is-hiding' : ''
                }`}
                type="button"
                onClick={() =>
                  setIsHidingOwnNominations(!isHidingOwnNominations)
                }
                title={
                  isHidingOwnNominations
                    ? 'Show your nominations'
                    : 'Hide your nominations'
                }
              >
                {userProfile?.avatar_url ||
                authUser?.user_metadata?.avatar_url ? (
                  <img
                    className="dashboard-nominations-user-avatar"
                    src={
                      userProfile?.avatar_url ||
                      authUser?.user_metadata?.avatar_url
                    }
                    alt=""
                  />
                ) : (
                  <div className="dashboard-nominations-user-avatar-placeholder">
                    {(
                      userProfile?.username ||
                      authUser?.user_metadata?.username ||
                      'U'
                    )
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                )}
              </button>
            )
          }
        >
          {isDashboardLoading ? (
            <div className="dashboard-nominations-loader">
              <div
                className="hero-loader-spinner"
                aria-label="Loading nomination updates"
              />
            </div>
          ) : dashboardError ? (
            <DashboardMessage tone="danger">{dashboardError}</DashboardMessage>
          ) : visibleNominationUpdates.length === 0 ? (
            <div className="dashboard-update-list animate-fade-in">
              <NominationEmptyCard />
              <NominationEmptyCard />
              <NominationEmptyCard />
            </div>
          ) : (
            <>
              {expandedUserId && (
                <div
                  className="modal-backdrop nomination-card-backdrop-sectional"
                  onClick={() => setExpandedUserId(null)}
                  role="presentation"
                />
              )}
              <div className="dashboard-nominations-carousel-container animate-fade-in">
                <ThreeDCarousel
                  autoRotate={
                    !expandedUserId &&
                    !isFeedbackPanelOpen &&
                    !nominationContextMenu
                  }
                >
                  {visibleNominationUpdates.slice(0, 10).map((update) => (
                    <NominationUpdateCard
                      key={update.userId}
                      update={update}
                      metadataById={mergedMetadata}
                      isExpanded={expandedUserId === update.userId}
                      onToggleExpand={setExpandedUserId}
                      onAddWholeList={handleAddWholeList}
                      onAddUpdates={handleAddUpdates}
                      onPlayTrack={handlePlayDiscoveryCandidate}
                      onAddTrack={handleAddDiscoveryCandidate}
                      onShowComments={onShowComments}
                      onToggleSupport={onToggleSupport}
                      onOpenSupportDropdown={onOpenSupportDropdown}
                      supportStatusById={supportStatusById}
                      globalActivityByVideoId={globalActivityByVideoId}
                      isFeedbackPanelOpen={isFeedbackPanelOpen}
                      resolveTrack={resolveTrack}
                      isMetadataLoading={isMetadataLoading}
                      onContextMenu={setNominationContextMenu}
                    />
                  ))}
                </ThreeDCarousel>
              </div>
            </>
          )}
        </DashboardSection>

        <DashboardSection
          title="Community Playlists"
          eyebrow="Browse"
          className="dashboard-section-community-playlists"
          actions={
            <button
              className="dashboard-action-btn dashboard-action-btn-muted"
              type="button"
              onClick={onNavigateToCommunityPlaylists}
            >
              View All
            </button>
          }
        >
          <HomeCommunityPlaylistsStrip
            supabase={supabase}
            authUser={authUser}
            onPlayPlaylist={onPlayPlaylist}
            onAddToPlaylist={onAddToPlaylist}
            onShowToast={onShowToast}
            isAuthReady={isAuthReady}
          />
        </DashboardSection>

        <DashboardSection
          title="Discover"
          eyebrow="Recommended"
          tone="manage"
          caption="Check out some of this years Nominations from the community, and older tracks that didn't make the bubble."
          className="dashboard-section-discover"
          isMobileLayout={isMobileLayout}
          isCollapsed={isMobileLayout && mobileCollapsedSections.discover}
          onToggleCollapse={() => toggleMobileSection('discover')}
          summary={sectionSummaries.discover}
        >
          {persistentDiscoveryItems.length === 0 ? (
            <DashboardMessage>
              You are caught up for now. When more nomination lists appear, new
              discovery picks will show here.
            </DashboardMessage>
          ) : (
            <DiscoveryMarqueeGrid>
              {persistentDiscoveryItems.map((candidate) => (
                <DiscoveryGridItem
                  key={candidate.videoId}
                  candidate={candidate}
                  metadata={mergedMetadata[candidate.videoId] || candidate}
                  onAdd={handleAddDiscoveryCandidate}
                  onPlayNow={handlePlayDiscoveryCandidate}
                  onContextMenu={(e, item) => {
                    e.preventDefault();
                    setDiscoveryContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      candidate: item,
                      source: 'discover',
                    });
                  }}
                />
              ))}
            </DiscoveryMarqueeGrid>
          )}
        </DashboardSection>
      </div>

      {discoveryContextMenu && (
        <ContextMenuPortal
          x={discoveryContextMenu.x}
          y={discoveryContextMenu.y}
          onClose={() => setDiscoveryContextMenu(null)}
          className="playlist-context-menu"
        >
          <button
            className="playlist-context-menu-item"
            onClick={(e) =>
              handleDiscoveryContextAction(
                'play',
                discoveryContextMenu.candidate,
                e,
              )
            }
          >
            <span>Play Now</span>
          </button>
          <button
            className="playlist-context-menu-item"
            onClick={(e) =>
              handleDiscoveryContextAction(
                'add',
                discoveryContextMenu.candidate,
                e,
              )
            }
          >
            <span>Add to Queue</span>
          </button>
          <CustomPlaylistSubmenu
            videos={[discoveryContextMenu.candidate]}
            customPlaylists={customPlaylists}
            onUpdateCustomPlaylists={onUpdateCustomPlaylists}
            onShowToast={onShowToast}
            onClose={() => setDiscoveryContextMenu(null)}
            itemClassName="playlist-context-menu-item"
          />
          <div className="context-menu-divider" />
          {!(
            supportStatusById[discoveryContextMenu.candidate.videoId]
              ?.isSupported &&
            (discoveryContextMenu.source === 'nominations' ||
              discoveryContextMenu.source === 'global')
          ) && (
            <button
              className={`playlist-context-menu-item ${
                supportStatusById[discoveryContextMenu.candidate.videoId]
                  ?.isSupported
                  ? 'active has-feedback'
                  : ''
              }`}
              onClick={(e) =>
                handleDiscoveryContextAction(
                  'support',
                  discoveryContextMenu.candidate,
                  e,
                )
              }
            >
              <span>
                {supportStatusById[discoveryContextMenu.candidate.videoId]
                  ?.isSupported
                  ? 'Remove from Support List'
                  : 'Add to Support List'}
              </span>
            </button>
          )}
          {!supportStatusById[discoveryContextMenu.candidate.videoId]
            ?.isNominated && (
            <button
              className="playlist-context-menu-item"
              onClick={(e) =>
                handleDiscoveryContextAction(
                  'nominate',
                  discoveryContextMenu.candidate,
                  e,
                )
              }
            >
              <span>Add to Nominations</span>
            </button>
          )}
          <div className="context-menu-divider" />
          <button
            className="playlist-context-menu-item"
            onClick={(e) =>
              handleDiscoveryContextAction(
                'comments',
                discoveryContextMenu.candidate,
                e,
              )
            }
          >
            <span>View Activity and Comments</span>
          </button>
          {authUser && (
            <button
              className="playlist-context-menu-item"
              onClick={(e) =>
                handleDiscoveryContextAction(
                  'metadata',
                  discoveryContextMenu.candidate,
                  e,
                )
              }
            >
              <span>Update Metadata</span>
            </button>
          )}
        </ContextMenuPortal>
      )}

      {nominationContextMenu && (
        <ContextMenuPortal
          x={nominationContextMenu.x}
          y={nominationContextMenu.y}
          onClose={() => setNominationContextMenu(null)}
          className="playlist-context-menu"
        >
          <button
            className="playlist-context-menu-item"
            onClick={(e) =>
              handleNominationContextAction(
                'play',
                e,
                nominationContextMenu.video,
              )
            }
          >
            <span>Play Now</span>
          </button>
          <button
            className="playlist-context-menu-item"
            onClick={(e) =>
              handleNominationContextAction(
                'add',
                e,
                nominationContextMenu.video,
              )
            }
          >
            <span>Add to Queue</span>
          </button>
          <CustomPlaylistSubmenu
            videos={[nominationContextMenu.video]}
            customPlaylists={customPlaylists}
            onUpdateCustomPlaylists={onUpdateCustomPlaylists}
            onShowToast={onShowToast}
            onClose={() => setNominationContextMenu(null)}
            itemClassName="playlist-context-menu-item"
          />
          <div className="context-menu-divider" />
          <button
            className={`playlist-context-menu-item ${
              supportStatusById[nominationContextMenu.video.videoId]
                ?.isSupported
                ? 'active has-feedback'
                : ''
            }`}
            onClick={(e) =>
              handleNominationContextAction(
                'support',
                e,
                nominationContextMenu.video,
              )
            }
          >
            <span>
              {supportStatusById[nominationContextMenu.video.videoId]
                ?.isSupported
                ? 'Remove from Support List'
                : 'Add to Support List'}
            </span>
          </button>
          {!supportStatusById[nominationContextMenu.video.videoId]
            ?.isNominated && (
            <button
              className="playlist-context-menu-item"
              onClick={(e) =>
                handleNominationContextAction(
                  'nominate',
                  e,
                  nominationContextMenu.video,
                )
              }
            >
              <span>Add to Nominations</span>
            </button>
          )}
          <div className="context-menu-divider" />
          <button
            className="playlist-context-menu-item"
            onClick={(e) =>
              handleNominationContextAction(
                'comments',
                e,
                nominationContextMenu.video,
              )
            }
          >
            <span>View Activity and Comments</span>
          </button>
        </ContextMenuPortal>
      )}
    </div>
  );
}
