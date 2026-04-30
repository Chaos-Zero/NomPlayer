import { useState, useEffect, useCallback } from 'react';
import { fetchTrackCatalogByVideoIds } from '../lib/trackCatalog.js';
import { fetchListenHistory } from '../lib/playerState.js';

function PlaylistPlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      width="16"
      height="16"
    >
      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
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

  // Refresh recent history whenever dialog opens
  useEffect(() => {
    if (!isOpen) return;

    if (authUser && supabase) {
      setRecentLoading(true);
      fetchListenHistory(supabase)
        .then(setLocalHistory)
        .catch((err) => console.error('Failed to load listen history:', err))
        .finally(() => setRecentLoading(false));
    } else {
      setLocalHistory(
        typeof getTrackHistory === 'function' ? getTrackHistory() : [],
      );
    }
  }, [isOpen, authUser, supabase, getTrackHistory]);

  const loadMostPlayed = useCallback(async () => {
    if (!supabase || !authUser) return;
    setMostPlayedLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        'get_user_youtube_track_listens',
      );
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const sorted = [...rows]
        .sort((a, b) => b.listen_count - a.listen_count)
        .slice(0, 100);
      const videoIds = sorted.map((r) => r.youtube_video_id);

      const catalogEntries = await fetchTrackCatalogByVideoIds(
        supabase,
        videoIds,
      );
      const catalogByVideoId = new Map(
        catalogEntries.map((e) => [e.videoId, e]),
      );

      setMostPlayed(
        sorted.map((row) => {
          const catalog = catalogByVideoId.get(row.youtube_video_id);
          return {
            videoId: row.youtube_video_id,
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
    } catch (err) {
      console.error('Failed to load most played:', err);
    } finally {
      setMostPlayedLoading(false);
    }
  }, [supabase, authUser]);

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
                          <PlaylistPlusIcon />
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
                          <PlaylistPlusIcon />
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
