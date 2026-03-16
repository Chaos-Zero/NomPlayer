export default function AuthDialog({
  mode = 'signin',
  isOpen = false,
  isConfigured = false,
  isSubmitting = false,
  error = '',
  notice = '',
  onClose,
  onModeChange,
  onSignIn,
  onSignUp,
}) {
  if (!isOpen) return null;

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const username = String(formData.get('username') || '').trim();
    const gamefaqsUsername = String(
      formData.get('gamefaqs_username') || '',
    ).trim();

    if (mode === 'signup') {
      onSignUp?.({
        email,
        password,
        username,
        gamefaqsUsername,
      });
      return;
    }

    onSignIn?.({
      email,
      password,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="auth-dialog-title">
              {mode === 'signup' ? 'Create account' : 'Log in'}
            </h2>
            <p className="modal-subtitle">
              Sync your playlist, support list, nominations, and listen
              progress.
            </p>
          </div>
          <button
            className="btn-close"
            type="button"
            aria-label="Close authentication dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {!isConfigured ? (
          <div className="auth-dialog-warning">
            Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to
            enable accounts.
          </div>
        ) : (
          <>
            <div
              className="auth-dialog-tabs"
              role="tablist"
              aria-label="Login mode"
            >
              <button
                className={`auth-dialog-tab${mode === 'signin' ? ' active' : ''}`}
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                onClick={() => onModeChange?.('signin')}
              >
                Log in
              </button>
              <button
                className={`auth-dialog-tab${mode === 'signup' ? ' active' : ''}`}
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                onClick={() => onModeChange?.('signup')}
              >
                Sign up
              </button>
            </div>

            <form className="auth-dialog-form" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <>
                  <label className="auth-dialog-field">
                    <span>Username</span>
                    <input
                      name="username"
                      type="text"
                      autoComplete="username"
                      minLength={3}
                      maxLength={32}
                      required
                    />
                  </label>

                  <label className="auth-dialog-field">
                    <span>GameFAQs Username (optional)</span>
                    <input
                      name="gamefaqs_username"
                      type="text"
                      autoComplete="nickname"
                      maxLength={32}
                    />
                  </label>
                </>
              )}

              <label className="auth-dialog-field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="auth-dialog-field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                  minLength={8}
                  required
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

              <button
                className="btn btn-primary auth-dialog-submit"
                type="submit"
              >
                {isSubmitting
                  ? mode === 'signup'
                    ? 'Creating account…'
                    : 'Logging in…'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Log in'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
