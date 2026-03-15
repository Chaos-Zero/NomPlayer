import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer from '../../components/VideoPlayer.jsx';

const youtubeMockState = vi.hoisted(() => ({
    players: new Map(),
    destroyedById: new Map(),
}));

vi.mock('react-youtube', async () => {
    const React = await import('react');

    function MockYouTube({ videoId, onReady, style }) {
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
            onReady?.({ target: player });

            return () => {
                youtubeMockState.destroyedById.set(videoId, true);
            };
        }, [onReady, player, videoId]);

        return <div data-testid={`youtube-${videoId}`} style={style} />;
    }

    return { default: MockYouTube };
});

describe('VideoPlayer', () => {
    beforeEach(() => {
        youtubeMockState.players.clear();
        youtubeMockState.destroyedById.clear();
    });

    it('controls the current player when playback toggles', () => {
        const video = { videoId: 'alpha1234567', title: 'Alpha' };
        const { rerender } = render(
            <VideoPlayer video={video} isPlaying={false} />
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
            <VideoPlayer video={firstVideo} isPlaying={true} />
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

        expect(screen.getByRole('link', { name: 'https://www.youtube.com/watch?v=alpha1234567' }))
            .toHaveAttribute('href', 'https://www.youtube.com/watch?v=alpha1234567');
    });

    it('shows the overlay toggle enabled by default and disables the hover overlay when clicked', () => {
        const video = { videoId: 'alpha1234567', title: 'Alpha' };
        const { container } = render(<VideoPlayer video={video} isPlaying={true} />);

        const toggle = screen.getByRole('button', { name: 'Disable player overlay' });
        const overlay = container.querySelector('.player-overlay');

        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(overlay).toHaveClass('enabled');

        fireEvent.click(toggle);

        expect(screen.getByRole('button', { name: 'Enable player overlay' })).toHaveAttribute('aria-pressed', 'false');
        expect(overlay).toHaveClass('disabled');
    });

    it('renders overlay controls that call the provided playback and list handlers', () => {
        const video = { videoId: 'alpha1234567', title: 'Alpha' };
        const onPrev = vi.fn();
        const onNext = vi.fn();
        const onTogglePlay = vi.fn();
        const onShuffle = vi.fn();
        const onTogglePreview = vi.fn();
        const onToggleSupport = vi.fn();

        render(
            <VideoPlayer
                video={video}
                isPlaying={true}
                onPrev={onPrev}
                onNext={onNext}
                onTogglePlay={onTogglePlay}
                isShuffleEnabled={true}
                onShuffle={onShuffle}
                isPreviewModeEnabled={true}
                onTogglePreview={onTogglePreview}
                onToggleSupport={onToggleSupport}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Previous video' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next video' }));
        fireEvent.click(screen.getByRole('button', { name: 'Shuffle playlist' }));
        fireEvent.click(screen.getByRole('button', { name: 'Preview mode' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add to support list' }));

        expect(onPrev).toHaveBeenCalledTimes(1);
        expect(onTogglePlay).toHaveBeenCalledTimes(1);
        expect(onNext).toHaveBeenCalledTimes(1);
        expect(onShuffle).toHaveBeenCalledTimes(1);
        expect(onTogglePreview).toHaveBeenCalledTimes(1);
        expect(onToggleSupport).toHaveBeenCalledWith(video);
    });

    it('shows nomination state on the overlay support button and disables changes', () => {
        const video = { videoId: 'alpha1234567', title: 'Alpha' };

        render(
            <VideoPlayer
                video={video}
                isPlaying={false}
                isNominated={true}
                onToggleSupport={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', { name: 'Nomination tracks cannot be changed from the player' })
        ).toBeDisabled();
    });
});
