import { useRef, useState } from 'react';
import { getDisplayProfileName } from '../lib/playerState.js';

function DisplayPictureField({ avatarUrl = '' }) {
  const [isEditing, setIsEditing] = useState(!avatarUrl);
  const [inputValue, setInputValue] = useState(avatarUrl);
  const [previewUrl, setPreviewUrl] = useState(avatarUrl);
  const inputRef = useRef(null);

  function handleEditClick() {
    const nextValue = inputValue.trim();

    if (isEditing && nextValue) {
      setPreviewUrl(nextValue);
    }

    setIsEditing(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    });
  }

  if (!previewUrl && !avatarUrl) {
    return (
      <label className="auth-dialog-field">
        <span>Display Picture URL</span>
        <input
          ref={inputRef}
          name="avatar_url"
          type="url"
          value={inputValue}
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com/avatar.png"
          onChange={(event) => setInputValue(event.target.value)}
        />
      </label>
    );
  }

  return (
    <div className="auth-dialog-field settings-avatar-field">
      <span>Display Picture</span>
      <div className="settings-avatar-inline">
        <div className="settings-avatar-preview-box">
          <img
            className="settings-avatar-preview"
            src={previewUrl}
            alt="Current Display Picture"
          />
        </div>
        <div className="settings-avatar-editor">
          <input
            ref={inputRef}
            className="settings-avatar-url-input"
            name="avatar_url"
            type="url"
            value={inputValue}
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com/avatar.png"
            readOnly={!isEditing}
            onChange={(event) => setInputValue(event.target.value)}
          />
          <button
            className="fav-panel-action-btn"
            type="button"
            onClick={handleEditClick}
          >
            Update Display Picture
          </button>
        </div>
      </div>
    </div>
  );
}

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
      avatarUrl: String(formData.get('avatar_url') || '').trim(),
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
              defaultValue={getDisplayProfileName(
                profile?.username || user?.user_metadata?.username || '',
                '',
              )}
              minLength={3}
              maxLength={32}
              autoComplete="username"
              required
            />
          </label>

          <label className="auth-dialog-field">
            <span>Email</span>
            <input type="email" value={user.email || ''} readOnly disabled />
          </label>

          <label className="auth-dialog-field">
            <span>GameFAQs Username</span>
            <input
              name="gamefaqs_username"
              type="text"
              defaultValue={profile?.gamefaqs_username || ''}
              autoComplete="nickname"
              maxLength={32}
            />
          </label>

          <DisplayPictureField
            key={profile?.avatar_url || ''}
            avatarUrl={profile?.avatar_url || ''}
          />

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
