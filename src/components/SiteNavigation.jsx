import { useEffect, useRef } from 'react';

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 9.1 10 3.75l6.5 5.35V16a.75.75 0 0 1-.75.75H11.5v-4.5h-3v4.5H4.25A.75.75 0 0 1 3.5 16V9.1Z" />
    </svg>
  );
}

function PlayerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.5 4.52v10.96c0 .62.68 1 1.22.68l8.3-5.48a.8.8 0 0 0 0-1.36l-8.3-5.48c-.54-.32-1.22.06-1.22.68Z" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M4 6h12" />
      <path d="M4 10h12" />
      <path d="M4 14h12" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <path d="M3 4.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75ZM3 8.75a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75ZM3.75 12a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" />
      <path
        fillRule="evenodd"
        d="M13 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-4.5 3a4.5 4.5 0 1 1 7.746 3.012l1.974 1.974a.75.75 0 1 1-1.06 1.06l-1.974-1.974A4.5 4.5 0 0 1 8.5 13Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ListExplorerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <path d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v11.5A2.25 2.25 0 0 1 15.75 18H4.25A2.25 2.25 0 0 1 2 15.75V4.25Zm2.25-.75a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.25V3.5H4.25Zm6.75 14.25h4.75a.75.75 0 0 0 .75-.75V11h-5.5v6.75Zm0-8.25h5.5V4.25a.75.75 0 0 0-.75-.75h-4.75V10Z" />
    </svg>
  );
}

const NAV_ITEMS = [
  {
    id: 'home',
    label: 'Home',
    Icon: HomeIcon,
  },
  {
    id: 'player',
    label: 'Player',
    Icon: PlayerIcon,
  },
  {
    id: 'listExplorer',
    label: 'List Explorer',
    Icon: ListExplorerIcon,
  },
  {
    id: 'database',
    label: 'Track Database',
    Icon: DatabaseIcon,
  },
];

export default function SiteNavigation({
  activePage,
  onNavigate,
  isMobile = false,
  isMenuOpen = false,
  onCloseMenu,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isMobile || !isMenuOpen) return undefined;

    function handlePointerDown(event) {
      const target = event.target;
      if (menuRef.current?.contains(target)) return;
      if (target.closest('.mobile-site-nav-toggle')) return;
      onCloseMenu?.();
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onCloseMenu?.();
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen, isMobile, onCloseMenu]);

  if (isMobile) {
    return (
      <>
        <div
          ref={menuRef}
          id="mobile-site-nav-menu"
          className={`mobile-site-nav-menu${isMenuOpen ? ' open' : ''}`}
          role="menu"
          aria-label="Site navigation"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`mobile-site-nav-item${activePage === item.id ? ' active' : ''}`}
              type="button"
              role="menuitem"
              aria-current={activePage === item.id ? 'page' : undefined}
              onClick={() => {
                onNavigate(item.id);
                onCloseMenu?.();
              }}
            >
              <item.Icon />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <div className="site-nav-logo-wrapper desktop-only">
        <img
          src="/NomPlayer_icon_backup.png"
          className="site-nav-logo"
          alt="NomPlayer"
        />
      </div>
      <div className="site-nav-group">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`site-nav-btn${activePage === item.id ? ' active' : ''}`}
            type="button"
            aria-label={item.label}
            aria-current={activePage === item.id ? 'page' : undefined}
            title={item.label}
            onClick={() => onNavigate(item.id)}
          >
            <span className="site-nav-btn-icon" aria-hidden="true">
              <item.Icon />
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
