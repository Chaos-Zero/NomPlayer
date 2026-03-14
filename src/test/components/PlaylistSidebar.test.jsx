import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlaylistSidebar from '../../components/PlaylistSidebar.jsx';

describe('PlaylistSidebar', () => {
    const video = {
        videoId: 'alpha1234567',
        title: 'Alpha',
        thumbnail: 'a.jpg',
        channelTitle: 'Channel',
    };

    function renderSidebar(overrides = {}) {
        const props = {
            playlist: [video],
            currentIndex: 0,
            flashVideoIds: [],
            isShuffleEnabled: false,
            showOriginalOrder: false,
            onShuffle: vi.fn(),
            onToggleOrderView: vi.fn(),
            onSelect: vi.fn(),
            supportList: [],
            listenedStatusById: {},
            onToggleSupport: vi.fn(),
            onAddToSupportList: vi.fn(),
            onRemoveFromPlaylist: vi.fn(),
            ...overrides,
        };

        return {
            ...render(<PlaylistSidebar {...props} />),
            props,
        };
    }

    it('renders a support star button for playlist entries', () => {
        const { props } = renderSidebar();

        fireEvent.click(screen.getByRole('button', { name: 'Add to support list' }));

        expect(props.onToggleSupport).toHaveBeenCalledWith(video);
    });

    it('shows a context menu with support and remove actions on right click', () => {
        const { props } = renderSidebar();

        fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));

        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Support' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Support' }));
        expect(props.onAddToSupportList).toHaveBeenCalledWith(video);

        fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));
        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Remove from Playlist' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Playlist' }));
        expect(props.onRemoveFromPlaylist).toHaveBeenCalledWith(video.videoId);
    });

    it('disables the context menu support action when the song is already supported', () => {
        const video = {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: 'Channel',
        };
        renderSidebar({ supportList: [video] });

        fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));

        expect(screen.getByRole('menuitem', { name: 'Support' })).toBeDisabled();
    });

    it('applies a transient flash class separately from the active class', () => {
        renderSidebar({ currentIndex: null, flashVideoIds: ['alpha1234567'] });

        expect(screen.getByLabelText('Play Alpha')).toHaveClass('flash');
        expect(screen.getByLabelText('Play Alpha')).not.toHaveClass('active');
    });

    it('shows a numeric position for each playlist entry', () => {
        const beta = {
            videoId: 'beta12345678',
            title: 'Beta',
            thumbnail: 'b.jpg',
            channelTitle: 'Channel B',
        };
        const { container } = renderSidebar({
            playlist: [
                { ...video, loadIndex: 1 },
                { ...beta, loadIndex: 0 },
            ],
        });

        const numbers = [...container.querySelectorAll('.list-entry-number')].map(node => node.textContent);

        expect(numbers).toEqual(['2', '1']);
    });

    it('shows shuffle controls and toggles the playlist view mode', () => {
        const { container, props } = renderSidebar({
            isShuffleEnabled: true,
            playlist: [
                { ...video, loadIndex: 0 },
                { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: 'Channel B', loadIndex: 1 },
            ],
        });

        fireEvent.click(screen.getByRole('button', { name: 'Shuffle playlist' }));
        expect(props.onShuffle).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Show original order' }));
        expect(props.onToggleOrderView).toHaveBeenCalledTimes(1);

        expect(container.querySelector('.playlist-order-toggle')).toHaveClass('visible');
    });

    it('renders the shuffle toggle before the video count in the header', () => {
        const { container } = renderSidebar({ isShuffleEnabled: true });
        const headerActions = container.querySelector('.sidebar-header-actions');

        expect(headerActions?.firstElementChild).toHaveAttribute('aria-label', 'Shuffle playlist');
    });

    it('keeps the order toggle mounted but hidden while shuffle is off', () => {
        const { container } = renderSidebar();

        expect(screen.getByRole('button', { name: 'Show original order' })).toBeDisabled();
        expect(container.querySelector('.playlist-order-toggle')).not.toHaveClass('visible');
    });

    it('renders outlined and filled listened ticks beside the support star', () => {
        renderSidebar({
            playlist: [
                { ...video, loadIndex: 0 },
                { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: 'Channel B', loadIndex: 1 },
            ],
            currentIndex: null,
            listenedStatusById: {
                alpha1234567: 'partial',
                beta12345678: 'complete',
            },
        });

        expect(screen.getByLabelText('Started')).toHaveClass('partial');
        expect(screen.getByLabelText('Completed')).toHaveClass('complete');
    });
});
