import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HomePage from '../../components/HomePage.jsx';

vi.mock('../../hooks/useMediaQuery.js', () => ({
  default: () => true,
}));

vi.mock('../../lib/dashboard.js', async () => {
  const actual = await vi.importActual('../../lib/dashboard.js');

  return {
    ...actual,
    fetchDashboardNominationUpdates: vi.fn(async () => [
      {
        user_id: 'user-2',
        username: 'Alice',
        updated_at: '2026-03-17T10:00:00Z',
        nominations: [
          {
            videoId: 'track-1',
            title: 'Forgotten Echo',
            thumbnail: 'echo.jpg',
            channelTitle: 'Channel',
          },
        ],
      },
    ]),
    fetchDashboardVgmcUpdates: vi.fn(async () => [
      {
        title: 'VGMC Finals Thread',
        url: 'https://example.com/thread',
      },
    ]),
  };
});

vi.mock('../../lib/trackCatalog.js', () => ({
  fetchPagedTracks: vi.fn(async () => ({ data: [], totalCount: 100 })),
  mapTrackCatalogEntryToVideo: vi.fn((entry) => ({ ...entry })),
  fetchRandomUnplacedVgmcTrack: vi.fn(async () => null),
}));

describe('HomePage mobile layout', () => {
  it('collapses secondary sections by default on mobile and lets them expand', async () => {
    render(
      <HomePage
        supabase={{}}
        currentPlaylist={[]}
        listenedStatusById={{}}
        onAddToPlaylist={vi.fn()}
        onPlayNow={vi.fn()}
        onNavigateToPlayer={vi.fn()}
        onShowToast={vi.fn()}
      />,
    );

    const overviewToggle = await screen.findByRole('button', {
      name: 'Collapse NomPlayer overview',
    });
    const discoverToggle = await screen.findByRole('button', {
      name: 'Expand Discover',
    });
    const updatesToggle = await screen.findByRole('button', {
      name: 'Expand VGMC Updates',
    });

    expect(overviewToggle).toHaveAttribute('aria-expanded', 'true');
    expect(discoverToggle).toHaveAttribute('aria-expanded', 'false');
    expect(updatesToggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(discoverToggle);

    expect(
      await screen.findByRole('button', { name: 'Collapse Discover' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });
});
