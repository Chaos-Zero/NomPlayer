import { useState } from 'react';

export default function ListeningHistoryDialog({
  isOpen = false,
  onClose,
  onPlayTrack,
  getTrackHistory,
  onClearHistory,
}) {
  const [localHistory, setLocalHistory] = useState(() => {
    return typeof getTrackHistory === 'function' ? getTrackHistory() : [];
  });

  if (!isOpen) return null;

  const handleItemClick = (item) => {
    onPlayTrack?.(item);
    // Move to top immediately for visual feedback
    setLocalHistory((prev) => {
      const filtered = prev.filter((i) => i.videoId !== item.videoId);
      return [item, ...filtered];
    });
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
              See your previously listened to tracks.
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
          <div className="settings-history-section">
            <div className="settings-history-header">
              <h3>Recent Tracks</h3>
              {history.length > 0 && (
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
            {localHistory.length === 0 ? (
              <p className="settings-history-empty">No history recorded yet.</p>
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
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
