import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DiscordIcon from './DiscordIcon.jsx';
import ScrollingText from './ScrollingText.jsx';
import { getYouTubeThumbnailUrl } from '../utils/youtube.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import {
  buildDiscoveryCandidates,
  fetchDashboardNominationUpdates,
  fetchDashboardVgmcUpdates,
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
import { HeartIcon, LockIcon } from './Icons.jsx';

const DASHBOARD_REFRESH_LIMIT = 8;

const PlayIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PlaylistPlusIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
  </svg>
);

const SpeechBubbleIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
    <path
      fillRule="evenodd"
      d="M10 2c-2.236 0-4.43.18-6.57.532a2.31 2.31 0 00-1.93 2.185c-.286 1.9-.447 3.832-.482 5.8a2.301 2.301 0 001.077 2.05L4 14.5V17a1 1 0 001.625.78L8.734 15.1c.42.025.84.042 1.266.05 2.236 0 4.43-.18 6.57-.532a2.31 2.31 0 001.93-2.185c.286-1.9.447-3.832.482-5.8a2.301 2.301 0 00-1.077-2.05L16 3.5V2h-6z"
      clipRule="evenodd"
    />
  </svg>
);

const MOBILE_DASHBOARD_COLLAPSE_DEFAULTS = {
  overview: false,
  nominations: false,
  discover: true,
  updates: true,
};
const DESKTOP_DASHBOARD_COLLAPSE_DEFAULTS = {
  overview: false,
  nominations: false,
  discover: false,
  updates: false,
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
}) {
  return (
    <section
      className={`dashboard-section-feed ${className}`}
      aria-label={title}
    >
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
  globalCommentedVideoIds = new Set(),
  isFeedbackPanelOpen = false,
  resolveTrack,
}) {
  const displayIdentity = parseStoredProfileUsername(update.username);
  const nominationCount = update.nominations.length;
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextAction = useCallback(
    (action, e, video) => {
      setContextMenu(null);
      const resolved = resolveTrack(video);
      if (action === 'play') onPlayTrack(resolved);
      else if (action === 'add') onAddTrack([resolved]);
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
      }
    },
    [
      onPlayTrack,
      onAddTrack,
      onToggleSupport,
      onOpenSupportDropdown,
      onShowComments,
      resolveTrack,
      supportStatusById,
    ],
  );

  const renderPeekRowActivity = (video, index) => {
    const hasSupport = supportStatusById[video.videoId]?.isSupported;
    const hasComments = globalCommentedVideoIds.has(video.videoId);
    const hasActivity = hasSupport || hasComments;

    return (
      <div
        key={video.videoId}
        className={`dashboard-update-peek-row ${hasActivity ? 'has-activity' : ''}`}
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
          onPlayTrack(resolveTrack(video));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            video,
          });
        }}
      >
        <span className="dashboard-update-peek-index" aria-hidden="true">
          {index + 1}
        </span>
        {hasActivity && (
          <button
            className="peek-action-btn peek-action-btn-activity"
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
            title="View activity and comments"
          >
            <SpeechBubbleIcon size={18} />
          </button>
        )}
        <div className="dashboard-update-peek-content">
          <span className="dashboard-update-peek-game">
            {metadataById[video.videoId]?.gameTitle || 'Unknown Game'}
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
            title="Add to current playlist"
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
              if (!supportStatusById[video.videoId]?.isSupported) {
                onToggleSupport?.(resolved);
                const rect = e.currentTarget.getBoundingClientRect();
                onOpenSupportDropdown?.(resolved, {
                  top: rect.top,
                  left: rect.left + rect.width / 2,
                });
              } else {
                onToggleSupport?.(resolved);
              }
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
                ? 'Remove support'
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
              onPlayTrack(resolveTrack(video));
            }}
            title="Play now"
          >
            <PlayIcon size={20} />
          </button>
          <button
            className="peek-action-btn peek-action-btn-comments"
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
            title="View comments"
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
                {update.nominations && update.nominations.length > 0 ? (
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
              <div className="dashboard-update-peek-list">
                {update.nominations
                  .slice(0, 20)
                  .map((video, index) => renderPeekRowActivity(video, index))}
              </div>
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

      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          className="playlist-context-menu"
        >
          <button
            className="playlist-context-menu-item"
            onClick={(e) => handleContextAction('play', e, contextMenu.video)}
          >
            <span>Play Now</span>
          </button>
          <button
            className="playlist-context-menu-item"
            onClick={(e) => handleContextAction('add', e, contextMenu.video)}
          >
            <span>Add to current playlist</span>
          </button>
          <button
            className={`playlist-context-menu-item ${
              supportStatusById[contextMenu.video.videoId]?.isSupported
                ? 'active has-feedback'
                : ''
            }`}
            onClick={(e) =>
              handleContextAction('support', e, contextMenu.video)
            }
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleContextAction('support', e, contextMenu.video);
            }}
          >
            <span>
              {supportStatusById[contextMenu.video.videoId]?.isSupported
                ? 'Remove from support list'
                : 'Add to support list'}
            </span>
          </button>
          <button
            className="playlist-context-menu-item"
            onClick={(e) =>
              handleContextAction('comments', e, contextMenu.video)
            }
          >
            <span>View activity and comments</span>
          </button>
        </ContextMenuPortal>
      )}
    </>
  );
}

