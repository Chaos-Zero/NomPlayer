import { useSyncExternalStore } from 'react';
import { formatTime } from '../utils/youtube.js';

/**
 * Renders the seek bar in the persistent footer player.
 *
 * Playback time updates arrive up to twice a second while a track is
 * playing (see VideoPlayer's progress interval). If that value lived in
 * App's own state, every tick would re-render the entire app tree - top
 * bar, sidebar, whichever page is active, all of it - just to update two
 * time labels and a slider. Reading it through useSyncExternalStore instead
 * means only this one small component re-renders on each tick; App just
 * hands down a ref it mutates and a subscribe function, never re-rendering
 * itself for this. See App.jsx's footerProgressRef/subscribeFooterProgress.
 */
export default function FooterProgressBar({ progressRef, subscribe, onSeek }) {
  const { currentTime, duration } = useSyncExternalStore(
    subscribe,
    () => progressRef.current,
  );

  return (
    <div className="footer-progress-row">
      <span className="footer-time-label">{formatTime(currentTime)}</span>
      <input
        type="range"
        className="footer-progress-slider"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={onSeek}
      />
      <span className="footer-time-label">{formatTime(duration)}</span>
    </div>
  );
}
