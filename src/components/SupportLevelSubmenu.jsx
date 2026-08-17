import { ChevronRightIcon } from './Icons.jsx';
import useContextSubmenu from '../hooks/useContextSubmenu.js';

const LEVELS = [
  { id: 1, label: 'Possible Support' },
  { id: 2, label: 'Likely Support' },
  { id: 3, label: 'Definite Support' },
];

/**
 * A nested "off to the side" submenu for picking a support level, meant to be
 * rendered as a child of a ContextMenuPortal (alongside CustomPlaylistSubmenu).
 * Opens on click or on ~500ms hover, and flips to the left if it would
 * overflow the right edge of the window.
 */
export default function SupportLevelSubmenu({
  videos,
  currentLevel = 1,
  onToggleSupport,
  onClose,
  itemClassName = 'playlist-context-menu-item',
  label = 'Update Support',
  showRemove = true,
}) {
  const {
    open,
    side,
    wrapRef,
    submenuRef,
    handleMouseEnter,
    handleMouseLeave,
    toggle,
  } = useContextSubmenu();

  if (!videos?.length || !onToggleSupport) return null;

  function selectLevel(level) {
    onToggleSupport(videos, level);
    onClose?.();
  }

  return (
    <div
      className="context-submenu-wrap"
      ref={wrapRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`${itemClassName}${open ? ' active' : ''}`}
        type="button"
        role="menuitem"
        onClick={toggle}
      >
        <span>{label}</span>
        <ChevronRightIcon
          className={`context-menu-chevron${open ? ' open' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={submenuRef}
          className={`context-side-submenu side-${side}`}
          role="menu"
        >
          {LEVELS.map((level) => (
            <button
              key={level.id}
              className={`${itemClassName}${currentLevel === level.id ? ' active' : ''}`}
              type="button"
              role="menuitem"
              onClick={() => selectLevel(level.id)}
            >
              {level.label}
            </button>
          ))}
          {showRemove && (
            <>
              <div className="context-menu-divider" />
              <button
                className={`${itemClassName} danger`}
                type="button"
                role="menuitem"
                onClick={() => selectLevel(0)}
              >
                Remove Support
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
