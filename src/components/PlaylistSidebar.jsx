import { useEffect, useMemo, useRef, useState } from 'react';

const CONTEXT_MENU_WIDTH = 180;
const CONTEXT_MENU_HEIGHT = 96;

function PlaylistItem({
    orderNumber,
    video,
    isActive,
    isFlashing,
    listenedStatus,
    onSelect,
    isSupported,
    onToggleSupport,
    onOpenContextMenu,
}) {
    const [imgError, setImgError] = useState(false);
    const tickLabel = listenedStatus === 'complete'
        ? 'Completed'
        : listenedStatus === 'partial'
            ? 'Started'
            : null;

    return (
        <div
            className={`playlist-item${isActive ? ' active' : ''}${isFlashing ? ' flash' : ''}`}
            onClick={() => onSelect(video.videoId)}
            onContextMenu={event => onOpenContextMenu(event, video)}
            role="button"
            tabIndex={0}
            onKeyDown={event => event.key === 'Enter' && onSelect(video.videoId)}
            aria-label={`Play ${video.title}`}
        >
            <div className="list-entry-number" aria-hidden="true">
                {orderNumber}
            </div>

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

            <div className="playlist-item-actions">
                <span
                    className={`item-status-tick${listenedStatus ? ` ${listenedStatus}` : ' empty'}`}
                    aria-hidden={!tickLabel}
                    aria-label={tickLabel || undefined}
                    title={tickLabel || undefined}
                >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M3.5 8.5 6.6 11.6 12.5 4.9" />
                    </svg>
                </span>
                <button
                    className={`item-fav-btn${isSupported ? ' starred' : ''}`}
                    onClick={event => {
                        event.stopPropagation();
                        onToggleSupport(video);
                    }}
                    title={isSupported ? 'Remove from support list' : 'Add to support list'}
                    aria-label={isSupported ? 'Remove from support list' : 'Add to support list'}
                >
                    {isSupported ? '★' : '☆'}
                </button>
            </div>
        </div>
    );
}

export default function PlaylistSidebar({
    playlist,
    currentIndex,
    flashVideoIds = [],
    isShuffleEnabled = false,
    showOriginalOrder = false,
    onShuffle,
    onToggleOrderView,
    onSelect,
    supportList,
    listenedStatusById = {},
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
    const flashIds = useMemo(
        () => new Set(flashVideoIds),
        [flashVideoIds]
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

    const showOrderToggle = isShuffleEnabled && playlist.length > 1;

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span className="sidebar-title">Playlist</span>
                <div className="sidebar-header-actions">
                    <button
                        className={`sidebar-icon-btn${isShuffleEnabled ? ' active' : ''}`}
                        type="button"
                        onClick={onShuffle}
                        disabled={playlist.length < 2}
                        aria-label="Shuffle playlist"
                        title="Shuffle playlist"
                    >
                        🔀
                    </button>
                    <span className="sidebar-count">{playlist.length} videos</span>
                </div>
            </div>
            <div className={`playlist-order-toggle${showOrderToggle ? ' visible' : ''}`}>
                <div className="playlist-order-toggle-inner">
                    <button
                        className="sidebar-toolbar-btn"
                        type="button"
                        onClick={onToggleOrderView}
                        disabled={!showOrderToggle}
                    >
                        {showOriginalOrder ? 'Show play order' : 'Show original order'}
                    </button>
                </div>
            </div>
            <div className="playlist-list" role="list">
                {playlist.map((video, index) => (
                    <PlaylistItem
                        key={video.videoId}
                        orderNumber={(video.loadIndex ?? index) + 1}
                        video={video}
                        isActive={index === currentIndex}
                        isFlashing={flashIds.has(video.videoId)}
                        listenedStatus={listenedStatusById[video.videoId] || null}
                        onSelect={onSelect}
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
