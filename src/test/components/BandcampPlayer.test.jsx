import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BandcampPlayer from '../../components/players/BandcampPlayer.jsx';

const { fetchBandcampMetadata } = vi.hoisted(() => ({
  fetchBandcampMetadata: vi.fn(),
}));

vi.mock('../../utils/bandcamp.js', () => ({ fetchBandcampMetadata }));

describe('BandcampPlayer', () => {
  beforeEach(() => {
    fetchBandcampMetadata.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a loading state before the resolve call completes', () => {
    fetchBandcampMetadata.mockReturnValue(new Promise(() => {})); // never resolves
    const video = { videoId: 'https://artist.bandcamp.com/track/song' };

    render(<BandcampPlayer video={video} isPlaying={true} />);

    expect(screen.getByText(/Loading Bandcamp player/i)).toBeInTheDocument();
  });

  it('renders the embed iframe once resolved, and calls onReady with an adapter', async () => {
    fetchBandcampMetadata.mockResolvedValue({
      embedId: '1234567890',
      embedType: 'track',
      durationSeconds: 200,
    });
    const onReady = vi.fn();
    const video = { videoId: 'https://artist.bandcamp.com/track/song' };

    const { container } = render(
      <BandcampPlayer video={video} isPlaying={true} onReady={onReady} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const iframe = container.querySelector('iframe');
    expect(iframe.src).toContain('track=1234567890');

    expect(onReady).toHaveBeenCalledTimes(1);
    const adapter = onReady.mock.calls[0][0].target;
    expect(adapter.getDuration()).toBe(200);
    expect(adapter.getPlayerState()).toBe(1);
  });

  it('builds an album= embed src for an album-type resolve', async () => {
    fetchBandcampMetadata.mockResolvedValue({
      embedId: '999',
      embedType: 'album',
      durationSeconds: null,
    });
    const video = { videoId: 'https://artist.bandcamp.com/album/lp' };

    const { container } = render(
      <BandcampPlayer video={video} isPlaying={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('iframe').src).toContain('album=999');
  });

  it('uses video.embedId/durationSeconds as an optimistic first-paint value, before resolve completes', () => {
    fetchBandcampMetadata.mockReturnValue(new Promise(() => {}));
    const video = {
      videoId: 'https://artist.bandcamp.com/track/song',
      embedId: '555',
      embedType: 'track',
      durationSeconds: 150,
    };

    const { container } = render(
      <BandcampPlayer video={video} isPlaying={true} />,
    );

    expect(container.querySelector('iframe').src).toContain('track=555');
  });

  it('play/pause/seekTo are no-ops that never throw', async () => {
    fetchBandcampMetadata.mockResolvedValue({
      embedId: '1',
      embedType: 'track',
      durationSeconds: 200,
    });
    const onReady = vi.fn();
    const video = { videoId: 'https://artist.bandcamp.com/track/song' };

    render(<BandcampPlayer video={video} isPlaying={true} onReady={onReady} />);

    await act(async () => {
      await Promise.resolve();
    });

    const adapter = onReady.mock.calls[0][0].target;
    expect(() => {
      adapter.playVideo();
      adapter.pauseVideo();
      adapter.seekTo(50);
    }).not.toThrow();
  });

  it('getCurrentTime only accumulates while isPlaying is true', async () => {
    vi.useFakeTimers();
    fetchBandcampMetadata.mockResolvedValue({
      embedId: '1',
      embedType: 'track',
      durationSeconds: 200,
    });
    const onReady = vi.fn();
    const video = { videoId: 'https://artist.bandcamp.com/track/song' };

    const { rerender } = render(
      <BandcampPlayer video={video} isPlaying={true} onReady={onReady} />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    const adapter = onReady.mock.calls[0][0].target;

    act(() => {
      vi.advanceTimersByTime(10000); // 10s playing
    });
    expect(adapter.getCurrentTime()).toBeCloseTo(10, 0);

    rerender(
      <BandcampPlayer video={video} isPlaying={false} onReady={onReady} />,
    );
    act(() => {
      vi.advanceTimersByTime(10000); // 10s paused, shouldn't count
    });
    expect(adapter.getCurrentTime()).toBeCloseTo(10, 0);

    rerender(
      <BandcampPlayer video={video} isPlaying={true} onReady={onReady} />,
    );
    act(() => {
      vi.advanceTimersByTime(5000); // 5s more playing
    });
    expect(adapter.getCurrentTime()).toBeCloseTo(15, 0);
  });

  it('fires onEnd once elapsed reaches the known duration', async () => {
    vi.useFakeTimers();
    fetchBandcampMetadata.mockResolvedValue({
      embedId: '1',
      embedType: 'track',
      durationSeconds: 5,
    });
    const onEnd = vi.fn();
    const video = { videoId: 'https://artist.bandcamp.com/track/song' };

    render(<BandcampPlayer video={video} isPlaying={true} onEnd={onEnd} />);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(onEnd).toHaveBeenCalledTimes(1);

    // Further polling ticks shouldn't fire it again.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('never fires onEnd when duration is unknown', async () => {
    vi.useFakeTimers();
    fetchBandcampMetadata.mockResolvedValue({
      embedId: '1',
      embedType: 'album',
      durationSeconds: null,
    });
    const onEnd = vi.fn();
    const video = { videoId: 'https://artist.bandcamp.com/album/lp' };

    render(<BandcampPlayer video={video} isPlaying={true} onEnd={onEnd} />);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(onEnd).not.toHaveBeenCalled();
  });
});