function DiscoveryGridItem({ candidate, metadata, onPlayNow }) {
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
      title="Double-click to play"
      onDoubleClick={() => onPlayNow(candidate)}
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
                    <SpeechBubbleIcon size={14} />
                    <span>{candidate.nominationCount}</span>
                  </div>
                )}
                {supportCount1 > 0 && (
                  <div
                    className="discovery-support-stat normal"
                    title={`${supportCount1} Normal Supports`}
                  >
                    <HeartIcon />
                    <span>{supportCount1}</span>
                  </div>
                )}
                {supportCount2 > 0 && (
                  <div
                    className="discovery-support-stat strong"
                    title={`${supportCount2} Strong Supports`}
                  >
                    <HeartIcon />
                    <span>{supportCount2}</span>
                  </div>
                )}
                {supportCount3 > 0 && (
                  <div
                    className="discovery-support-stat highest"
                    title={`${supportCount3} Highest Supports`}
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

function VgmcThreadItem({ thread }) {
  return (
    <a
      className="dashboard-thread-item"
      href={thread.url}
      target="_blank"
      rel="noreferrer"
    >
      <span className="dashboard-thread-icon" aria-hidden="true">
        #
      </span>
      <span className="dashboard-thread-copy">
        <span className="dashboard-thread-title">{thread.title}</span>
        <span className="dashboard-thread-meta">Open thread</span>
      </span>
    </a>
  );
}

export default function HomePage({
  supabase,
  authUser = null,
  currentPlaylist = [],
  listenedStatusById = {},
  onAddToPlaylist,
  onPlayNow,
  onShowComments,
  onNavigateToPlayer,
  onToggleSupport,
  onOpenSupportDropdown,
  supportStatusById = {},
  isFeedbackPanelOpen = false,
  globalCommentedVideoIds = new Set(),
  onShowToast,
  isAuthReady = true,
}) {
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
  const [nominationUpdates, setNominationUpdates] = useState([]);
  const [unplacedFallbackTracks, setUnplacedFallbackTracks] = useState([]);
  const [persistentDiscoveryItems, setPersistentDiscoveryItems] = useState([]);
  const [vgmcThreads, setVgmcThreads] = useState([]);
  const [dashboardError, setDashboardError] = useState('');
  const [updatesError, setUpdatesError] = useState('');
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isUpdatesLoading, setIsUpdatesLoading] = useState(true);
  const [isExtraLoading, setIsExtraLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [featuredDiscoveryId, setFeaturedDiscoveryId] = useState(null);
  const [dbUnlistenedCount, setDbUnlistenedCount] = useState(null);
  const [prospectiveFallbackTrack, setProspectiveFallbackTrack] =
    useState(null);
  const [mobileCollapsedSections, setMobileCollapsedSections] = useState(
    MOBILE_DASHBOARD_COLLAPSE_DEFAULTS,
  );
  const [maxVgmcNumber, setMaxVgmcNumber] = useState(24);
  const [trackMetadataById, setTrackMetadataById] = useState({});
  const [isShowingFallback, setIsShowingFallback] = useState(false);

  const resolveTrack = useCallback(
    (video) => {
      const meta = trackMetadataById[video.videoId];
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
    [trackMetadataById],
  );

  const currentPlaylistIds = useMemo(
    () => new Set(currentPlaylist.map((video) => video.videoId)),
    [currentPlaylist],
  );

  const visibleNominationUpdates = useMemo(
    () => nominationUpdates.filter((update) => update.userId !== authUser?.id),
    [authUser?.id, nominationUpdates],
  );

  const discoveryCandidates = useMemo(() => {
    const candidates = buildDiscoveryCandidates(visibleNominationUpdates, {
      currentPlaylistIds,
      excludeUserId: authUser?.id ?? null,
      limit: 200, // Increased for larger pool
      ignoreFilterVideoIds: featuredDiscoveryId ? [featuredDiscoveryId] : [],
    });
    // Shuffle candidates to prioritize variety over popularity
    return [...candidates].sort(() => Math.random() - 0.5);
  }, [
    authUser?.id,
    currentPlaylistIds,
    visibleNominationUpdates,
    featuredDiscoveryId,
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

    // 5. Commit to persistent state (140 items to ensure grid stays full on resize)
    setPersistentDiscoveryItems(uniquePool.slice(0, 140));
  }, [
    discoveryCandidates,
    unplacedFallbackTracks,
    persistentDiscoveryItems.length,
    listenedStatusById,
  ]);

  // Pin the first discovery candidate as the featured one if none is set
  // This prevents the card from rotating when the first track's status changes during playback
  useEffect(() => {
    if (
      !featuredDiscoveryId &&
      discoveryCandidates.length > 0 &&
      !isShowingFallback
    ) {
      setFeaturedDiscoveryId(discoveryCandidates[0].videoId);
    }
  }, [discoveryCandidates, featuredDiscoveryId, isShowingFallback]);

  const featuredDiscoveryCandidate = useMemo(() => {
    if (isShowingFallback || discoveryCandidates.length === 0) return null;
    return (
      discoveryCandidates.find(
        (candidate) => candidate.videoId === featuredDiscoveryId,
      ) ?? discoveryCandidates[0]
    );
  }, [discoveryCandidates, featuredDiscoveryId, isShowingFallback]);

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
      try {
        const data = await fetchDashboardNominationUpdates(
          supabase,
          null, // Fetch all for catalog usage
        );
        if (!isActive) return;
        setNominationUpdates(data);
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

    // Fetch several unplaced tracks for grid fallback
    async function loadMarqueeFallbacks() {
      if (!supabase) return;
      try {
        const { data } = await fetchPagedTracks(supabase, {
          viewMode: 'unplaced',
          limit: 150, // Increased for larger backfill pool
          sortColumn: 'submissions',
          sortAsc: false,
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
  }, [supabase, isAuthReady]);

  useEffect(() => {
    if (!isAuthReady) return undefined;
    let isActive = true;

    async function loadVgmcUpdates() {
      try {
        const threads = await fetchDashboardVgmcUpdates(
          DASHBOARD_REFRESH_LIMIT,
        );
        if (!isActive) return;
        setVgmcThreads(threads);
        setUpdatesError('');
      } catch (error) {
        if (!isActive) return;
        setUpdatesError(error.message || 'Could not load GameFAQs updates.');
      } finally {
        if (isActive) {
          setIsUpdatesLoading(false);
        }
      }
    }

    loadVgmcUpdates();

    return () => {
      isActive = false;
    };
  }, [isAuthReady]);

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
        `${resolved.length} ${resolved.length === 1 ? 'song' : 'songs'} added to playlist`,
      );
    },
    [onAddToPlaylist, onShowToast, resolveTrack],
  );

  const handlePlayDiscoveryCandidate = useCallback(
    (video) => {
      onPlayNow?.(resolveTrack(video));
    },
    [onPlayNow, resolveTrack],
  );

  const handleAddWholeList = useCallback(
    (update) => {
      const resolved = update.nominations.map((v) => resolveTrack(v));
      onAddToPlaylist?.(resolved);
      onShowToast?.(`Added all ${resolved.length} songs to playlist`);
    },
    [onAddToPlaylist, onShowToast, resolveTrack],
  );

  const handleAddUpdates = useCallback(
    (update) => {
      const unplaced = update.nominations.filter(
        (v) => !currentPlaylistIds.has(v.videoId),
      );

      if (unplaced.length === 0) {
        onShowToast?.('All songs from this list are already in your playlist');
        return;
      }

      const resolved = unplaced.map((v) => resolveTrack(v));
      onAddToPlaylist?.(resolved);
      onShowToast?.(
        `Added ${resolved.length} new ${resolved.length === 1 ? 'song' : 'songs'} to playlist`,
      );
    },
    [currentPlaylistIds, onAddToPlaylist, onShowToast, resolveTrack],
  );

  const handleFindNewSong = useCallback(async () => {
    const nextCandidate = pickNextDiscoveryCandidate(
      discoveryCandidates,
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
    discoveryCandidates,
    onShowToast,
    listenedStatusById,
    supabase,
  ]);

  const dashboardStats = [
    {
      label: 'Updated lists',
      value: isDashboardLoading
        ? '...'
        : String(visibleNominationUpdates.length),
      accent: 'purple',
    },
    {
      label: 'New nominations',
      value: isDashboardLoading ? '...' : String(totalVisibleNominationCount),
      accent: 'orange',
    },
    {
      label: authUser ? 'VGMC songs remaining' : 'VGMC Nominations',
      value: dbUnlistenedCount === null ? '...' : String(dbUnlistenedCount),
      accent: 'blue',
    },
  ];

  const sectionSummaries = useMemo(
    () => ({
      overview:
        !isAuthReady || isDashboardLoading
          ? 'Loading current dashboard stats'
          : `${visibleNominationUpdates.length} lists, ${discoveryCandidates.length} picks, ${vgmcThreads.length} threads`,
      nominations:
        !isAuthReady || isDashboardLoading
          ? 'Loading updated lists'
          : `${visibleNominationUpdates.length} updated lists`,
      discover:
        !isAuthReady || isDashboardLoading
          ? 'Loading picks'
          : discoveryCandidates.length === 0
            ? 'You are caught up'
            : `${discoveryCandidates.length} discovery picks`,
      updates:
        !isAuthReady || isUpdatesLoading
          ? 'Loading GameFAQs threads'
          : `${vgmcThreads.length} VGMC threads`,
    }),
    [
      discoveryCandidates.length,
      isDashboardLoading,
      isUpdatesLoading,
      vgmcThreads.length,
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

  return (
    <div className="home-shell dashboard-home-shell">
      <section className="dashboard-hero" aria-label="Dashboard overview">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-badge">Community Dashboard</span>
          <h1 className="dashboard-hero-title">NomPlayer</h1>

          <p className="dashboard-hero-description">
            Track recently refreshed nomination lists, find songs you might have
            missed, and discover older tracks from the VGMC archives.
          </p>

          <div className="dashboard-hero-actions">
            <button
              className="dashboard-action-btn dashboard-action-btn-primary"
              type="button"
              onClick={onNavigateToPlayer}
            >
              Open player
            </button>
          </div>

          <div className="dashboard-stat-strip">
            {dashboardStats.map((stat) => (
              <div
                key={stat.label}
                className={`dashboard-stat-card dashboard-stat-card-${stat.accent}`}
              >
                <span className="dashboard-stat-value">{stat.value}</span>
                <span className="dashboard-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-hero-spotlight">
          {!isAuthReady || isDashboardLoading || isExtraLoading ? (
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
          ) : featuredDiscoveryCandidate ? (
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
                      handlePlayDiscoveryCandidate(featuredDiscoveryCandidate)
                    }
                  >
                    Listen Now
                  </button>
                </div>
              )}
              <img
                className="dashboard-feature-thumb"
                src={featuredDiscoveryCandidate.thumbnail}
                alt=""
                loading="lazy"
              />

              <div className="dashboard-feature-copy">
                <span className="dashboard-feature-kicker">New Nomination</span>
                <h2 className="dashboard-feature-title">
                  <ScrollingText
                    text={
                      trackMetadataById[featuredDiscoveryCandidate.videoId]
                        ? `${trackMetadataById[featuredDiscoveryCandidate.videoId].gameTitle} - ${trackMetadataById[featuredDiscoveryCandidate.videoId].trackTitle}`
                        : featuredDiscoveryCandidate.title
                    }
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
                    {featuredDiscoveryCandidate.nominators
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
                        handlePlayDiscoveryCandidate(featuredDiscoveryCandidate)
                      }
                    >
                      Listen Now
                    </button>
                  )}
                  <button
                    className="dashboard-action-btn"
                    type="button"
                    onClick={() =>
                      handleAddDiscoveryCandidate(featuredDiscoveryCandidate)
                    }
                  >
                    Add to Playlist
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
              />

              <div className="dashboard-feature-copy">
                <span className="dashboard-feature-kicker">VGMC Unplaced</span>
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
                              .map((t) => t.sequenceNumber || t.sequence_number)
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
                    Add to Playlist
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
                  autoRotate={!expandedUserId && !isFeedbackPanelOpen}
                >
                  {visibleNominationUpdates.slice(0, 10).map((update) => (
                    <NominationUpdateCard
                      key={update.userId}
                      update={update}
                      metadataById={trackMetadataById}
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
                      globalCommentedVideoIds={globalCommentedVideoIds}
                      isFeedbackPanelOpen={isFeedbackPanelOpen}
                      resolveTrack={resolveTrack}
                    />
                  ))}
                </ThreeDCarousel>
              </div>
            </>
          )}
        </DashboardSection>

        <DashboardSection
          title="Discover"
          eyebrow="Recommended"
          tone="manage"
          caption="Songs other users nominated that are still missing from your current playlist."
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
                  metadata={trackMetadataById[candidate.videoId] || candidate}
                  onAdd={handleAddDiscoveryCandidate}
                  onPlayNow={handlePlayDiscoveryCandidate}
                />
              ))}
            </DiscoveryMarqueeGrid>
          )}
        </DashboardSection>

        <DashboardSection
          title="VGMC Updates"
          eyebrow="GameFAQs"
          tone="updates"
          caption="Live threads from the GameFAQs Contests board with VGMC in the title."
          className="dashboard-section-updates"
          isMobileLayout={isMobileLayout}
          isCollapsed={isMobileLayout && mobileCollapsedSections.updates}
          onToggleCollapse={() => toggleMobileSection('updates')}
          summary={sectionSummaries.updates}
        >
          {isUpdatesLoading ? (
            <div className="dashboard-nominations-loader">
              <div
                className="hero-loader-spinner"
                aria-label="Loading GameFAQs threads"
              />
            </div>
          ) : updatesError ? (
            <DashboardMessage tone="danger">{updatesError}</DashboardMessage>
          ) : vgmcThreads.length === 0 ? (
            <DashboardMessage>
              No VGMC threads were found on the contests board right now.
            </DashboardMessage>
          ) : (
            <div className="dashboard-thread-list animate-fade-in">
              {vgmcThreads.map((thread) => (
                <VgmcThreadItem key={thread.url} thread={thread} />
              ))}
            </div>
          )}
        </DashboardSection>
      </div>
    </div>
  );
}
