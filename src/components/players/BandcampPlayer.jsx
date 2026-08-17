import { useEffect, useRef, useState } from 'react';
import { fetchBandcampMetadata } from '../../utils/bandcamp.js';

/**
 * Embeds a Bandcamp track/album via its public iframe embed. Bandcamp's
 * embed has no postMessage/control API at all — no way to play/pause/seek
 * it from outside, no way to detect when it ends. This is a deliberate,
 * user-approved best-effort tradeoff: playback commands are disabled in the
 * UI for a Bandcamp track (TopBar's transport controls, driven off
 * video.provider — see App.jsx), and "ended" is approximated with a timer
 * against the track's known duration instead of a real event. That timer:
 *  - only counts while `isPlaying` is true (best-effort respect for a
 *    pause, even though nothing can actually pause the embedded iframe
 *    itself once it's playing)
 *  - can drift if the tab is backgrounded/throttled, or if the listener
 *    manually pauses/seeks inside the iframe (both undetectable from here)
 * Good enough to keep the queue moving; not a source of truth.
 *
 * The numeric embed id isn't cached across sessions (see
 * src/utils/bandcamp.js and the Step 4 design note in the project plan) —
 * this always re-resolves it via fetchBandcampMetadata, using
 * video.embedId/durationSeconds only as an optimistic first-paint value
 * when they happen to already be on the object (e.g. a track just added
 * this session, before any reload round-trip strips them).
 */
export default function BandcampPlayer({
  video,
  isPlaying,
  onReady,
  onEnd,
  style,
}) {
  const [resolved, setResolved] = useState(() =>
    video.embedId
      ? {
          embedId: video.embedId,
          embedType: video.embedType || 'track',
          durationSeconds: video.durationSeconds || null,
        }
      : null,
  );
  const elapsedBeforePauseRef = useRef(0);
  const resumedAtRef = useRef(null);
  const hasFiredEndRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    fetchBandcampMetadata(video.videoId).then((meta) => {
      if (cancelled || !meta) return;
      setResolved({
        embedId: meta.embedId,
        embedType: meta.embedType || 'track',
        durationSeconds: meta.durationSeconds || video.durationSeconds || null,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.videoId]);

  useEffect(() => {
    if (isPlaying) {
      resumedAtRef.current = Date.now();
    } else if (resumedAtRef.current != null) {
      elapsedBeforePauseRef.current +=
        (Date.now() - resumedAtRef.current) / 1000;
      resumedAtRef.current = null;
    }
  }, [isPlaying]);

  function getCurrentTime() {
    const liveElapsed =
      resumedAtRef.current != null
        ? (Date.now() - resumedAtRef.current) / 1000
        : 0;
    return elapsedBeforePauseRef.current + liveElapsed;
  }

  // Fires onReady once, whenever we first have enough to build the embed
  // (either the optimistic initial value or the resolved fetch result).
  useEffect(() => {
    if (!resolved) return;
    const adapter = {
      getCurrentTime,
      getDuration: () => resolved.durationSeconds || 0,
      getPlayerState: () => 1,
      playVideo: () => {},
      pauseVideo: () => {},
      seekTo: () => {},
    };
    onReadyRef.current?.({ target: adapter });
  }, [resolved]);

  // Best-effort "ended" detection, see the file-level comment.
  useEffect(() => {
    if (!resolved?.durationSeconds) return undefined;
    const intervalId = window.setInterval(() => {
      if (hasFiredEndRef.current) return;
      if (getCurrentTime() >= resolved.durationSeconds) {
        hasFiredEndRef.current = true;
        onEnd?.();
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [resolved, onEnd]);

  if (!resolved) {
    return (
      <div className="player-empty" style={style}>
        <div className="player-empty-icon">▶</div>
        <div className="player-empty-title">Loading Bandcamp player…</div>
      </div>
    );
  }

  const src = `https://bandcamp.com/EmbeddedPlayer/${resolved.embedType}=${resolved.embedId}/size=large/bgcol=333333/linkcol=0f91ff/tracklist=false/artwork=small/transparent=true/`;

  return (
    <iframe
      title="Bandcamp player"
      src={src}
      style={style}
      seamless
      allow="autoplay"
    />
  );
}
