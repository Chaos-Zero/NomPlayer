import { useCallback, useEffect, useMemo, useState } from 'react';
import DiscordIcon from './DiscordIcon.jsx';
import ScrollingText from './ScrollingText.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';
import {
  buildDiscoveryCandidates,
  fetchDashboardNominationUpdates,
  fetchDashboardVgmcUpdates,
  formatRelativeDashboardTime,
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

const DASHBOARD_REFRESH_LIMIT = 8;
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
  tone,
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
      className={`dashboard-section dashboard-section-${tone}${className ? ` ${className}` : ''}`}
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

function NominationUpdateCard({ update, onAddWholeList, onAddUpdates }) {
  const displayIdentity = parseStoredProfileUsername(update.username);

  return (
    <article className="dashboard-update-card">
      <div className="dashboard-update-meta">
        <DashboardAvatar update={update} />

        <div className="dashboard-update-copy">
          <div className="dashboard-update-title-row">
            <h3 className="dashboard-update-title">
              <span className="profile-name-inline">
                {displayIdentity.provider === 'discord' && (
                  <DiscordIcon className="profile-provider-icon dashboard-provider-icon" />
                )}
                <span>{displayIdentity.displayName}</span>
              </span>
            </h3>
            <span className="dashboard-chip">
              {formatRelativeDashboardTime(update.updatedAt)}
            </span>
          </div>

          <div className="dashboard-update-subtitle">
            {update.gamefaqsUsername
              ? `GameFaqs: ${update.gamefaqsUsername}`
              : `${update.nominations.length} nomination${update.nominations.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      <div className="dashboard-update-song-list">
        {update.nominations.slice(0, 4).map((video, index) => (
          <div key={video.videoId} className="dashboard-update-song-row">
            <span className="dashboard-update-song-index" aria-hidden="true">
              {index + 1}
            </span>
            <span className="dashboard-update-song-title">{video.title}</span>
          </div>
        ))}
      </div>

      <div className="dashboard-update-actions">
        <button
          className="dashboard-action-btn dashboard-action-btn-muted"
          type="button"
          onClick={() => onAddUpdates(update)}
        >
          Add updates
        </button>
        <button
          className="dashboard-action-btn"
          type="button"
          onClick={() => onAddWholeList(update)}
        >
          Add whole list
        </button>
      </div>
    </article>
  );
}

function DiscoveryRow({ candidate, onAdd, onPlayNow }) {
  const nominatorNames = candidate.nominators
    .slice(0, 3)
    .map((nominator) => getDisplayProfileName(nominator.username))
    .join(', ');

  return (
    <article className="dashboard-discovery-row">
      <img
        className="dashboard-discovery-thumb"
        src={candidate.thumbnail}
        alt=""
        loading="lazy"
      />

      <div className="dashboard-discovery-copy">
        <div className="dashboard-discovery-title-row">
          <h3 className="dashboard-discovery-title">{candidate.title}</h3>
          <span className="dashboard-chip dashboard-chip-warm">
            {candidate.nominationCount} pick
            {candidate.nominationCount === 1 ? '' : 's'}
          </span>
        </div>

        <p className="dashboard-discovery-meta">
          Nominated by {nominatorNames}
        </p>
      </div>

      <div className="dashboard-discovery-actions">
        <button
          className="dashboard-inline-btn"
          type="button"
          onClick={() => onPlayNow(candidate)}
        >
          Listen now
        </button>
        <button
          className="dashboard-inline-btn dashboard-inline-btn-primary"
          type="button"
          onClick={() => onAdd(candidate)}
        >
          Add
        </button>
      </div>
    </article>
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
  onNavigateToPlayer,
  onShowToast,
  isAuthReady = true,
}) {
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
  const [nominationUpdates, setNominationUpdates] = useState([]);
  const [vgmcThreads, setVgmcThreads] = useState([]);
  const [dashboardError, setDashboardError] = useState('');
  const [updatesError, setUpdatesError] = useState('');
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isUpdatesLoading, setIsUpdatesLoading] = useState(true);
  const [isExtraLoading, setIsExtraLoading] = useState(true);
  const [featuredDiscoveryId, setFeaturedDiscoveryId] = useState(null);
  const [dbUnlistenedCount, setDbUnlistenedCount] = useState(null);
  const [prospectiveFallbackTrack, setProspectiveFallbackTrack] =
    useState(null);
  const [mobileCollapsedSections, setMobileCollapsedSections] = useState(
    MOBILE_DASHBOARD_COLLAPSE_DEFAULTS,
  );
  const [maxVgmcNumber, setMaxVgmcNumber] = useState(24);
  const [discoveryMetadataById, setDiscoveryMetadataById] = useState({});
  const [isShowingFallback, setIsShowingFallback] = useState(false);

  const currentPlaylistIds = useMemo(
    () => new Set(currentPlaylist.map((video) => video.videoId)),
    [currentPlaylist],
  );

  const visibleNominationUpdates = useMemo(
    () => nominationUpdates.filter((update) => update.userId !== authUser?.id),
    [authUser?.id, nominationUpdates],
  );

  const discoveryCandidates = useMemo(
    () =>
      buildDiscoveryCandidates(visibleNominationUpdates, {
        currentPlaylistIds,
        listenedStatusById,
        excludeUserId: authUser?.id ?? null,
        limit: 10,
        ignoreFilterVideoIds: featuredDiscoveryId ? [featuredDiscoveryId] : [],
      }),
    [
      authUser?.id,
      currentPlaylistIds,
      listenedStatusById,
      visibleNominationUpdates,
      featuredDiscoveryId,
    ],
  );

  const featuredDiscoveryCandidate = useMemo(() => {
    if (isShowingFallback || discoveryCandidates.length === 0) return null;
    return (
      discoveryCandidates.find(
        (candidate) => candidate.videoId === featuredDiscoveryId,
      ) ?? discoveryCandidates[0]
    );
  }, [discoveryCandidates, featuredDiscoveryId, isShowingFallback]);

  const activeFeaturedDiscoveryId =
    featuredDiscoveryCandidate?.videoId ?? featuredDiscoveryId ?? null;

  const totalVisibleNominationCount = useMemo(
    () =>
      visibleNominationUpdates.reduce(
        (sum, update) => sum + update.nominations.length,
        0,
      ),
    [visibleNominationUpdates],
  );

  const showActionNotice = useCallback(
    (message) => {
      if (!message) return;
      onShowToast?.(message);
    },
    [onShowToast],
  );

  useEffect(() => {
    if (!isAuthReady) return undefined;
    let isActive = true;

    async function loadDashboardUpdates() {
      try {
        const data = await fetchDashboardNominationUpdates(
          supabase,
          DASHBOARD_REFRESH_LIMIT,
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
    async function enrichDiscoveryMetadata() {
      if (!supabase || discoveryCandidates.length === 0) return;
      try {
        const videoIds = discoveryCandidates.map((c) => c.videoId);
        const metadataList = await fetchTrackCatalogByVideoIds(
          supabase,
          videoIds,
        );
        if (!isActive) return;
        const metaMap = {};
        metadataList.forEach((track) => {
          metaMap[track.videoId] = track;
        });
        setDiscoveryMetadataById(metaMap);
      } catch (err) {
        console.error('Failed to enrich discovery metadata:', err);
      }
    }
    enrichDiscoveryMetadata();
    return () => {
      isActive = false;
    };
  }, [supabase, discoveryCandidates, isAuthReady]);

  const handleQueueVideos = useCallback(
    (videos, emptyMessage) => {
      if (!videos?.length) {
        showActionNotice(emptyMessage);
        return;
      }

      const addResult = onAddToPlaylist?.(videos);
      const addedCount =
        typeof addResult === 'number'
          ? addResult
          : (addResult?.addedCount ?? 0);

      showActionNotice(
        addedCount > 0
          ? addedCount === 1
            ? 'Added 1 song to your current playlist'
            : `Added ${addedCount} songs to your current playlist`
          : emptyMessage,
      );
    },
    [onAddToPlaylist, showActionNotice],
  );

  const handleAddWholeList = useCallback(
    (update) => {
      handleQueueVideos(
        update.nominations,
        `${getDisplayProfileName(update.username)}'s nominations are already in your current playlist.`,
      );
    },
    [handleQueueVideos],
  );

  const handleAddUpdates = useCallback(
    (update) => {
      const nextVideos = update.nominations.filter(
        (video) => !currentPlaylistIds.has(video.videoId),
      );
      handleQueueVideos(
        nextVideos,
        `No new nominations from ${getDisplayProfileName(update.username)} for your current playlist.`,
      );
    },
    [currentPlaylistIds, handleQueueVideos],
  );

  const handleAddDiscoveryCandidate = useCallback(
    (candidate) => {
      handleQueueVideos(
        [candidate],
        'That song is already in your current playlist.',
      );
    },
    [handleQueueVideos],
  );

  const handlePlayDiscoveryCandidate = useCallback(
    (candidate) => {
      onPlayNow?.(candidate);
      showActionNotice(`Playing ${candidate.title}`);
    },
    [onPlayNow, showActionNotice],
  );

  const handleFindNewSong = useCallback(async () => {
    const nextCandidate = pickNextDiscoveryCandidate(
      discoveryCandidates,
      activeFeaturedDiscoveryId,
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
          showActionNotice('Showcasing a random unplaced VGMC track!');
          return;
        }
      } catch {
        showActionNotice('Failed to fetch a random unplaced track.');
      }
    }

    showActionNotice('No fresh nomination picks are available right now.');
  }, [
    activeFeaturedDiscoveryId,
    discoveryCandidates,
    showActionNotice,
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

          {isMobileLayout && (
            <button
              className={`dashboard-mobile-toggle dashboard-mobile-toggle-hero${mobileCollapsedSections.overview ? ' collapsed' : ''}`}
              type="button"
              aria-expanded={!mobileCollapsedSections.overview}
              aria-label={`${mobileCollapsedSections.overview ? 'Expand' : 'Collapse'} NomPlayer overview`}
              onClick={() => toggleMobileSection('overview')}
            >
              <span className="dashboard-mobile-toggle-copy">
                <span className="dashboard-mobile-toggle-label">
                  {mobileCollapsedSections.overview
                    ? 'Expand overview'
                    : 'Collapse overview'}
                </span>
                <span className="dashboard-mobile-toggle-summary">
                  {sectionSummaries.overview}
                </span>
              </span>
              <span className="dashboard-mobile-toggle-icon" aria-hidden="true">
                ▾
              </span>
            </button>
          )}

          {(!isMobileLayout || !mobileCollapsedSections.overview) && (
            <>
              <p className="dashboard-hero-description">
                Track recently refreshed nomination lists, find songs you might
                have missed, and discover older tracks from the VGMC archives.
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
            </>
          )}
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
                      discoveryMetadataById[featuredDiscoveryCandidate.videoId]
                        ? `${discoveryMetadataById[featuredDiscoveryCandidate.videoId].gameTitle} - ${discoveryMetadataById[featuredDiscoveryCandidate.videoId].trackTitle}`
                        : featuredDiscoveryCandidate.title
                    }
                    truncateWhenStatic={true}
                  />
                </h2>
                <div className="dashboard-feature-meta">
                  <p className="dashboard-feature-meta-vgmc">
                    VGMC {maxVgmcNumber + 1}
                  </p>
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
                  <button
                    className="dashboard-action-btn dashboard-action-btn-muted"
                    type="button"
                    onClick={() =>
                      handlePlayDiscoveryCandidate(featuredDiscoveryCandidate)
                    }
                  >
                    Listen Now
                  </button>
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
                </div>
                <div className="dashboard-feature-actions">
                  <button
                    className="dashboard-action-btn dashboard-action-btn-muted"
                    type="button"
                    onClick={() =>
                      handlePlayDiscoveryCandidate(prospectiveFallbackTrack)
                    }
                  >
                    Listen Now
                  </button>
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

      <div className="dashboard-flow">
        <div className="dashboard-flow-main">
          <DashboardSection
            title="Updated Nominations"
            eyebrow="Community"
            tone="discover"
            caption="Recently refreshed nomination lists from other users."
            className="dashboard-section-feed"
            isMobileLayout={isMobileLayout}
            isCollapsed={isMobileLayout && mobileCollapsedSections.nominations}
            onToggleCollapse={() => toggleMobileSection('nominations')}
            summary={sectionSummaries.nominations}
          >
            {isDashboardLoading ? (
              <DashboardMessage>Loading nomination updates…</DashboardMessage>
            ) : dashboardError ? (
              <DashboardMessage tone="danger">
                {dashboardError}
              </DashboardMessage>
            ) : visibleNominationUpdates.length === 0 ? (
              <DashboardMessage>
                No public nomination updates yet. Once users start curating
                lists, they will appear here.
              </DashboardMessage>
            ) : (
              <div className="dashboard-update-list animate-fade-in">
                {visibleNominationUpdates.map((update) => (
                  <NominationUpdateCard
                    key={update.userId}
                    update={update}
                    onAddWholeList={handleAddWholeList}
                    onAddUpdates={handleAddUpdates}
                  />
                ))}
              </div>
            )}
          </DashboardSection>
        </div>

        <div className="dashboard-flow-side">
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
            {discoveryCandidates.length === 0 ? (
              <DashboardMessage>
                You are caught up for now. When more nomination lists appear,
                new discovery picks will show here.
              </DashboardMessage>
            ) : (
              <div className="dashboard-discovery-list animate-fade-in">
                {discoveryCandidates.slice(0, 5).map((candidate) => (
                  <DiscoveryRow
                    key={candidate.videoId}
                    candidate={candidate}
                    onAdd={handleAddDiscoveryCandidate}
                    onPlayNow={handlePlayDiscoveryCandidate}
                  />
                ))}
              </div>
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
              <DashboardMessage>Loading GameFAQs threads…</DashboardMessage>
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
    </div>
  );
}
