export default function GuestImportDialog({
  isOpen = false,
  selections,
  counts,
  onToggle,
  onImport,
  onSkip,
}) {
  if (!isOpen || !selections || !counts) return null;

  const options = [
    {
      key: 'playlist',
      label: 'Playlist',
      description:
        counts.playlist === 1
          ? 'Import 1 queued track'
          : `Import ${counts.playlist} queued tracks`,
      disabled: counts.playlist === 0,
    },
    {
      key: 'supportList',
      label: 'Support list',
      description:
        counts.supportList === 1
          ? 'Import 1 support item'
          : `Import ${counts.supportList} support items`,
      disabled: counts.supportList === 0,
    },
    {
      key: 'nominationList',
      label: 'Nominations',
      description:
        counts.nominationList === 1
          ? 'Import 1 nomination'
          : `Import ${counts.nominationList} nominations`,
      disabled: counts.nominationList === 0,
    },
  ];

  const selectedCount = Object.entries(selections).filter(
    ([key, selected]) => selected && counts[key] > 0,
  ).length;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card guest-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-import-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="guest-import-title">Import guest lists?</h2>
            <p className="modal-subtitle">
              We found guest data on this device. Choose what to merge into your
              account.
            </p>
          </div>
        </div>

        <div className="guest-import-options">
          {options.map((option) => (
            <button
              key={option.key}
              className={`guest-import-option${selections[option.key] ? ' selected' : ''}${option.disabled ? ' disabled' : ''}`}
              type="button"
              onClick={() => {
                if (!option.disabled) {
                  onToggle?.(option.key);
                }
              }}
              disabled={option.disabled}
            >
              <span
                className={`guest-import-option-toggle${selections[option.key] ? ' selected' : ''}`}
                aria-hidden="true"
              />
              <span className="guest-import-option-copy">
                <span className="guest-import-option-title">
                  {option.label}
                </span>
                <span className="guest-import-option-description">
                  {option.description}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="guest-import-actions">
          <button
            className="fav-panel-action-btn"
            type="button"
            onClick={onSkip}
          >
            Skip import
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={onImport}
            disabled={selectedCount === 0}
          >
            Import selected
          </button>
        </div>
      </div>
    </div>
  );
}
