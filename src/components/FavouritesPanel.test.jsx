import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FavouritesPanel from './FavouritesPanel.jsx';

vi.mock('@dnd-kit/core', () => ({
    DndContext: ({ children }) => <div>{children}</div>,
    closestCenter: {},
    KeyboardSensor: function KeyboardSensor() {},
    PointerSensor: function PointerSensor() {},
    useSensor: () => ({}),
    useSensors: (...sensors) => sensors,
}));

vi.mock('@dnd-kit/sortable', () => ({
    arrayMove: (items, oldIndex, newIndex) => {
        const next = [...items];
        const [item] = next.splice(oldIndex, 1);
        next.splice(newIndex, 0, item);
        return next;
    },
    SortableContext: ({ children }) => <div>{children}</div>,
    sortableKeyboardCoordinates: () => ({}),
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: () => {},
        transform: null,
        transition: undefined,
        isDragging: false,
    }),
    verticalListSortingStrategy: {},
}));

vi.mock('@dnd-kit/utilities', () => ({
    CSS: {
        Transform: {
            toString: () => undefined,
        },
    },
}));

describe('FavouritesPanel', () => {
    const alpha = {
        videoId: 'alpha1234567',
        title: 'Alpha',
        thumbnail: 'a.jpg',
        channelTitle: 'Channel A',
    };
    const beta = {
        videoId: 'beta12345678',
        title: 'Beta',
        thumbnail: 'b.jpg',
        channelTitle: 'Channel B',
    };

    function renderPanel(overrides = {}) {
        const props = {
            supportList: [alpha, beta],
            onReorder: vi.fn(),
            onClose: vi.fn(),
            onPlayNow: vi.fn(),
            onAddToPlaylist: vi.fn(),
            onRemove: vi.fn(),
            ...overrides,
        };

        return {
            ...render(<FavouritesPanel {...props} />),
            props,
        };
    }

    it('queues a support item on double click without playing it immediately', () => {
        const { props } = renderPanel();

        fireEvent.doubleClick(screen.getByLabelText('Support Alpha'));

        expect(props.onAddToPlaylist).toHaveBeenCalledWith([alpha]);
        expect(props.onPlayNow).not.toHaveBeenCalled();
    });

    it('shows single-item context menu actions including Play Now', () => {
        const { props } = renderPanel();

        fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));
        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Play Now' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Play Now' }));
        expect(props.onPlayNow).toHaveBeenCalledWith(alpha);

        fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));
        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Add to Current Playlist' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Add to Current Playlist' }));
        expect(props.onAddToPlaylist).toHaveBeenCalledWith([alpha]);

        fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));
        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Remove Support' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Support' }));
        expect(props.onRemove).toHaveBeenCalledWith([alpha.videoId]);
    });

    it('enables selection mode with select-all and multi-item context actions', () => {
        const { props } = renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Select' }));
        expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
        fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));

        expect(screen.queryByRole('menuitem', { name: 'Play Now' })).not.toBeInTheDocument();

        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Add to Current Playlist' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Add to Current Playlist' }));
        expect(props.onAddToPlaylist).toHaveBeenCalledWith([alpha, beta]);

        fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));
        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Remove Support' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Support' }));
        expect(props.onRemove).toHaveBeenCalledWith([alpha.videoId, beta.videoId]);
    });
});
