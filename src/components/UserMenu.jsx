import { useEffect, useRef, useState } from 'react';
import DiscordIcon from './DiscordIcon.jsx';
import { parseStoredProfileUsername } from '../lib/playerState.js';

function UserIcon() {
  return (
    <svg className="user-menu-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 10.25A3.63 3.63 0 1 0 10 3a3.63 3.63 0 0 0 0 7.25Z" />
      <path d="M10 11.75c-3.62 0-6.56 2.24-6.56 5 0 .41.33.75.75.75h11.62c.42 0 .75-.34.75-.75 0-2.76-2.94-5-6.56-5Z" />
    </svg>
  );
}

export default function UserMenu({
  user,
  profile,
  authAvailable = false,
  onOpenAuth,
  onOpenHistory,
  onOpenSettings,
  onLogout,
  disabled = false,
  compact = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current?.contains(event.target)) return;
      setIsOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const displayName =
    profile?.username || user?.user_metadata?.username || 'User';
  const displayIdentity = parseStoredProfileUsername(displayName);
  const email = profile?.email || user?.email || '';
  const gamefaqsUsername = profile?.gamefaqs_username || '';
  const avatarUrl = profile?.avatar_url || '';
  const showAvatar = Boolean(
    user && avatarUrl && avatarUrl !== failedAvatarUrl,
  );
  const secondaryLabel = gamefaqsUsername
    ? `GameFaqs: ${gamefaqsUsername}`
    : email;

  return (
    <div
      ref={menuRef}
      className={`user-menu${compact ? ' compact' : ''}${isOpen ? ' open' : ''}`}
    >
      <button
        className={`collection-toggle-btn user-toggle-btn${user ? ' signed-in' : ''}${isOpen ? ' active' : ''}${showAvatar ? ' has-avatar' : ''}`}
        type="button"
        onClick={() => setIsOpen((previousValue) => !previousValue)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={user ? 'Open user menu' : 'Open login menu'}
        disabled={disabled}
      >
        {showAvatar ? (
          <img
            className="user-menu-avatar"
            src={avatarUrl}
            alt={`${displayIdentity.displayName} profile`}
            onError={() => setFailedAvatarUrl(avatarUrl)}
          />
        ) : (
          <UserIcon />
        )}
      </button>

      {isOpen && (
        <div className="user-menu-popover" role="menu">
          {user ? (
            <>
              <div className="user-menu-summary">
                <span className="user-menu-name">
                  {displayIdentity.provider === 'discord' && (
                    <DiscordIcon className="profile-provider-icon user-menu-provider-icon" />
                  )}
                  <span>{displayIdentity.displayName}</span>
                </span>
                {secondaryLabel && (
                  <span className="user-menu-email">{secondaryLabel}</span>
                )}
              </div>
              <button
                className="user-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onOpenHistory?.();
                }}
              >
                History
              </button>
              <button
                className="user-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings?.();
                }}
              >
                Settings
              </button>
              <button
                className="user-menu-item danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onLogout?.();
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <div className="user-menu-summary">
                <span className="user-menu-name">Guest</span>
                <span className="user-menu-email">
                  {authAvailable
                    ? 'Log in to sync playlists and lists.'
                    : 'Configure Supabase to enable accounts.'}
                </span>
              </div>
              <button
                className="user-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onOpenAuth?.();
                }}
              >
                {authAvailable ? 'Log in' : 'Set up login'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
