import { useState } from 'react';

export default function ExportVgmcModal({ isOpen, tracks, onClose }) {
  const [copySuccess, setCopySuccess] = useState(false);

  if (!isOpen) return null;

  const formattedText = tracks
    .map((track) => {
      const game = track.gameTitle || 'Metadata Needed';
      const title = track.trackTitle || track.title || 'Unknown Track';
      const url = `https://www.youtube.com/watch?v=${track.videoId}`;
      return `+ ${game} | ${title} | ${url}`;
    })
    .join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '600px',
          width: 'calc(100% - 32px)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Export for VGMC</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div
          className="modal-body"
          style={{
            padding: '20px',
            flex: 1,
            minHeight: '200px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <p
            style={{
              marginBottom: '12px',
              fontSize: '14px',
              color: 'var(--text-secondary)',
            }}
          >
            The following list is formatted for VGMC nomination threads.
          </p>
          <textarea
            readOnly
            value={formattedText}
            style={{
              width: '100%',
              flex: 1,
              minHeight: '150px',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: 'monospace',
              fontSize: '13px',
              resize: 'none',
              marginBottom: '4px',
            }}
          />
        </div>

        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            className={`btn ${copySuccess ? 'btn-success' : 'btn-primary'}`}
            onClick={handleCopy}
            disabled={tracks.length === 0}
            style={{ margin: 0 }}
          >
            {copySuccess ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <button
            className="btn btn-muted"
            onClick={onClose}
            style={{ margin: 0 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
