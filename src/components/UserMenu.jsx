import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DiscordIcon from './DiscordIcon.jsx';
import {
  parseStoredProfileUsername,
  getDisplayProfileName,
} from '../lib/playerState.js';

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
  // Popover is portaled to document.body (see the createPortal call below)
  // so it always paints above everything else, including ancestors that
  // create their own stacking context (a transform/filter/etc. anywhere
  // between here and <body> would otherwise trap a position:fixed child
  // and cap its effective z-index at that ancestor's). popoverRef lets the
  // outside-click check below still recognise clicks inside it even though
  // it's no longer a DOM descendant of menuRef.
  const popoverRef = useRef(null);
  const [popoverPosition, setPopoverPosition] = useState(null);

  // Anchors the portaled popover under the toggle button, right-aligned to
  // its edge - the same spot the old position:absolute/right:0 CSS put it.
  // Reading menuRef during render (rather than measuring here in an effect)
  // isn't allowed - refs aren't safe to read until after commit - so this
  // has to be an Effect that measures the DOM and reflects it into state.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const buttonRect = menuRef.current?.getBoundingClientRect();
    if (!buttonRect) return;
    setPopoverPosition({
      top: buttonRect.bottom + 10,
      right: Math.max(8, window.innerWidth - buttonRect.right),
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current?.contains(event.target)) return;
      if (popoverRef.current?.contains(event.target)) return;
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

      {isOpen &&
        popoverPosition &&
        createPortal(
          <div
            ref={popoverRef}
            className="user-menu-popover"
            role="menu"
            style={{
              position: 'fixed',
              top: popoverPosition.top,
              right: popoverPosition.right,
              zIndex: 50000,
            }}
          >
            {user ? (
              <>
                <div className="user-menu-summary">
                  <span className="user-menu-name">
                    {displayIdentity.provider === 'discord' && (
                      <DiscordIcon className="profile-provider-icon user-menu-provider-icon" />
                    )}
                    <span>
                      {getDisplayProfileName(displayIdentity.displayName)}
                    </span>
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
          </div>,
          document.body,
        )}
    </div>
  );
}
