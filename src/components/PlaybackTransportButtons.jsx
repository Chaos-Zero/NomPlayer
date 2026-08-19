import {
  PreviousIcon,
  NextIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ShuffleIcon,
  StopwatchIcon,
} from './Icons.jsx';

/**
 * The shuffle / previous / play-pause / next / preview button row shared by
 * TopBar's header controls and VideoPlayer's below-player relocated
 * controls (see the playback-relocate-btn toggle in both). Kept as a plain
 * row of buttons - no wrapping element - so each caller stays in charge of
 * its own layout/animation shell around it.
 */
export default function PlaybackTransportButtons({
  showModeButtons = true,
  isShuffleEnabled = false,
  isShuffleAvailable = true,
  onShuffle,
  onPrev,
  onNext,
  isPlaying = false,
  onTogglePlay,
  canTogglePlayback = true,
  currentVideo = null,
  isPreviewModeEnabled = false,
  previewCountdown = 30,
  onTogglePreview,
  showPreviewCountdownOnPlayButton = false,
  withIds = false,
  disabled = false,
}) {
  const playPauseLabel = isPlaying
    ? currentVideo?.provider === 'soundcloud'
      ? 'Stop'
      : 'Pause'
    : 'Play';

  return (
    <>
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
          tabIndex={disabled ? -1 : 0}
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
        tabIndex={disabled ? -1 : 0}
      >
        <PreviousIcon />
      </button>

      <button
        className="footer-control-btn play-pause"
        onClick={onTogglePlay}
        title={playPauseLabel}
        id={withIds ? 'play-pause-btn' : undefined}
        aria-label={playPauseLabel}
        disabled={!canTogglePlayback}
        tabIndex={disabled ? -1 : 0}
      >
        {showPreviewCountdownOnPlayButton ? (
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
        tabIndex={disabled ? -1 : 0}
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
          tabIndex={disabled ? -1 : 0}
        >
          <StopwatchIcon
            countdown={previewCountdown}
            className="transport-icon transport-icon-preview"
          />
        </button>
      )}
    </>
  );
}
