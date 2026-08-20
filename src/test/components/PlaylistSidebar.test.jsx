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

  it('flags a Bandcamp track with the provider-bandcamp class, plain otherwise', () => {
    const bandcampVideo = { ...video, provider: 'bandcamp' };
    const { container } = renderSidebar({ playlist: [bandcampVideo] });

    expect(
      container.querySelector('.playlist-item.provider-bandcamp'),
    ).not.toBeNull();
  });

  it('does not add the provider-bandcamp class for a YouTube track', () => {
    const { container } = renderSidebar();

    expect(
      container.querySelector('.playlist-item.provider-bandcamp'),
    ).toBeNull();
    expect(container.querySelector('.playlist-item')).not.toBeNull();
  });

  it('shows a context menu with support and remove actions on right click', () => {
    const { props } = renderSidebar();

    fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));

    fireEvent.pointerDown(
      screen.getByRole('menuitem', { name: 'Update Support' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Update Support' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Possible Support' }));
    expect(props.onToggleSupport).toHaveBeenCalledWith([video], 1);

    fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));
    fireEvent.pointerDown(
      screen.getByRole('menuitem', { name: 'Remove from Queue' }),
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Remove from Queue' }),
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
      screen.getByRole('menuitem', { name: 'Update Support' }),
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
      screen.queryByRole('menuitem', { name: 'Update Support' }),
    ).not.toBeInTheDocument();
  });

  it('applies a transient flash class separately from the active class', () => {
    renderSidebar({ currentIndex: null, flashVideoIds: ['alpha1234567'] });

    expect(screen.getByLabelText('Play Alpha')).toHaveClass('flash');
    expect(screen.getByLabelText('Play Alpha')).not.toHaveClass('active');
  });

  it('numbers each playlist entry sequentially by its displayed position, not loadIndex', () => {
    const beta = {
      videoId: 'beta12345678',
      title: 'Beta',
      thumbnail: 'b.jpg',
      channelTitle: 'Channel B',
    };
    const { container } = renderSidebar({
      // loadIndex deliberately mismatches display order here, the number
      // shown must follow where the row actually is (1, 2, ...), not this.
      playlist: [
        { ...video, loadIndex: 1 },
        { ...beta, loadIndex: 0 },
      ],
    });

    const numbers = [...container.querySelectorAll('.list-entry-number')].map(
      (node) => node.textContent,
    );

    expect(numbers).toEqual(['1', '2']);
  });

  it('shows each entry\'s original position instead, when "show original order" is on', () => {
    const beta = {
      videoId: 'beta12345678',
      title: 'Beta',
      thumbnail: 'b.jpg',
      channelTitle: 'Channel B',
    };
    const { container } = renderSidebar({
      showOriginalOrder: true,
      // Rows stay in this (shuffled) position, only the number should
      // reflect loadIndex now, not this array position.
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

  it('keeps the active row on the actually-playing track when sorted by rating, not whatever lands on its old position', () => {
    const x = { ...video, rating: 2 }; // videoId 'alpha1234567', currently playing
    const y = {
      videoId: 'beta12345678',
      title: 'Beta',
      thumbnail: 'b.jpg',
      channelTitle: 'Channel B',
      rating: 9,
    };
    const { container } = renderSidebar({
      playlist: [x, y],
      currentIndex: 0, // X is playing
      activePlaylistView: { type: 'support' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Order by rating' }));

    // Y (higher rating) now renders first, but X is still what's playing.
    const rows = [...container.querySelectorAll('.playlist-item')];
    const activeRows = rows.filter((row) => row.classList.contains('active'));

    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]).toHaveTextContent('Alpha');
    expect(rows[0]).toHaveTextContent('Beta');
    expect(rows[0]).not.toHaveClass('active');
  });

  it('re-focuses the active row when toggling rating sort, now that isActive stays correct while sorted', () => {
    const x = { ...video, rating: 2 };
    const y = {
      videoId: 'beta12345678',
      title: 'Beta',
      thumbnail: 'b.jpg',
      channelTitle: 'Channel B',
      rating: 9,
    };
    renderSidebar({
      playlist: [x, y],
      currentIndex: 0,
      activePlaylistView: { type: 'support' },
    });

    // Tracking is on by default, mounting already-cued-up scrolls.
    // scrollToIndex's own reconciliation can call scrollTo more than once
    // per logical scroll, so this checks *that* a scroll happened at each
    // point rather than an exact count - the latter would really be
    // asserting on the virtualizer's internals, not this feature.
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    vi.mocked(Element.prototype.scrollTo).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Order by rating' }));

    expect(Element.prototype.scrollTo).toHaveBeenCalled();
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
    const titleBar = container.querySelector('.playlist-title-bar');
    const headerActions = container.querySelector('.sidebar-header-actions');

    expect(titleBar).toHaveTextContent('Queue');
    expect(titleBar).toHaveTextContent('1 video');
    expect(headerActions?.children).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Track current song' }),
    ).toBeInTheDocument();
  });

  it('tracks the active track by default, and stops once toggled off', () => {
    const twoVideoPlaylist = [
      { ...video, loadIndex: 0 },
      {
        videoId: 'beta12345678',
        title: 'Beta',
        thumbnail: 'b.jpg',
        channelTitle: 'Channel B',
        loadIndex: 1,
      },
    ];
    const { rerender, props } = renderSidebar({
      playlist: twoVideoPlaylist,
      currentIndex: 0,
    });

    // Tracking is on by default, so mounting already-cued-up scrolls.
    // scrollToIndex's own reconciliation can call scrollTo more than once
    // per logical scroll, so each checkpoint below clears the mock and
    // checks *that* a scroll happened (or didn't) rather than an exact
    // count - the latter would really be asserting on the virtualizer's
    // internals, not this feature.
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    vi.mocked(Element.prototype.scrollTo).mockClear();

    // A track change (skip/back, or a new track starting) re-focuses.
    rerender(<PlaylistSidebar {...props} currentIndex={1} />);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    vi.mocked(Element.prototype.scrollTo).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Track current song' }));
    vi.mocked(Element.prototype.scrollTo).mockClear();

    // Off now, further track changes shouldn't scroll the list around.
    rerender(<PlaylistSidebar {...props} currentIndex={0} />);
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled();

    // Turning it back on immediately re-focuses the active row.
    fireEvent.click(screen.getByRole('button', { name: 'Track current song' }));
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
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

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle queue' }));
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
      screen.getByRole('button', { name: 'Add to queue' }),
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
      screen.queryByRole('button', { name: 'Shuffle queue' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Play Alpha')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    expect(props.onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('resets selection mode when the sidebar collapses, so it doesn\'t re-expand still showing "Done"', () => {
    const { rerender, props } = renderSidebar({ isCollapsed: false });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('active');

    rerender(<PlaylistSidebar {...props} isCollapsed={true} />);
    rerender(<PlaylistSidebar {...props} isCollapsed={false} />);

    expect(screen.getByRole('button', { name: 'Select' })).not.toHaveClass(
      'active',
    );
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
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Queue' }));

    expect(props.onRemoveFromPlaylist).toHaveBeenCalledWith([
      'alpha1234567',
      'beta12345678',
    ]);
  });

  it('adds selected tracks in the order shown on screen (rating-sorted), not the underlying playlist order', () => {
    const alpha = { ...video, rating: 2 }; // videoId 'alpha1234567', 1st in the raw playlist array, lowest rating
    const beta = {
      videoId: 'beta12345678',
      title: 'Beta',
      thumbnail: 'b.jpg',
      channelTitle: 'Channel B',
      rating: 9, // highest rating - sorts to the top once "Order by rating" is on
    };
    const { props } = renderSidebar({
      playlist: [alpha, beta],
      currentIndex: null,
      activePlaylistView: { type: 'support' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Order by rating' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Queue' }));

    // Beta is shown first once rating-sorted, even though it's 2nd in the
    // raw playlist array - the add order has to follow the screen, not the
    // array.
    expect(props.onAddDirectItems).toHaveBeenCalledWith([beta, alpha]);
  });

  it('"Select all" only selects what a search filter currently shows, not tracks it\'s hiding', () => {
    const alpha = { ...video, title: 'Alpha' }; // videoId 'alpha1234567'
    const beta = {
      videoId: 'beta12345678',
      title: 'Beta',
      thumbnail: 'b.jpg',
      channelTitle: 'Channel B',
    };
    const { props } = renderSidebar({
      playlist: [alpha, beta],
      currentIndex: null,
      activePlaylistView: { type: 'support' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Search in playlist' }));
    fireEvent.change(screen.getByPlaceholderText('Search in Playlist…'), {
      target: { value: 'Beta' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Queue' }));

    // Alpha never matched the filter, so "Select all" shouldn't have picked
    // it up even though it's still sitting in the underlying playlist.
    expect(props.onAddDirectItems).toHaveBeenCalledWith([beta]);
  });

  it('renders CustomPlaylistSubmenu inside the context menu', () => {
    const mockPlaylists = [{ id: 'p1', name: 'My Mix', videos: [] }];
    renderSidebar({
      customPlaylists: mockPlaylists,
      onUpdateCustomPlaylists: vi.fn(),
    });

    // Open context menu for the track
    fireEvent.contextMenu(screen.getByLabelText('Play Alpha'));

    // The CustomPlaylistSubmenu should render its toggle button
    expect(
      screen.getByRole('menuitem', { name: /Add to Playlist/i }),
    ).toBeInTheDocument();
  });

  it('shows drag handles for a "community-playlist" view whose id is actually one of your own customPlaylists', () => {
    const { container } = renderSidebar({
      activePlaylistView: { type: 'community-playlist', id: 'p1' },
      customPlaylists: [
        { id: 'p1', name: 'Mine, browsed via Community', videos: [] },
      ],
    });

    expect(container.querySelector('.drag-handle')).toBeInTheDocument();
  });

  it('hides drag handles for a "community-playlist" view that is not one of your own customPlaylists', () => {
    const { container } = renderSidebar({
      activePlaylistView: {
        type: 'community-playlist',
        id: 'someone-elses-id',
      },
      customPlaylists: [{ id: 'p1', name: 'Mine', videos: [] }],
    });

    expect(container.querySelector('.drag-handle')).not.toBeInTheDocument();
  });

  it("shortens a long title/game name for display so they can't crowd the rating/comment/heart cluster", () => {
    const longVideo = {
      videoId: 'gamma1234567',
      thumbnail: 'g.jpg',
      trackTitle:
        'A Very Long Song Title That Definitely Runs On For Quite A While',
      gameTitle: 'An Equally Long Game Title That Also Keeps Going And Going',
      displayTitle:
        'A Very Long Song Title That Definitely Runs On For Quite A While',
    };
    // Not the active row, so this exercises the plain (non-ScrollingText)
    // title/meta divs.
    renderSidebar({ playlist: [longVideo], currentIndex: null });

    const title = screen.getByText(/^A Very Long Song Title/);
    expect(title.textContent.length).toBeLessThanOrEqual(32);
    expect(title.textContent.endsWith('…')).toBe(true);

    const meta = screen.getByText(/^An Equally Long Game Title/);
    expect(meta.textContent.length).toBeLessThanOrEqual(32);
    expect(meta.textContent.endsWith('…')).toBe(true);
  });

  it("shortens a long title the same way for the active row's scrolling title, not just the static one", () => {
    const longVideo = {
      videoId: 'gamma1234567',
      thumbnail: 'g.jpg',
      trackTitle:
        'A Very Long Song Title That Definitely Runs On For Quite A While',
      gameTitle: 'Short Game',
      displayTitle:
        'A Very Long Song Title That Definitely Runs On For Quite A While',
    };
    renderSidebar({ playlist: [longVideo], currentIndex: 0 });

    const title = screen.getByText(/^A Very Long Song Title/);
    expect(title.textContent.length).toBeLessThanOrEqual(32);
    expect(title.textContent.endsWith('…')).toBe(true);
  });

  it('leaves a short title/game name untouched', () => {
    renderSidebar({
      currentIndex: null,
      playlist: [
        {
          ...video,
          trackTitle: 'Skyline',
          gameTitle: 'Gamma Game',
          displayTitle: 'Gamma Game - Skyline',
        },
      ],
    });

    expect(screen.getByText('Skyline')).toBeInTheDocument();
    expect(screen.getByText('Gamma Game')).toBeInTheDocument();
  });
});
