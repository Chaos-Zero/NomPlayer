import { useState, useEffect } from 'react';
import { findPotentialDuplicates, mergeTracks } from '../lib/trackCatalog.js';

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="currentColor"
      width="14"
      height="14"
    >
      <path d="M6.25 4.67V15.33C6.25 15.91 6.89 16.27 7.39 15.96L15.75 10.63C16.22 10.33 16.22 9.67 15.75 9.37L7.39 4.04C6.89 3.73 6.25 4.09 6.25 4.67Z" />
    </svg>
  );
}

export default function DuplicateReviewModal({
  supabase,
  selectedTrack,
  hasPlayer,
  onPlayNow,
  onClose,
  onMerged,
}) {
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState(null);

  // Track which candidate IDs are selected for merging
  const [includedSourceIds, setIncludedSourceIds] = useState(new Set());

  // Custom manual values
  const [customValues, setCustomValues] = useState({
    gameTitle: '',
    trackTitle: '',
    sourceUrl: '',
  });

  // Which track ID's value is chosen for each field (or 'custom')
  const [selectedValues, setSelectedValues] = useState({
    gameTitle: 'selected',
    trackTitle: 'selected',
    sourceUrl: 'selected',
  });

  useEffect(() => {
    if (!selectedTrack || !supabase) return;

    let active = true;

    const getSimilarityScore = (s1, s2) => {
      if (!s1 || !s2) return 0;
      const n1 = s1.toLowerCase().trim();
      const n2 = s2.toLowerCase().trim();
      if (n1 === n2) return 1.0;
      if (n1.includes(n2) || n2.includes(n1)) return 0.8;

      const w1 = new Set(n1.split(/\s+/).filter((w) => w.length > 1));
      const w2 = new Set(n2.split(/\s+/).filter((w) => w.length > 1));
      const intersection = [...w1].filter((x) => w2.has(x));
      if (w1.size === 0 || w2.size === 0) return 0;
      return intersection.length / Math.max(w1.size, w2.size);
    };

    findPotentialDuplicates(supabase, selectedTrack)
      .then((data) => {
        if (active) {
          // Sort by similarity to selected track (track title weighted higher)
          const sorted = [...data].sort((a, b) => {
            const simA =
              getSimilarityScore(selectedTrack.trackTitle, a.trackTitle) * 0.7 +
              getSimilarityScore(selectedTrack.gameTitle, a.gameTitle) * 0.3;
            const simB =
              getSimilarityScore(selectedTrack.trackTitle, b.trackTitle) * 0.7 +
              getSimilarityScore(selectedTrack.gameTitle, b.gameTitle) * 0.3;
            return simB - simA;
          });
          setDuplicates(sorted);
          // By default, do NOT include any duplicates - user must opt-in
          setIncludedSourceIds(new Set());
        }
      })
      .catch((err) => {
        if (active) setError('Failed to find potential duplicates.');
        console.error(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedTrack, supabase]);

  const handleToggleInclude = (trackId) => {
    const next = new Set(includedSourceIds);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
    }
    setIncludedSourceIds(next);
  };

  const handleValueChange = (field, trackId) => {
    setSelectedValues((prev) => ({
      ...prev,
      [field]: trackId,
    }));
  };

  const handleCustomValueChange = (field, value) => {
    setCustomValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveInitiate = () => {
    if (includedSourceIds.size === 0) {
      setError('Please select at least one duplicate track to merge.');
      return;
    }
    setError(null);
    setIsConfirming(true);
  };

  const handleFinalMerge = async () => {
    const sourceTracks = duplicates.filter((d) =>
      includedSourceIds.has(d.trackId),
    );

    // Construct final values object
    const getVal = (field) => {
      const id = selectedValues[field];
      if (id === 'selected') return selectedTrack[field];
      if (id === 'custom') return customValues[field];
      const track = duplicates.find((d) => d.trackId === id);
      return track ? track[field] : selectedTrack[field];
    };

    const finalValues = {
      gameTitle: getVal('gameTitle'),
      trackTitle: getVal('trackTitle'),
      sourceUrl: getVal('sourceUrl'),
    };

    setIsSaving(true);
    setError(null);

    try {
      await mergeTracks(supabase, selectedTrack, sourceTracks, finalValues);
      onMerged();
      onClose();
    } catch (err) {
      setError(`Merge failed: ${err.message || 'Unknown error'}`);
      console.error('Merge Error:', err);
      setIsSaving(false);
      setIsConfirming(false);
    }
  };

  if (!selectedTrack) return null;

  const renderTournaments = (tournaments) => {
    if (!tournaments || tournaments.length === 0)
      return <span className="dim">None</span>;
    return tournaments.map((t) => `VGMC ${t.sequenceNumber}`).join(', ');
  };

  const isFieldSame = (field, candidateValue) => {
    return (
      String(selectedTrack[field]).toLowerCase() ===
      String(candidateValue).toLowerCase()
    );
  };

  // Calculate summary for confirmation
  const sourceTracks = duplicates.filter((d) =>
    includedSourceIds.has(d.trackId),
  );
  const getFinalVal = (field) => {
    const id = selectedValues[field];
    if (id === 'selected') return selectedTrack[field];
    if (id === 'custom') return customValues[field];
    const track = duplicates.find((d) => d.trackId === id);
    return track ? track[field] : selectedTrack[field];
  };

  return (
    <div
      className={`modal-overlay ${hasPlayer ? 'with-player' : ''}`}
      onClick={onClose}
    >
      <div
        className="modal-content diff-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <h2>Interactive Merge Duplicates</h2>
          </div>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Searching for potential duplicates...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <span className="error-icon">⚠️</span>
              <p>{error}</p>
            </div>
          ) : isConfirming ? (
            <div className="confirmation-view">
              <div className="confirm-icon">🧪</div>
              <h3>Confirm Merge Action</h3>
              <p>
                You are about to merge the following tracks. This action cannot
                be undone.
              </p>

              <div className="confirm-summary-box">
                <div className="summary-item">
                  <span className="summary-label">Target Track:</span>
                  <span className="summary-value highlight">
                    {selectedTrack.trackTitle} (ID: {selectedTrack.trackId})
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Deleting Match(es):</span>
                  <div className="summary-list">
                    {sourceTracks.map((t) => (
                      <div key={t.trackId} className="list-item">
                        • {t.trackTitle} (ID: {t.trackId})
                      </div>
                    ))}
                  </div>
                </div>
                <div className="summary-divider"></div>
                <div className="summary-item">
                  <span className="summary-label">Final Game:</span>
                  <span className="summary-value">
                    {getFinalVal('gameTitle')}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Final Track:</span>
                  <span className="summary-value">
                    {getFinalVal('trackTitle')}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Final URL:</span>
                  <span className="summary-value truncate">
                    {getFinalVal('sourceUrl')}
                  </span>
                </div>
              </div>
            </div>
          ) : duplicates.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✨</span>
              <p>No potential duplicates found for this track.</p>
            </div>
          ) : (
            <div className="interactive-grid-container">
              <div className="grid-scroll-viewport">
                <div className="grid-table">
                  {/* Header Row */}
                  <div className="grid-row header-row">
                    <div className="grid-cell label-cell sticky">Field</div>
                    <div className="grid-cell track-column current-column selected">
                      <div className="track-header-content">
                        <span className="badge">Original</span>
                        <div className="track-id">
                          ID: {selectedTrack.trackId}
                        </div>
                      </div>
                    </div>

                    {duplicates.map((dup, i) => (
                      <div
                        key={dup.trackId}
                        className={`grid-cell track-column ${includedSourceIds.has(dup.trackId) ? 'included' : 'excluded'}`}
                      >
                        <div className="track-header-content">
                          <label className="include-checkbox">
                            <input
                              type="checkbox"
                              checked={includedSourceIds.has(dup.trackId)}
                              onChange={() => handleToggleInclude(dup.trackId)}
                            />
                            <span className="checkbox-label">
                              Merge Match #{i + 1}
                            </span>
                          </label>
                          <div className="track-id">ID: {dup.trackId}</div>
                        </div>
                      </div>
                    ))}

                    <div className="grid-cell track-column custom-column">
                      <div className="track-header-content">
                        <span className="badge custom">Custom</span>
                        <div className="track-id">Manual Override</div>
                      </div>
                    </div>
                  </div>

                  {/* Game Title Row */}
                  <div className="grid-row">
                    <div className="grid-cell label-cell sticky">
                      Game Title
                    </div>
                    <div className="grid-cell track-column current-column">
                      <label className="radio-value">
                        <input
                          type="radio"
                          name="gameTitle"
                          value="selected"
                          checked={selectedValues.gameTitle === 'selected'}
                          onChange={() =>
                            handleValueChange('gameTitle', 'selected')
                          }
                        />
                        <span className="value-text">
                          {selectedTrack.gameTitle}
                        </span>
                      </label>
                    </div>

                    {duplicates.map((dup) => (
                      <div
                        key={dup.trackId}
                        className={`grid-cell track-column ${includedSourceIds.has(dup.trackId) ? '' : 'disabled'}`}
                      >
                        <label className="radio-value">
                          <input
                            type="radio"
                            name="gameTitle"
                            value={dup.trackId}
                            disabled={!includedSourceIds.has(dup.trackId)}
                            checked={selectedValues.gameTitle === dup.trackId}
                            onChange={() =>
                              handleValueChange('gameTitle', dup.trackId)
                            }
                          />
                          <span
                            className={`value-text ${!isFieldSame('gameTitle', dup.gameTitle) ? 'diff-highlight' : ''}`}
                          >
                            {dup.gameTitle}
                          </span>
                        </label>
                      </div>
                    ))}

                    <div className="grid-cell track-column custom-column">
                      <label className="radio-value">
                        <input
                          type="radio"
                          name="gameTitle"
                          value="custom"
                          checked={selectedValues.gameTitle === 'custom'}
                          onChange={() =>
                            handleValueChange('gameTitle', 'custom')
                          }
                        />
                        <input
                          type="text"
                          className="custom-input"
                          placeholder="Game Title"
                          value={customValues.gameTitle}
                          onChange={(e) =>
                            handleCustomValueChange('gameTitle', e.target.value)
                          }
                          onClick={() =>
                            handleValueChange('gameTitle', 'custom')
                          }
                        />
                      </label>
                    </div>
                  </div>

                  {/* Track Title Row */}
                  <div className="grid-row">
                    <div className="grid-cell label-cell sticky">
                      Track Title
                    </div>
                    <div className="grid-cell track-column current-column">
                      <label className="radio-value">
                        <input
                          type="radio"
                          name="trackTitle"
                          value="selected"
                          checked={selectedValues.trackTitle === 'selected'}
                          onChange={() =>
                            handleValueChange('trackTitle', 'selected')
                          }
                        />
                        <span className="value-text">
                          {selectedTrack.trackTitle}
                        </span>
                      </label>
                    </div>

                    {duplicates.map((dup) => (
                      <div
                        key={dup.trackId}
                        className={`grid-cell track-column ${includedSourceIds.has(dup.trackId) ? '' : 'disabled'}`}
                      >
                        <label className="radio-value">
                          <input
                            type="radio"
                            name="trackTitle"
                            value={dup.trackId}
                            disabled={!includedSourceIds.has(dup.trackId)}
                            checked={selectedValues.trackTitle === dup.trackId}
                            onChange={() =>
                              handleValueChange('trackTitle', dup.trackId)
                            }
                          />
                          <span
                            className={`value-text ${!isFieldSame('trackTitle', dup.trackTitle) ? 'diff-highlight' : ''}`}
                          >
                            {dup.trackTitle}
                          </span>
                        </label>
                      </div>
                    ))}

                    <div className="grid-cell track-column custom-column">
                      <label className="radio-value">
                        <input
                          type="radio"
                          name="trackTitle"
                          value="custom"
                          checked={selectedValues.trackTitle === 'custom'}
                          onChange={() =>
                            handleValueChange('trackTitle', 'custom')
                          }
                        />
                        <input
                          type="text"
                          className="custom-input"
                          placeholder="Song Title"
                          value={customValues.trackTitle}
                          onChange={(e) =>
                            handleCustomValueChange(
                              'trackTitle',
                              e.target.value,
                            )
                          }
                          onClick={() =>
                            handleValueChange('trackTitle', 'custom')
                          }
                        />
                      </label>
                    </div>
                  </div>

                  {/* URL Row */}
                  <div className="grid-row">
                    <div className="grid-cell label-cell sticky">
                      Source URL
                    </div>
                    <div className="grid-cell track-column current-column">
                      <div className="url-group">
                        <label className="radio-value">
                          <input
                            type="radio"
                            name="sourceUrl"
                            value="selected"
                            checked={selectedValues.sourceUrl === 'selected'}
                            onChange={() =>
                              handleValueChange('sourceUrl', 'selected')
                            }
                          />
                          <span
                            className="value-text truncate"
                            title={selectedTrack.sourceUrl}
                          >
                            {selectedTrack.sourceUrl}
                          </span>
                        </label>
                        <button
                          className="btn-play-mini"
                          onClick={() => onPlayNow(selectedTrack)}
                          title="Preview track"
                        >
                          <PlayIcon />
                        </button>
                      </div>
                    </div>

                    {duplicates.map((dup) => (
                      <div
                        key={dup.trackId}
                        className={`grid-cell track-column ${includedSourceIds.has(dup.trackId) ? '' : 'disabled'}`}
                      >
                        <div className="url-group">
                          <label className="radio-value">
                            <input
                              type="radio"
                              name="sourceUrl"
                              value={dup.trackId}
                              disabled={!includedSourceIds.has(dup.trackId)}
                              checked={selectedValues.sourceUrl === dup.trackId}
                              onChange={() =>
                                handleValueChange('sourceUrl', dup.trackId)
                              }
                            />
                            <span
                              className={`value-text truncate ${!isFieldSame('sourceUrl', dup.sourceUrl) ? 'diff-highlight' : ''}`}
                              title={dup.sourceUrl}
                            >
                              {dup.sourceUrl}
                            </span>
                          </label>
                          <button
                            className="btn-play-mini"
                            onClick={() => onPlayNow(dup)}
                            title="Preview candidate"
                            disabled={!includedSourceIds.has(dup.trackId)}
                          >
                            <PlayIcon />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="grid-cell track-column custom-column">
                      <label className="radio-value">
                        <input
                          type="radio"
                          name="sourceUrl"
                          value="custom"
                          checked={selectedValues.sourceUrl === 'custom'}
                          onChange={() =>
                            handleValueChange('sourceUrl', 'custom')
                          }
                        />
                        <input
                          type="text"
                          className="custom-input"
                          placeholder="URL"
                          value={customValues.sourceUrl}
                          onChange={(e) =>
                            handleCustomValueChange('sourceUrl', e.target.value)
                          }
                          onClick={() =>
                            handleValueChange('sourceUrl', 'custom')
                          }
                        />
                      </label>
                    </div>
                  </div>

                  {/* Contests Row */}
                  <div className="grid-row last-row">
                    <div className="grid-cell label-cell sticky">Contests</div>
                    <div className="grid-cell track-column current-column">
                      <div className="tournament-list">
                        {renderTournaments(selectedTrack.tournaments)}
                      </div>
                    </div>

                    {duplicates.map((dup) => (
                      <div
                        key={dup.trackId}
                        className={`grid-cell track-column ${includedSourceIds.has(dup.trackId) ? '' : 'disabled'}`}
                      >
                        <div className="tournament-list">
                          {renderTournaments(dup.tournaments)}
                        </div>
                      </div>
                    ))}

                    <div className="grid-cell track-column custom-column">
                      <div className="tournament-list dim">N/A</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="merge-summary">
                <h3>Final Merge Result</h3>
                <div className="summary-banner">
                  All selected tracks will be deleted and their contest
                  histories will be combined into the original track entry.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary cancel-btn"
            onClick={isConfirming ? () => setIsConfirming(false) : onClose}
            disabled={isSaving}
          >
            {isConfirming ? 'Go Back' : 'Cancel'}
          </button>
          <button
            className="btn btn-primary save-btn"
            onClick={isConfirming ? handleFinalMerge : handleSaveInitiate}
            disabled={
              isSaving || loading || (duplicates.length === 0 && !isConfirming)
            }
          >
            {isSaving
              ? 'Merging Tracks...'
              : isConfirming
                ? 'Confirm & Merge'
                : 'Save Changes'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--bg-overlay, rgba(0, 0, 0, 0.85));
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
          backdrop-filter: blur(8px);
          transition: bottom 0.34s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .modal-overlay.with-player {
          bottom: calc(var(--footer-player-h) + 40px);
        }
        .diff-modal {
          max-width: 1400px;
          width: 95%;
          max-height: 85vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          box-shadow: var(--shadow-lg);
          color: var(--text-base);
        }
        .modal-header {
          padding: 20px 28px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--bg-surface-header, rgba(255, 255, 255, 0.02));
        }
        .modal-title-group {
          display: flex;
          align-items: center;
        }
        .modal-header h2 {
          font-size: 1.25rem;
          margin: 0;
          font-weight: 600;
          color: var(--text-primary);
        }
        .btn-close {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 1.5rem;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          transition: color 0.2s;
        }
        .btn-close:hover {
          color: var(--text-primary);
        }
        .modal-body {
          padding: 0;
          overflow-y: auto;
          flex-grow: 1;
          background: var(--bg-base);
          display: flex;
          flex-direction: column;
        }

        /* Confirmation View */
        .confirmation-view {
          padding: 60px 40px;
          text-align: center;
          max-width: 700px;
          margin: 0 auto;
        }
        .confirm-icon {
          font-size: 4rem;
          margin-bottom: 24px;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
          }
        }
        .confirmation-view h3 {
          font-size: 1.75rem;
          margin-bottom: 12px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .confirmation-view p {
          color: var(--text-muted);
          margin-bottom: 40px;
          font-size: 1.1rem;
        }
        .confirm-summary-box {
          background: var(--bg-surface-dim, rgba(255, 255, 255, 0.03));
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 32px;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .summary-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .summary-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          font-weight: 700;
        }
        .summary-value {
          font-size: 1rem;
          color: var(--text-primary);
          word-break: break-all;
        }
        .summary-value.highlight {
          color: var(--accent-light);
          font-weight: 600;
        }
        .summary-list {
          margin-top: 4px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .list-item {
          font-size: 0.95rem;
          color: var(--text-danger, #ff6b6b);
        }
        .summary-divider {
          height: 1px;
          background: var(--border);
          margin: 8px 0;
        }

        /* Single Horizontal Scroll Viewport */
        .grid-scroll-viewport {
          overflow-x: auto;
          width: 100%;
        }
        .grid-table {
          display: flex;
          flex-direction: column;
          min-width: max-content;
        }
        .grid-row {
          display: flex;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
        }
        .grid-row:hover {
          background: var(--bg-surface-hover, rgba(255, 255, 255, 0.01));
        }
        .header-row {
          background: var(--bg-surface-dim, rgba(255, 255, 255, 0.03));
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .last-row {
          border-bottom: none;
        }
        .grid-cell {
          padding: 16px;
          display: flex;
          align-items: center;
        }
        .label-cell.sticky {
          position: sticky;
          left: 0;
          z-index: 5;
          width: 140px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          color: var(--text-muted);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
          background: var(--bg-sidebar, #16161c);
        }
        .track-column {
          width: 350px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
        }
        .current-column {
          background: rgba(var(--accent-rgb), 0.03);
          box-shadow: inset 0 0 40px rgba(var(--accent-rgb), 0.02);
        }
        .custom-column {
          background: var(--bg-surface-custom, rgba(255, 255, 255, 0.015));
        }

        /* Selection Controls */
        .track-header-content {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .badge {
          background: var(--accent);
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 700;
          align-self: flex-start;
          text-transform: uppercase;
        }
        .badge.custom {
          background: #6e45e2;
        }
        .track-id {
          font-family: monospace;
          font-size: 0.7rem;
          color: var(--text-muted);
          opacity: 0.6;
        }
        .include-checkbox {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text-base);
        }
        .radio-value {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          cursor: pointer;
          flex-grow: 1;
          padding: 4px 0;
          width: 100%;
        }
        .url-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 8px;
        }
        .value-text {
          font-size: 0.95rem;
          line-height: 1.4;
          transition: color 0.2s;
        }
        .radio-value:hover .value-text {
          color: var(--accent-light);
        }
        .radio-value input[type='radio'],
        .include-checkbox input[type='checkbox'] {
          margin-top: 4px;
          cursor: pointer;
          accent-color: var(--accent);
        }
        .custom-input {
          background: var(--bg-input, rgba(255, 255, 255, 0.05));
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-primary);
          padding: 6px 10px;
          font-size: 0.9rem;
          width: 100%;
          transition: all 0.2s;
        }
        .custom-input:focus {
          outline: none;
          border-color: var(--accent);
          background: var(--bg-input-focus, rgba(255, 255, 255, 0.08));
        }
        .btn-play-mini {
          background: rgba(var(--accent-rgb), 0.1);
          color: var(--accent);
          border: 1px solid rgba(var(--accent-rgb), 0.2);
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .btn-play-mini:hover:not(:disabled) {
          background: var(--accent);
          color: white;
          transform: scale(1.1);
        }
        .btn-play-mini:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .diff-highlight {
          background: rgba(255, 68, 68, 0.12);
          padding: 1px 4px;
          border-radius: 3px;
          color: var(--text-danger, #ff6b6b);
        }
        .disabled {
          opacity: 0.4;
          filter: grayscale(0.8);
        }
        .truncate {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 250px;
        }
        .tournament-list {
          font-size: 0.85rem;
          color: var(--text-base);
          line-height: 1.5;
        }
        .dim {
          color: var(--text-muted);
          font-style: italic;
        }

        /* Footer */
        .modal-footer {
          padding: 24px 28px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          gap: 16px;
          background: var(--bg-surface-header, rgba(255, 255, 255, 0.02));
        }
        .btn {
          padding: 10px 24px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .save-btn {
          background: var(--accent);
          color: white;
          border: none;
          box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3);
        }
        .save-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(var(--accent-rgb), 0.4);
        }
        .cancel-btn {
          background: var(--bg-input, rgba(255, 255, 255, 0.05));
          color: var(--text-base);
          border: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
        }
        .cancel-btn:hover:not(:disabled) {
          background: var(--bg-input-focus, rgba(255, 255, 255, 0.1));
          border-color: var(--text-primary);
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        /* States */
        .loading-state,
        .empty-state,
        .error-state {
          padding: 100px 40px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(var(--accent-rgb), 0.1);
          border-top: 3px solid var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .error-icon,
        .empty-icon {
          font-size: 2.5rem;
        }
        .error-state p {
          color: var(--text-danger, #ff6b6b);
        }
        .merge-summary {
          padding: 28px;
        }
        .merge-summary h3 {
          margin-top: 0;
          font-size: 1rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .summary-banner {
          background: rgba(var(--accent-rgb), 0.08);
          border-left: 4px solid var(--accent);
          padding: 16px 20px;
          border-radius: 8px;
          font-size: 0.9rem;
          color: var(--accent-light);
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
