import { useRef, useState } from 'react';
import { ChevronRightIcon } from './Icons.jsx';

export default function CustomPlaylistSubmenu({
  videos,
  customPlaylists,
  onUpdateCustomPlaylists,
  onShowToast,
  onClose,
  itemClassName = 'database-context-menu-item',
}) {
  const [open, setOpen] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  if (!customPlaylists || !onUpdateCustomPlaylists || !videos?.length)
    return null;

  function addToPlaylist(playlistId) {
    const pl = customPlaylists.find((p) => p.id === playlistId);
    if (!pl) return;

    const existingIds = new Set(pl.videos.map((v) => v.videoId));
    const toAdd = videos.filter((v) => !existingIds.has(v.videoId));

    if (!toAdd.length) {
      onShowToast?.(
        videos.length === 1
          ? 'Track already in this playlist'
          : 'All tracks already in this playlist',
      );
      return;
    }

    onUpdateCustomPlaylists(
      customPlaylists.map((p) =>
        p.id === playlistId ? { ...p, videos: [...p.videos, ...toAdd] } : p,
      ),
    );
    onShowToast?.(
      toAdd.length === 1
        ? `Added to "${pl.name}"`
        : `Added ${toAdd.length} tracks to "${pl.name}"`,
    );
    onClose?.();
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
    onShowToast?.(
      videos.length === 1
        ? `Created "${trimmed}"`
        : `Created "${trimmed}" with ${videos.length} tracks`,
    );
    onClose?.();
  }

  return (
    <>
      <button
        className={`${itemClassName}${open ? ' active' : ''}`}
        onClick={() => {
          setOpen((v) => !v);
          setShowInput(false);
          setName('');
        }}
      >
        <span>Add to Custom Playlist</span>
        <ChevronRightIcon
          className={`context-menu-chevron${open ? ' open' : ''}`}
        />
      </button>

      {open && (
        <div className="context-playlist-submenu">
          {!showInput ? (
            <button
              className={`${itemClassName} context-playlist-submenu-create`}
              onClick={() => {
                setShowInput(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              <span>+ Create New Playlist</span>
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
          {customPlaylists.length === 0 && !showInput && (
            <span className="context-playlist-submenu-empty">
              No playlists yet
            </span>
          )}
          {customPlaylists.map((pl) => (
            <button
              key={pl.id}
              className={`${itemClassName} context-playlist-submenu-item`}
              onClick={() => addToPlaylist(pl.id)}
            >
              <span>{pl.name}</span>
              <span className="context-playlist-submenu-count">
                {pl.videos.length}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
