import { useEffect, useRef, useCallback } from 'react';
import YouTube from 'react-youtube';

export default function VideoPlayer({ video, isPlaying, onVideoEnd, onReady }) {
    const playerRef = useRef(null);

    // Sync play/pause state with the YouTube player
    useEffect(() => {
        const player = playerRef.current;
        if (!player) return;
        if (isPlaying) {
            player.playVideo?.();
        } else {
            player.pauseVideo?.();
        }
    }, [isPlaying]);

    const handleReady = useCallback((event) => {
        playerRef.current = event.target;
        onReady?.(event.target);
        if (isPlaying) event.target.playVideo();
    }, [isPlaying, onReady]);

    const handleEnd = useCallback(() => {
        onVideoEnd?.();
    }, [onVideoEnd]);

    const handleStateChange = useCallback((event) => {
        // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
        // We don't need to do anything here; isPlaying drives us.
    }, []);

    if (!video) {
        return (
            <div className="player-empty" id="player-empty">
                <div className="player-empty-icon">▶</div>
                <div className="player-empty-title">Nothing loaded yet</div>
                <div className="player-empty-sub">Paste a YouTube URL or playlist above to get started</div>
            </div>
        );
    }

    const opts = {
        width: '100%',
        height: '100%',
        playerVars: {
            autoplay: isPlaying ? 1 : 0,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
        },
    };

    return (
        <div className="player-wrap">
            <div className="player-iframe-container" id="player-container">
                <YouTube
                    key={video.videoId}
                    videoId={video.videoId}
                    opts={opts}
                    onReady={handleReady}
                    onEnd={handleEnd}
                    onStateChange={handleStateChange}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
            {video.title && (
                <div className="now-playing-info">
                    {isPlaying && <div className="now-playing-dot" />}
                    <div className="now-playing-title">
                        {isPlaying ? 'Now Playing: ' : ''}{video.title}
                    </div>
                </div>
            )}
        </div>
    );
}
