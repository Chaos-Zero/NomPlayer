import React from 'react';

// Gate in front of sharing a private playlist, mirrors
// DeletePlaylistConfirmDialog.jsx's shape. Only public playlists are
// readable by anyone but the owner (RLS), so a link to a private one would
// silently fail to load for its recipient, this confirms the visibility
// change that makes the link actually work, rather than flipping it
// automatically.
export default function SharePlaylistConfirmDialog({
  isOpen = false,
  isSubmitting = false,
  playlistName = '',
  onClose,
  onConfirm,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-pl-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="share-pl-dialog-title">Make Playlist Public?</h2>
          <button
            className="btn-close"
            type="button"
            aria-label="Close confirmation dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p>
            <strong>"{playlistName}"</strong> is private. Would you like to make
            it public in order to share?
          </p>
        </div>

        <div className="modal-footer share-dialog-footer">
          <button
            className="btn btn-primary"
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Making public…' : 'Make Public & Copy Link'}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
