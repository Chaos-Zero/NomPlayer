import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const HOVER_OPEN_DELAY = 500;
const HOVER_CLOSE_DELAY = 250;

/**
 * Shared open/close + positioning logic for a nested "off to the side"
 * context-menu submenu (e.g. Update Support, Add to Playlist).
 * Opens on click or on ~500ms hover, closes shortly after the pointer
 * leaves, and flips from the right side to the left (horizontally) or from
 * top-anchored to bottom-anchored (vertically) if it would otherwise
 * overflow the window on that edge.
 */
export default function useContextSubmenu() {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState('right');
  const [vAlign, setVAlign] = useState('top');
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
    const submenuHeight = submenuRef.current?.offsetHeight || 200;
    const margin = 8;
    const overflowsRight =
      wrapRect.right + submenuWidth + margin > window.innerWidth;
    const nextSide = overflowsRight ? 'left' : 'right';

    // Same check on the vertical axis: the submenu is top-anchored to the
    // trigger by default (grows downward from wrapRect.top), so it
    // overflows the bottom of the window under the same condition
    // overflowsRight checks for the right edge.
    const overflowsBottom =
      wrapRect.top + submenuHeight + margin > window.innerHeight;
    const nextVAlign = overflowsBottom ? 'bottom' : 'top';

    requestAnimationFrame(() => {
      setSide(nextSide);
      setVAlign(nextVAlign);
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
    vAlign,
    wrapRef,
    submenuRef,
    handleMouseEnter,
    handleMouseLeave,
    toggle,
    close,
  };
}
