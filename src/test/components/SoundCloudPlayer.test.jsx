import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SoundCloudPlayer from '../../components/players/SoundCloudPlayer.jsx';

// loadWidgetApi()'s already-loaded fast path is still a Promise.resolve().then()
// chain (widgetApi -> component's own .then()), so rendering doesn't
// synchronously bind widget events — flush a couple of microtask ticks first.
async function flushWidgetReady() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function installFakeWidgetApi() {
  const handlers = {};
  const widget = {
    bind: vi.fn((event, cb) => {
      handlers[event] = cb;
    }),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getDuration: vi.fn((cb) => cb(180000)),
  };
  const Widget = vi.fn(() => widget);
  Widget.Events = {
    READY: 'ready',
    PLAY: 'play',
    PAUSE: 'pause',
    FINISH: 'finish',
    PLAY_PROGRESS: 'play-progress',
  };
  window.SC = { Widget };
  return { widget, handlers, Widget };
}

describe('SoundCloudPlayer', () => {
  afterEach(() => {
    delete window.SC;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds an iframe src with the encoded permalink and auto_play', () => {
    installFakeWidgetApi();
    const video = { videoId: 'https://soundcloud.com/artist/track' };

    const { container } = render(
      <SoundCloudPlayer video={video} isPlaying={true} />,
    );

    const iframe = container.querySelector('iframe');
    expect(iframe.src).toContain(
      encodeURIComponent('https://soundcloud.com/artist/track'),
    );
    expect(iframe.src).toContain('auto_play=true');
  });

  it('calls onReady with a synchronous-looking adapter once the widget is ready', async () => {
    const { handlers } = installFakeWidgetApi();
    const onReady = vi.fn();
    const video = { videoId: 'https://soundcloud.com/artist/track' };

    render(
      <SoundCloudPlayer video={video} isPlaying={false} onReady={onReady} />,
    );

    await flushWidgetReady();
    handlers.ready();

    expect(onReady).toHaveBeenCalledTimes(1);
    const adapter = onReady.mock.calls[0][0].target;
    expect(adapter.getDuration()).toBe(180); // 180000ms -> 180s
    expect(adapter.getCurrentTime()).toBe(0);
    expect(typeof adapter.playVideo).toBe('function');
    expect(typeof adapter.pauseVideo).toBe('function');
    expect(typeof adapter.seekTo).toBe('function');
  });

  it('maps PLAY/PAUSE/FINISH events to onStateChange/onEnd', async () => {
    const { handlers } = installFakeWidgetApi();
    const onStateChange = vi.fn();
    const onEnd = vi.fn();
    const video = { videoId: 'https://soundcloud.com/artist/track' };

    render(
      <SoundCloudPlayer
        video={video}
        isPlaying={false}
        onStateChange={onStateChange}
        onEnd={onEnd}
      />,
    );

    await flushWidgetReady();
    handlers.ready();

    handlers.play();
    expect(onStateChange).toHaveBeenCalledWith({ data: 1 });

    handlers.pause();
    expect(onStateChange).toHaveBeenCalledWith({ data: 2 });

    handlers.finish();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('updates getCurrentTime() from PLAY_PROGRESS events', async () => {
    const { handlers } = installFakeWidgetApi();
    const onReady = vi.fn();
    const video = { videoId: 'https://soundcloud.com/artist/track' };

    render(
      <SoundCloudPlayer video={video} isPlaying={false} onReady={onReady} />,
    );

    await flushWidgetReady();
    handlers.ready();

    const adapter = onReady.mock.calls[0][0].target;
    handlers['play-progress']({ currentPosition: 45500 });

    expect(adapter.getCurrentTime()).toBeCloseTo(45.5);
  });

  it("adapter's playVideo/pauseVideo/seekTo call through to the widget", async () => {
    const { handlers, widget } = installFakeWidgetApi();
    const onReady = vi.fn();
    const video = { videoId: 'https://soundcloud.com/artist/track' };

    render(
      <SoundCloudPlayer video={video} isPlaying={false} onReady={onReady} />,
    );

    await flushWidgetReady();
    handlers.ready();

    const adapter = onReady.mock.calls[0][0].target;
    adapter.playVideo();
    adapter.pauseVideo();
    adapter.seekTo(12.5);

    expect(widget.play).toHaveBeenCalled();
    expect(widget.pause).toHaveBeenCalled();
    expect(widget.seekTo).toHaveBeenCalledWith(12500);
  });
});
