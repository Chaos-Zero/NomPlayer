import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  parseYouTubeInput,
  fetchPlaylistItems,
  singleVideoEntry,
} from '../utils/youtube.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import ScrollingText from './ScrollingText.jsx';
import TrackCatalogSearch from './TrackCatalogSearch.jsx';
import UserMenu from './UserMenu.jsx';

const API_KEY = import.meta.env.VITE_YT_API_KEY || '';
const SUCCESS_FLASH_MS = 1000;

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

function PlaylistPlusIcon() {
  return (
    <svg
      className="collection-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg className="collection-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 16.35 8.95 15.39C4.58 11.43 2 9.08 2 6.19 2 3.84 3.84 2 6.19 2c1.33 0 2.6.62 3.41 1.68A4.39 4.39 0 0 1 13.81 2C16.16 2 18 3.84 18 6.19c0 2.89-2.58 5.24-6.95 9.21L10 16.35Z" />
    </svg>
  );
}

function FastForwardIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.75 4.95v10.1c0 .58.64.94 1.14.64l6.45-4.98c.44-.34.44-1.08 0-1.42L4.89 4.31c-.5-.3-1.14.06-1.14.64Z" />
      <path d="M10.5 4.95v10.1c0 .58.64.94 1.14.64l6.45-4.98c.44-.34.44-1.08 0-1.42l-6.45-4.98c-.5-.3-1.14.06-1.14.64Z" />
    </svg>
  );
}

