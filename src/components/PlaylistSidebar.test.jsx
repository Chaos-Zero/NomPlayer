import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlaylistSidebar from './PlaylistSidebar.jsx';

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
            onSelect: vi.fn(),
            supportList: [],
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
});
