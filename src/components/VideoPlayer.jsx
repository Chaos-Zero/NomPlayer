import { useEffect, useRef, useCallback } from 'react';
import YouTube from 'react-youtube';

function safelyControlPlayer(player, methodName) {
    try {
        player?.[methodName]?.();
    } catch {
        // The YouTube iframe API can throw while the old iframe is being replaced.
    }
}

export default function VideoPlayer({ video, isPlaying, onVideoEnd, onReady }) {
    const playerRef = useRef(null);
    const videoId = video?.videoId ?? null;

    useEffect(() => {
        return () => {
            playerRef.current = null;
        };
    }, [videoId]);

    // Sync play/pause state with the YouTube player
    useEffect(() => {
        const player = playerRef.current;
        if (!player) return;
        if (isPlaying) {
            safelyControlPlayer(player, 'playVideo');
        } else {
            safelyControlPlayer(player, 'pauseVideo');
        }
    }, [isPlaying, videoId]);

    const handleReady = useCallback((event) => {
        playerRef.current = event.target;
        onReady?.(event.target);
        if (isPlaying) {
            safelyControlPlayer(event.target, 'playVideo');
        }
    }, [isPlaying, onReady]);

    const handleEnd = useCallback(() => {
        onVideoEnd?.();
    }, [onVideoEnd]);

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
