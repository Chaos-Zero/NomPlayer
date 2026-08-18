import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { fetchMediaItems, parseMediaInput } from '../utils/media.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import ScrollingText from './ScrollingText.jsx';
import TrackCatalogSearch from './TrackCatalogSearch.jsx';
import { MenuIcon } from './SiteNavigation.jsx';
import { lastSearchQuery } from '../utils/searchPersistence.js';
import UserMenu from './UserMenu.jsx';
import FeedbackDialog from './FeedbackDialog.jsx';
import {
  PreviousIcon,
  NextIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ShuffleIcon,
  PlaylistPlusIcon,
  StopwatchIcon,
  HeartIcon as SupportIcon,
  HeartEmptyIcon,
  StarIcon,
  LockIcon,
  SunIcon,
  MoonIcon,
  SearchIcon,
} from './Icons.jsx';

const API_KEY = import.meta.env.VITE_YT_API_KEY || '';
const SUCCESS_FLASH_MS = 1000;

function TopBar({
  theme,
  onToggleTheme,
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
  isShuffleAvailable = true,
  onShuffle,
  isPreviewModeEnabled = false,
  previewCountdown = 30,
  onTogglePreview,
  currentVideo = null,
  isCurrentVideoSupported = false,
  isCurrentVideoNominated = false,
  onToggleCurrentVideoSupport,
  isCurrentVideoInPlaylist = false,
  onAddToPlaylist,
  currentSupportLevel = 1,
  authUser = null,
  userProfile = null,
  isAuthAvailable = false,
  onOpenAuthDialog,
  onOpenHistory,
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
  isMenuOpen = false,
  onToggleMenu,
  hidePlaybackControls = false,
  customPlaylists,
  onUpdateCustomPlaylists,
  onShowToast,
  nominationList,
  supportList,
  onToggleNomination,
  onToggleSupport,
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
  const [isCatalogSearchOpen, setIsCatalogSearchOpen] = useState(false);
  const [mobileHasQuery, setMobileHasQuery] = useState(
    Boolean(lastSearchQuery),
  );
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
      ? ` supported level-${currentSupportLevel}`
      : '';
  const currentSupportGlyph = isCurrentVideoNominated ? (
    <StarIcon />
  ) : isCurrentVideoSupported ? (
    currentSupportLevel === 3 ? (
      <LockIcon />
    ) : (
      <SupportIcon />
    )
  ) : (
    <HeartEmptyIcon />
  );
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
    ? 'Add to queue'
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
    // This effect syncs mobileKeyboardOffset with the external
    // visualViewport API; the early setState(0) calls below are its
    // "nothing to observe" branches (no listeners to attach), not state
    // derived from this render, so they can't be hoisted out to a
    // render-phase adjustment without duplicating the
    // isMobileLayout/effectiveInputOpen condition into a second,
    // separately-maintained copy.
    if (!isMobileLayout || !effectiveInputOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // Syncs mobileDetachedPlayerVars with real getBoundingClientRect()
    // measurements of DOM nodes outside this component - can't run during
    // render, needs painted layout. setMobileDetachedPlayerVars({}) below
    // is this effect's own "nothing to measure" branch, same reasoning as
    // the visualViewport effect above.
    if (!isMobileLayout || !hasMobileDetachedPlayer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // Syncs controlsOffset with real getBoundingClientRect() measurements
    // of the topbar/form/zone DOM nodes to resolve collisions; the
    // setControlsOffset(0) below is this effect's "not applicable on
    // mobile" branch, same reasoning as the two effects above.
    if (isMobileLayout) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

    const parsed = parseMediaInput(trimmedUrl);
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
      const { items, startVideoId } = await fetchMediaItems(parsed, {
        apiKey: API_KEY,
      });
      if (requestId !== activeRequestRef.current) return;
      if (items.length === 0) {
        setError('Playlist is empty or private.');
      } else {
        onLoad(items, {
          mode: 'append',
          autoplay: parsed.type !== 'playlist',
          startVideoId: startVideoId || null,
        });
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
        className={`playback-controls-stage${hidePlaybackControls ? ' flipped' : ''}`}
      >
        <div
          className={`playback-controls playback-controls-front${className ? ` ${className}` : ''}`}
          aria-hidden={hidden || hidePlaybackControls || undefined}
        >
          {showModeButtons && (
            <button
              className={`footer-control-btn shuffle${isShuffleEnabled ? ' active' : ''}${!isShuffleAvailable ? ' disabled' : ''}`}
              onClick={isShuffleAvailable ? onShuffle : undefined}
              title={
                isShuffleAvailable
                  ? 'Shuffle queue'
                  : 'Add at least 2 tracks to shuffle'
              }
              aria-label={
                isShuffleAvailable
                  ? 'Shuffle queue'
                  : 'Add at least 2 tracks to shuffle'
              }
              aria-pressed={isShuffleEnabled}
              disabled={!isShuffleAvailable}
              tabIndex={hidden || hidePlaybackControls ? -1 : 0}
            >
              <ShuffleIcon />
            </button>
          )}

          <button
            className="footer-control-btn"
            onClick={onPrev}
            title="Previous"
            id={withIds ? 'prev-btn' : undefined}
            aria-label="Previous video"
            tabIndex={hidden || hidePlaybackControls ? -1 : 0}
          >
            <PreviousIcon />
          </button>

          <button
            className="footer-control-btn play-pause"
            onClick={() => setIsPlaying((p) => !p)}
            title={
              isPlaying
                ? currentVideo?.provider === 'soundcloud'
                  ? 'Stop'
                  : 'Pause'
                : 'Play'
            }
            id={withIds ? 'play-pause-btn' : undefined}
            aria-label={
              isPlaying
                ? currentVideo?.provider === 'soundcloud'
                  ? 'Stop'
                  : 'Pause'
                : 'Play'
            }
            disabled={!canTogglePlayback}
            tabIndex={hidden || hidePlaybackControls ? -1 : 0}
          >
            {isMobileLayout && isPreviewModeEnabled ? (
              <StopwatchIcon
                countdown={previewCountdown}
                className="transport-icon transport-icon-preview"
              />
            ) : isPlaying ? (
              currentVideo?.provider === 'soundcloud' ? (
                <StopIcon />
              ) : (
                <PauseIcon />
              )
            ) : (
              <PlayIcon />
            )}
          </button>

          <button
            className="footer-control-btn"
            onClick={onNext}
            title="Next"
            id={withIds ? 'next-btn' : undefined}
            aria-label="Next video"
            tabIndex={hidden || hidePlaybackControls ? -1 : 0}
          >
            <NextIcon />
          </button>

          {showModeButtons && (
            <button
              className={`footer-control-btn preview${isPreviewModeEnabled ? ' active' : ''}`}
              onClick={onTogglePreview}
              title="Preview mode"
              aria-label="Preview mode"
              aria-pressed={isPreviewModeEnabled}
              tabIndex={hidden || hidePlaybackControls ? -1 : 0}
            >
              <StopwatchIcon
                countdown={previewCountdown}
                className="transport-icon transport-icon-preview"
              />
            </button>
          )}
        </div>
        <div className="playback-controls-face playback-controls-back" />
      </div>
    );
  }

  const mobileHeaderActions = (
    <div className="mobile-header-actions">
      {supabase && (
        <button
          className={`btn btn-icon mobile-search-toggle${isCatalogSearchOpen ? ' active' : ''}${mobileHasQuery ? ' with-query' : ''}`}
          type="button"
          onClick={() => setIsCatalogSearchOpen(true)}
          aria-label="Toggle catalog search"
          title="Search track catalog"
        >
          <SearchIcon className="mobile-search-icon-fixed" />
        </button>
      )}
      <button
        className={`mobile-corner-toggle support${showSupportList ? ' active' : ''}`}
        onClick={() => setShowSupportList((s) => !s)}
        title={showSupportList ? 'Hide Support' : 'Show Support'}
        aria-label="Toggle support list"
      >
        <SupportIcon />
      </button>

      <button
        className={`mobile-corner-toggle nomination${showNominationsList ? ' active' : ''}`}
        onClick={() => setShowNominationsList((s) => !s)}
        title={showNominationsList ? 'Hide Nominations' : 'Show Nominations'}
        aria-label="Toggle nominations list"
      >
        <StarIcon />
      </button>

      <button
        className="btn btn-icon theme-toggle-btn mobile-theme-toggle"
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>

      {authUser && (
        <FeedbackDialog
          compact
          user={authUser}
          profile={userProfile}
          disabled={effectiveInputOpen}
        />
      )}

      <UserMenu
        compact
        user={authUser}
        profile={userProfile}
        authAvailable={isAuthAvailable}
        onOpenAuth={onOpenAuthDialog}
        onOpenHistory={onOpenHistory}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
        disabled={effectiveInputOpen}
      />
    </div>
  );

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
        <div
          className={`mobile-header-bar${isCatalogSearchOpen ? ' search-open' : ''}`}
        >
          <div className="mobile-header-search-wrap">
            <TrackCatalogSearch
              supabase={supabase}
              onPlayNow={(video) => {
                onCatalogPlayNow?.(video);
                setIsCatalogSearchOpen(false);
              }}
              onAddToPlaylist={(videos) => {
                onAddCatalogToPlaylist?.(videos);
                setIsCatalogSearchOpen(false);
              }}
              customPlaylists={customPlaylists}
              onUpdateCustomPlaylists={onUpdateCustomPlaylists}
              onShowToast={onShowToast}
              nominationList={nominationList}
              supportList={supportList}
              onToggleNomination={onToggleNomination}
              onToggleSupport={onToggleSupport}
              className="mobile-header-catalog-search"
              autoFocus={isCatalogSearchOpen}
              onHasQueryChange={setMobileHasQuery}
            />
            <button
              className="mobile-search-close-btn"
              type="button"
              onClick={() => setIsCatalogSearchOpen(false)}
              aria-label="Close search"
            >
              ✕
            </button>
          </div>
          <div className="mobile-header-bar-content">
            <div className="mobile-header-left">
              <button
                className={`btn btn-icon mobile-header-menu-btn${isMenuOpen ? ' active' : ''}`}
                type="button"
                onClick={onToggleMenu}
                aria-label="Toggle navigation menu"
                aria-expanded={isMenuOpen}
              >
                <MenuIcon />
              </button>
              <img
                src="/NomPlayer_icon_backup.png"
                className="topbar-logo mobile-header-logo"
                alt="NomPlayer"
              />
            </div>
            {mobileHeaderActions}
          </div>
        </div>
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
                        aria-label="Add to Queue"
                        title="Add to Queue"
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
                  aria-label="Close add to queue"
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
                customPlaylists={customPlaylists}
                onUpdateCustomPlaylists={onUpdateCustomPlaylists}
                onShowToast={onShowToast}
                nominationList={nominationList}
                supportList={supportList}
                onToggleNomination={onToggleNomination}
                onToggleSupport={onToggleSupport}
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
                aria-label="Close add to queue"
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
          type="button"
          title={showSupportList ? 'Hide Support' : 'Show Support'}
          aria-label={showSupportList ? 'Hide Support' : 'Show Support'}
          onClick={() => setShowSupportList((s) => !s)}
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
          <StarIcon />
        </button>

        <button
          className="btn btn-icon theme-toggle-btn desktop-theme-toggle"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {authUser && <FeedbackDialog user={authUser} profile={userProfile} />}

        <UserMenu
          user={authUser}
          profile={userProfile}
          authAvailable={isAuthAvailable}
          onOpenAuth={onOpenAuthDialog}
          onOpenHistory={onOpenHistory}
          onOpenSettings={onOpenSettings}
          onLogout={onLogout}
        />
      </div>
    </div>
  );
}

// Re-renders on every playback-progress tick and other frequent App state
// changes otherwise, despite most of its props barely ever changing - see
// App.jsx's footerProgressRef comment for the same reasoning applied to the
// player itself.
export default memo(TopBar);
