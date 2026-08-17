import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';
import { fetchVgmcPlaylistTracks } from '../lib/vgmcStandings.js';

const appTestState = vi.hoisted(() => ({
  topBarProps: null,
  videoPlayerProps: null,
  playlistSidebarProps: null,
  supportPanelProps: null,
  nominationPanelProps: null,
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

function openPlayerView() {
  const directPlayerButton = screen.queryByRole('button', { name: 'Player' });
  if (directPlayerButton) {
    fireEvent.click(directPlayerButton);
    return;
  }

  fireEvent.click(
    screen.getByRole('button', { name: 'Toggle navigation menu' }),
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Player' }));
}

vi.mock('../components/TopBar.jsx', () => ({
  default: function MockTopBar(props) {
    appTestState.topBarProps = props;
    return (
      <div data-testid="topbar-mock">
        <button
          onClick={props.onToggleMenu}
          aria-label="Toggle navigation menu"
        >
          Menu
        </button>
        {props.mobileDetachedPlayer ?? null}
      </div>
    );
  },
}));

vi.mock('../components/VideoPlayer.jsx', () => ({
  default: function MockVideoPlayer(props) {
    appTestState.videoPlayerProps = props;
    return (
      <div data-testid="video-player-mock">
        <span>{props.video?.title || 'Nothing loaded'}</span>
        <span>{props.isPlaying ? 'playing' : 'paused'}</span>
      </div>
    );
  },
}));

vi.mock('../components/PlaylistSidebar.jsx', () => ({
  default: function MockPlaylistSidebar(props) {
    appTestState.playlistSidebarProps = props;
    return (
      <div data-testid="playlist-sidebar-mock">
        <span>{props.playlist.map((video) => video.title).join(', ')}</span>
      </div>
    );
  },
}));

vi.mock('../components/FavouritesPanel.jsx', () => ({
  default: function MockSupportListPanel(props) {
    if (props.tone === 'support') {
      appTestState.supportPanelProps = props;
    } else {
      appTestState.nominationPanelProps = props;
    }
    return (
      <div data-testid={`favourites-panel-mock-${props.tone}`}>
        <span>{props.supportList.map((video) => video.title).join(', ')}</span>
      </div>
    );
  },
  HeartIcon: () => <div data-testid="heart-icon-mock" />,
  LockIcon: () => <div data-testid="lock-icon-mock" />,
  SpeechBubbleIcon: () => <div data-testid="speech-bubble-icon-mock" />,
}));

vi.mock('../components/HomePage.jsx', () => ({
  default: function MockHomePage() {
    return (
      <div data-testid="home-page-mock">
        <span>Updated Nominations</span>
        <span>Discover</span>
        <span>Listen Now</span>
        <span>VGMC Updates</span>
      </div>
    );
  },
}));

vi.mock('../lib/supabase.js', () => {
  const mock = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockResolvedValue({ data: null, error: null }),
    delete: vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    then: (onFullfilled) => onFullfilled({ data: [], error: null }),
  };
  return {
    isSupabaseConfigured: true,
    getSupabaseClient: () => mock,
  };
});

// The mocked supabase client above resolves every call almost immediately, which
// would make the VGMC 20 auto-navigate effect (App.jsx) fire during every single
// test in this file, not just the ones about it, breaking assumptions in tests
// that have nothing to do with VGMC. Default to a promise that never resolves, so
// activePage stays on 'home' unless a test explicitly opts in with
// `vi.mocked(fetchVgmcPlaylistTracks).mockResolvedValueOnce(...)`.
vi.mock('../lib/vgmcStandings.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchVgmcPlaylistTracks: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock('../lib/feedback.js', () => ({
  fetchCommunityFeedback: vi.fn().mockResolvedValue([]),
  upsertUserFeedback: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('../lib/trackCatalog.js', () => ({
  fetchTrackCatalogByVideoIds: vi.fn().mockResolvedValue([]),
  fetchTrackCatalogByTrackIds: vi.fn().mockResolvedValue([]),
  fetchSupportedTracks: vi.fn().mockResolvedValue([]),
  ingestYouTubeTrackSources: vi.fn().mockResolvedValue([]),
  searchTrackCatalog: vi.fn().mockResolvedValue([]),
  getFullCatalog: vi.fn().mockResolvedValue([]),
  clearCatalogCache: vi.fn(),
  mapTrackCatalogEntryToVideo: (entry) => entry,
}));

vi.mock('../lib/playerState.js', () => ({
  fetchUserTrackListenStatuses: vi.fn().mockResolvedValue({}),
  fetchUserPlayerState: vi.fn().mockResolvedValue(null),
  fetchUserProfile: vi.fn().mockResolvedValue(null),
  recordYouTubeTrackListen: vi.fn(),
  saveUserPlayerState: vi.fn(),
  saveTrackSupport: vi.fn(),
  upsertUserProfile: vi.fn(),
  recordTrackHistory: vi.fn(),
  getTrackHistory: vi.fn().mockReturnValue([]),
  clearTrackHistory: vi.fn(),
  NOMINATION_LIST_STORAGE_KEY: 'yt_nomination_list',
  SUPPORT_LIST_STORAGE_KEY: 'yt_support_list',
  LEGACY_SUPPORT_STORAGE_KEY: 'yt_support',
  createGuestImportSelectionState: () => ({}),
  createPersistedPlayerState: () => ({}),
  checkSignupAvailability: vi.fn().mockResolvedValue(true),
  deriveProfileAvatarUrl: (p, url) => url,
  deriveProfileUsername: (p) => p?.username || 'Anonymous',
  hasImportableGuestCollections: () => false,
  hasMeaningfulPlayerState: () => false,
  isDiscordAuthUser: () => false,
  loadLocalPlayerState: () => ({
    playlist: [],
    currentVideoId: null,
    shuffleOrderIds: [],
    showOriginalOrder: false,
    listenedStatusById: {},
    supportList: [],
    nominationList: [],
  }),
  mergeGuestCollectionsIntoPlayerState: (s) => s,
  normalizeOptionalProfileValue: (v) => v,
  normalizePersistedPlayerState: (s) => s,
  persistLocalGuestPlayerState: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    appTestState.topBarProps = null;
    appTestState.videoPlayerProps = null;
    appTestState.playlistSidebarProps = null;
    appTestState.supportPanelProps = null;
    appTestState.nominationPanelProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      delete window.matchMedia;
    }
  });

  it('loads behind the home page, then switches to VGMC 20 once it is ready', async () => {
    let resolveFetch;
    vi.mocked(fetchVgmcPlaylistTracks).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<App />);

    // The site is mounted into the normal home page underneath the whole time,
    // the loading overlay sits on top of it, not instead of it.
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Loading VGMC 20…')).toBeInTheDocument();

    await act(async () => {
      resolveFetch([]);
      await Promise.resolve();
    });

    // Only once loading actually finishes does it switch to the VGMC page, the
    // toggle names where clicking it takes you, so "NomPlayer" confirms we're on
    // the VGMC page now.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'NomPlayer' }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading VGMC 20…')).not.toBeInTheDocument();
  });

  it('shows the dashboard sections by default', () => {
    render(<App />);

    expect(screen.getByText('Updated Nominations')).toBeInTheDocument();
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Listen Now')).toBeInTheDocument();
    expect(screen.getByText('VGMC Updates')).toBeInTheDocument();
  });

  it('keeps the playlist available as a collapsed overlay on desktop home view', () => {
    render(<App />);

    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByTestId('playlist-sidebar-mock')).toBeInTheDocument();
    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(true);
  });

  it('shows a mobile navigation menu with home and player entries', () => {
    mockMatchMedia(true);

    render(<App />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle navigation menu' }),
    );

    expect(screen.getByRole('menuitem', { name: 'Home' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Player' }),
    ).toBeInTheDocument();
  });

  it('keeps the player mounted when leaving the player page with a loaded track', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByTestId('video-player-mock')).toHaveTextContent('Alpha');
  });

  it('shows a support toggle on the detached desktop footer and updates its state', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    const supportButton = await screen.findByRole('button', {
      name: 'Add to support list',
    });

    fireEvent.click(supportButton);

    // The button opens a level picker, select a level to add to the support list
    const possibleButton = await screen.findByRole('menuitem', {
      name: /Possible Support/i,
    });
    fireEvent.click(possibleButton);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Remove from support list' }),
      ).toBeInTheDocument();
    });
  });

  it('does not switch into detached mini-player mode when the current track is paused', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: false },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(appTestState.videoPlayerProps.variant).toBe('hidden');
  });

  it('switches the player into mini mode on mobile when leaving the player page', async () => {
    mockMatchMedia(true);

    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle navigation menu' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Home' }));

    expect(screen.getByText('Discover')).toBeInTheDocument();
    await waitFor(() => {
      expect(appTestState.videoPlayerProps.variant).toBe('mini');
      expect(appTestState.videoPlayerProps.showMetadata).toBe(false);
    });
  });

  it('closes the desktop overlay playlist on other pages without losing the player page state', () => {
    render(<App />);
    openPlayerView();

    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(true);

    openPlayerView();

    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(false);
  });

  it('animates the detached footer in when playback starts on a non-player page', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: false },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    expect(appTestState.videoPlayerProps.variant).toBe('hidden');

    act(() => {
      appTestState.topBarProps.setIsPlaying(true);
    });

    await waitFor(() => {
      expect(appTestState.videoPlayerProps.variant).toBe('mini');
      expect(
        document.querySelector('.player-surface.detached-footer.entering'),
      ).toBeInTheDocument();
    });
  });

  it('autoplays a loaded single video when the playlist is empty', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    expect(screen.getByTestId('video-player-mock')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('video-player-mock')).toHaveTextContent(
      'playing',
    );
    expect(appTestState.playlistSidebarProps.playlist).toHaveLength(1);
  });

  it('appends a loaded single video to the existing playlist without interrupting playback', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'beta12345678',
            title: 'Beta',
            thumbnail: 'b.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Alpha', 'Beta']);
    expect(appTestState.videoPlayerProps.video.title).toBe('Alpha');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
  });

  it('reopens the playlist drawer on mobile after new songs are added', () => {
    mockMatchMedia(true);

    render(<App />);
    openPlayerView();

    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(true);

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(false);
    expect(appTestState.playlistSidebarProps.playlist).toHaveLength(1);
  });

  it('passes preview mode state to the top bar on mobile when enabled', () => {
    mockMatchMedia(true);

    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.onTogglePreview();
      appTestState.playlistSidebarProps.onToggleCollapse();
    });

    expect(appTestState.topBarProps.isPreviewModeEnabled).toBe(true);
  });

  it('does not append duplicate videos to the playlist', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Alpha']);
  });

  it('shows a toast when a song is added to the support list', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    await act(async () => {
      await appTestState.playlistSidebarProps.onToggleSupport({
        videoId: 'alpha1234567',
        title: 'Alpha',
        thumbnail: 'a.jpg',
        channelTitle: '',
      });
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Added to Possible Support',
    );
  });

  it('blocks retired songs from being added to the support list', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
            isRetired: true,
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    await act(async () => {
      await appTestState.playlistSidebarProps.onToggleSupport({
        videoId: 'alpha1234567',
        title: 'Alpha',
        thumbnail: 'a.jpg',
        channelTitle: '',
        isRetired: true,
      });
    });

    expect(appTestState.playlistSidebarProps.supportList).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'This song is retired. It can still be added to the current playlist.',
    );
  });

  it('removes playlist entries and keeps playback on the next available track', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
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
        ],
        { startVideoId: 'alpha1234567' },
      );
    });

    act(() => {
      appTestState.playlistSidebarProps.onRemoveFromPlaylist('alpha1234567');
    });

    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Beta']);
    expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
  });

  it('queues a support-list song without interrupting the current playback and highlights the queued item', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.setShowSupportList(true);
    });

    act(() => {
      appTestState.supportPanelProps.onAddToPlaylist([
        {
          videoId: 'beta12345678',
          title: 'Beta',
          thumbnail: 'b.jpg',
          channelTitle: '',
        },
      ]);
    });

    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Alpha', 'Beta']);
    expect(appTestState.playlistSidebarProps.currentIndex).toBe(0);
    expect(appTestState.playlistSidebarProps.flashVideoIds).toEqual([
      'beta12345678',
    ]);
    expect(appTestState.videoPlayerProps.video.title).toBe('Alpha');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
  });

  it('plays a support-list song immediately without adding it to the playlist', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.setShowSupportList(true);
    });

    await act(async () => {
      await appTestState.playlistSidebarProps.onToggleSupport({
        videoId: 'beta12345678',
        title: 'Beta',
        thumbnail: 'b.jpg',
        channelTitle: '',
      });
    });

    act(() => {
      appTestState.supportPanelProps.onPlayNow({
        videoId: 'beta12345678',
        title: 'Beta',
        thumbnail: 'b.jpg',
        channelTitle: '',
      });
    });

    expect(appTestState.playlistSidebarProps.currentIndex).toBe(0);
    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Beta']);
    await waitFor(() => {
      expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
      expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
    });
  });

  it('resumes the next playlist song after a Play Now track ends', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
          {
            videoId: 'gamma1234567',
            title: 'Gamma',
            thumbnail: 'g.jpg',
            channelTitle: '',
          },
        ],
        { startVideoId: 'alpha1234567', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.setShowSupportList(true);
    });

    act(() => {
      appTestState.supportPanelProps.onPlayNow({
        videoId: 'beta12345678',
        title: 'Beta',
        thumbnail: 'b.jpg',
        channelTitle: '',
      });
    });

    act(() => {
      appTestState.videoPlayerProps.onVideoEnd();
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Gamma');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
    expect(appTestState.playlistSidebarProps.currentIndex).toBe(1);
  });

  it('appends loaded playlists to the current queue without interrupting playback', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'beta12345678',
            title: 'Beta',
            thumbnail: 'b.jpg',
            channelTitle: '',
          },
          {
            videoId: 'gamma1234567',
            title: 'Gamma',
            thumbnail: 'g.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', startVideoId: 'gamma1234567' },
      );
    });

    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(appTestState.playlistSidebarProps.currentIndex).toBe(0);
    expect(appTestState.videoPlayerProps.video.title).toBe('Alpha');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
  });

  it('keeps the shuffled row order when toggling "show original order", only turning shuffle off restores it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
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
          {
            videoId: 'gamma1234567',
            title: 'Gamma',
            thumbnail: 'g.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.onShuffle();
    });

    expect(appTestState.playlistSidebarProps.isShuffleEnabled).toBe(true);
    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Alpha', 'Gamma', 'Beta']);

    // "Show original order" only changes which number a row displays (see
    // PlaylistSidebar's orderNumber tests), the shuffled row order itself
    // must stay exactly where it was.
    act(() => {
      appTestState.playlistSidebarProps.onToggleOrderView();
    });

    expect(appTestState.playlistSidebarProps.showOriginalOrder).toBe(true);
    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Alpha', 'Gamma', 'Beta']);

    // Turning shuffle off entirely is what actually restores saved order.
    act(() => {
      appTestState.topBarProps.onShuffle();
    });

    expect(appTestState.playlistSidebarProps.isShuffleEnabled).toBe(false);
    expect(appTestState.playlistSidebarProps.showOriginalOrder).toBe(false);
    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('toggles the playlist collapsed state from the sidebar control', () => {
    render(<App />);
    openPlayerView();

    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(false);

    act(() => {
      appTestState.playlistSidebarProps.onToggleCollapse();
    });

    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(true);

    act(() => {
      appTestState.playlistSidebarProps.onToggleCollapse();
    });

    expect(appTestState.playlistSidebarProps.isCollapsed).toBe(false);
  });

  it('marks playlist songs as started and then completed once playback finishes', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: true },
      );
    });

    await waitFor(() => {
      expect(
        appTestState.playlistSidebarProps.listenedStatusById.alpha1234567,
      ).toBe('partial');
    });

    act(() => {
      appTestState.videoPlayerProps.onVideoEnd();
    });

    expect(
      appTestState.playlistSidebarProps.listenedStatusById.alpha1234567,
    ).toBe('complete');
  });

  it('restarts from the first track when play is pressed after the last track finishes', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
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
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.onNext();
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(true);

    act(() => {
      appTestState.videoPlayerProps.onVideoEnd();
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(false);

    act(() => {
      appTestState.topBarProps.setIsPlaying((previousValue) => !previousValue);
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Alpha');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
    expect(appTestState.playlistSidebarProps.currentIndex).toBe(0);
  });

  it('resumes the current track after a normal pause on the last playlist song', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
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
        ],
        { mode: 'append', autoplay: true },
      );
    });

    act(() => {
      appTestState.topBarProps.onNext();
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(true);

    act(() => {
      appTestState.topBarProps.setIsPlaying((previousValue) => !previousValue);
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(false);

    act(() => {
      appTestState.topBarProps.setIsPlaying((previousValue) => !previousValue);
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
    expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
    expect(appTestState.playlistSidebarProps.currentIndex).toBe(1);
  });

  it('advances to the next track after 31 seconds in preview mode without completing the current song', async () => {
    vi.useFakeTimers();

    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
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
        ],
        { mode: 'append', autoplay: true },
      );
    });

    expect(
      appTestState.playlistSidebarProps.listenedStatusById.alpha1234567,
    ).toBe('partial');

    act(() => {
      appTestState.topBarProps.onTogglePreview();
    });

    expect(appTestState.topBarProps.isPreviewModeEnabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
    expect(
      appTestState.playlistSidebarProps.listenedStatusById.alpha1234567,
    ).toBe('partial');
    expect(
      appTestState.playlistSidebarProps.listenedStatusById.beta12345678,
    ).toBe('partial');
  });

  it('stops the preview timer when preview mode is toggled off', async () => {
    vi.useFakeTimers();

    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
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
        ],
        { mode: 'append', autoplay: true },
      );
    });

    expect(
      appTestState.playlistSidebarProps.listenedStatusById.alpha1234567,
    ).toBe('partial');

    act(() => {
      appTestState.topBarProps.onTogglePreview();
    });

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    act(() => {
      appTestState.topBarProps.onTogglePreview();
    });

    expect(appTestState.topBarProps.isPreviewModeEnabled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(appTestState.videoPlayerProps.video.title).toBe('Alpha');
    expect(appTestState.playlistSidebarProps.currentIndex).toBe(0);
  });

  it('leaves a started song as partial when playback is skipped before completion', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
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
        ],
        { mode: 'append', autoplay: true },
      );
    });

    await waitFor(() => {
      expect(
        appTestState.playlistSidebarProps.listenedStatusById.alpha1234567,
      ).toBe('partial');
    });

    act(() => {
      appTestState.topBarProps.onNext();
    });

    expect(
      appTestState.playlistSidebarProps.listenedStatusById.alpha1234567,
    ).toBe('partial');
    expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
  });

  it('removes a support item when the same song is added to nominations', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.setShowSupportList(true);
    });

    await act(async () => {
      await appTestState.supportPanelProps.onAddDirectItems([
        {
          videoId: 'alpha1234567',
          title: 'Alpha',
          thumbnail: 'a.jpg',
          channelTitle: '',
        },
      ]);
    });

    expect(
      appTestState.playlistSidebarProps.supportList.map((video) => video.title),
    ).toEqual(['Alpha']);

    act(() => {
      appTestState.topBarProps.setShowNominationsList(true);
    });

    await act(async () => {
      await appTestState.nominationPanelProps.onAddDirectItems([
        {
          videoId: 'alpha1234567',
          title: 'Alpha',
          thumbnail: 'a.jpg',
          channelTitle: '',
        },
      ]);
    });

    expect(appTestState.playlistSidebarProps.supportList).toEqual([]);
    expect(
      appTestState.playlistSidebarProps.nominationList.map(
        (video) => video.title,
      ),
    ).toEqual(['Alpha']);
  });

  it('appends songs added from the playlist sidebar to the current playlist', () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.onLoad(
        [
          {
            videoId: 'alpha1234567',
            title: 'Alpha',
            thumbnail: 'a.jpg',
            channelTitle: '',
          },
        ],
        { mode: 'append', autoplay: false },
      );
    });

    act(() => {
      appTestState.playlistSidebarProps.onAddDirectItems([
        {
          videoId: 'beta12345678',
          title: 'Beta',
          thumbnail: 'b.jpg',
          channelTitle: '',
        },
      ]);
    });

    expect(
      appTestState.playlistSidebarProps.playlist.map((video) => video.title),
    ).toEqual(['Alpha', 'Beta']);
  });

  it('returns a positive add count when a nomination is added directly', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.setShowNominationsList(true);
    });

    let addResult;
    await act(async () => {
      addResult = await appTestState.nominationPanelProps.onAddDirectItems([
        {
          videoId: 'alpha1234567',
          title: 'Alpha',
          thumbnail: 'a.jpg',
          channelTitle: '',
        },
      ]);
    });

    expect(addResult).toEqual({
      addedCount: 1,
      blockedNominationCount: 0,
      blockedRetiredCount: 0,
    });
    expect(
      appTestState.playlistSidebarProps.nominationList.map(
        (video) => video.title,
      ),
    ).toEqual(['Alpha']);
  });

  it('blocks retired songs from being added directly to nominations', async () => {
    render(<App />);
    openPlayerView();

    act(() => {
      appTestState.topBarProps.setShowNominationsList(true);
    });

    let addResult;
    await act(async () => {
      addResult = await appTestState.nominationPanelProps.onAddDirectItems([
        {
          videoId: 'alpha1234567',
          title: 'Alpha',
          thumbnail: 'a.jpg',
          channelTitle: '',
          isRetired: true,
        },
      ]);
    });

    expect(addResult).toEqual({
      addedCount: 0,
      blockedNominationCount: 0,
      blockedRetiredCount: 1,
    });
    expect(appTestState.playlistSidebarProps.nominationList).toEqual([]);
  });
});
