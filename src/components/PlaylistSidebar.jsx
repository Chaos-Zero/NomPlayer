import { useState } from 'react';

function PlaylistItem({ video, isActive, onSelect, isFavourite, onToggleFavourite }) {
    const [imgError, setImgError] = useState(false);

    return (
        <div
            className={`playlist-item${isActive ? ' active' : ''}`}
            onClick={() => onSelect(video)}
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
                className={`item-fav-btn${isFavourite ? ' starred' : ''}`}
                onClick={e => { e.stopPropagation(); onToggleFavourite(video); }}
                title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
                aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            >
                {isFavourite ? '★' : '☆'}
            </button>
        </div>
    );
}

export default function PlaylistSidebar({ playlist, currentIndex, onSelect, favourites, onToggleFavourite }) {
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

    const favIds = new Set(favourites.map(f => f.videoId));

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
                        isFavourite={favIds.has(video.videoId)}
                        onToggleFavourite={onToggleFavourite}
                    />
                ))}
            </div>
        </div>
    );
}
