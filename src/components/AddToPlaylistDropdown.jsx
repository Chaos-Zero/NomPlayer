import { useEffect, useRef, useState, useLayoutEffect } from 'react';

// "Add to Playlist" popover for the playback views (VideoPlayer, TopBar's
// mobile inline bar, the detached footer) - opened beside the existing "Add
// to Queue" button. Unlike CustomPlaylistSubmenu (a hover submenu nested
// inside a right-click context menu), this is a standalone button + fixed-
// position popover, so it's built on the same positioning/clamp/outside-
// click pattern as SupportLevelDropdown rather than reusing that component.
//
// Checkboxes, not radio buttons: a song can belong to any number of custom
// playlists at once, so every row toggles independently and the popover
// stays open across multiple toggles (only outside-click/Escape/creating a
// new playlist closes it) - the same "keep going" idiom FavouritesPanel's
// support-level filter dropdown uses for its own checkbox list.
export default function AddToPlaylistDropdown({
  videos,
  customPlaylists,
  onUpdateCustomPlaylists,
  onShowToast,
  onClose,
  position = { top: 0, left: 0 },
  direction = 'down',
}) {
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState('');

  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const margin = 8;

      let dx = 0;
      let dy = 0;

      if (rect.right > winW - margin) {
        dx = winW - margin - rect.right;
      } else if (rect.left < margin) {
        dx = margin - rect.left;
      }

      if (rect.bottom > winH - margin) {
        dy = winH - margin - rect.bottom;
      } else if (rect.top < margin) {
        dy = margin - rect.top;
      }

      if (dx !== offset.x || dy !== offset.y) {
        requestAnimationFrame(() => {
          setOffset({ x: dx, y: dy });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, direction, showInput, customPlaylists?.length]);

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

  if (!videos?.length || !customPlaylists || !onUpdateCustomPlaylists) {
    return null;
  }

  // Newest playlist first - customPlaylists is stored oldest-first (a new
  // one is always appended to the end, see App.jsx's setCustomPlaylists
  // calls), so this is purely a display-order reversal, it never touches
  // the stored order other views rely on.
  const orderedPlaylists = [...customPlaylists].reverse();

  function isVideoInPlaylist(pl) {
    const ids = new Set(pl.videos.map((v) => v.videoId));
    return videos.every((v) => ids.has(v.videoId));
  }

  function toggle(playlistId) {
    const pl = customPlaylists.find((p) => p.id === playlistId);
    if (!pl) return;

    const alreadyIn = isVideoInPlaylist(pl);
    const nextVideos = alreadyIn
      ? pl.videos.filter((v) => !videos.some((sv) => sv.videoId === v.videoId))
      : [
          ...pl.videos,
          ...videos.filter(
            (v) => !pl.videos.some((pv) => pv.videoId === v.videoId),
          ),
        ];

    onUpdateCustomPlaylists(
      customPlaylists.map((p) =>
        p.id === playlistId ? { ...p, videos: nextVideos } : p,
      ),
    );
    onShowToast?.(
      alreadyIn ? `Removed from "${pl.name}"` : `Added to "${pl.name}"`,
    );
  }

  function createAndAdd(playlistName) {
    const trimmed = playlistName.trim();
    if (!trimmed) return;
    const newPlaylist = {
      id: crypto.randomUUID(),
      name: trimmed,
      videos: [...videos],
    };
    onUpdateCustomPlaylists([...customPlaylists, newPlaylist]);
    onShowToast?.(`Created "${trimmed}"`);
    onClose();
  }

  return (
    <div
      ref={menuRef}
      className="user-menu-popover add-to-playlist-dropdown"
      role="menu"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 3000,
        transform:
          direction === 'up'
            ? `translate(calc(-50% + ${offset.x}px), calc(-100% - 8px + ${offset.y}px))`
            : `translate(calc(-50% + ${offset.x}px), calc(8px + ${offset.y}px))`,
      }}
    >
      <div className="user-menu-summary">Add to Playlist</div>

      {!showInput ? (
        <button
          className="user-menu-item context-side-submenu-create"
          type="button"
          role="menuitem"
          onClick={() => {
            setShowInput(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          + Create New Playlist
        </button>
      ) : (
        <input
          ref={inputRef}
          className="context-playlist-name-input"
          type="text"
          placeholder="Playlist name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') createAndAdd(name);
            if (e.key === 'Escape') {
              setShowInput(false);
              setName('');
            }
            e.stopPropagation();
          }}
        />
      )}

      {orderedPlaylists.length === 0 && !showInput && (
        <span className="context-side-submenu-empty">No playlists yet</span>
      )}

      {orderedPlaylists.length > 0 && (
        <div className="add-to-playlist-options">
          {orderedPlaylists.map((pl) => (
            <label key={pl.id} className="support-level-filter-option">
              <input
                type="checkbox"
                checked={isVideoInPlaylist(pl)}
                onChange={() => toggle(pl.id)}
              />
              <span className="add-to-playlist-option-name">{pl.name}</span>
              <span className="context-playlist-submenu-count">
                {pl.videos.length}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
