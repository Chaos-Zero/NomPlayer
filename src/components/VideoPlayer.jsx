import {
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import YouTube from 'react-youtube';
import CommunityActivity from './CommunityActivity.jsx';

function safelyControlPlayer(player, methodName, args = []) {
  try {
    player?.[methodName]?.(...args);
  } catch {
    // The YouTube iframe API can throw while the old iframe is being replaced.
  }
}

import {
  PreviousIcon,
  NextIcon,
  PlayIcon,
  PauseIcon,
  FastForwardIcon,
  PlaylistPlusIcon,
  ShuffleIcon,
  StopwatchIcon,
} from './Icons.jsx';

const VideoPlayer = forwardRef(function VideoPlayer(
  {
    video,
    isPlaying,
    onVideoEnd,
    onPlaybackChange,
    onReady,
    onPrev,
    onNext,
    onTogglePlay,
    isShuffleEnabled = false,
    onShuffle,
    isPreviewModeEnabled = false,
    previewCountdown = 30,
    onTogglePreview,
    isSupported = false,
    isNominated = false,
    onToggleSupport,
    onOpenSupportDropdown,
    supportLevel = 1,
    isCurrentVideoInPlaylist = false,
    onAddToPlaylist,
    variant = 'full',
    showMetadata = true,
    supabase,
    authUser,
    userProfile,
    onShowToast,
    onProgressUpdate,
  },
  ref,
) {
  const playerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    seekTo: (time, allowSeekAhead = true) => {
      safelyControlPlayer(playerRef.current, 'seekTo', [time, allowSeekAhead]);
    },
    getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    getDuration: () => playerRef.current?.getDuration() ?? 0,
  }));
  const isPlayingRef = useRef(isPlaying);
  const resumeAfterVisibilityRef = useRef(false);
  const restorePauseGuardUntilRef = useRef(0);
  const restorePlayRetryTimeoutsRef = useRef([]);
  const pauseVerificationTimeoutRef = useRef(0);
  const isOverlayEnabled = false;
  const videoId = video?.videoId ?? null;
  const videoUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : null;
  const supportLabel = isNominated
    ? 'Nomination tracks cannot be changed from the player'
    : isSupported
      ? 'Remove from support list'
      : 'Add to support list';
  const supportTooltip = isNominated
    ? 'In Nomination List'
    : isSupported
      ? 'Remove Support'
      : 'Add to support list';
  const supportClassName = isNominated
    ? ' nominated locked'
    : isSupported
      ? ` supported level-${supportLevel}`
      : '';
  const supportGlyph = isNominated
    ? '★'
    : isSupported
      ? supportLevel === 3
        ? '🔒'
        : '♥'
      : '♡';

  const clearRestorePauseGuard = useCallback(() => {
    restorePauseGuardUntilRef.current = 0;

    for (const timeoutId of restorePlayRetryTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }

    restorePlayRetryTimeoutsRef.current = [];
  }, []);

  const clearPauseVerification = useCallback(() => {
    if (pauseVerificationTimeoutRef.current) {
      window.clearTimeout(pauseVerificationTimeoutRef.current);
      pauseVerificationTimeoutRef.current = 0;
    }
  }, []);

  const clearVisibilityResumeTracking = useCallback(() => {
    resumeAfterVisibilityRef.current = false;
    clearRestorePauseGuard();
    clearPauseVerification();
  }, [clearPauseVerification, clearRestorePauseGuard]);

  const isPauseIgnoredDuringRestore = useCallback(() => {
    return (
      resumeAfterVisibilityRef.current &&
      isPlayingRef.current &&
      (document.visibilityState !== 'visible' ||
        !document.hasFocus() ||
        Date.now() < restorePauseGuardUntilRef.current)
    );
  }, []);

  const armRestorePauseGuard = useCallback(() => {
    if (
      document.visibilityState !== 'visible' ||
      !resumeAfterVisibilityRef.current
    ) {
      return;
    }

    clearRestorePauseGuard();
    restorePauseGuardUntilRef.current = Date.now() + 2500;

    if (!isPlayingRef.current) {
      onPlaybackChange?.(true);
    }

    safelyControlPlayer(playerRef.current, 'playVideo');
    restorePlayRetryTimeoutsRef.current = [
      window.setTimeout(() => {
        safelyControlPlayer(playerRef.current, 'playVideo');
      }, 180),
      window.setTimeout(() => {
        safelyControlPlayer(playerRef.current, 'playVideo');
      }, 700),
      window.setTimeout(() => {
        safelyControlPlayer(playerRef.current, 'playVideo');
      }, 1500),
    ];
  }, [clearRestorePauseGuard, onPlaybackChange]);

  const verifyPauseState = useCallback(() => {
    clearPauseVerification();

    if (isPauseIgnoredDuringRestore()) {
      return;
    }

    if (
      document.visibilityState !== 'visible' ||
      (typeof document.hasFocus === 'function' && !document.hasFocus())
    ) {
      return;
    }

    const playerState = playerRef.current?.getPlayerState?.();
    const isActuallyPaused =
      typeof playerState === 'number' ? playerState === 2 : true;

    if (!isActuallyPaused) {
      return;
    }

    clearVisibilityResumeTracking();
    onPlaybackChange?.(false);
  }, [
    clearPauseVerification,
    clearVisibilityResumeTracking,
    isPauseIgnoredDuringRestore,
    onPlaybackChange,
  ]);

  useEffect(() => {
    return () => {
      clearVisibilityResumeTracking();
      playerRef.current = null;
    };
  }, [clearVisibilityResumeTracking, videoId]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;

    if (!isPlaying) {
      clearVisibilityResumeTracking();
    }
  }, [clearVisibilityResumeTracking, isPlaying]);

  // Track playback progress
  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const time = player.getCurrentTime();
        const dur = player.getDuration();
        onProgressUpdate?.({ currentTime: time, duration: dur });
      } catch {
        // Player might be re-initializing
      }
    }, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPlaying, onProgressUpdate]);

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

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const playerState = playerRef.current?.getPlayerState?.();
        const isActuallyPlaying = playerState === 1 || playerState === 3;
        resumeAfterVisibilityRef.current =
          isActuallyPlaying && isPlayingRef.current;
        return;
      }

      if (document.visibilityState === 'visible') {
        armRestorePauseGuard();
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        armRestorePauseGuard();
      }
    };

    const handleWindowBlur = () => {
      const playerState = playerRef.current?.getPlayerState?.();
      const isActuallyPlaying = playerState === 1 || playerState === 3;
      resumeAfterVisibilityRef.current =
        isActuallyPlaying && isPlayingRef.current;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [armRestorePauseGuard]);

  const handleReady = useCallback(
    (event) => {
      playerRef.current = event.target;
      onReady?.(event.target);
      if (isPlaying) {
        safelyControlPlayer(event.target, 'playVideo');
      }
    },
    [isPlaying, onReady],
  );

  const handleEnd = useCallback(() => {
    onVideoEnd?.();
  }, [onVideoEnd]);

  const handleStateChange = useCallback(
    (event) => {
      if (event?.data === 1) {
        clearPauseVerification();
        onPlaybackChange?.(true);
      } else if (event?.data === 2) {
        if (isPauseIgnoredDuringRestore()) {
          return;
        }

        clearPauseVerification();
        pauseVerificationTimeoutRef.current = window.setTimeout(() => {
          pauseVerificationTimeoutRef.current = 0;
          verifyPauseState();
        }, 180);
      }
    },
    [
      clearPauseVerification,
      isPauseIgnoredDuringRestore,
      onPlaybackChange,
      verifyPauseState,
    ],
  );

  if (!video) {
    return (
      <div className="player-empty" id="player-empty">
        <div className="player-empty-icon">▶</div>
        <div className="player-empty-title">Nothing loaded yet</div>
        <div className="player-empty-sub">
          Paste a YouTube URL or playlist above to get started
        </div>
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

  const isFull = variant === 'full';

  const metadataNode =
    showMetadata && (video.trackTitle || video.gameTitle || video.title) ? (
      <div
        className="now-playing-info"
        style={isFull ? { marginBottom: '0', paddingBottom: '0' } : undefined}
      >
        <div className="now-playing-main">
          <div className="now-playing-meta">
            <div className="now-playing-title">
              {video.trackTitle || video.gameTitle ? (
                <>
                  {video.gameTitle && (
                    <div
                      className="now-playing-subtitle"
                      style={
                        !video.trackTitle
                          ? {
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '11px',
                              marginBottom: '4px',
                            }
                          : {
                              fontSize: '11px',
                              marginBottom: '4px',
                            }
                      }
                    >
                      {!video.trackTitle && isPlaying && (
                        <div
                          className="now-playing-dot"
                          style={{ marginTop: 0 }}
                        />
                      )}
                      <span>{video.gameTitle}</span>
                    </div>
                  )}
                  {video.trackTitle && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {isPlaying && (
                        <div
                          className="now-playing-dot"
                          style={{ marginTop: 0 }}
                        />
                      )}
                      <span>{video.trackTitle}</span>
                    </div>
                  )}
                </>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {isPlaying && (
                    <div className="now-playing-dot" style={{ marginTop: 0 }} />
                  )}
                  <span>{video.title}</span>
                </div>
              )}
            </div>
            {videoUrl && (
              <a
                className="now-playing-link"
                href={videoUrl}
                target="_blank"
                rel="noreferrer"
              >
                {videoUrl}
              </a>
            )}
          </div>
        </div>
        <div className="now-playing-actions">
          <button
            className={`btn btn-icon add-to-playlist-btn${isCurrentVideoInPlaylist ? ' hidden' : ''}`}
            onClick={() => onAddToPlaylist?.([video])}
            title="Add to current playlist"
            aria-label="Add to current playlist"
          >
            <PlaylistPlusIcon />
          </button>
        </div>
      </div>
    ) : null;

  const playerIframeNode = (
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
      {isOverlayEnabled && (
        <div className="player-overlay enabled">
          <div className="player-overlay-main-controls">
            <button
              className="btn btn-icon player-overlay-btn"
              type="button"
              onClick={onPrev}
              title="Previous"
              aria-label="Previous video"
            >
              <PreviousIcon />
            </button>
            <button
              className="btn btn-play player-overlay-btn player-overlay-btn-play"
              type="button"
              onClick={onTogglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              className="btn btn-icon player-overlay-btn"
              type="button"
              onClick={onNext}
              title="Next"
              aria-label="Next video"
            >
              <NextIcon />
            </button>
          </div>
          <div className="player-overlay-gap" aria-hidden="true" />
          <div className="player-overlay-sub-controls">
            <button
              className={`player-overlay-chip shuffle${isShuffleEnabled ? ' active' : ''}`}
              type="button"
              onClick={onShuffle}
              aria-label="Shuffle playlist"
              title="Shuffle playlist"
            >
              <ShuffleIcon />
            </button>
            <button
              className={`player-overlay-chip preview${isPreviewModeEnabled ? ' active' : ''}`}
              type="button"
              onClick={onTogglePreview}
              aria-label="Preview mode"
              title="Preview mode"
            >
              <StopwatchIcon
                countdown={previewCountdown}
                className="transport-icon transport-icon-preview"
              />
            </button>
            <div className="item-fav-container">
              <button
                className={`player-overlay-chip support${supportClassName}`}
                type="button"
                aria-label={supportLabel}
                title={supportTooltip}
                disabled={isNominated}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isSupported) {
                    onToggleSupport(video);
                    const rect = event.currentTarget.getBoundingClientRect();
                    onOpenSupportDropdown(video, {
                      top: rect.top,
                      left: rect.left + rect.width / 2,
                    });
                  } else {
                    onToggleSupport(video);
                  }
                }}
              >
                {supportGlyph}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={`player-wrap player-wrap-${variant}`}>
      <div className={`player-stage${isFull ? ' has-community-activity' : ''}`}>
        <div className="player-video-stack">
          {isFull && <div className="player-grid-top-spacer" />}
          <div
            className={
              isFull ? 'player-grid-video-row' : 'player-grid-video-row-minimal'
            }
          >
            {playerIframeNode}
            {isFull && metadataNode}
          </div>

          {isFull && (
            <div className="player-bottom-content-wrapper">
              <div className="player-scroll-area">
                <CommunityActivity
                  videoId={video.videoId}
                  supabase={supabase}
                  authUser={authUser}
                  userProfile={userProfile}
                  onShowToast={onShowToast}
                />
              </div>
              <div className="player-filler" />
            </div>
          )}
        </div>
        {!isFull && metadataNode}
      </div>
    </div>
  );
});

export default VideoPlayer;
