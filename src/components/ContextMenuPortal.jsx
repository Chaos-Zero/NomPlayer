import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * A reusable portal-based wrapper for context menus and dropdowns.
 * Ensures the menu is at the top level of the DOM and stays within window bounds.
 */
export function ContextMenuPortal({
  x,
  y,
  onClose,
  children,
  className = '',
  offset = 8,
}) {
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ x, y });

  // Adjust position after first render to keep it on screen
  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      let newX = x;
      let newY = y;

      // Flip or shift if overflowing right
      if (x + rect.width > winW - offset) {
        newX = Math.max(offset, winW - rect.width - offset);
      }

      // Flip or shift if overflowing bottom
      if (y + rect.height > winH - offset) {
        newY = Math.max(offset, winH - rect.height - offset);
      }

      // Only update if the calculated position is different from the current state
      // This prevents unnecessary re-renders and potential infinite loops if coords were a dependency
      if (newX !== coords.x || newY !== coords.y) {
        requestAnimationFrame(() => {
          setCoords({ x: newX, y: newY });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, offset]);

  // Global listeners for closing
  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };

    // Use capture to catch events before they reach other elements if needed
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className={className}
      style={{
        position: 'fixed',
        top: coords.y,
        left: coords.x,
        zIndex: 50000,
        pointerEvents: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
