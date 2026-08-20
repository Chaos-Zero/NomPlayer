import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer from '../../components/VideoPlayer.jsx';

const youtubeMockState = vi.hoisted(() => ({
  players: new Map(),
  destroyedById: new Map(),
  stateChangeHandlers: new Map(),
  playerStates: new Map(),
}));

vi.mock('react-youtube', async () => {
  const React = await import('react');

  function MockYouTube({ videoId, onReady, onStateChange, style }) {
    const player = React.useMemo(() => {
      youtubeMockState.destroyedById.set(videoId, false);
      youtubeMockState.playerStates.set(videoId, -1);
      const player = {
        playVideo: vi.fn(() => {
          if (youtubeMockState.destroyedById.get(videoId)) {
            throw new Error('stale player');
          }
          youtubeMockState.playerStates.set(videoId, 1);
        }),
        pauseVideo: vi.fn(() => {
          if (youtubeMockState.destroyedById.get(videoId)) {
            throw new Error('stale player');
          }
          youtubeMockState.playerStates.set(videoId, 2);
        }),
        getPlayerState: vi.fn(() => youtubeMockState.playerStates.get(videoId)),
      };

      youtubeMockState.players.set(videoId, player);
      return player;
    }, [videoId]);

    React.useEffect(() => {
      youtubeMockState.destroyedById.set(videoId, false);
      youtubeMockState.stateChangeHandlers.set(videoId, onStateChange);
      onReady?.({ target: player });

      return () => {
        youtubeMockState.destroyedById.set(videoId, true);
        youtubeMockState.stateChangeHandlers.delete(videoId);
      };
    }, [onReady, onStateChange, player, videoId]);

    return <div data-testid={`youtube-${videoId}`} style={style} />;
  }

  return { default: MockYouTube };
});

const soundCloudMockCalls = vi.hoisted(() => []);
vi.mock('../../components/players/SoundCloudPlayer.jsx', () => ({
  default: (props) => {
    soundCloudMockCalls.push(props);
    return <div data-testid={`soundcloud-${props.video.videoId}`} />;
  },
}));

const bandcampMockCalls = vi.hoisted(() => []);
vi.mock('../../components/players/BandcampPlayer.jsx', () => ({
  default: (props) => {
    bandcampMockCalls.push(props);
    return <div data-testid={`bandcamp-${props.video.videoId}`} />;
  },
}));

