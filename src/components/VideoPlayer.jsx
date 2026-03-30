import { useEffect, useRef, useCallback } from 'react';
import YouTube from 'react-youtube';
import CommunityActivity from './CommunityActivity.jsx';

function safelyControlPlayer(player, methodName) {
  try {
    player?.[methodName]?.();
  } catch {
    // The YouTube iframe API can throw while the old iframe is being replaced.
  }
}

function PreviousIcon() {
  return (
    <svg className="transport-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 4.5C5 4.09 4.66 3.75 4.25 3.75C3.84 3.75 3.5 4.09 3.5 4.5V15.5C3.5 15.91 3.84 16.25 4.25 16.25C4.66 16.25 5 15.91 5 15.5V4.5Z" />
      <path d="M15.75 4.6V15.4C15.75 15.99 15.09 16.34 14.6 16L7.11 10.6C6.7 10.31 6.7 9.69 7.11 9.4L14.6 4C15.09 3.66 15.75 4.01 15.75 4.6Z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg className="transport-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15 4.5C15 4.09 15.34 3.75 15.75 3.75C16.16 3.75 16.5 4.09 16.5 4.5V15.5C16.5 15.91 16.16 16.25 15.75 16.25C15.34 16.25 15 15.91 15 15.5V4.5Z" />
      <path d="M4.25 4.6V15.4C4.25 15.99 4.91 16.34 5.4 16L12.89 10.6C13.3 10.31 13.3 9.69 12.89 9.4L5.4 4C4.91 3.66 4.25 4.01 4.25 4.6Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      className="transport-icon transport-icon-play"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M6.25 4.67V15.33C6.25 15.91 6.89 16.27 7.39 15.96L15.75 10.63C16.22 10.33 16.22 9.67 15.75 9.37L7.39 4.04C6.89 3.73 6.25 4.09 6.25 4.67Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="transport-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.5 4.5C6.5 4.09 6.84 3.75 7.25 3.75H8.25C8.66 3.75 9 4.09 9 4.5V15.5C9 15.91 8.66 16.25 8.25 16.25H7.25C6.84 16.25 6.5 15.91 6.5 15.5V4.5Z" />
      <path d="M11 4.5C11 4.09 11.34 3.75 11.75 3.75H12.75C13.16 3.75 13.5 4.09 13.5 4.5V15.5C13.5 15.91 13.16 16.25 12.75 16.25H11.75C11.34 16.25 11 15.91 11 15.5V4.5Z" />
    </svg>
  );
}

function FastForwardIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.75 4.95v10.1c0 .58.64.94 1.14.64l6.45-4.98c.44-.34.44-1.08 0-1.42L4.89 4.31c-.5-.3-1.14.06-1.14.64Z" />
      <path d="M10.5 4.95v10.1c0 .58.64.94 1.14.64l6.45-4.98c.44-.34.44-1.08 0-1.42l-6.45-4.98c-.5-.3-1.14.06-1.14.64Z" />
    </svg>
  );
}

function PlaylistPlusIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
    </svg>
  );
}

export default function VideoPlayer({
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
  onShowToast,
}) {
  const playerRef = useRef(null);
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

    if (
      !isPlaying &&
      document.visibilityState === 'visible' &&
      !resumeAfterVisibilityRef.current
    ) {
      clearVisibilityResumeTracking();
    }
  }, [clearVisibilityResumeTracking, isPlaying]);

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
        resumeAfterVisibilityRef.current = isPlayingRef.current;
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
      resumeAfterVisibilityRef.current = isPlayingRef.current;
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

  return (
    <div className={`player-wrap player-wrap-${variant}`}>
      <div className="player-stage has-community-activity">
        <div className="player-video-stack">
          <div className="player-grid-top-spacer" />
          <div className="player-grid-video-row">
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
                      <span aria-hidden="true">🔀</span>
                    </button>
                    <button
                      className={`player-overlay-chip preview${isPreviewModeEnabled ? ' active' : ''}`}
                      type="button"
                      onClick={onTogglePreview}
                      aria-label="Preview mode"
                      title="Preview mode"
                    >
                      <FastForwardIcon />
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
                            const rect =
                              event.currentTarget.getBoundingClientRect();
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
          </div>

          <div className="player-bottom-content-wrapper">
            <div className="player-scroll-area">
              {showMetadata &&
                (video.trackTitle || video.gameTitle || video.title) && (
                  <div
                    className="now-playing-info"
                    style={{ marginBottom: '0', paddingBottom: '0' }}
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
                                <div
                                  className="now-playing-dot"
                                  style={{ marginTop: 0 }}
                                />
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
                )}
              <CommunityActivity
                videoId={video.videoId}
                supabase={supabase}
                authUser={authUser}
                onShowToast={onShowToast}
              />
            </div>
            <div className="player-filler" />
          </div>
        </div>
      </div>
    </div>
  );
}
