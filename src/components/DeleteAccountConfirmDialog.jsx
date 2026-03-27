export default function DeleteAccountConfirmDialog({
  isOpen = false,
  isSubmitting = false,
  onClose,
  onConfirm,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card delete-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="delete-dialog-header-content">
            <div className="delete-dialog-warning-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 id="delete-dialog-title">Delete Account?</h2>
          </div>
          <button
            className="btn-close"
            type="button"
            aria-label="Close confirmation dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="modal-body delete-dialog-body">
          <p>
            Are you sure you wish to delete your account?
            <strong>
              {' '}
              Your lists and listening progress will be permanently deleted.
            </strong>
          </p>
          <p className="delete-dialog-irreversible">
            This action is irreversible.
          </p>
        </div>

        <div className="modal-footer delete-dialog-footer">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Deleting…' : 'Delete Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
