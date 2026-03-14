import { useEffect, useMemo, useRef, useState } from 'react';

const CONTEXT_MENU_WIDTH = 180;
const CONTEXT_MENU_HEIGHT = 96;

function PlaylistItem({
    video,
    isActive,
    onSelect,
    isSupported,
    onToggleSupport,
    onOpenContextMenu,
}) {
    const [imgError, setImgError] = useState(false);

    return (
        <div
            className={`playlist-item${isActive ? ' active' : ''}`}
            onClick={() => onSelect(video)}
            onContextMenu={event => onOpenContextMenu(event, video)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect(video)}
            aria-label={`Play ${video.title}`}
        >
            {video.thumbnail && !imgError ? (
                <img
                    className="playlist-thumb"
                    src={video.thumbnail}
                    alt=""
                    onError={() => setImgError(true)}
                />
            ) : (
                <div className="playlist-thumb-placeholder">▶</div>
            )}

            <div className="playlist-item-info">
                <div className="playlist-item-title">{video.title || video.videoId}</div>
                {video.channelTitle && (
                    <div className="playlist-item-meta">{video.channelTitle}</div>
                )}
            </div>

            <button
                className={`item-fav-btn${isSupported ? ' starred' : ''}`}
                onClick={e => { e.stopPropagation(); onToggleSupport(video); }}
                title={isSupported ? 'Remove from support list' : 'Add to support list'}
                aria-label={isSupported ? 'Remove from support list' : 'Add to support list'}
            >
                {isSupported ? '★' : '☆'}
            </button>
        </div>
    );
}

export default function PlaylistSidebar({
    playlist,
    currentIndex,
    onSelect,
    supportList,
    onToggleSupport,
    onAddToSupportList,
    onRemoveFromPlaylist,
}) {
    const [contextMenu, setContextMenu] = useState(null);
    const contextMenuRef = useRef(null);
    const supportIds = useMemo(
        () => new Set(supportList.map(entry => entry.videoId)),
        [supportList]
    );

    useEffect(() => {
        if (!contextMenu) return undefined;

        function closeContextMenu() {
            setContextMenu(null);
        }

        function handlePointerDown(event) {
            if (contextMenuRef.current?.contains(event.target)) return;
            closeContextMenu();
        }

        function handleKeyDown(event) {
            if (event.key === 'Escape') {
                closeContextMenu();
            }
        }

        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', closeContextMenu, true);

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', closeContextMenu, true);
        };
    }, [contextMenu]);

    if (!playlist.length) {
        return (
            <div className="sidebar">
                <div className="sidebar-header">
                    <span className="sidebar-title">Playlist</span>
                </div>
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        padding: 24,
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                    }}
                >
                    <div style={{ fontSize: 32, opacity: 0.3 }}>🎵</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No playlist loaded</div>
                    <div style={{ fontSize: 11 }}>Paste a YouTube URL above to get started</div>
                </div>
            </div>
        );
    }

    function handleOpenContextMenu(event, video) {
        event.preventDefault();

        const left = Math.min(
            event.clientX,
            window.innerWidth - CONTEXT_MENU_WIDTH - 8
        );
        const top = Math.min(
            event.clientY,
            window.innerHeight - CONTEXT_MENU_HEIGHT - 8
        );

        setContextMenu({ left: Math.max(8, left), top: Math.max(8, top), video });
    }

    function handleSupport(video) {
        onAddToSupportList(video);
        setContextMenu(null);
    }

    function handleRemove(videoId) {
        onRemoveFromPlaylist(videoId);
        setContextMenu(null);
    }

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span className="sidebar-title">Playlist</span>
                <span className="sidebar-count">{playlist.length} videos</span>
            </div>
            <div className="playlist-list" role="list">
                {playlist.map((video, i) => (
                    <PlaylistItem
                        key={video.videoId + i}
                        video={video}
                        isActive={i === currentIndex}
                        onSelect={() => onSelect(i)}
                        isSupported={supportIds.has(video.videoId)}
                        onToggleSupport={onToggleSupport}
                        onOpenContextMenu={handleOpenContextMenu}
                    />
                ))}
            </div>
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="playlist-context-menu"
                    role="menu"
                    style={{ top: contextMenu.top, left: contextMenu.left }}
                    onClick={event => event.stopPropagation()}
                >
                    <button
                        className="playlist-context-menu-item"
                        type="button"
                        role="menuitem"
                        onClick={() => handleSupport(contextMenu.video)}
                        disabled={supportIds.has(contextMenu.video.videoId)}
                    >
                        Support
                    </button>
                    <button
                        className="playlist-context-menu-item danger"
                        type="button"
                        role="menuitem"
                        onClick={() => handleRemove(contextMenu.video.videoId)}
                    >
                        Remove from Playlist
                    </button>
                </div>
            )}
        </div>
    );
}
