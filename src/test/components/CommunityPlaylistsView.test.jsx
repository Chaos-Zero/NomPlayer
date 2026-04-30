import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommunityPlaylistsView } from '../../components/CommunityPlaylistsView.jsx';

describe('CommunityPlaylistsView', () => {
  it('renders the empty state correctly when no playlists exist', async () => {
    const mockSupabase = {
      from: vi.fn(() => {
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (cb) => Promise.resolve({ data: [] }).then(cb),
        };
        return builder;
      }),
    };

    render(<CommunityPlaylistsView supabase={mockSupabase} authUser={null} />);

    expect(
      await screen.findByText('No public playlists yet'),
    ).toBeInTheDocument();
  });
});
