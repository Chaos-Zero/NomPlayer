import DiscordIcon from './DiscordIcon.jsx';

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
  onContinueWithDiscord,
  onRequestPasswordReset,
  onUpdatePassword,
}) {
  if (!isOpen) return null;

  const isSignInMode = mode === 'signin';
  const isSignUpMode = mode === 'signup';
  const isResetMode = mode === 'reset';
  const isRecoveryMode = mode === 'recovery';
  const showModeTabs = isSignInMode || isSignUpMode;

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const confirmPassword = String(formData.get('confirm_password') || '');
    const username = String(formData.get('username') || '').trim();
    const gamefaqsUsername = String(
      formData.get('gamefaqs_username') || '',
    ).trim();

    if (isSignUpMode) {
      onSignUp?.({
        email,
        password,
        username,
        gamefaqsUsername,
      });
      return;
    }

    if (isResetMode) {
      onRequestPasswordReset?.({ email });
      return;
    }

    if (isRecoveryMode) {
      onUpdatePassword?.({ password, confirmPassword });
      return;
    }

    onSignIn?.({
      email,
      password,
    });
  }

  const dialogTitle = isSignUpMode
    ? 'Create account'
    : isResetMode
      ? 'Reset password'
      : isRecoveryMode
        ? 'Choose a new password'
        : 'Log in';

  const dialogSubtitle = isResetMode
    ? 'Enter your email address and we will send you a password reset link.'
    : isRecoveryMode
      ? 'Enter a new password for your account.'
      : 'Build your support list, share your nominations, and listen to new tracks.';

  const submitLabel = isSubmitting
    ? isSignUpMode
      ? 'Creating account…'
      : isResetMode
        ? 'Sending reset email…'
        : isRecoveryMode
          ? 'Updating password…'
          : 'Logging in…'
    : isSignUpMode
      ? 'Create account'
      : isResetMode
        ? 'Send reset email'
        : isRecoveryMode
          ? 'Update password'
          : 'Log in';

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
            <h2 id="auth-dialog-title">{dialogTitle}</h2>
            <p className="modal-subtitle">{dialogSubtitle}</p>
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
            {showModeTabs ? (
              <div
                className="auth-dialog-tabs"
                role="tablist"
                aria-label="Login mode"
              >
                <button
                  className={`auth-dialog-tab${isSignInMode ? ' active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={isSignInMode}
                  onClick={() => onModeChange?.('signin')}
                >
                  Log in
                </button>
                <button
                  className={`auth-dialog-tab${isSignUpMode ? ' active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={isSignUpMode}
                  onClick={() => onModeChange?.('signup')}
                >
                  Sign up
                </button>
              </div>
            ) : (
              <div className="auth-dialog-link-row">
                <button
                  className="auth-dialog-link-btn"
                  type="button"
                  onClick={() => onModeChange?.('signin')}
                >
                  Back to log in
                </button>
              </div>
            )}

            <form className="auth-dialog-form" onSubmit={handleSubmit}>
              {isSignUpMode && (
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

              {!isRecoveryMode && (
                <label className="auth-dialog-field">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}

              {!isResetMode && (
                <label className="auth-dialog-field">
                  <span>{isRecoveryMode ? 'New Password' : 'Password'}</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      isSignInMode ? 'current-password' : 'new-password'
                    }
                    minLength={8}
                    required
                  />
                </label>
              )}

              {isRecoveryMode && (
                <label className="auth-dialog-field">
                  <span>Confirm New Password</span>
                  <input
                    name="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              )}

              {isSignInMode && (
                <div className="auth-dialog-link-row">
                  <button
                    className="auth-dialog-link-btn"
                    type="button"
                    onClick={() => onModeChange?.('reset')}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

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
                {submitLabel}
              </button>

              {showModeTabs && (
                <>
                  <div className="auth-dialog-separator" aria-hidden="true">
                    <span>or</span>
                  </div>

                  <button
                    className="btn auth-dialog-discord-btn"
                    type="button"
                    onClick={() => onContinueWithDiscord?.()}
                    disabled={isSubmitting}
                  >
                    <DiscordIcon className="auth-dialog-discord-icon" />
                    Continue with Discord
                  </button>
                </>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
