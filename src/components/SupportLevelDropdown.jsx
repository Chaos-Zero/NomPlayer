import { useEffect, useRef } from 'react';

export default function SupportLevelDropdown({
  onSelect,
  onClose,
  currentLevel = 1,
  position = { top: 0, left: 0 },
  direction = 'down',
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const levels = [
    { id: 1, label: 'Standard Support', icon: '♥', className: '' },
    { id: 2, label: 'High Support', icon: '♥', className: 'level-2' },
    { id: 3, label: 'Definite Support', icon: '🔒', className: 'level-3' },
  ];

  return (
    <div
      ref={menuRef}
      className="user-menu-popover support-level-dropdown"
      role="menu"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 1000,
        transform:
          direction === 'up'
            ? 'translate(-50%, calc(-100% - 8px))'
            : 'translate(-50%, 8px)',
      }}
    >
      <div
        className="user-menu-summary"
        style={{
          padding: '8px 12px',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-muted)',
        }}
      >
        Support Level
      </div>
      {levels.map((level) => (
        <button
          key={level.id}
          className={`user-menu-item${currentLevel === level.id ? ' active' : ''}`}
          type="button"
          role="menuitem"
          onClick={() => {
            onSelect(level.id);
            onClose();
          }}
        >
          <span
            className={`item-fav-btn supported ${level.className}`}
            style={{
              width: '20px',
              height: '20px',
              display: 'inline-flex',
              marginRight: '8px',
              opacity: 1,
            }}
          >
            {level.icon}
          </span>
          {level.label}
        </button>
      ))}
      <div
        style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}
      />
      <button
        className="user-menu-item danger"
        type="button"
        role="menuitem"
        onClick={() => {
          onSelect(0);
          onClose();
        }}
      >
        <span
          style={{
            width: '20px',
            display: 'inline-flex',
            marginRight: '8px',
            justifyContent: 'center',
          }}
        >
          ✕
        </span>
        Remove Support
      </button>
    </div>
  );
}
