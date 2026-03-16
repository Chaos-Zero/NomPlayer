import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TopBar from '../../components/TopBar.jsx';
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
    fireEvent.click(screen.getByRole('button', { name: 'Add to playlist' }));
    return screen.getByRole('textbox');
  }

  it('opens and closes the add-to-playlist input shell', () => {
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'Add to playlist' }));
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Close add to playlist' }),
    );
    expect(
      screen.getByRole('button', { name: 'Add to playlist' }),
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
      screen.getByRole('button', { name: 'Shuffle playlist' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Preview mode' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Toggle support list' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Toggle nominations list' }),
    ).toBeInTheDocument();
  });

  it('hides shuffle and preview buttons from the mobile bottom controls', () => {
    mockMatchMedia(true);

    renderTopBar();

    expect(
      screen.queryByRole('button', { name: 'Shuffle playlist' }),
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
      expect(props.onLoad).toHaveBeenCalledWith([item], {
        mode: 'append',
        autoplay: true,
      });
    });
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

    expect(props.onLoad).toHaveBeenCalledWith([item], {
      mode: 'append',
      autoplay: true,
    });
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
      expect(props.onLoad).toHaveBeenCalledWith([secondItem], {
        mode: 'append',
        autoplay: true,
      });
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
      expect(props.onLoad).toHaveBeenCalledWith(items, {
        mode: 'append',
        startVideoId: 'beta12345678',
      });
    });
  });
});
