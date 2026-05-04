import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function CreatePlaylistDialog({ onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return createPortal(
    <div
      className="cpd-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="cpd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New playlist"
      >
        <h3 className="cpd-title">New Playlist</h3>
        <input
          ref={inputRef}
          className="cpd-input"
          type="text"
          placeholder="Playlist name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
          }}
        />
        <div className="cpd-actions">
          <button className="cpd-btn cpd-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="cpd-btn cpd-btn-confirm"
            onClick={handleConfirm}
            disabled={!name.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root') ?? document.body,
  );
}
