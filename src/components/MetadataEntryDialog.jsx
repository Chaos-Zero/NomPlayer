import { useState, useEffect } from 'react';
import YouTubeIcon from './YouTubeIcon.jsx';

export default function MetadataEntryDialog({
  tracks,
  onSave,
  onClose,
  isOpen,
}) {
  const [metadata, setMetadata] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMetadata(
        tracks.map((track) => {
          const currentUrl = `https://www.youtube.com/watch?v=${track.videoId}`;
          return {
            oldVideoId: track.videoId,
            videoId: track.videoId,
            trackId: track.trackId,
            title: track.title,
            currentUrl,
            videoUrl: currentUrl,
            gameTitle: track.gameTitle || '',
            trackTitle: track.trackTitle || '',
          };
        }),
      );
    }
  }, [isOpen, tracks]);

  if (!isOpen) return null;

  function handleChange(index, field, value) {
    const nextMetadata = [...metadata];
    nextMetadata[index] = { ...nextMetadata[index], [field]: value };
    setMetadata(nextMetadata);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(metadata);
      onClose();
    } catch (err) {
      console.error('Failed to save metadata:', err);
      alert('Failed to save metadata. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="metadata-dialog-backdrop" onClick={onClose}>
      <div
        className="metadata-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-dialog-title"
      >
        <div className="metadata-dialog-header">
          <h2 id="metadata-dialog-title">Contribute Track Metadata</h2>
          <button
            className="btn-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="metadata-dialog-body">
          <p className="metadata-dialog-intro">
            {tracks.length === 1
              ? 'Providing metadata helps others find this track!'
              : 'The following tracks are new to the system. Providing metadata helps others find them!'}
          </p>

          <div className="metadata-track-list">
            {metadata.map((track, index) => (
              <div key={track.videoId} className="metadata-track-item">
                <div className="metadata-track-info">
                  <span className="metadata-track-name" title={track.title}>
                    {track.title}
                  </span>
                  <a
                    href={track.currentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="metadata-track-url"
                  >
                    {track.videoId} ↗
                  </a>
                </div>

                <div className="metadata-track-inputs">
                  <div className="metadata-input-group">
                    <input
                      id={`game-${track.videoId}`}
                      type="text"
                      placeholder="Game Title"
                      value={track.gameTitle}
                      onChange={(e) =>
                        handleChange(index, 'gameTitle', e.target.value)
                      }
                    />
                  </div>
                  <div className="metadata-input-group">
                    <input
                      id={`track-${track.videoId}`}
                      type="text"
                      placeholder="Track Title"
                      value={track.trackTitle}
                      onChange={(e) =>
                        handleChange(index, 'trackTitle', e.target.value)
                      }
                    />
                  </div>
                </div>
                <div
                  className="metadata-track-inputs"
                  style={{ marginTop: '10px' }}
                >
                  <div className="metadata-input-group" style={{ flex: 1 }}>
                    <input
                      id={`url-${track.videoId}`}
                      type="text"
                      placeholder={`${track.currentUrl}`}
                      value={track.videoUrl}
                      onChange={(e) =>
                        handleChange(index, 'videoUrl', e.target.value)
                      }
                    />
                  </div>
                  <div className="metadata-input-group">
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                        `${track.gameTitle} OST ${track.trackTitle}`.trim() ||
                          track.title,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="metadata-search-btn"
                      title="Search YouTube for this track"
                    >
                      <YouTubeIcon className="metadata-search-icon" />
                      <span className="metadata-search-text">Search OST</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="metadata-dialog-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Dismiss
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={
              saving ||
              metadata.some((m) => !m.gameTitle.trim() || !m.trackTitle.trim())
            }
          >
            {saving ? 'Saving...' : 'Save Metadata'}
          </button>
        </div>
      </div>
    </div>
  );
}
