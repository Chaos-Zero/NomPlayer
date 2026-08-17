import { useEffect, useRef, useState } from 'react';
import { resolveBandcampMetadata } from '../../utils/bandcamp.js';

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
 *
 * Autoplay: the embed src includes autoplay=1 whenever this mounts while
 * isPlaying is true (e.g. clicking a track, or auto-advancing into one),
 * plus allow="autoplay" on the iframe so the browser's autoplay policy
 * permits it. Browsers generally honour this when it follows a user
 * gesture in the same tab (which clicking/auto-advancing both count as);
 * it can still be silently blocked in stricter contexts (e.g. Safari, or
 * after long tab inactivity) - there's no way to detect that from here, so
 * it just stays paused with no error in that case.
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
          albumId: video.albumId || null,
          durationSeconds: video.durationSeconds || null,
        }
      : null,
  );
  const [resolveError, setResolveError] = useState(null);
  // Captured once at mount, not read reactively: the iframe's `src` embeds
  // this value, and changing `src` forces the browser to reload/restart the
  // iframe from 0:00. Since there's no real pause for Bandcamp (see the
  // file comment), toggling isPlaying later must not rebuild `src`, or
  // clicking "pause" would actually restart the track instead of just
  // freezing our own elapsed-time timer.
  const initialAutoplayRef = useRef(isPlaying);
  const elapsedBeforePauseRef = useRef(0);
  const resumedAtRef = useRef(null);
  const hasFiredEndRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    setResolveError(null);
    resolveBandcampMetadata(video.videoId)
      .then((meta) => {
        if (cancelled) return;
        setResolved({
          embedId: meta.embedId,
          embedType: meta.embedType || 'track',
          albumId: meta.albumId || null,
          durationSeconds:
            meta.durationSeconds || video.durationSeconds || null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        // Surfaced instead of leaving the "Loading…" state spinning forever
        // - a resolve failure (Bandcamp blocking the fetch, page removed,
        // unexpected page shape) is otherwise silent and undiagnosable.
        console.error('Failed to resolve Bandcamp track', err);
        setResolveError(err.message || 'Failed to load this Bandcamp track.');
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
    if (resolveError) {
      return (
        <div className="player-empty" style={style}>
          <div className="player-empty-icon">⚠</div>
          <div className="player-empty-title">
            Couldn't load this Bandcamp track
          </div>
          <div className="player-empty-sub">{resolveError}</div>
        </div>
      );
    }
    return (
      <div className="player-empty" style={style}>
        <div className="player-empty-icon">▶</div>
        <div className="player-empty-title">Loading Bandcamp player…</div>
      </div>
    );
  }

  // When a track belongs to an album, including album=<id> alongside
  // track=<id> (the same combined form Bandcamp's own "Share/Embed" button
  // generates) makes the "large" card render its intended compact layout;
  // track= alone renders a much sparser card that stretches to fill
  // whatever width it's given, leaving a lot of visually empty space (see
  // .player-iframe-container--bandcamp in index.css for the width cap that
  // handles the rest of that). bgcol is pinned to match the player's own
  // fixed black backdrop rather than transparent=true, which - at this
  // size/param combination - was leaving Bandcamp's default white card
  // background showing through instead.
  const albumSegment =
    resolved.embedType === 'track' && resolved.albumId
      ? `album=${resolved.albumId}/`
      : '';
  const src =
    `https://bandcamp.com/EmbeddedPlayer/${albumSegment}${resolved.embedType}=${resolved.embedId}` +
    `/size=large/bgcol=000000/linkcol=0f91ff/tracklist=false/artwork=small` +
    `/autoplay=${initialAutoplayRef.current ? 1 : 0}/`;

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
