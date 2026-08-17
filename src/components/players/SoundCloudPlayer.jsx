import { useEffect, useRef } from 'react';

// SoundCloud's Widget API script is loaded once globally and cached — every
// SoundCloudPlayer instance (across track changes) reuses the same request
// rather than re-injecting a <script> tag per track, mirroring how
// react-youtube lazily loads the YouTube iframe API exactly once.
let widgetApiPromise = null;
function loadWidgetApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SoundCloud widget requires a browser'));
  }
  if (window.SC?.Widget) return Promise.resolve(window.SC.Widget);
  if (widgetApiPromise) return widgetApiPromise;

  widgetApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.async = true;
    script.onload = () => resolve(window.SC.Widget);
    script.onerror = () => {
      widgetApiPromise = null;
      reject(new Error('Failed to load SoundCloud Widget API'));
    };
    document.head.appendChild(script);
  });

  return widgetApiPromise;
}

/**
 * Embeds a SoundCloud track via the Widget API and exposes the same
 * getCurrentTime/getDuration/getPlayerState/playVideo/pauseVideo/seekTo
 * surface a react-youtube player instance has, so VideoPlayer's generic
 * playback-control code (progress polling, pause-verification,
 * visibility-restore — see VideoPlayer.jsx's playerRef usage) works
 * unmodified regardless of which provider is actually playing.
 *
 * The Widget API itself is async/callback-based (getPosition(cb),
 * getDuration(cb)), unlike the YouTube API's synchronous getCurrentTime()/
 * getDuration(). To present the same synchronous-looking surface, this
 * keeps a locally-cached position/duration updated by the PLAY_PROGRESS
 * event (fires roughly once a second during playback) and the initial
 * READY duration fetch; getCurrentTime()/getDuration() just read that
 * cache rather than calling the widget's async methods each time.
 */
export default function SoundCloudPlayer({
  video,
  isPlaying,
  onReady,
  onEnd,
  onStateChange,
  style,
}) {
  const iframeRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const state = { positionMs: 0, durationMs: 0, playerState: 3 };

    loadWidgetApi()
      .then((Widget) => {
        if (cancelled || !iframeRef.current) return;
        const widget = Widget(iframeRef.current);
        widgetRef.current = widget;

        const adapter = {
          getCurrentTime: () => state.positionMs / 1000,
          getDuration: () => state.durationMs / 1000,
          getPlayerState: () => state.playerState,
          playVideo: () => widget.play(),
          pauseVideo: () => widget.pause(),
          seekTo: (seconds) => {
            const ms = Math.max(0, Math.round((seconds || 0) * 1000));
            state.positionMs = ms;
            widget.seekTo(ms);
          },
        };

        widget.bind(Widget.Events.READY, () => {
          if (cancelled) return;
          widget.getDuration((durationMs) => {
            state.durationMs = durationMs || 0;
          });
          onReady?.({ target: adapter });
        });

        widget.bind(Widget.Events.PLAY, () => {
          state.playerState = 1;
          onStateChange?.({ data: 1 });
        });

        widget.bind(Widget.Events.PAUSE, () => {
          state.playerState = 2;
          onStateChange?.({ data: 2 });
        });

        widget.bind(Widget.Events.FINISH, () => {
          onEnd?.();
        });

        widget.bind(Widget.Events.PLAY_PROGRESS, (progress) => {
          if (typeof progress?.currentPosition === 'number') {
            state.positionMs = progress.currentPosition;
          }
        });
      })
      .catch((error) => {
        console.error('Failed to load SoundCloud Widget API', error);
      });

    return () => {
      cancelled = true;
      widgetRef.current = null;
    };
    // Track changes remount this component entirely (VideoPlayer keys it by
    // video.videoId), so this effect intentionally only ever runs once per
    // mount — onReady/onEnd/onStateChange are read fresh via closure each
    // time regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.videoId]);

  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
    video.videoId,
  )}&auto_play=${isPlaying ? 'true' : 'false'}&show_artwork=true`;

  return (
    <iframe
      ref={iframeRef}
      title="SoundCloud player"
      src={src}
      style={style}
      frameBorder="no"
      scrolling="no"
      allow="autoplay"
    />
  );
}
