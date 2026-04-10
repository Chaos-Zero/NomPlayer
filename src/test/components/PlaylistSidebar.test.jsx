import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaylistSidebar from '../../components/PlaylistSidebar.jsx';

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

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
      onReorder: vi.fn(),
      supportList: [],
      nominationList: [],
      listenedStatusById: {},
      onToggleSupport: vi.fn(),
      onAddToSupportList: vi.fn(),
      onRemoveFromPlaylist: vi.fn(),
      onOpenSupportDropdown: vi.fn(),
      onAddDirectItems: vi.fn(() => 1),
      retiredVideoIds: new Set(),
      ...overrides,
    };

    return {
      ...render(<PlaylistSidebar {...props} />),
      props,
    };
  }

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      delete window.matchMedia;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds playlist stars to the support list', () => {
    const { props } = renderSidebar();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add to support list' }),
    );

    expect(props.onToggleSupport).toHaveBeenCalledWith(video);
  });

  it('opens the support dropdown when the playlist star is clicked on a supported item', () => {
    const { props } = renderSidebar({ supportList: [{ ...video }] });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove from support list' }),
    );

    expect(props.onOpenSupportDropdown).toHaveBeenCalled();
  });

  it('shows a context menu with support and remove actions on right click', () => {
    const { props } = renderSidebar();

    fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));

    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Support' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support' }));
    expect(props.onToggleSupport).toHaveBeenCalledWith(video, 1);

    fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));
    fireEvent.pointerDown(
      screen.getByRole('menuitem', { name: 'Remove from Playlist' }),
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Remove from Playlist' }),
    );
    expect(props.onRemoveFromPlaylist).toHaveBeenCalledWith(video.videoId);
  });

  it('shows tiered support options in the context menu when the song is already supported', () => {
    const video = {
      videoId: 'alpha1234567',
      title: 'Alpha',
      thumbnail: 'a.jpg',
      channelTitle: 'Channel',
    };
    renderSidebar({ supportList: [video] });

    fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));

    expect(
      screen.queryByRole('menuitem', { name: 'Support' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Set Possible Support/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Set Likely Support/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Set Definite Support/ }),
    ).toBeInTheDocument();
  });

  it('locks nomination tracks from the playlist star and support menu action', () => {
    renderSidebar({ nominationList: [{ ...video }] });

    expect(
      screen.getByRole('button', {
        name: 'Nomination tracks cannot be changed from the playlist',
      }),
    ).toBeDisabled();

    fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));

    expect(
      screen.queryByRole('menuitem', { name: 'Support' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Set Possible Support/ }),
    ).not.toBeInTheDocument();
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

    const numbers = [...container.querySelectorAll('.list-entry-number')].map(
      (node) => node.textContent,
    );

    expect(numbers).toEqual(['2', '1']);
  });

  it('toggles the playlist view mode when shuffle is active', () => {
    const { container, props } = renderSidebar({
      isShuffleEnabled: true,
      playlist: [
        { ...video, loadIndex: 0 },
        {
          videoId: 'beta12345678',
          title: 'Beta',
          thumbnail: 'b.jpg',
          channelTitle: 'Channel B',
          loadIndex: 1,
        },
      ],
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Show original order' }),
    );
    expect(props.onToggleOrderView).toHaveBeenCalledTimes(1);

    expect(container.querySelector('.playlist-order-toggle')).toHaveClass(
      'visible',
    );
  });

  it('renders the video count beside the title with a desktop select button', () => {
    const { container } = renderSidebar({ isShuffleEnabled: true });
    const headerMain = container.querySelector('.sidebar-header-main');
    const headerActions = container.querySelector('.sidebar-header-actions');

    expect(headerMain).toHaveTextContent('Playlist');
    expect(headerMain).toHaveTextContent('1 video');
    expect(headerActions?.children).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  });

  it('shows shuffle and preview controls in the mobile playlist header', () => {
    mockMatchMedia(true);
    const { props } = renderSidebar({
      isShuffleEnabled: true,
      isPreviewModeEnabled: true,
      playlist: [
        { ...video, loadIndex: 0 },
        {
          videoId: 'beta12345678',
          title: 'Beta',
          thumbnail: 'b.jpg',
          channelTitle: 'Channel B',
          loadIndex: 1,
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle playlist' }));
    expect(props.onShuffle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Preview mode' }));
    expect(props.onTogglePreview).toHaveBeenCalledTimes(1);
  });

  it('keeps the order toggle mounted but hidden while shuffle is off', () => {
    const { container } = renderSidebar();

    expect(
      screen.getByRole('button', { name: 'Show original order' }),
    ).toBeDisabled();
    expect(container.querySelector('.playlist-order-toggle')).not.toHaveClass(
      'visible',
    );
  });

  it('renders outlined and filled listened ticks beside the support star', () => {
    renderSidebar({
      playlist: [
        { ...video, loadIndex: 0 },
        {
          videoId: 'beta12345678',
          title: 'Beta',
          thumbnail: 'b.jpg',
          channelTitle: 'Channel B',
          loadIndex: 1,
        },
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
        {
          videoId: 'beta12345678',
          title: 'Beta',
          thumbnail: 'b.jpg',
          channelTitle: 'Channel B',
          loadIndex: 1,
        },
      ],
      currentIndex: null,
      supportList: [
        {
          videoId: 'beta12345678',
          title: 'Beta',
          thumbnail: 'b.jpg',
          channelTitle: 'Channel B',
        },
      ],
      nominationList: [{ ...video }],
    });

    expect(
      screen.getByRole('button', {
        name: 'Nomination tracks cannot be changed from the playlist',
      }),
    ).toHaveClass('nominated');
    expect(
      screen.getByRole('button', { name: 'Remove from support list' }),
    ).toHaveClass('supported');
  });

  it('keeps the playlist add button available in the sidebar', () => {
    renderSidebar();

    expect(
      screen.getByRole('button', { name: 'Add to playlist' }),
    ).toBeInTheDocument();
  });

  it('renders catalog metadata with the track title above the game title', () => {
    renderSidebar({
      currentIndex: null,
      playlist: [
        {
          ...video,
          title: 'Gamma Game - Skyline',
          channelTitle: 'Channel',
          gameTitle: 'Gamma Game',
          trackTitle: 'Skyline',
          displayTitle: 'Gamma Game - Skyline',
        },
      ],
    });

    expect(screen.getByLabelText('Play Skyline')).toBeInTheDocument();
    expect(screen.getByText('Skyline')).toBeInTheDocument();
    expect(screen.getByText('Gamma Game')).toBeInTheDocument();
    expect(screen.queryByText('Channel')).not.toBeInTheDocument();
  });

  it('highlights retired playlist entries with the retired style', () => {
    renderSidebar({ retiredVideoIds: new Set(['alpha1234567']) });

    expect(screen.getByLabelText('Play Alpha')).toHaveClass('retired');
  });

  it('uses the scrolling title wrapper for the active playlist item', () => {
    const { container } = renderSidebar();

    expect(container.querySelector('.playlist-item-title-scroll')).toBeTruthy();
  });

  it('collapses to a flat side tab with only the expand toggle visible', () => {
    const { container, props } = renderSidebar({ isCollapsed: true });

    expect(container.querySelector('.playlist-sidebar')).toHaveClass(
      'collapsed',
    );
    expect(
      container.querySelector('.playlist-collapse-tab'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand playlist' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Shuffle playlist' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Play Alpha')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    expect(props.onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('supports closing the mobile playlist by dragging the drawer edge', () => {
    mockMatchMedia(true);
    const { props } = renderSidebar({ isCollapsed: false });

    fireEvent.pointerDown(screen.getByTestId('playlist-drag-edge'), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(window, { clientX: 50, clientY: 10 });

    expect(props.onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('shows a header close button instead of the side tab when the mobile playlist is open', () => {
    mockMatchMedia(true);
    const { container, props } = renderSidebar({ isCollapsed: false });

    expect(
      container.querySelector('.playlist-collapse-tab'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse playlist' }));

    expect(props.onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('supports selecting all playlist items and removing them in bulk', () => {
    const beta = {
      videoId: 'beta12345678',
      title: 'Beta',
      thumbnail: 'b.jpg',
      channelTitle: 'Channel B',
    };
    const { props } = renderSidebar({
      playlist: [{ ...video }, beta],
      currentIndex: null,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove from Playlist' }),
    );

    expect(props.onRemoveFromPlaylist).toHaveBeenCalledWith([
      'alpha1234567',
      'beta12345678',
    ]);
  });
});
