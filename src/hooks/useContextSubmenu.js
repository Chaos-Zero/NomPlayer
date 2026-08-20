import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const HOVER_OPEN_DELAY = 500;
const HOVER_CLOSE_DELAY = 250;

/**
 * Shared open/close + positioning logic for a nested "off to the side"
 * context-menu submenu (e.g. Update Support, Add to Playlist).
 * Opens on click or on ~500ms hover, closes shortly after the pointer
 * leaves, and flips from the right side to the left if it would overflow
 * the window.
 */
export default function useContextSubmenu() {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState('right');
  const wrapRef = useRef(null);
  const submenuRef = useRef(null);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);

  function clearTimers() {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  useEffect(() => clearTimers, []);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;

    const wrapRect = wrapRef.current.getBoundingClientRect();
    const submenuWidth = submenuRef.current?.offsetWidth || 200;
    const margin = 8;
    const overflowsRight =
      wrapRect.right + submenuWidth + margin > window.innerWidth;
    const nextSide = overflowsRight ? 'left' : 'right';

    requestAnimationFrame(() => {
      setSide(nextSide);
    });
  }, [open]);

  function handleMouseEnter() {
    clearTimers();
    if (!open) {
      openTimerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY);
    }
  }

  function handleMouseLeave() {
    clearTimers();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY);
  }

  function toggle() {
    clearTimers();
    setOpen((v) => !v);
  }

  function close() {
    clearTimers();
    setOpen(false);
  }

  return {
    open,
    side,
    wrapRef,
    submenuRef,
    handleMouseEnter,
    handleMouseLeave,
    toggle,
    close,
  };
}
