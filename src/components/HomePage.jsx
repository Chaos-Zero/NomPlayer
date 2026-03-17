import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiscordIcon from './DiscordIcon.jsx';
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

const DASHBOARD_REFRESH_LIMIT = 8;

function DashboardSection({
  title,
  eyebrow,
  tone,
  children,
  actions = null,
  caption = null,
  className = '',
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

        <div className="dashboard-pane-body">{children}</div>
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
}) {
  const [nominationUpdates, setNominationUpdates] = useState([]);
  const [vgmcThreads, setVgmcThreads] = useState([]);
  const [dashboardError, setDashboardError] = useState('');
  const [updatesError, setUpdatesError] = useState('');
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isUpdatesLoading, setIsUpdatesLoading] = useState(true);
  const [featuredDiscoveryId, setFeaturedDiscoveryId] = useState(null);
  const [actionNotice, setActionNotice] = useState('');
  const noticeTimeoutRef = useRef(0);

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
      }),
    [
      authUser?.id,
      currentPlaylistIds,
      listenedStatusById,
      visibleNominationUpdates,
    ],
  );

  const featuredDiscoveryCandidate = useMemo(() => {
    if (discoveryCandidates.length === 0) return null;
    return (
      discoveryCandidates.find(
        (candidate) => candidate.videoId === featuredDiscoveryId,
      ) ?? discoveryCandidates[0]
    );
  }, [discoveryCandidates, featuredDiscoveryId]);

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

  const showActionNotice = useCallback((message) => {
    if (!message) return;

    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }

    setActionNotice(message);
    noticeTimeoutRef.current = window.setTimeout(() => {
      noticeTimeoutRef.current = 0;
      setActionNotice('');
    }, 2400);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
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
  }, [supabase]);

  useEffect(() => {
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
  }, []);

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

  const handleFindNewSong = useCallback(() => {
    const nextCandidate = pickNextDiscoveryCandidate(
      discoveryCandidates,
      activeFeaturedDiscoveryId,
    );

    if (!nextCandidate) {
      showActionNotice('No fresh nomination picks are available right now.');
      return;
    }

    setFeaturedDiscoveryId(nextCandidate.videoId);
  }, [activeFeaturedDiscoveryId, discoveryCandidates, showActionNotice]);

  const dashboardStats = [
    {
      label: 'Updated lists',
      value: isDashboardLoading
        ? '...'
        : String(visibleNominationUpdates.length),
      accent: 'purple',
    },
    {
      label: 'Fresh nominations',
      value: isDashboardLoading ? '...' : String(totalVisibleNominationCount),
      accent: 'orange',
    },
    {
      label: 'Discovery picks',
      value: String(discoveryCandidates.length),
      accent: 'blue',
    },
    {
      label: 'VGMC threads',
      value: isUpdatesLoading ? '...' : String(vgmcThreads.length),
      accent: 'pink',
    },
  ];

  return (
    <div className="home-shell dashboard-home-shell">
      <section className="dashboard-hero" aria-label="Dashboard overview">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-badge">Community Dashboard</span>
          <h1 className="dashboard-hero-title">
            What&apos;s moving in VGMC right now
          </h1>
          <p className="dashboard-hero-description">
            Track recently refreshed nomination lists, surface the next songs
            you have not queued yet, and jump straight into the latest contest
            board chatter without leaving the dashboard.
          </p>

          <div className="dashboard-hero-actions">
            <button
              className="dashboard-action-btn"
              type="button"
              onClick={onNavigateToPlayer}
            >
              Open player
            </button>
            <button
              className="dashboard-link-btn"
              type="button"
              onClick={handleFindNewSong}
            >
              Find new song
            </button>
          </div>

          {actionNotice && (
            <DashboardMessage tone="accent">{actionNotice}</DashboardMessage>
          )}

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
          {featuredDiscoveryCandidate ? (
            <article className="dashboard-feature-card dashboard-feature-card-hero">
              <img
                className="dashboard-feature-thumb"
                src={featuredDiscoveryCandidate.thumbnail}
                alt=""
                loading="lazy"
              />

              <div className="dashboard-feature-copy">
                <span className="dashboard-feature-kicker">Listen now</span>
                <h2 className="dashboard-feature-title">
                  {featuredDiscoveryCandidate.title}
                </h2>
                <p className="dashboard-feature-meta">
                  Nominated by{' '}
                  {featuredDiscoveryCandidate.nominators
                    .map((nominator) =>
                      getDisplayProfileName(nominator.username),
                    )
                    .join(', ')}
                </p>
                <div className="dashboard-feature-actions">
                  <button
                    className="dashboard-action-btn dashboard-action-btn-muted"
                    type="button"
                    onClick={() =>
                      handlePlayDiscoveryCandidate(featuredDiscoveryCandidate)
                    }
                  >
                    Listen now
                  </button>
                  <button
                    className="dashboard-action-btn"
                    type="button"
                    onClick={() =>
                      handleAddDiscoveryCandidate(featuredDiscoveryCandidate)
                    }
                  >
                    Add to current playlist
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
              <div className="dashboard-update-list">
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
          >
            {discoveryCandidates.length === 0 ? (
              <DashboardMessage>
                You are caught up for now. When more nomination lists appear,
                new discovery picks will show here.
              </DashboardMessage>
            ) : (
              <div className="dashboard-discovery-list">
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
              <div className="dashboard-thread-list">
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
