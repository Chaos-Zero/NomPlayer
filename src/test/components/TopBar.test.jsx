import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TopBar from '../../components/TopBar.jsx';
import { fetchFilteredTracks } from '../../lib/trackCatalog.js';
import {
  fetchPlaylistItems,
  parseYouTubeInput,
  singleVideoEntry,
} from '../../utils/youtube.js';

vi.mock('../../utils/youtube.js', () => ({
  parseYouTubeInput: vi.fn(),
  fetchPlaylistItems: vi.fn(),
  singleVideoEntry: vi.fn(),
}));

vi.mock('../../lib/trackCatalog.js', async () => {
  const actual = await vi.importActual('../../lib/trackCatalog.js');
  return {
    ...actual,
    fetchFilteredTracks: vi.fn(),
  };
});

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

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function renderTopBar(overrides = {}) {
  const props = {
    isPlaying: false,
    setIsPlaying: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    canTogglePlayback: true,
    showSupportList: false,
    setShowSupportList: vi.fn(),
    showNominationsList: false,
    setShowNominationsList: vi.fn(),
    isShuffleEnabled: false,
    onShuffle: vi.fn(),
    isPreviewModeEnabled: false,
    onTogglePreview: vi.fn(),
    onLoad: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<TopBar {...props} />),
    props,
  };
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      delete window.matchMedia;
    }
  });

  function openLoader() {
    fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
    return screen.getByRole('textbox');
  }

  it('opens and closes the add-to-playlist input shell', () => {
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close add to queue' }));
    expect(
      screen.getByRole('button', { name: 'Add to queue' }),
    ).toBeInTheDocument();
  });

  it('turns the add button into a go-to-player action outside the player page', () => {
    const onNavigateToPlayer = vi.fn();
    renderTopBar({
      isPlayerPage: false,
      onNavigateToPlayer,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Go to player' }));

    expect(onNavigateToPlayer).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Go to player' }),
    ).toBeInTheDocument();
  });

  it('shows a shorter player button label on mobile outside the player page', () => {
    mockMatchMedia(true);

    const onNavigateToPlayer = vi.fn();
    renderTopBar({
      isPlayerPage: false,
      onNavigateToPlayer,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Player' }));

    expect(onNavigateToPlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Player' })).toBeInTheDocument();
  });

  it('renders shuffle/preview playback controls plus support and nominations toggles', () => {
    renderTopBar();

    expect(
      screen.getByRole('button', { name: 'Shuffle queue' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Preview mode' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show Support' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Toggle nominations list' }),
    ).toBeInTheDocument();
  });

  it('shows the permanent catalog search in the desktop header when Supabase is available', () => {
    renderTopBar({ supabase: {} });

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add to queue' }),
    ).not.toBeInTheDocument();
  });

  it('plays a catalog search result from the desktop header search', async () => {
    vi.useFakeTimers();

    fetchFilteredTracks.mockResolvedValue({
      data: [
        {
          videoId: 'g1234567890',
          trackId: 'track-1',
          gameTitle: 'Gamma Game',
          trackTitle: 'Skyline',
          displayTitle: 'Gamma Game - Skyline',
          sourceTitle: 'Skyline',
          sourceChannelTitle: 'Channel G',
          sourceThumbnailUrl: 'g.jpg',
          isRetired: false,
          retiredByTournamentName: '',
          tournaments: [{ sequenceNumber: 6 }],
        },
      ],
      totalCount: 1,
    });

    const onCatalogPlayNow = vi.fn();
    renderTopBar({
      supabase: {},
      onCatalogPlayNow,
    });

    fireEvent.focus(screen.getByRole('searchbox'));
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Skyline' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(
      screen.getByRole('option', { name: /Gamma Game - Skyline/i }),
    );

    expect(onCatalogPlayNow).toHaveBeenCalledWith({
      videoId: 'g1234567890',
      provider: 'youtube',
      title: 'Gamma Game - Skyline',
      thumbnail: 'g.jpg',
      channelTitle: 'Channel G',
      trackId: 'track-1',
      gameTitle: 'Gamma Game',
      trackTitle: 'Skyline',
      displayTitle: 'Gamma Game - Skyline',
      isRetired: false,
      retiredByTournamentName: '',
      supportCount1: 0,
      supportCount2: 0,
      supportCount3: 0,
    });
  });

  it('adds a catalog search result to the playlist from the header search context menu', async () => {
    vi.useFakeTimers();

    fetchFilteredTracks.mockResolvedValue({
      data: [
        {
          videoId: 'g1234567890',
          trackId: 'track-1',
          gameTitle: 'Gamma Game',
          trackTitle: 'Skyline',
          displayTitle: 'Gamma Game - Skyline',
          sourceTitle: 'Skyline',
          sourceChannelTitle: 'Channel G',
          sourceThumbnailUrl: 'g.jpg',
          isRetired: true,
          retiredByTournamentName: 'VGMC 6',
          tournaments: [{ sequenceNumber: 6 }],
        },
      ],
      totalCount: 1,
    });

    const onAddCatalogToPlaylist = vi.fn();
    renderTopBar({
      supabase: {},
      onAddCatalogToPlaylist,
    });

    fireEvent.focus(screen.getByRole('searchbox'));
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Skyline' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const result = screen.getByRole('option', {
      name: /Gamma Game - Skyline/i,
    });
    fireEvent.contextMenu(result);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to Queue' }));

    expect(onAddCatalogToPlaylist).toHaveBeenCalledWith([
      {
        videoId: 'g1234567890',
        provider: 'youtube',
        title: 'Gamma Game - Skyline',
        thumbnail: 'g.jpg',
        channelTitle: 'Channel G',
        trackId: 'track-1',
        gameTitle: 'Gamma Game',
        trackTitle: 'Skyline',
        displayTitle: 'Gamma Game - Skyline',
        isRetired: true,
        retiredByTournamentName: 'VGMC 6',
        supportCount1: 0,
        supportCount2: 0,
        supportCount3: 0,
      },
    ]);
  });

  it('hides shuffle and preview buttons from the mobile bottom controls', () => {
    mockMatchMedia(true);

    renderTopBar();

    expect(
      screen.queryByRole('button', { name: 'Shuffle queue' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Preview mode' }),
    ).not.toBeInTheDocument();
  });

  it('shows the current song title in the mobile playback bar', () => {
    mockMatchMedia(true);

    renderTopBar({
      isPlaying: true,
      currentVideo: {
        videoId: 'alpha1234567',
        title: 'Alpha',
      },
    });

    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('disables the play button when there is no playable queue', () => {
    renderTopBar({ canTogglePlayback: false });

    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('awaits single video metadata before loading it', async () => {
    const item = {
      videoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      thumbnail: 'thumb.jpg',
      channelTitle: 'Rick Astley',
    };
    parseYouTubeInput.mockReturnValue({ type: 'video', videoId: item.videoId });
    singleVideoEntry.mockResolvedValue(item);

    const { props } = renderTopBar();
    fireEvent.change(openLoader(), {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(props.onLoad).toHaveBeenCalledWith(
        [{ ...item, provider: 'youtube' }],
        {
          mode: 'append',
          autoplay: true,
          startVideoId: item.videoId,
        },
      );
    });
  });

  it('loads a SoundCloud track pasted into the same "add by URL" box, via the real media dispatcher', async () => {
    // vi.clearAllMocks (beforeEach) only clears call history, not a
    // previously-set mockReturnValue — an earlier test's YouTube stub would
    // otherwise leak in here. Force it back to "not a YouTube URL" so this
    // genuinely falls through to parseMediaInput's real, unmocked
    // SoundCloud/Bandcamp branches, exercising the actual dispatcher wiring.
    parseYouTubeInput.mockReturnValue(null);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Great Track',
        thumbnail_url: 'https://i1.sndcdn.com/artworks-abc.jpg',
        author_name: 'Great Artist',
      }),
    });

    try {
      const { props } = renderTopBar();
      fireEvent.change(openLoader(), {
        target: { value: 'https://soundcloud.com/artist-name/track-name' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load' }));

      await waitFor(() => {
        expect(props.onLoad).toHaveBeenCalledWith(
          [
            {
              videoId: 'https://soundcloud.com/artist-name/track-name',
              provider: 'soundcloud',
              title: 'Great Track',
              thumbnail: 'https://i1.sndcdn.com/artworks-abc.jpg',
              channelTitle: 'Great Artist',
            },
          ],
          {
            mode: 'append',
            autoplay: true,
            startVideoId: 'https://soundcloud.com/artist-name/track-name',
          },
        );
      });

      // Confirms this genuinely went through parseMediaInput's SoundCloud
      // branch, not the mocked YouTube parser.
      expect(singleVideoEntry).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('flashes a success tick after a valid load completes', async () => {
    vi.useFakeTimers();

    const item = {
      videoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      thumbnail: 'thumb.jpg',
      channelTitle: 'Rick Astley',
    };
    parseYouTubeInput.mockReturnValue({ type: 'video', videoId: item.videoId });
    singleVideoEntry.mockResolvedValue(item);

    const { props } = renderTopBar();
    fireEvent.change(openLoader(), {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(props.onLoad).toHaveBeenCalledWith(
      [{ ...item, provider: 'youtube' }],
      {
        mode: 'append',
        autoplay: true,
        startVideoId: item.videoId,
      },
    );
    expect(
      screen.getByRole('button', { name: 'Load successful' }),
    ).toHaveTextContent('✓');

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
  });

  it('ignores stale single-video responses when a newer request finishes later', async () => {
    const first = createDeferred();
    const second = createDeferred();
    const firstItem = {
      videoId: 'first-video',
      title: 'First',
      thumbnail: 'a.jpg',
      channelTitle: '',
    };
    const secondItem = {
      videoId: 'second-video',
      title: 'Second',
      thumbnail: 'b.jpg',
      channelTitle: '',
    };

    parseYouTubeInput
      .mockReturnValueOnce({ type: 'video', videoId: firstItem.videoId })
      .mockReturnValueOnce({ type: 'video', videoId: secondItem.videoId });
    singleVideoEntry
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { container, props } = renderTopBar();
    const input = openLoader();
    const form = container.querySelector('form');

    fireEvent.change(input, { target: { value: 'first url' } });
    fireEvent.submit(form);

    fireEvent.change(input, { target: { value: 'second url' } });
    fireEvent.submit(form);

    await act(async () => {
      second.resolve(secondItem);
    });

    await waitFor(() => {
      expect(props.onLoad).toHaveBeenCalledWith(
        [{ ...secondItem, provider: 'youtube' }],
        {
          mode: 'append',
          autoplay: true,
          startVideoId: secondItem.videoId,
        },
      );
    });

    await act(async () => {
      first.resolve(firstItem);
    });

    expect(props.onLoad).toHaveBeenCalledTimes(1);
  });

  it('appends playlist loads instead of replacing the current queue', async () => {
    const items = [
      {
        videoId: 'alpha1234567',
        title: 'Alpha',
        thumbnail: 'a.jpg',
        channelTitle: '',
      },
      {
        videoId: 'beta12345678',
        title: 'Beta',
        thumbnail: 'b.jpg',
        channelTitle: '',
      },
    ];

    parseYouTubeInput.mockReturnValue({
      type: 'playlist',
      playlistId: 'PL123',
      videoId: 'beta12345678',
    });
    fetchPlaylistItems.mockResolvedValue(items);

    const { props } = renderTopBar();
    fireEvent.change(openLoader(), {
      target: {
        value: 'https://www.youtube.com/playlist?list=PL123&v=beta12345678',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(props.onLoad).toHaveBeenCalledWith(
        items.map((item) => ({ ...item, provider: 'youtube' })),
        {
          mode: 'append',
          autoplay: false,
          startVideoId: 'beta12345678',
        },
      );
    });
  });
});
