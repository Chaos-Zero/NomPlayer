import { useState, useEffect, useCallback, useId } from 'react';
import { fetchTrackCatalogByVideoIds } from '../lib/trackCatalog.js';
import { fetchListenHistory } from '../lib/playerState.js';

// Play triangle, centered, masked with a small gap around the plus for
// contrast - matches the "Add to Queue" icon used everywhere else (see
// PlayPlusIcon in Icons.jsx) - kept as a local copy like the rest of this
// file's icon, rather than importing, since it's only used here.
function PlayPlusIcon() {
  const maskId = useId();
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      width="16"
      height="16"
    >
      <mask id={maskId}>
        <rect width="24" height="24" fill="#fff" />
        <path d="M19 13V9H15V13H11V17H15V21H19V17H23V13Z" fill="#000" />
      </mask>
      <path d="M5 4v16l14-8z" mask={`url(#${maskId})`} />
      <path d="M18 14V10H16V14H12V16H16V20H18V16H22V14Z" />
    </svg>
  );
}

export default function ListeningHistoryDialog({
  isOpen = false,
  onClose,
  onPlayTrack,
  onAddToPlaylist,
  getTrackHistory,
  onClearHistory,
  supabase,
  authUser,
}) {
  const [activeTab, setActiveTab] = useState('recent');
  const [localHistory, setLocalHistory] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [mostPlayed, setMostPlayed] = useState([]);
  const [mostPlayedLoading, setMostPlayedLoading] = useState(false);

  // Reacts to a fresh fetch cycle starting, during render rather than
  // inside the effect below - React's recommended way to react to a
  // condition becoming newly true is setState during render, not inside an
  // effect (see https://react.dev/learn/you-might-not-need-an-effect,
  // "Derived event pattern"; same pattern VgmcSheetSyncPanel.jsx uses for
  // its own reset-on-reopen case), since setting state synchronously as the
  // first thing an effect does forces an extra cascading render. The guest
  // (no authUser/supabase) branch is fully synchronous - just a local read
  // - so it's resolved right here too, rather than round-tripping through
  // an effect for no reason.
  const recentFetchSignature = isOpen
    ? `${Boolean(authUser)}:${Boolean(supabase)}`
    : null;
  const [lastRecentFetchSignature, setLastRecentFetchSignature] =
    useState(null);
  if (isOpen && recentFetchSignature !== lastRecentFetchSignature) {
    setLastRecentFetchSignature(recentFetchSignature);
    if (authUser && supabase) {
      setRecentLoading(true);
    } else {
      setLocalHistory(
        typeof getTrackHistory === 'function' ? getTrackHistory() : [],
      );
    }
  }

  // Kicks off the actual fetch for the authenticated branch only - the
  // guest branch is handled synchronously above, it never needed an effect.
  useEffect(() => {
    if (!isOpen || !authUser || !supabase) return;

    fetchListenHistory(supabase)
      .then(setLocalHistory)
      .catch((err) => console.error('Failed to load listen history:', err))
      .finally(() => setRecentLoading(false));
  }, [isOpen, authUser, supabase]);

  // Written as an explicit .then() chain rather than async/await
  // deliberately: the set-state-in-effect check exempts setState calls made
  // from a Promise callback (see fetchListenHistory above) but doesn't
  // unwrap async/await control flow the same way, so an async function
  // invoked directly from the effect below still trips it even though every
  // setState call here already only ever runs after an await.
  const loadMostPlayed = useCallback(() => {
    if (!supabase || !authUser) return;
    supabase
      .rpc('get_track_listens')
      .then(({ data, error }) => {
        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        const sorted = [...rows]
          .sort((a, b) => b.listen_count - a.listen_count)
          .slice(0, 100);
        const videoIds = sorted.map((r) => r.external_id);

        return fetchTrackCatalogByVideoIds(supabase, videoIds).then(
          (catalogEntries) => {
            const catalogByVideoId = new Map(
              catalogEntries.map((e) => [e.videoId, e]),
            );

            setMostPlayed(
              sorted.map((row) => {
                const catalog = catalogByVideoId.get(row.external_id);
                return {
                  videoId: row.external_id,
                  provider: catalog?.provider || 'youtube',
                  trackId: row.track_id,
                  listenCount: row.listen_count,
                  trackTitle:
                    catalog?.trackTitle ||
                    catalog?.displayTitle ||
                    catalog?.sourceTitle ||
                    '',
                  gameTitle: catalog?.gameTitle || '',
                  title: catalog?.sourceTitle || '',
                };
              }),
            );
          },
        );
      })
      .catch((err) => console.error('Failed to load most played:', err))
      .finally(() => setMostPlayedLoading(false));
  }, [supabase, authUser]);

  // Same render-time-flip pattern as recentFetchSignature above, mirroring
  // loadMostPlayed's own [supabase, authUser] dependency so this re-fires
  // under the same conditions the effect below would re-run for.
  const mostPlayedFetchSignature =
    isOpen && activeTab === 'mostPlayed'
      ? `${Boolean(authUser)}:${Boolean(supabase)}`
      : null;
  const [lastMostPlayedFetchSignature, setLastMostPlayedFetchSignature] =
    useState(null);
  if (mostPlayedFetchSignature !== lastMostPlayedFetchSignature) {
    setLastMostPlayedFetchSignature(mostPlayedFetchSignature);
    if (authUser && supabase) {
      setMostPlayedLoading(true);
    }
  }

  // Load most played when tab becomes active or dialog opens on that tab
  useEffect(() => {
    if (isOpen && activeTab === 'mostPlayed') {
      loadMostPlayed();
    }
  }, [isOpen, activeTab, loadMostPlayed]);

  if (!isOpen) return null;

  const handleItemClick = (item) => {
    onPlayTrack?.(item);
    if (activeTab === 'recent') {
      setLocalHistory((prev) => {
        const filtered = prev.filter((i) => i.videoId !== item.videoId);
        return [item, ...filtered];
      });
    }
  };

  const handleAddToPlaylist = (e, item) => {
    e.stopPropagation();
    onAddToPlaylist?.([item]);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-dialog-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="history-dialog-title">Listening History</h2>
            <p className="modal-subtitle">
              Your recently played and most-listened tracks.
            </p>
          </div>
          <button
            className="btn-close"
            type="button"
            aria-label="Close listening history"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="settings-dialog-content">
          <div className="history-tab-bar">
            <button
              className={`history-tab${activeTab === 'recent' ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab('recent')}
            >
              Recent
            </button>
            <button
              className={`history-tab${activeTab === 'mostPlayed' ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab('mostPlayed')}
            >
              Most Played
            </button>
          </div>

          {activeTab === 'recent' && (
            <div className="settings-history-section">
              <div className="settings-history-header">
                <h3>Recent Tracks</h3>
                {!authUser && localHistory.length > 0 && (
                  <button
                    className="btn btn-text btn-clear-history"
                    type="button"
                    onClick={() => {
                      if (confirm('Clear your listening history?')) {
                        onClearHistory?.();
                        setLocalHistory([]);
                      }
                    }}
                  >
                    Clear History
                  </button>
                )}
              </div>
              {recentLoading ? (
                <p className="settings-history-empty">Loading…</p>
              ) : localHistory.length === 0 ? (
                <p className="settings-history-empty">
                  No history recorded yet.
                </p>
              ) : (
                <div className="settings-history-list">
                  {localHistory.map((item, index) => (
                    <button
                      key={`${item.videoId}-${item.timestamp}`}
                      className="settings-history-item"
                      type="button"
                      onClick={() => handleItemClick(item)}
                      title={`Play ${item.trackTitle || item.title}`}
                    >
                      <span className="history-item-index">{index + 1}</span>
                      <div className="history-item-meta">
                        <span className="history-item-title">
                          {item.trackTitle || item.title}
                        </span>
                        {item.gameTitle && (
                          <span className="history-item-game">
                            {item.gameTitle}
                          </span>
                        )}
                      </div>
                      {onAddToPlaylist && (
                        <button
                          className="history-item-queue-btn"
                          type="button"
                          title="Add to queue"
                          onClick={(e) => handleAddToPlaylist(e, item)}
                        >
                          <PlayPlusIcon />
                        </button>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'mostPlayed' && (
            <div className="settings-history-section">
              <div className="settings-history-header">
                <h3>Most Played</h3>
              </div>
              {!authUser ? (
                <p className="settings-history-empty">
                  Log in to see your most-played tracks.
                </p>
              ) : mostPlayedLoading ? (
                <p className="settings-history-empty">Loading…</p>
              ) : mostPlayed.length === 0 ? (
                <p className="settings-history-empty">No plays recorded yet.</p>
              ) : (
                <div className="settings-history-list">
                  {mostPlayed.map((item, index) => (
                    <button
                      key={item.videoId}
                      className="settings-history-item"
                      type="button"
                      onClick={() => handleItemClick(item)}
                      title={`Play ${item.trackTitle || item.title}`}
                    >
                      <span className="history-item-index">{index + 1}</span>
                      <div className="history-item-meta">
                        <span className="history-item-title">
                          {item.trackTitle || item.title || item.videoId}
                        </span>
                        {item.gameTitle && (
                          <span className="history-item-game">
                            {item.gameTitle}
                          </span>
                        )}
                      </div>
                      <span className="history-item-count" title="Times played">
                        {item.listenCount}×
                      </span>
                      {onAddToPlaylist && (
                        <button
                          className="history-item-queue-btn"
                          type="button"
                          title="Add to queue"
                          onClick={(e) => handleAddToPlaylist(e, item)}
                        >
                          <PlayPlusIcon />
                        </button>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
