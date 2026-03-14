import { useState, useRef } from 'react';
import { parseYouTubeInput, fetchPlaylistItems, singleVideoEntry } from '../utils/youtube.js';

const API_KEY = import.meta.env.VITE_YT_API_KEY || '';

export default function TopBar({
    isPlaying, setIsPlaying,
    onPrev, onNext,
    showFavourites, setShowFavourites,
    onLoad,
}) {
    const [urlValue, setUrlValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    async function handleSubmit(e) {
        e?.preventDefault();
        const parsed = parseYouTubeInput(urlValue);
        if (!parsed) {
            setError('Could not recognise that URL or ID');
            return;
        }
        setError('');
        setLoading(true);
        try {
            if (parsed.type === 'video') {
                onLoad([singleVideoEntry(parsed.videoId)]);
            } else {
                // playlist
                const items = await fetchPlaylistItems(parsed.playlistId, API_KEY);
                if (items.length === 0) {
                    setError('Playlist is empty or private.');
                } else {
                    onLoad(items, parsed.videoId || null);
                }
            }
        } catch (err) {
            if (err.message === 'NO_API_KEY') {
                setError('Add VITE_YT_API_KEY to .env to load playlists.');
            } else {
                setError(err.message || 'Failed to load playlist.');
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="topbar">
            {/* URL input */}
            <form className="url-form" onSubmit={handleSubmit} style={{ flex: 1 }}>
                <input
                    ref={inputRef}
                    className="url-input"
                    type="text"
                    placeholder="Paste a YouTube video or playlist URL…"
                    value={urlValue}
                    onChange={e => { setUrlValue(e.target.value); setError(''); }}
                    id="url-input"
                />
                <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={loading || !urlValue.trim()}
                    id="load-btn"
                >
                    {loading ? '…' : 'Load'}
                </button>
            </form>

            {error && (
                <span style={{ fontSize: 12, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                    ⚠ {error}
                </span>
            )}

            <div className="controls-divider" />

            {/* Playback controls */}
            <button
                className="btn btn-icon"
                onClick={onPrev}
                title="Previous"
                id="prev-btn"
                aria-label="Previous video"
            >⏮</button>

            <button
                className="btn btn-play"
                onClick={() => setIsPlaying(p => !p)}
                title={isPlaying ? 'Pause' : 'Play'}
                id="play-pause-btn"
                aria-label={isPlaying ? 'Pause' : 'Play'}
            >
                {isPlaying ? '⏸' : '▶'}
            </button>

            <button
                className="btn btn-icon"
                onClick={onNext}
                title="Next"
                id="next-btn"
                aria-label="Next video"
            >⏭</button>

            <div className="controls-divider" />

            {/* Favourites toggle */}
            <button
                className={`star-btn${showFavourites ? ' active' : ''}`}
                onClick={() => setShowFavourites(s => !s)}
                title={showFavourites ? 'Hide Favourites' : 'Show Favourites'}
                id="fav-toggle-btn"
                aria-label="Toggle favourites"
            >
                ★
            </button>
        </div>
    );
}
