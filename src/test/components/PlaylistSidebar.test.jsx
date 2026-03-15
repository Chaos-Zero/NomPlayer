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
            isPreviewModeEnabled: false,
            isCollapsed: false,
            showOriginalOrder: false,
            onShuffle: vi.fn(),
            onTogglePreview: vi.fn(),
            onToggleCollapse: vi.fn(),
            onToggleOrderView: vi.fn(),
            onSelect: vi.fn(),
            supportList: [],
            nominationList: [],
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

    it('adds playlist stars to the support list', () => {
        const { props } = renderSidebar();

        fireEvent.click(screen.getByRole('button', { name: 'Add to support list' }));

        expect(props.onToggleSupport).toHaveBeenCalledWith(video);
    });

    it('removes support tracks when their playlist star is clicked again', () => {
        const { props } = renderSidebar({ supportList: [{ ...video }] });

        fireEvent.click(screen.getByRole('button', { name: 'Remove from support list' }));

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

    it('locks nomination tracks from the playlist star and support menu action', () => {
        renderSidebar({ nominationList: [{ ...video }] });

        expect(
            screen.getByRole('button', { name: 'Nomination tracks cannot be changed from the playlist' })
        ).toBeDisabled();

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

    it('shows shuffle and preview controls and toggles the playlist view mode', () => {
        const { container, props } = renderSidebar({
            isShuffleEnabled: true,
            isPreviewModeEnabled: true,
            playlist: [
                { ...video, loadIndex: 0 },
                { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: 'Channel B', loadIndex: 1 },
            ],
        });

        fireEvent.click(screen.getByRole('button', { name: 'Shuffle playlist' }));
        expect(props.onShuffle).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Preview mode' }));
        expect(props.onTogglePreview).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Show original order' }));
        expect(props.onToggleOrderView).toHaveBeenCalledTimes(1);

        expect(container.querySelector('.playlist-order-toggle')).toHaveClass('visible');
        expect(screen.getByLabelText('Preview mode active')).toBeInTheDocument();
    });

    it('renders the shuffle and preview toggles before the video count in the header', () => {
        const { container } = renderSidebar({ isShuffleEnabled: true });
        const headerActions = container.querySelector('.sidebar-header-actions');

        expect(headerActions?.firstElementChild).toHaveAttribute('aria-label', 'Shuffle playlist');
        expect(headerActions?.children[1]).toHaveAttribute('aria-label', 'Preview mode');
        expect(headerActions?.lastElementChild).toHaveTextContent('1 videos');
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

    it('shows nomination stars in purple and support stars in gold', () => {
        renderSidebar({
            playlist: [
                { ...video, loadIndex: 0 },
                { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: 'Channel B', loadIndex: 1 },
            ],
            currentIndex: null,
            supportList: [{ videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: 'Channel B' }],
            nominationList: [{ ...video }],
        });

        expect(
            screen.getByRole('button', { name: 'Nomination tracks cannot be changed from the playlist' })
        ).toHaveClass('nominated');
        expect(screen.getByRole('button', { name: 'Remove from support list' })).toHaveClass('supported');
    });

    it('collapses to a flat side tab with only the expand toggle visible', () => {
        const { container, props } = renderSidebar({ isCollapsed: true });

        expect(container.querySelector('.playlist-sidebar')).toHaveClass('collapsed');
        expect(container.querySelector('.playlist-collapse-tab')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Expand playlist' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Shuffle playlist' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Play Alpha')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
        expect(props.onToggleCollapse).toHaveBeenCalledTimes(1);
    });
});
