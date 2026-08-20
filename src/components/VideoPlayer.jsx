import {
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import YouTube from 'react-youtube';
import CommunityActivity from './CommunityActivity.jsx';
import SoundCloudPlayer from './players/SoundCloudPlayer.jsx';
import BandcampPlayer from './players/BandcampPlayer.jsx';
import PlaybackTransportButtons from './PlaybackTransportButtons.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';

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
  StopIcon,
  FastForwardIcon,
  PlaylistPlusIcon,
  FolderPlusIcon,
  ShuffleIcon,
  StopwatchIcon,
  SpeechBubbleIcon,
  ReloadIcon,
  SheetIcon,
  TriangleUpIcon,
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
    isShuffleAvailable = true,
    onShuffle,
    isPreviewModeEnabled = false,
    previewCountdown = 30,
    onTogglePreview,
    canTogglePlayback = true,
    isControlsBelowPlayer = false,
    onToggleControlsPosition,
    isSupported = false,
    isNominated = false,
    onToggleSupport,
    onOpenSupportDropdown,
    onOpenAddToPlaylistDropdown,
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
    playingListLabel,
    onOpenPlayingList,
    onFeedbackSaved,
    onOpenVgmcSheetSync,
    onOpenNominationFeedback,
    previousTrack,
    onShowComments,
    onPlayPreviousTrack,
    vgmcSupportPointsByVideoId,
  },
  ref,
) {
  // The relocated controls row (see now-playing-controls-relocated below)
  // only has anywhere to go on desktop - mobile keeps its own separate
  // footer controls untouched, so this feature is a no-op there.
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
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
  // Last currentTime we actually heard from the player (updated by
  // reportProgress below). Backgrounded tabs can lose the player's position
  // entirely - either the browser reclaims the iframe's content or the
  // embed resets itself - so armRestorePauseGuard uses this to notice a
  // resume that silently landed back at 0 and seek it back where it was.
  const lastKnownTimeRef = useRef(0);
  const isOverlayEnabled = false;
  const videoId = video?.videoId ?? null;
  const provider = video?.provider || 'youtube';
  // SoundCloud/Bandcamp ids are already the canonical page URL; only
  // YouTube needs one built from a bare id.
  const videoUrl = videoId
    ? provider === 'youtube'
      ? `https://www.youtube.com/watch?v=${videoId}`
      : videoId
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

  // Corrects for the player having silently lost its position while
  // backgrounded (see lastKnownTimeRef above) - only seeks when we're
  // actually behind where we were, so a normal resume that kept its place
  // never takes an unnecessary/audible seek.
  const restorePlaybackPosition = useCallback(() => {
    const player = playerRef.current;
    const target = lastKnownTimeRef.current;
    if (!player || !(target > 1.5)) return;

    try {
      const current = player.getCurrentTime?.() ?? 0;
      if (current < target - 1.5) {
        player.seekTo?.(target, true);
      }
    } catch {
      // player may be re-initializing
    }
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

    const playAndRestore = () => {
      safelyControlPlayer(playerRef.current, 'playVideo');
      restorePlaybackPosition();
    };

    playAndRestore();
    restorePlayRetryTimeoutsRef.current = [
      window.setTimeout(playAndRestore, 180),
      window.setTimeout(playAndRestore, 700),
      window.setTimeout(playAndRestore, 1500),
    ];
  }, [clearRestorePauseGuard, onPlaybackChange, restorePlaybackPosition]);

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

    if (!isPlaying && document.visibilityState === 'visible') {
      clearVisibilityResumeTracking();
    }
  }, [clearVisibilityResumeTracking, isPlaying]);

  // Wraps onProgressUpdate to also keep lastKnownTimeRef current, so
  // restorePlaybackPosition always has an up-to-date fallback to seek back
  // to. Used by the active-playback sites below (the polling interval,
  // buffering) - deliberately NOT by handleReady's own progress report,
  // since a freshly (re)initialized player reports time 0 there, which
  // would stomp the very position we're trying to preserve if it fires
  // mid-restore (e.g. a backgrounded iframe the browser reloaded, which
  // re-fires "ready" once its player re-initializes).
  const reportProgress = useCallback(
    (currentTime, duration) => {
      if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
        lastKnownTimeRef.current = currentTime;
      }
      onProgressUpdate?.({ currentTime, duration });
    },
    [onProgressUpdate],
  );

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
        reportProgress(time, dur);
      } catch {
        // Player might be re-initializing
      }
    }, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPlaying, reportProgress]);

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
      try {
        const dur = event.target.getDuration?.() ?? 0;
        const time = event.target.getCurrentTime?.() ?? 0;
        onProgressUpdate?.({ currentTime: time, duration: dur });
      } catch {
        // player may be re-initializing
      }
    },
    [isPlaying, onReady, onProgressUpdate],
  );

  const handleEnd = useCallback(() => {
    onVideoEnd?.();
  }, [onVideoEnd]);

  const handleStateChange = useCallback(
    (event) => {
      if (event?.data === 1) {
        clearPauseVerification();
        // Confirmed actually playing again - stop treating a subsequent
        // pause as background-restore noise to ignore (see
        // isPauseIgnoredDuringRestore). Left armed, it would keep
        // swallowing pause presses for up to the rest of the 2.5s guard
        // window even after we'd already resumed successfully.
        resumeAfterVisibilityRef.current = false;
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
      } else if (event?.data === 3) {
        // Buffering, duration is reliably available here even before first play
        try {
          const player = playerRef.current;
          const dur = player?.getDuration?.() ?? 0;
          const time = player?.getCurrentTime?.() ?? 0;
          if (dur > 0) reportProgress(time, dur);
        } catch {
          // player may be re-initializing
        }
      }
    },
    [
      clearPauseVerification,
      isPauseIgnoredDuringRestore,
      onPlaybackChange,
      reportProgress,
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

  const previousTrackTitle = previousTrack
    ? previousTrack.trackTitle || previousTrack.title || previousTrack.videoId
    : '';

  const nowPlayingListNode =
    showMetadata && isFull ? (
      <>
        <div className="now-playing-list-label">
          <span className="now-playing-list-text">
            {playingListLabel ? (
              <>
                <span className="now-playing-list-prefix">
                  Now Playing List:{' '}
                </span>
                <button
                  className="now-playing-list-btn"
                  type="button"
                  onClick={onOpenPlayingList}
                >
                  {playingListLabel}
                </button>
              </>
            ) : (
              <span className="now-playing-list-prefix">Now Playing</span>
            )}
          </span>
          {onOpenVgmcSheetSync && (
            <button
              className="vgmc-sheet-sync-btn"
              type="button"
              onClick={onOpenVgmcSheetSync}
              title="Sync your VGMC ratings to the reaction sheet"
            >
              Sync your feedback to Reactions Sheet
            </button>
          )}
        </div>
        {(previousTrack || onOpenNominationFeedback) && (
          <div className="now-playing-previous-row">
            {previousTrack && (
              <>
                <span className="now-playing-list-prefix">
                  Previous Track:{' '}
                </span>
                <span className="now-playing-previous-title">
                  {previousTrackTitle}
                </span>
                {onPlayPreviousTrack && (
                  <button
                    className="comment-bubble-btn"
                    type="button"
                    title="Play this track now (doesn't affect the queue)"
                    onClick={() => onPlayPreviousTrack(previousTrack)}
                  >
                    <PlayIcon />
                  </button>
                )}
                {onShowComments && (
                  <button
                    className="comment-bubble-btn"
                    type="button"
                    title="Open the community dialogue for the previous track"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      onShowComments(previousTrack, {
                        top: rect.bottom,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                      });
                    }}
                  >
                    <SpeechBubbleIcon />
                  </button>
                )}
              </>
            )}
            {onOpenNominationFeedback && (
              <button
                className="vgmc-sheet-sync-btn nomination-feedback-btn"
                type="button"
                onClick={onOpenNominationFeedback}
                title="See ratings & comments left on tracks you've nominated"
              >
                Check your Nomination feedback
              </button>
            )}
          </div>
        )}
      </>
    ) : null;

  const hasVgmcMobileActions = Boolean(
    onOpenVgmcSheetSync || onOpenNominationFeedback,
  );

  const metadataNode =
    showMetadata && (video.trackTitle || video.gameTitle || video.title) ? (
      <div
        className={`now-playing-info${hasVgmcMobileActions ? ' has-vgmc-mobile-actions' : ''}${!isMobileLayout && isControlsBelowPlayer ? ' has-relocated-controls' : ''}`}
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
                      {/* OST search, not a link to the game itself - there's
                          no canonical "game page" to send this to, but "Game
                          Title OST" on YouTube is exactly what someone
                          clicking a game name here is usually after. Same
                          href pattern as the OST search button in
                          MetadataEntryDialog. */}
                      <a
                        className="now-playing-subtitle-link"
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                          `${video.gameTitle} OST`,
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`Search YouTube for "${video.gameTitle} OST"`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {video.gameTitle}
                      </a>
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
        {!isMobileLayout && isControlsBelowPlayer && (
          // Its own grid cell in now-playing-info (see index.css) - centered
          // relative to the whole row (i.e. the video width) regardless of
          // how wide the title text or action buttons beside it are, rather
          // than just splitting the leftover space between them.
          <div className="now-playing-controls-relocated">
            <PlaybackTransportButtons
              isShuffleEnabled={isShuffleEnabled}
              isShuffleAvailable={isShuffleAvailable}
              onShuffle={onShuffle}
              onPrev={onPrev}
              onNext={onNext}
              isPlaying={isPlaying}
              onTogglePlay={onTogglePlay}
              canTogglePlayback={canTogglePlayback}
              currentVideo={video}
              isPreviewModeEnabled={isPreviewModeEnabled}
              previewCountdown={previewCountdown}
              onTogglePreview={onTogglePreview}
            />
            <button
              className="footer-control-btn playback-relocate-btn"
              type="button"
              onClick={onToggleControlsPosition}
              title="Move controls back to the top bar"
              aria-label="Move playback controls back to the top bar"
            >
              <TriangleUpIcon className="transport-icon transport-icon-relocate" />
            </button>
          </div>
        )}
        <div className="now-playing-actions">
          <button
            className={`btn btn-icon add-to-playlist-btn${isCurrentVideoInPlaylist ? ' hidden' : ''}`}
            onClick={() => onAddToPlaylist?.([video])}
            title="Add to Queue"
            aria-label="Add to Queue"
          >
            <PlaylistPlusIcon />
          </button>
          <button
            className="btn btn-icon add-to-custom-playlist-btn"
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenAddToPlaylistDropdown?.([video], {
                top: rect.bottom,
                left: rect.left + rect.width / 2,
              });
            }}
            title="Add to Playlist"
            aria-label="Add to Playlist"
            disabled={!video}
          >
            <FolderPlusIcon />
          </button>
          <button
            className={`btn btn-icon now-playing-support-btn${supportClassName}`}
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenSupportDropdown(
                video,
                {
                  top: rect.bottom,
                  left: rect.left + rect.width / 2,
                },
                {
                  direction: 'down',
                  showRemove: isSupported,
                },
              );
            }}
            title={supportTooltip}
            aria-label={supportLabel}
            disabled={isNominated}
          >
            {supportGlyph}
          </button>
          {onOpenVgmcSheetSync && (
            <button
              className="btn btn-icon vgmc-mobile-action-btn"
              type="button"
              onClick={onOpenVgmcSheetSync}
              title="Sync your VGMC ratings to the reaction sheet"
              aria-label="Sync your feedback to Reactions Sheet"
            >
              <ReloadIcon />
            </button>
          )}
          {onOpenNominationFeedback && (
            <button
              className="btn btn-icon vgmc-mobile-action-btn"
              type="button"
              onClick={onOpenNominationFeedback}
              title="See ratings & comments left on tracks you've nominated"
              aria-label="Check your Nomination feedback"
            >
              <SheetIcon />
            </button>
          )}
        </div>
      </div>
    ) : null;

  const embedNode =
    provider === 'soundcloud' ? (
      <SoundCloudPlayer
        key={video.videoId}
        video={video}
        isPlaying={isPlaying}
        onReady={handleReady}
        onEnd={handleEnd}
        onStateChange={handleStateChange}
        style={{ width: '100%', height: '100%' }}
      />
    ) : provider === 'bandcamp' ? (
      <BandcampPlayer
        key={video.videoId}
        video={video}
        isPlaying={isPlaying}
        onReady={handleReady}
        onEnd={handleEnd}
        style={{ width: '100%', height: '100%' }}
      />
    ) : (
      <YouTube
        key={video.videoId}
        videoId={video.videoId}
        opts={opts}
        onReady={handleReady}
        onEnd={handleEnd}
        onStateChange={handleStateChange}
        style={{ width: '100%', height: '100%' }}
      />
    );

  const playerIframeNode = (
    <div
      className={
        provider === 'youtube'
          ? 'player-iframe-container'
          : `player-iframe-container player-iframe-container--${provider}`
      }
      id="player-container"
    >
      {embedNode}
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
              title={
                isPlaying
                  ? provider === 'soundcloud'
                    ? 'Stop'
                    : 'Pause'
                  : 'Play'
              }
              aria-label={
                isPlaying
                  ? provider === 'soundcloud'
                    ? 'Stop'
                    : 'Pause'
                  : 'Play'
              }
            >
              {isPlaying ? (
                provider === 'soundcloud' ? (
                  <StopIcon />
                ) : (
                  <PauseIcon />
                )
              ) : (
                <PlayIcon />
              )}
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
              aria-label="Shuffle queue"
              title="Shuffle queue"
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
    <div
      className={`player-wrap player-wrap-${variant}${
        provider !== 'youtube' ? ` player-wrap-provider-${provider}` : ''
      }`}
    >
      <div className={`player-stage${isFull ? ' has-community-activity' : ''}`}>
        <div className="player-video-stack">
          {isFull && <div className="player-grid-top-spacer" />}
          {isFull && nowPlayingListNode}
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
                  onFeedbackSaved={onFeedbackSaved}
                  vgmcSupportPointsByVideoId={vgmcSupportPointsByVideoId}
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
