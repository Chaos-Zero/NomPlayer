export default function UserSettingsDialog({
  isOpen = false,
  profile = null,
  user = null,
  isSubmitting = false,
  error = '',
  notice = '',
  onClose,
  onSave,
}) {
  if (!isOpen || !user) return null;

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSave?.({
      username: String(formData.get('username') || '').trim(),
      gamefaqsUsername: String(formData.get('gamefaqs_username') || '').trim(),
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="settings-dialog-title">Account settings</h2>
            <p className="modal-subtitle">
              Manage how your profile appears in the app.
            </p>
          </div>
          <button
            className="btn-close"
            type="button"
            aria-label="Close settings dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form className="auth-dialog-form" onSubmit={handleSubmit}>
          <label className="auth-dialog-field">
            <span>Username</span>
            <input
              name="username"
              type="text"
              defaultValue={
                profile?.username || user?.user_metadata?.username || ''
              }
              minLength={3}
              maxLength={32}
              autoComplete="username"
              required
            />
          </label>

          {profile?.gamefaqs_username && (
            <div className="auth-dialog-message">
              Current GameFAQs username: {profile.gamefaqs_username}
            </div>
          )}

          <label className="auth-dialog-field">
            <span>Email</span>
            <input type="email" value={user.email || ''} readOnly disabled />
          </label>

          <label className="auth-dialog-field">
            <span>GameFAQs username</span>
            <input
              name="gamefaqs_username"
              type="text"
              defaultValue={profile?.gamefaqs_username || ''}
              autoComplete="nickname"
              maxLength={32}
            />
          </label>

          {(error || notice) && (
            <div
              className={`auth-dialog-message${error ? ' error' : ''}`}
              role={error ? 'alert' : 'status'}
            >
              {error || notice}
            </div>
          )}

          <button className="btn btn-primary auth-dialog-submit" type="submit">
            {isSubmitting ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </div>
    </div>
  );
}
