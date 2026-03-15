import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import {
  parseYouTubeInput,
  fetchPlaylistItems,
  singleVideoEntry,
} from '../utils/youtube.js';
import useMediaQuery from '../hooks/useMediaQuery.js';

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

function SupportIcon() {
  return (
    <svg className="collection-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 16.35 8.95 15.39C4.58 11.43 2 9.08 2 6.19 2 3.84 3.84 2 6.19 2c1.33 0 2.6.62 3.41 1.68A4.39 4.39 0 0 1 13.81 2C16.16 2 18 3.84 18 6.19c0 2.89-2.58 5.24-6.95 9.21L10 16.35Z" />
    </svg>
  );
}

export default function TopBar({
  isPlaying,
  setIsPlaying,
  onPrev,
  onNext,
  showSupportList,
  setShowSupportList,
  showNominationsList,
  setShowNominationsList,
  currentVideo = null,
  isCurrentVideoSupported = false,
  isCurrentVideoNominated = false,
  onToggleCurrentVideoSupport,
  onLoad,
}) {
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
  const [urlValue, setUrlValue] = useState('');
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [controlsOffset, setControlsOffset] = useState(0);
  const [mobileKeyboardOffset, setMobileKeyboardOffset] = useState(0);
  const [error, setError] = useState('');
  const topbarRef = useRef(null);
  const formRef = useRef(null);
  const errorRef = useRef(null);
  const centerZoneRef = useRef(null);
  const rightZoneRef = useRef(null);
  const inputRef = useRef(null);
  const activeRequestRef = useRef(0);
  const successTimeoutRef = useRef(null);
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
  const mobileNowPlayingText = currentVideo?.title ?? '';

  useEffect(() => {
    if (!isInputOpen) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isInputOpen]);

  useEffect(
    () => () => {
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isMobileLayout || !isInputOpen) {
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
  }, [isInputOpen, isMobileLayout]);

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
  }, [error, isInputOpen, isMobileLayout, showSuccess]);

  function clearSuccessFlash() {
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setShowSuccess(false);
  }

  function flashSuccess() {
    clearSuccessFlash();
    setShowSuccess(true);
    successTimeoutRef.current = window.setTimeout(() => {
      successTimeoutRef.current = null;
      setShowSuccess(false);
    }, SUCCESS_FLASH_MS);
  }

  function openInput() {
    clearSuccessFlash();
    setError('');
    setIsInputOpen(true);
  }

  function closeInput() {
    activeRequestRef.current += 1;
    clearSuccessFlash();
    setLoading(false);
    setError('');
    setUrlValue('');
    setIsInputOpen(false);
  }

  async function handleSubmit(e) {
    e?.preventDefault();

    if (!isInputOpen) {
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
    return (
      <div
        className={`playback-controls${className ? ` ${className}` : ''}`}
        aria-hidden={hidden || undefined}
      >
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
          tabIndex={hidden ? -1 : 0}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
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
          </div>,
          document.body,
        )
      : null;

  if (isMobileLayout) {
    return (
      <>
        {mobileCornerActions}
        <div
          ref={topbarRef}
          className={`topbar mobile-layout${isInputOpen ? ' input-open' : ''}`}
          style={{ '--mobile-keyboard-offset': `${mobileKeyboardOffset}px` }}
        >
          <div
            className={`mobile-topbar-floating-controls${isInputOpen ? ' visible' : ''}`}
            aria-hidden={!isInputOpen}
          >
            {renderPlaybackControls({
              className: 'mobile-playback-floating',
              hidden: !isInputOpen,
            })}
          </div>

          {error && <span className="mobile-url-error">⚠ {error}</span>}

          <div className={`mobile-topbar-shell${isInputOpen ? ' open' : ''}`}>
            <div className="mobile-topbar-stage">
              <div
                className="mobile-topbar-face mobile-topbar-front"
                aria-hidden={isInputOpen}
              >
                {mobileNowPlayingText && (
                  <div
                    className="mobile-now-playing-inline"
                    title={mobileNowPlayingText}
                  >
                    {isPlaying && (
                      <span
                        className="mobile-now-playing-dot"
                        aria-hidden="true"
                      />
                    )}
                    <span className="mobile-now-playing-text">
                      {mobileNowPlayingText}
                    </span>
                  </div>
                )}

                <div className="mobile-topbar-controls-row">
                  <div className="mobile-topbar-slot mobile-topbar-slot-left">
                    <button
                      className="mobile-add-btn"
                      type="button"
                      onClick={openInput}
                      aria-label="Add to playlist"
                      tabIndex={isInputOpen ? -1 : 0}
                    >
                      Add
                    </button>
                  </div>

                  <div
                    className="mobile-playback-inline-wrap"
                    aria-hidden={isInputOpen || undefined}
                  >
                    {renderPlaybackControls({
                      className: 'mobile-playback-inline',
                      hidden: isInputOpen,
                    })}
                  </div>

                  <div className="mobile-topbar-slot mobile-topbar-slot-right">
                    <button
                      className={`btn btn-icon mobile-current-support-btn${currentSupportClassName}`}
                      type="button"
                      onClick={() =>
                        onToggleCurrentVideoSupport?.(currentVideo)
                      }
                      title={currentSupportTooltip}
                      aria-label={currentSupportLabel}
                      disabled={!currentVideo || isCurrentVideoNominated}
                      tabIndex={isInputOpen ? -1 : 0}
                    >
                      {currentSupportGlyph}
                    </button>
                  </div>
                </div>
              </div>

              <form
                className={`mobile-topbar-face mobile-topbar-back${showSuccess ? ' success' : ''}`}
                onSubmit={handleSubmit}
                aria-hidden={!isInputOpen}
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
                  tabIndex={isInputOpen ? 0 : -1}
                />
                <button
                  className={`mobile-topbar-submit${showSuccess ? ' success' : ''}`}
                  type="submit"
                  disabled={!showSuccess && !urlValue.trim()}
                  aria-label={showSuccess ? 'Load successful' : undefined}
                  tabIndex={isInputOpen ? 0 : -1}
                >
                  {showSuccess ? '✓' : loading ? 'Loading…' : 'Load'}
                </button>
                <button
                  className="mobile-topbar-close"
                  type="button"
                  aria-label="Close add to playlist"
                  onClick={closeInput}
                  tabIndex={isInputOpen ? 0 : -1}
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
      className={`topbar${isInputOpen ? ' input-open' : ''}`}
    >
      <div className="topbar-side topbar-left">
        <div className="topbar-load-area">
          <form
            ref={formRef}
            className={`url-form${isInputOpen ? ' open' : ''}${showSuccess ? ' success' : ''}`}
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
              type={isInputOpen ? 'submit' : 'button'}
              disabled={isInputOpen && !showSuccess && !urlValue.trim()}
              id="load-btn"
              aria-label={showSuccess ? 'Load successful' : undefined}
              onClick={!isInputOpen ? openInput : undefined}
            >
              {showSuccess
                ? '✓'
                : loading
                  ? 'Loading…'
                  : isInputOpen
                    ? 'Load'
                    : 'Add to playlist'}
            </button>
            <button
              className="btn btn-icon url-close-btn"
              type="button"
              aria-label="Close add to playlist"
              onClick={closeInput}
              tabIndex={isInputOpen ? 0 : -1}
            >
              ✕
            </button>
          </form>
        </div>

        {error && (
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
      </div>
    </div>
  );
}