export default function TopBar({
  isPlaying,
  setIsPlaying,
  onPrev,
  onNext,
  canTogglePlayback = true,
  showSupportList,
  setShowSupportList,
  showNominationsList,
  setShowNominationsList,
  isShuffleEnabled = false,
  onShuffle,
  isPreviewModeEnabled = false,
  onTogglePreview,
  currentVideo = null,
  isCurrentVideoSupported = false,
  isCurrentVideoNominated = false,
  onToggleCurrentVideoSupport,
  isCurrentVideoInPlaylist = false,
  onAddToPlaylist,
  authUser = null,
  userProfile = null,
  isAuthAvailable = false,
  onOpenAuthDialog,
  onOpenSettings,
  onLogout,
  onLoad,
  supabase = null,
  onCatalogPlayNow,
  onAddCatalogToPlaylist,
  isPlayerPage = true,
  hasMobileDetachedPlayer = false,
  isMobileDetachedPlayerEntering = false,
  isMobileDetachedPlayerExiting = false,
  onNavigateToPlayer,
}) {
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
  const [urlValue, setUrlValue] = useState('');
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [controlsOffset, setControlsOffset] = useState(0);
  const [mobileKeyboardOffset, setMobileKeyboardOffset] = useState(0);
  const [mobileDetachedPlayerVars, setMobileDetachedPlayerVars] = useState({});
  const [error, setError] = useState('');
  const topbarRef = useRef(null);
  const mobileShellRef = useRef(null);
  const formRef = useRef(null);
  const errorRef = useRef(null);
  const centerZoneRef = useRef(null);
  const rightZoneRef = useRef(null);
  const inputRef = useRef(null);
  const activeRequestRef = useRef(0);
  const successTimeoutRef = useRef(null);
  const effectiveInputOpen = isPlayerPage && isInputOpen;
  const currentSupportLabel = !currentVideo
    ? 'No current video to support'
    : isCurrentVideoNominated
      ? 'Nomination tracks cannot be changed from the player'
      : isCurrentVideoSupported
        ? 'Remove from support list'
        : 'Add to support list';
  const currentSupportTooltip = !currentVideo
    ? 'No current video'
    : isCurrentVideoNominated
      ? 'In Nomination List'
      : isCurrentVideoSupported
        ? 'Remove Support'
        : 'Add to support list';
  const currentSupportClassName = isCurrentVideoNominated
    ? ' nominated locked'
    : isCurrentVideoSupported
      ? ' supported'
      : '';
  const currentSupportGlyph = isCurrentVideoNominated
    ? '★'
    : isCurrentVideoSupported
      ? '♥'
      : '♡';
  const hasTrackTitle =
    typeof currentVideo?.trackTitle === 'string' &&
    currentVideo.trackTitle.trim();
  const hasGameTitle =
    typeof currentVideo?.gameTitle === 'string' &&
    currentVideo.gameTitle.trim();
  const currentVideoDisplayTitle =
    hasTrackTitle || hasGameTitle
      ? `${hasGameTitle ? currentVideo.gameTitle : ''}${hasGameTitle && hasTrackTitle ? ' - ' : ''}${hasTrackTitle ? currentVideo.trackTitle : ''}`
      : (currentVideo?.title ?? '');

  const mobileNowPlayingText = currentVideoDisplayTitle;
  const playerActionLabel = isPlayerPage
    ? 'Add to playlist'
    : isMobileLayout
      ? 'Player'
      : 'Go to player';
  const showDesktopCatalogSearch = !isMobileLayout && Boolean(supabase);
  const clearSuccessFlash = useCallback(() => {
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setShowSuccess(false);
  }, []);

  const flashSuccess = useCallback(() => {
    clearSuccessFlash();
    setShowSuccess(true);
    successTimeoutRef.current = window.setTimeout(() => {
      successTimeoutRef.current = null;
      setShowSuccess(false);
    }, SUCCESS_FLASH_MS);
  }, [clearSuccessFlash]);

  const openInput = useCallback(() => {
    if (!isPlayerPage) {
      onNavigateToPlayer?.();
      return;
    }

    clearSuccessFlash();
    setError('');
    setIsInputOpen(true);
  }, [clearSuccessFlash, isPlayerPage, onNavigateToPlayer]);

  const closeInput = useCallback(() => {
    activeRequestRef.current += 1;
    clearSuccessFlash();
    setLoading(false);
    setError('');
    setUrlValue('');
    setIsInputOpen(false);
  }, [clearSuccessFlash]);

  useEffect(() => {
    if (!effectiveInputOpen) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [effectiveInputOpen]);

  useEffect(() => {
    if (isPlayerPage || !isInputOpen) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      closeInput();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [closeInput, isInputOpen, isPlayerPage]);

  useEffect(
    () => () => {
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isMobileLayout || !effectiveInputOpen) {
      setMobileKeyboardOffset(0);
      return undefined;
    }

    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      setMobileKeyboardOffset(0);
      return undefined;
    }

    let frameId = 0;

    function measureKeyboardOffset() {
      const nextOffset = Math.max(
        0,
        window.innerHeight - visualViewport.height - visualViewport.offsetTop,
      );
      setMobileKeyboardOffset((previousOffset) =>
        Math.abs(previousOffset - nextOffset) < 1 ? previousOffset : nextOffset,
      );
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureKeyboardOffset);
    }

    scheduleMeasure();
    visualViewport.addEventListener('resize', scheduleMeasure);
    visualViewport.addEventListener('scroll', scheduleMeasure);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frameId);
      visualViewport.removeEventListener('resize', scheduleMeasure);
      visualViewport.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [effectiveInputOpen, isMobileLayout]);

  useLayoutEffect(() => {
    if (!isMobileLayout || !hasMobileDetachedPlayer) {
      setMobileDetachedPlayerVars({});
      return undefined;
    }

    const shellNode = mobileShellRef.current;
    if (!shellNode) return undefined;

    const playerSelector =
      '.player-surface.detached-footer.mobile-detached-footer .player-wrap-mini';
    let frameId = 0;
    let playerNode = null;

    function updateVars(nextVars) {
      setMobileDetachedPlayerVars((previousVars) => {
        const previousKeys = Object.keys(previousVars);
        const nextKeys = Object.keys(nextVars);

        if (
          previousKeys.length === nextKeys.length &&
          nextKeys.every((key) => previousVars[key] === nextVars[key])
        ) {
          return previousVars;
        }

        return nextVars;
      });
    }

    function measure() {
      playerNode = document.querySelector(playerSelector);
      if (!shellNode || !playerNode) {
        updateVars({});
        return;
      }

      const shellRect = shellNode.getBoundingClientRect();
      const playerRect = playerNode.getBoundingClientRect();
      const topbarShellHeight =
        Number.parseFloat(
          getComputedStyle(shellNode).getPropertyValue(
            '--mobile-topbar-shell-h',
          ),
        ) || 88;
      const controlsSurfaceTop = shellRect.bottom - (topbarShellHeight + 6);
      const visibleHeight = Math.max(0, controlsSurfaceTop - playerRect.top);

      updateVars({
        '--mobile-detached-player-top': `${Math.max(
          0,
          playerRect.top - shellRect.top,
        )}px`,
        '--mobile-detached-player-left': `${Math.max(
          0,
          playerRect.left - shellRect.left,
        )}px`,
        '--mobile-detached-player-right': `${Math.max(
          0,
          shellRect.right - playerRect.right,
        )}px`,
        '--mobile-detached-player-width': `${playerRect.width}px`,
        '--mobile-detached-player-height': `${playerRect.height}px`,
        '--mobile-detached-player-visible-height': `${visibleHeight}px`,
      });
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    }

    scheduleMeasure();

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleMeasure);

    resizeObserver?.observe(shellNode);

    playerNode = document.querySelector(playerSelector);
    if (playerNode) {
      resizeObserver?.observe(playerNode);
    }

    window.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('scroll', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [hasMobileDetachedPlayer, isMobileLayout]);

  useEffect(() => {
    if (isMobileLayout) {
      setControlsOffset(0);
      return undefined;
    }

    const topbarNode = topbarRef.current;
    const formNode = formRef.current;
    const centerNode = centerZoneRef.current;
    const rightNode = rightZoneRef.current;
    if (!topbarNode || !formNode || !centerNode || !rightNode) return undefined;

    const collisionPadding = 18;
    let frameId = 0;

    function measure() {
      const isCompactLayout =
        window.matchMedia?.('(max-width: 960px)')?.matches ?? false;
      if (isCompactLayout) {
        setControlsOffset(0);
        return;
      }

      const topbarRect = topbarNode.getBoundingClientRect();
      const formRect = formNode.getBoundingClientRect();
      const errorRect = errorRef.current?.getBoundingClientRect() ?? null;
      const centerRect = centerNode.getBoundingClientRect();
      const rightRect = rightNode.getBoundingClientRect();

      const baseCenter = topbarRect.width / 2;
      const occupiedLeftEdge = Math.max(
        formRect.right,
        errorRect?.right ?? formRect.right,
      );
      const minCenter =
        occupiedLeftEdge -
        topbarRect.left +
        collisionPadding +
        centerRect.width / 2;
      const maxCenter =
        rightRect.left -
        topbarRect.left -
        collisionPadding -
        centerRect.width / 2;

      let nextOffset = 0;
      if (minCenter <= maxCenter) {
        const targetCenter = Math.min(
          maxCenter,
          Math.max(baseCenter, minCenter),
        );
        nextOffset = targetCenter - baseCenter;
      } else {
        const overlapLeft = minCenter - baseCenter;
        const overlapRight = baseCenter - maxCenter;
        nextOffset = overlapLeft >= overlapRight ? overlapLeft : -overlapRight;
      }

      setControlsOffset((previousOffset) =>
        Math.abs(previousOffset - nextOffset) < 0.5
          ? previousOffset
          : nextOffset,
      );
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    }

    scheduleMeasure();

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleMeasure);

    resizeObserver?.observe(topbarNode);
    resizeObserver?.observe(formNode);
    if (errorRef.current) {
      resizeObserver?.observe(errorRef.current);
    }
    resizeObserver?.observe(centerNode);
    resizeObserver?.observe(rightNode);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [effectiveInputOpen, error, isMobileLayout, showSuccess]);

  async function handleSubmit(e) {
    e?.preventDefault();

    if (!isPlayerPage) {
      onNavigateToPlayer?.();
      return;
    }

    if (!effectiveInputOpen) {
      openInput();
      return;
    }

    const trimmedUrl = urlValue.trim();
    if (!trimmedUrl) return;

    const parsed = parseYouTubeInput(trimmedUrl);
    if (!parsed) {
      setError('Could not recognise that URL or ID');
      return;
    }

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    clearSuccessFlash();
    setError('');
    setLoading(true);
    try {
      if (parsed.type === 'video') {
        const item = await singleVideoEntry(parsed.videoId);
        if (requestId !== activeRequestRef.current) return;
        onLoad([item], { mode: 'append', autoplay: true });
      } else {
        const items = await fetchPlaylistItems(parsed.playlistId, API_KEY);
        if (requestId !== activeRequestRef.current) return;
        if (items.length === 0) {
          setError('Playlist is empty or private.');
        } else {
          onLoad(items, {
            mode: 'append',
            startVideoId: parsed.videoId || null,
          });
        }
      }

      if (requestId === activeRequestRef.current) {
        setUrlValue('');
        flashSuccess();
      }
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      if (err.message === 'NO_API_KEY') {
        setError('Add VITE_YT_API_KEY to .env to load playlists.');
      } else {
        setError(err.message || 'Failed to load playlist.');
      }
    } finally {
      if (requestId === activeRequestRef.current) {
        setLoading(false);
      }
    }
  }

  function renderPlaybackControls({
    className = '',
    hidden = false,
    withIds = false,
  } = {}) {
    const showModeButtons = !isMobileLayout;

    return (
      <div
        className={`playback-controls${className ? ` ${className}` : ''}`}
        aria-hidden={hidden || undefined}
      >
        {showModeButtons && (
          <button
            className={`btn btn-icon shuffle-btn${isShuffleEnabled ? ' active' : ''}`}
            onClick={onShuffle}
            title="Shuffle playlist"
            aria-label="Shuffle playlist"
            aria-pressed={isShuffleEnabled}
            tabIndex={hidden ? -1 : 0}
          >
            <span className="shuffle-glyph" aria-hidden="true">
              🔀
            </span>
          </button>
        )}

        <button
          className="btn btn-icon"
          onClick={onPrev}
          title="Previous"
          id={withIds ? 'prev-btn' : undefined}
          aria-label="Previous video"
          tabIndex={hidden ? -1 : 0}
        >
          <PreviousIcon />
        </button>

        <button
          className="btn btn-play"
          onClick={() => setIsPlaying((p) => !p)}
          title={isPlaying ? 'Pause' : 'Play'}
          id={withIds ? 'play-pause-btn' : undefined}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={!canTogglePlayback}
          tabIndex={hidden ? -1 : 0}
        >
          {isMobileLayout && isPreviewModeEnabled ? (
            <FastForwardIcon className="transport-icon transport-icon-preview" />
          ) : isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>

        <button
          className="btn btn-icon"
          onClick={onNext}
          title="Next"
          id={withIds ? 'next-btn' : undefined}
          aria-label="Next video"
          tabIndex={hidden ? -1 : 0}
        >
          <NextIcon />
        </button>

        {showModeButtons && (
          <button
            className={`btn btn-icon${isPreviewModeEnabled ? ' active' : ''}`}
            onClick={onTogglePreview}
            title="Preview mode"
            aria-label="Preview mode"
            aria-pressed={isPreviewModeEnabled}
            tabIndex={hidden ? -1 : 0}
          >
            <FastForwardIcon />
          </button>
        )}
      </div>
    );
  }

  const mobileCornerActions =
    isMobileLayout && !isInputOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="mobile-corner-actions">
            <button
              className={`mobile-corner-toggle support${showSupportList ? ' active' : ''}`}
              onClick={() => setShowSupportList((s) => !s)}
              title={
                showSupportList ? 'Hide Support List' : 'Show Support List'
              }
              aria-label="Toggle support list"
            >
              <SupportIcon />
            </button>

            <button
              className={`mobile-corner-toggle nomination${showNominationsList ? ' active' : ''}`}
              onClick={() => setShowNominationsList((s) => !s)}
              title={
                showNominationsList ? 'Hide Nominations' : 'Show Nominations'
              }
              aria-label="Toggle nominations list"
            >
              ★
            </button>

            <UserMenu
              compact
              user={authUser}
              profile={userProfile}
              authAvailable={isAuthAvailable}
              onOpenAuth={onOpenAuthDialog}
              onOpenSettings={onOpenSettings}
              onLogout={onLogout}
              disabled={effectiveInputOpen}
            />
          </div>,
          document.body,
        )
      : null;

  const mobileTopbarStyle = {
    '--mobile-keyboard-offset': `${mobileKeyboardOffset}px`,
    ...mobileDetachedPlayerVars,
  };
  const mobileDetachedPlayerMotionClass = hasMobileDetachedPlayer
    ? `${isMobileDetachedPlayerEntering ? ' entering' : ''}${isMobileDetachedPlayerExiting ? ' exiting' : ''}`
    : '';

  if (isMobileLayout) {
    return (
      <>
        {mobileCornerActions}
        <img
          src="/NomPlayer_icon.png"
          className="topbar-logo mobile-only"
          alt="NomPlayer"
        />
        <div
          ref={topbarRef}
          className={`topbar mobile-layout${effectiveInputOpen ? ' input-open' : ''}${hasMobileDetachedPlayer ? ' mobile-detached-player' : ''}`}
          style={mobileTopbarStyle}
        >
          <div
            className={`mobile-topbar-floating-controls${effectiveInputOpen ? ' visible' : ''}`}
            aria-hidden={!effectiveInputOpen}
          >
            {renderPlaybackControls({
              className: 'mobile-playback-floating',
              hidden: !effectiveInputOpen,
            })}
          </div>

          {error && <span className="mobile-url-error">⚠ {error}</span>}

          <div
            ref={mobileShellRef}
            className={`mobile-topbar-shell${effectiveInputOpen ? ' open' : ''}${hasMobileDetachedPlayer ? ' has-detached-player' : ''}${mobileDetachedPlayerMotionClass}`}
          >
            <div className="mobile-topbar-stage">
              <div
                className={`mobile-topbar-face mobile-topbar-front${hasMobileDetachedPlayer ? ' with-detached-player' : ''}${mobileDetachedPlayerMotionClass}`}
                aria-hidden={effectiveInputOpen}
              >
                {hasMobileDetachedPlayer && (
                  <div
                    className="mobile-topbar-player-spacer"
                    aria-hidden="true"
                  />
                )}

                <div
                  className={`mobile-topbar-footer-shell${hasMobileDetachedPlayer ? ' with-detached-player' : ''}`}
                >
                  {mobileNowPlayingText && (
                    <div
                      className="mobile-now-playing-inline"
                      title={mobileNowPlayingText}
                    >
                      <div className="mobile-now-playing-content">
                        {isPlaying && (
                          <span
                            className="mobile-now-playing-dot"
                            aria-hidden="true"
                          />
                        )}
                        <ScrollingText
                          className="mobile-now-playing-text"
                          text={mobileNowPlayingText}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mobile-topbar-controls-row">
                    <div className="mobile-topbar-slot mobile-topbar-slot-left">
                      <button
                        className="mobile-add-btn"
                        type="button"
                        onClick={openInput}
                        aria-label={playerActionLabel}
                        tabIndex={effectiveInputOpen ? -1 : 0}
                      >
                        {isPlayerPage ? 'Add' : playerActionLabel}
                      </button>
                    </div>

                    <div
                      className="mobile-playback-inline-wrap"
                      aria-hidden={effectiveInputOpen || undefined}
                    >
                      {renderPlaybackControls({
                        className: 'mobile-playback-inline',
                        hidden: effectiveInputOpen,
                      })}
                    </div>

                    <div className="mobile-topbar-slot mobile-topbar-slot-right">
                      <button
                        className={`btn btn-icon add-to-playlist-btn mobile-add-to-playlist-btn${isCurrentVideoInPlaylist ? ' hidden' : ''}`}
                        type="button"
                        onClick={() => onAddToPlaylist?.([currentVideo])}
                        aria-label="Add to current playlist"
                        title="Add to current playlist"
                        disabled={!currentVideo}
                        tabIndex={effectiveInputOpen ? -1 : 0}
                      >
                        <PlaylistPlusIcon />
                      </button>
                      <button
                        className={`btn btn-icon mobile-current-support-btn${currentSupportClassName}`}
                        type="button"
                        onClick={() =>
                          onToggleCurrentVideoSupport?.(currentVideo)
                        }
                        title={currentSupportTooltip}
                        aria-label={currentSupportLabel}
                        disabled={!currentVideo || isCurrentVideoNominated}
                        tabIndex={effectiveInputOpen ? -1 : 0}
                      >
                        {currentSupportGlyph}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <form
                className={`mobile-topbar-face mobile-topbar-back${showSuccess ? ' success' : ''}`}
                onSubmit={handleSubmit}
                aria-hidden={!effectiveInputOpen}
              >
                <input
                  ref={inputRef}
                  className="mobile-topbar-input"
                  type="text"
                  placeholder="Paste a YouTube video or playlist URL…"
                  value={urlValue}
                  onChange={(event) => {
                    setUrlValue(event.target.value);
                    setError('');
                    if (showSuccess) {
                      clearSuccessFlash();
                    }
                  }}
                  tabIndex={effectiveInputOpen ? 0 : -1}
                />
                <button
                  className={`mobile-topbar-submit${showSuccess ? ' success' : ''}`}
                  type="submit"
                  disabled={!showSuccess && !urlValue.trim()}
                  aria-label={showSuccess ? 'Load successful' : undefined}
                  tabIndex={effectiveInputOpen ? 0 : -1}
                >
                  {showSuccess ? '✓' : loading ? 'Loading…' : 'Load'}
                </button>
                <button
                  className="mobile-topbar-close"
                  type="button"
                  aria-label="Close add to playlist"
                  onClick={closeInput}
                  tabIndex={effectiveInputOpen ? 0 : -1}
                >
                  ✕
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div
      ref={topbarRef}
      className={`topbar${effectiveInputOpen ? ' input-open' : ''}`}
    >
      <div className="topbar-side topbar-left">
        <div className="topbar-load-area">
          {showDesktopCatalogSearch ? (
            <div ref={formRef} className="topbar-catalog-search-slot">
              <TrackCatalogSearch
                className="topbar-catalog-search"
                inputId="topbar-track-search"
                supabase={supabase}
                onPlayNow={onCatalogPlayNow}
                onAddToPlaylist={onAddCatalogToPlaylist}
              />
            </div>
          ) : (
            <form
              ref={formRef}
              className={`url-form${effectiveInputOpen ? ' open' : ''}${showSuccess ? ' success' : ''}`}
              onSubmit={handleSubmit}
            >
              <div className="url-input-wrap">
                <input
                  ref={inputRef}
                  className="url-input"
                  type="text"
                  placeholder="Paste a YouTube video or playlist URL…"
                  value={urlValue}
                  onChange={(e) => {
                    setUrlValue(e.target.value);
                    setError('');
                    if (showSuccess) {
                      clearSuccessFlash();
                    }
                  }}
                  id="url-input"
                />
              </div>
              <button
                className={`btn btn-primary url-submit-btn${showSuccess ? ' success' : ''}`}
                type={effectiveInputOpen ? 'submit' : 'button'}
                disabled={
                  effectiveInputOpen && !showSuccess && !urlValue.trim()
                }
                id="load-btn"
                aria-label={showSuccess ? 'Load successful' : undefined}
                onClick={!effectiveInputOpen ? openInput : undefined}
              >
                {showSuccess
                  ? '✓'
                  : loading
                    ? 'Loading…'
                    : effectiveInputOpen
                      ? 'Load'
                      : playerActionLabel}
              </button>
              <button
                className="btn btn-icon url-close-btn"
                type="button"
                aria-label="Close add to playlist"
                onClick={closeInput}
                tabIndex={effectiveInputOpen ? 0 : -1}
              >
                ✕
              </button>
            </form>
          )}
        </div>

        {!showDesktopCatalogSearch && error && (
          <span ref={errorRef} className="url-error">
            ⚠ {error}
          </span>
        )}
      </div>

      <div
        ref={centerZoneRef}
        className="topbar-center"
        style={{ '--topbar-controls-offset': `${controlsOffset}px` }}
      >
        <div className="controls-divider" aria-hidden="true" />
        {renderPlaybackControls({ withIds: true })}
        <div className="controls-divider" aria-hidden="true" />
      </div>

      <div ref={rightZoneRef} className="topbar-side topbar-right">
        <button
          className={`collection-toggle-btn support${showSupportList ? ' active' : ''}`}
          onClick={() => setShowSupportList((s) => !s)}
          title={showSupportList ? 'Hide Support List' : 'Show Support List'}
          id="support-toggle-btn"
          aria-label="Toggle support list"
        >
          <SupportIcon />
        </button>

        <button
          className={`collection-toggle-btn nomination${showNominationsList ? ' active' : ''}`}
          onClick={() => setShowNominationsList((s) => !s)}
          title={showNominationsList ? 'Hide Nominations' : 'Show Nominations'}
          id="nomination-toggle-btn"
          aria-label="Toggle nominations list"
        >
          ★
        </button>

        <UserMenu
          user={authUser}
          profile={userProfile}
          authAvailable={isAuthAvailable}
          onOpenAuth={onOpenAuthDialog}
          onOpenSettings={onOpenSettings}
          onLogout={onLogout}
        />
      </div>
    </div>
  );
}
