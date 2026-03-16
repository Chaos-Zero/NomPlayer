import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer from '../../components/VideoPlayer.jsx';

const youtubeMockState = vi.hoisted(() => ({
  players: new Map(),
  destroyedById: new Map(),
  stateChangeHandlers: new Map(),
}));

vi.mock('react-youtube', async () => {
  const React = await import('react');

  function MockYouTube({ videoId, onReady, onStateChange, style }) {
    const player = React.useMemo(() => {
      youtubeMockState.destroyedById.set(videoId, false);
      const player = {
        playVideo: vi.fn(() => {
          if (youtubeMockState.destroyedById.get(videoId)) {
            throw new Error('stale player');
          }
        }),
        pauseVideo: vi.fn(() => {
          if (youtubeMockState.destroyedById.get(videoId)) {
            throw new Error('stale player');
          }
        }),
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

describe('VideoPlayer', () => {
  beforeEach(() => {
    youtubeMockState.players.clear();
    youtubeMockState.destroyedById.clear();
    youtubeMockState.stateChangeHandlers.clear();
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
    const onPlaybackChange = vi.fn();
    const video = { videoId: 'alpha1234567', title: 'Alpha' };

    render(
      <VideoPlayer
        video={video}
        isPlaying={false}
        onPlaybackChange={onPlaybackChange}
      />,
    );

    youtubeMockState.stateChangeHandlers.get(video.videoId)?.({ data: 1 });
    youtubeMockState.stateChangeHandlers.get(video.videoId)?.({ data: 2 });

    expect(onPlaybackChange).toHaveBeenNthCalledWith(1, true);
    expect(onPlaybackChange).toHaveBeenNthCalledWith(2, false);
  });
});
