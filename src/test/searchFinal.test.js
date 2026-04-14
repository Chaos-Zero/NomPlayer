import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fetchFilteredTracks, clearCatalogCache } from '../lib/trackCatalog.js';

const mockSnapshot = {
  exportedAt: '2026-04-10T00:00:00Z',
  tracks: [
    {
      track_id: '1',
      game_title: 'Mega man Battle Network',
      track_title: 'Main Theme',
      source_external_id: 'megaman1234',
      display_title: 'Mega man Battle Network - Main Theme',
    },
    {
      track_id: '2',
      game_title: 'The Legend of Zelda',
      track_title: 'Overworld',
      source_external_id: 'zelda123456',
      display_title: 'The Legend of Zelda - Overworld',
    },
  ],
};

vi.mock('../data/catalogSnapshot.json', () => ({
  default: mockSnapshot,
  ...mockSnapshot,
}));

describe('Search Final Verification', () => {
  beforeAll(() => {
    vi.clearAllMocks();
    clearCatalogCache();
  });

  it('matches "Megaman" to "Mega man" (Concatenated Word)', async () => {
    const { data } = await fetchFilteredTracks(null, { searchTerm: 'Megaman' });
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].gameTitle).toBe('Mega man Battle Network');
  }, 30000);

  it('matches "Battle Network" (Partial match)', async () => {
    const { data } = await fetchFilteredTracks(null, {
      searchTerm: 'Battle Network',
    });
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].gameTitle).toBe('Mega man Battle Network');
  }, 30000);

  it('filters out unrelated tracks', async () => {
    const { data } = await fetchFilteredTracks(null, { searchTerm: 'Zelda' });
    expect(data.length).toBe(1);
    expect(data[0].gameTitle).toBe('The Legend of Zelda');
  }, 30000);

  it('shows no matches for nonsense', async () => {
    const { data } = await fetchFilteredTracks(null, {
      searchTerm: 'qwertyuiop',
    });
    expect(data).toHaveLength(0);
  }, 30000);
});
