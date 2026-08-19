import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FavouritesPanel from '../../components/FavouritesPanel.jsx';
import {
  fetchPlaylistItems,
  parseYouTubeInput,
  singleVideoEntry,
} from '../../utils/youtube.js';

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

vi.mock('../../utils/youtube.js', () => ({
  parseYouTubeInput: vi.fn(),
  fetchPlaylistItems: vi.fn(),
  singleVideoEntry: vi.fn(),
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
      onAddDirectItems: vi.fn(() => 1),
      ...overrides,
    };

    return {
      ...render(<FavouritesPanel {...props} />),
      props,
    };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays a support item on double click immediately', () => {
    const { props } = renderPanel();

    fireEvent.doubleClick(screen.getByLabelText('Support Alpha'));

    expect(props.onPlayNow).toHaveBeenCalledWith(alpha);
    expect(props.onAddToPlaylist).not.toHaveBeenCalled();
  });

  it('loads a direct video into the support list from the footer adder', async () => {
    const loadedVideo = {
      videoId: 'gamma1234567',
      title: 'Gamma',
      thumbnail: 'g.jpg',
      channelTitle: 'Channel G',
    };
    parseYouTubeInput.mockReturnValue({
      type: 'video',
      videoId: loadedVideo.videoId,
    });
    singleVideoEntry.mockResolvedValue(loadedVideo);

    const { props } = renderPanel({
      supportList: [],
      addButtonLabel: 'Add Supports',
      onAddDirectItems: vi.fn(() => 1),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Supports' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: loadedVideo.videoId },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(props.onAddDirectItems).toHaveBeenCalledWith([
        { ...loadedVideo, provider: 'youtube' },
      ]);
    });
  });

  it('shows a nomination-collision toast for blocked single support links', async () => {
    const loadedVideo = {
      videoId: 'gamma1234567',
      title: 'Gamma',
      thumbnail: 'g.jpg',
      channelTitle: 'Channel G',
    };
    parseYouTubeInput.mockReturnValue({
      type: 'video',
      videoId: loadedVideo.videoId,
    });
    singleVideoEntry.mockResolvedValue(loadedVideo);

    renderPanel({
      supportList: [],
      addButtonLabel: 'Add Supports',
      onAddDirectItems: vi.fn(() => ({
        addedCount: 0,
        blockedNominationCount: 1,
      })),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Supports' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: loadedVideo.videoId },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(
        screen.getByText('You have already added this link as a Nomination'),
      ).toBeInTheDocument();
    });
  });

  it('shows a nomination-collision toast for blocked support playlists', async () => {
    const playlistItems = [
      {
        videoId: 'gamma1234567',
        title: 'Gamma',
        thumbnail: 'g.jpg',
        channelTitle: 'Channel G',
      },
      {
        videoId: 'delta1234567',
        title: 'Delta',
        thumbnail: 'd.jpg',
        channelTitle: 'Channel D',
      },
    ];
    parseYouTubeInput.mockReturnValue({
      type: 'playlist',
      playlistId: 'PL123',
    });
    fetchPlaylistItems.mockResolvedValue(playlistItems);

    renderPanel({
      supportList: [],
      addButtonLabel: 'Add Supports',
      onAddDirectItems: vi.fn(() => ({
        addedCount: 1,
        blockedNominationCount: 1,
      })),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Supports' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'PL123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Some songs in this playlist have already been added as Nominations',
        ),
      ).toBeInTheDocument();
    });
  });

  it('renders nomination-specific footer copy', () => {
    renderPanel({
      title: 'Nominations',
      tone: 'nomination',
      addButtonLabel: 'Add Nominations',
    });

    expect(
      screen.getByRole('button', { name: 'Add Nominations' }),
    ).toBeInTheDocument();
  });

  it('shows single-item context menu actions including Play Now', () => {
    const { props } = renderPanel();

    fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Play Now' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Play Now' }));
    expect(props.onPlayNow).toHaveBeenCalledWith(alpha);

    fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));
    fireEvent.pointerDown(
      screen.getByRole('menuitem', { name: 'Add to My Queue' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to My Queue' }));
    expect(props.onAddToPlaylist).toHaveBeenCalledWith([alpha]);
    expect(
      screen.getByText('Added 1 song to current playlist'),
    ).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));
    fireEvent.pointerDown(
      screen.getByRole('menuitem', { name: 'Remove Support' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Support' }));
    expect(props.onRemove).toHaveBeenCalledWith([alpha.videoId]);
  });

  it('enables selection mode with select-all, visible action buttons, and multi-item context actions', () => {
    const { props } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(
      screen.getByRole('button', { name: 'Select all' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add to My Queue' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove Support' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to My Queue' }));
    expect(props.onAddToPlaylist).toHaveBeenCalledWith([alpha, beta]);
    expect(
      screen.getByText('Added 2 songs to current playlist'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Support' }));
    expect(props.onRemove).toHaveBeenCalledWith([alpha.videoId, beta.videoId]);

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));

    expect(
      screen.queryByRole('menuitem', { name: 'Play Now' }),
    ).not.toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getByRole('menuitem', { name: 'Add to My Queue' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to My Queue' }));
    expect(props.onAddToPlaylist).toHaveBeenLastCalledWith([alpha, beta]);

    fireEvent.contextMenu(screen.getByLabelText('Support Alpha'));
    fireEvent.pointerDown(
      screen.getByRole('menuitem', { name: 'Remove Support' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Support' }));
    expect(props.onRemove).toHaveBeenLastCalledWith([
      alpha.videoId,
      beta.videoId,
    ]);
  });

  it('adds selected tracks in the order shown on screen (rating-sorted), not the underlying supportList order', () => {
    const alphaLowRating = { ...alpha, rating: 2 }; // 1st in the raw supportList array, lowest rating
    const betaHighRating = { ...beta, rating: 9 }; // 2nd in the array, but sorts to the top

    const { props } = renderPanel({
      supportList: [alphaLowRating, betaHighRating],
    });

    // Sorting first, same as a real user would - clicking "Order by rating"
    // while selection mode is already on turns selection mode back off
    // (see its onClick), so this only works sort-then-select, not the
    // other way round.
    fireEvent.click(screen.getByRole('button', { name: 'Order by rating' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to My Queue' }));

    // Beta is shown first once rating-sorted, even though it's 2nd in the
    // raw supportList array - the add order has to follow the screen, not
    // the array.
    expect(props.onAddToPlaylist).toHaveBeenCalledWith([
      betaHighRating,
      alphaLowRating,
    ]);
  });

  it('shows numeric positions for support-list entries', () => {
    const { container } = renderPanel();

    const numbers = [...container.querySelectorAll('.list-entry-number')].map(
      (node) => node.textContent,
    );

    expect(numbers).toEqual(['1', '2']);
  });

  it('resets selection mode when the panel closes, so it doesn\'t reopen still showing "Done"', () => {
    const { rerender, props } = renderPanel({ isOpen: true });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('active');

    rerender(<FavouritesPanel {...props} isOpen={false} />);
    rerender(<FavouritesPanel {...props} isOpen={true} />);

    expect(screen.getByRole('button', { name: 'Select' })).not.toHaveClass(
      'active',
    );
    expect(
      screen.queryByRole('button', { name: 'Select all' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the panel mounted while closing and notifies when the exit animation completes', () => {
    vi.useFakeTimers();

    const onExited = vi.fn();
    const { rerender } = render(
      <FavouritesPanel
        supportList={[alpha, beta]}
        onReorder={vi.fn()}
        onClose={vi.fn()}
        onPlayNow={vi.fn()}
        onAddToPlaylist={vi.fn()}
        onRemove={vi.fn()}
        isOpen={true}
        onExited={onExited}
      />,
    );

    rerender(
      <FavouritesPanel
        supportList={[alpha, beta]}
        onReorder={vi.fn()}
        onClose={vi.fn()}
        onPlayNow={vi.fn()}
        onAddToPlaylist={vi.fn()}
        onRemove={vi.fn()}
        isOpen={false}
        onExited={onExited}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Support list' })).toHaveClass(
      'closing',
    );

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(onExited).toHaveBeenCalledTimes(1);
  });
});