describe('VideoPlayer', () => {
  const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState',
  );
  let hasFocusMock;

  beforeEach(() => {
    youtubeMockState.players.clear();
    youtubeMockState.destroyedById.clear();
    youtubeMockState.stateChangeHandlers.clear();
    youtubeMockState.playerStates.clear();
    soundCloudMockCalls.length = 0;
    bandcampMockCalls.length = 0;
    hasFocusMock = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    hasFocusMock?.mockRestore();

    if (originalVisibilityStateDescriptor) {
      Object.defineProperty(
        document,
        'visibilityState',
        originalVisibilityStateDescriptor,
      );
    } else {
      delete document.visibilityState;
    }
  });

  it('controls the current player when playback toggles', () => {
    const video = { videoId: 'alpha1234567', title: 'Alpha' };
    const { rerender } = render(
      <VideoPlayer video={video} isPlaying={false} />,
    );
    const player = youtubeMockState.players.get(video.videoId);

    player.playVideo.mockClear();
    player.pauseVideo.mockClear();

    rerender(<VideoPlayer video={video} isPlaying={true} />);
    expect(player.playVideo).toHaveBeenCalled();

    rerender(<VideoPlayer video={video} isPlaying={false} />);
    expect(player.pauseVideo).toHaveBeenCalled();
  });

  it('does not call pause on the old player when swapping videos during playback', () => {
    const firstVideo = { videoId: 'alpha1234567', title: 'Alpha' };
    const secondVideo = { videoId: 'beta12345678', title: 'Beta' };
    const { rerender } = render(
      <VideoPlayer video={firstVideo} isPlaying={true} />,
    );
    const firstPlayer = youtubeMockState.players.get(firstVideo.videoId);

    firstPlayer.playVideo.mockClear();
    firstPlayer.pauseVideo.mockClear();

    rerender(<VideoPlayer video={secondVideo} isPlaying={false} />);

    expect(firstPlayer.pauseVideo).not.toHaveBeenCalled();
  });

  it('shows a YouTube hyperlink below the now playing title', () => {
    const video = { videoId: 'alpha1234567', title: 'Alpha' };

    render(<VideoPlayer video={video} isPlaying={true} />);

    expect(
      screen.getByRole('link', {
        name: 'https://www.youtube.com/watch?v=alpha1234567',
      }),
    ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=alpha1234567');
  });

  it('does not render the player overlay or toggle by default', () => {
    const video = { videoId: 'alpha1234567', title: 'Alpha' };
    const { container } = render(
      <VideoPlayer video={video} isPlaying={true} />,
    );

    expect(container.querySelector('.player-overlay')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /player overlay/i }),
    ).not.toBeInTheDocument();
  });

  it('reports direct YouTube play and pause state changes', () => {
    vi.useFakeTimers();

    const onPlaybackChange = vi.fn();
    const video = { videoId: 'alpha1234567', title: 'Alpha' };

    render(
      <VideoPlayer
        video={video}
        isPlaying={false}
        onPlaybackChange={onPlaybackChange}
      />,
    );

    youtubeMockState.playerStates.set(video.videoId, 1);
    youtubeMockState.stateChangeHandlers.get(video.videoId)?.({ data: 1 });
    youtubeMockState.playerStates.set(video.videoId, 2);
    youtubeMockState.stateChangeHandlers.get(video.videoId)?.({ data: 2 });

    act(() => {
      vi.advanceTimersByTime(181);
    });

    expect(onPlaybackChange).toHaveBeenNthCalledWith(1, true);
    expect(onPlaybackChange).toHaveBeenNthCalledWith(2, false);
  });

  it('ignores a transient pause event right after the page becomes visible again', () => {
    vi.useFakeTimers();

    let visibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });

    const onPlaybackChange = vi.fn();
    const video = { videoId: 'alpha1234567', title: 'Alpha' };

    render(
      <VideoPlayer
        video={video}
        isPlaying={true}
        onPlaybackChange={onPlaybackChange}
      />,
    );

    onPlaybackChange.mockClear();

    act(() => {
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    youtubeMockState.playerStates.set(video.videoId, 2);
    youtubeMockState.stateChangeHandlers.get(video.videoId)?.({ data: 2 });

    expect(onPlaybackChange).not.toHaveBeenCalledWith(false);

    act(() => {
      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    youtubeMockState.stateChangeHandlers.get(video.videoId)?.({ data: 1 });
    youtubeMockState.playerStates.set(video.videoId, 2);
    youtubeMockState.stateChangeHandlers.get(video.videoId)?.({ data: 2 });

    expect(onPlaybackChange).toHaveBeenCalledWith(true);
    expect(onPlaybackChange).not.toHaveBeenCalledWith(false);

    act(() => {
      vi.advanceTimersByTime(2501);
    });

    youtubeMockState.playerStates.set(video.videoId, 2);
    youtubeMockState.stateChangeHandlers.get(video.videoId)?.({ data: 2 });

    act(() => {
      vi.advanceTimersByTime(181);
    });

    expect(onPlaybackChange).toHaveBeenCalledWith(false);
  });

  it('nudges playVideo() again when the player silently stalls while the tab is hidden', () => {
    vi.useFakeTimers();

    let visibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });

    const video = { videoId: 'alpha1234567', title: 'Alpha' };

    render(<VideoPlayer video={video} isPlaying={true} />);

    const player = youtubeMockState.players.get(video.videoId);
    player.getCurrentTime = vi.fn(() => 60);
    player.getDuration = vi.fn(() => 240);
    player.playVideo.mockClear();

    act(() => {
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Simulate the YouTube IFrame API's known quirk of silently auto-pausing
    // an embedded player while its containing tab is backgrounded - without
    // a real pause event ever coming through.
    youtubeMockState.playerStates.set(video.videoId, 2);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(player.playVideo).toHaveBeenCalled();
  });

  it('does not call playVideo() from the polling interval while genuinely paused', () => {
    vi.useFakeTimers();

    const video = { videoId: 'alpha1234567', title: 'Alpha' };
    const { rerender } = render(<VideoPlayer video={video} isPlaying={true} />);

    const player = youtubeMockState.players.get(video.videoId);
    player.getCurrentTime = vi.fn(() => 60);
    player.getDuration = vi.fn(() => 240);

    rerender(<VideoPlayer video={video} isPlaying={false} />);
    player.playVideo.mockClear();
    youtubeMockState.playerStates.set(video.videoId, 2);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it('restores the playback state on visible when it fell false during the hidden cycle', () => {
    vi.useFakeTimers();

    let visibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });

    const onPlaybackChange = vi.fn();
    const video = { videoId: 'alpha1234567', title: 'Alpha' };

    const { rerender } = render(
      <VideoPlayer
        video={video}
        isPlaying={true}
        onPlaybackChange={onPlaybackChange}
      />,
    );

    onPlaybackChange.mockClear();

    act(() => {
      hasFocusMock.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    rerender(
      <VideoPlayer
        video={video}
        isPlaying={false}
        onPlaybackChange={onPlaybackChange}
      />,
    );

    act(() => {
      hasFocusMock.mockReturnValue(true);
      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onPlaybackChange).toHaveBeenCalledWith(true);
  });

  it('seeks back to the last known position if a resume reports a reset time', () => {
    vi.useFakeTimers();

    let visibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });

    const onPlaybackChange = vi.fn();
    const onProgressUpdate = vi.fn();
    const video = { videoId: 'alpha1234567', title: 'Alpha' };

    render(
      <VideoPlayer
        video={video}
        isPlaying={true}
        onPlaybackChange={onPlaybackChange}
        onProgressUpdate={onProgressUpdate}
      />,
    );

    const player = youtubeMockState.players.get(video.videoId);
    let mockCurrentTime = 120;
    player.getCurrentTime = vi.fn(() => mockCurrentTime);
    player.getDuration = vi.fn(() => 240);
    player.seekTo = vi.fn((time) => {
      mockCurrentTime = time;
    });

    // Let the progress-polling interval record a real position before we go
    // into the background.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onProgressUpdate).toHaveBeenCalledWith({
      currentTime: 120,
      duration: 240,
    });

    act(() => {
      hasFocusMock.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Simulate the browser having silently reset the player's position
    // while it was backgrounded (the bug this guards against).
    mockCurrentTime = 0;

    act(() => {
      hasFocusMock.mockReturnValue(true);
      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(player.seekTo).toHaveBeenCalledWith(120, true);
  });

  it('does not seek on a normal resume that kept its position', () => {
    vi.useFakeTimers();

    let visibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });

    const onPlaybackChange = vi.fn();
    const video = { videoId: 'alpha1234567', title: 'Alpha' };

    render(
      <VideoPlayer
        video={video}
        isPlaying={true}
        onPlaybackChange={onPlaybackChange}
      />,
    );

    const player = youtubeMockState.players.get(video.videoId);
    const mockCurrentTime = 120;
    player.getCurrentTime = vi.fn(() => mockCurrentTime);
    player.getDuration = vi.fn(() => 240);
    player.seekTo = vi.fn();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    act(() => {
      hasFocusMock.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      hasFocusMock.mockReturnValue(true);
      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(player.seekTo).not.toHaveBeenCalled();
  });

  describe('provider dispatch', () => {
    it('renders SoundCloudPlayer for a soundcloud track, passing video and isPlaying through', () => {
      const video = {
        videoId: 'https://soundcloud.com/artist/track',
        provider: 'soundcloud',
        title: 'Track',
      };

      render(<VideoPlayer video={video} isPlaying={true} />);

      expect(
        screen.getByTestId('soundcloud-https://soundcloud.com/artist/track'),
      ).toBeInTheDocument();
      expect(soundCloudMockCalls).toHaveLength(1);
      expect(soundCloudMockCalls[0]).toMatchObject({ video, isPlaying: true });
    });

    it('renders BandcampPlayer for a bandcamp track, passing video and isPlaying through', () => {
      const video = {
        videoId: 'https://artist.bandcamp.com/track/song',
        provider: 'bandcamp',
        title: 'Song',
      };

      render(<VideoPlayer video={video} isPlaying={false} />);

      expect(
        screen.getByTestId('bandcamp-https://artist.bandcamp.com/track/song'),
      ).toBeInTheDocument();
      expect(bandcampMockCalls).toHaveLength(1);
      expect(bandcampMockCalls[0]).toMatchObject({ video, isPlaying: false });
    });

    it('falls back to the YouTube embed for an unrecognized/missing provider', () => {
      const video = { videoId: 'alpha1234567', provider: 'spotify' };

      render(<VideoPlayer video={video} isPlaying={true} />);

      expect(screen.getByTestId('youtube-alpha1234567')).toBeInTheDocument();
      expect(soundCloudMockCalls).toHaveLength(0);
      expect(bandcampMockCalls).toHaveLength(0);
    });

    it('links directly to the canonical URL for a non-YouTube "now playing" track, not a youtube.com URL', () => {
      const video = {
        videoId: 'https://artist.bandcamp.com/track/song',
        provider: 'bandcamp',
        title: 'Song',
      };

      render(<VideoPlayer video={video} isPlaying={true} />);

      expect(
        screen.getByRole('link', {
          name: 'https://artist.bandcamp.com/track/song',
        }),
      ).toHaveAttribute('href', 'https://artist.bandcamp.com/track/song');
    });
  });
});
