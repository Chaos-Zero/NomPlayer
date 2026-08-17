import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CustomPlaylistSubmenu from '../../components/CustomPlaylistSubmenu.jsx';

describe('CustomPlaylistSubmenu', () => {
  const mockVideo1 = { videoId: 'v1', title: 'Video 1' };
  const mockVideo2 = { videoId: 'v2', title: 'Video 2' };
  const mockVideos = [mockVideo1];

  const mockPlaylists = [
    { id: 'p1', name: 'Chill Vibes', videos: [mockVideo2] },
    { id: 'p2', name: 'Focus', videos: [] },
  ];

  it('renders nothing if required props are missing', () => {
    const { container } = render(<CustomPlaylistSubmenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the initial toggle button', () => {
    render(
      <CustomPlaylistSubmenu
        videos={mockVideos}
        customPlaylists={mockPlaylists}
        onUpdateCustomPlaylists={() => {}}
      />,
    );
    expect(
      screen.getByRole('menuitem', { name: /Add to Custom Playlist/i }),
    ).toBeInTheDocument();
  });

  it('expands to show playlists and create button when clicked', () => {
    render(
      <CustomPlaylistSubmenu
        videos={mockVideos}
        customPlaylists={mockPlaylists}
        onUpdateCustomPlaylists={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole('menuitem', { name: /Add to Custom Playlist/i }),
    );

    expect(
      screen.getByRole('menuitem', { name: /\+ Create New Playlist/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chill Vibes')).toBeInTheDocument();
    expect(screen.getByText('Focus')).toBeInTheDocument();
  });

  it('shows empty message if no custom playlists exist', () => {
    render(
      <CustomPlaylistSubmenu
        videos={mockVideos}
        customPlaylists={[]}
        onUpdateCustomPlaylists={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole('menuitem', { name: /Add to Custom Playlist/i }),
    );
    expect(screen.getByText('No playlists yet')).toBeInTheDocument();
  });

  it('adds tracks to an existing playlist and closes', () => {
    const mockUpdate = vi.fn();
    const mockClose = vi.fn();
    const mockToast = vi.fn();

    render(
      <CustomPlaylistSubmenu
        videos={mockVideos}
        customPlaylists={mockPlaylists}
        onUpdateCustomPlaylists={mockUpdate}
        onClose={mockClose}
        onShowToast={mockToast}
      />,
    );

    fireEvent.click(
      screen.getByRole('menuitem', { name: /Add to Custom Playlist/i }),
    );
    fireEvent.click(screen.getByText('Chill Vibes'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updatedPlaylists = mockUpdate.mock.calls[0][0];
    const chillPlaylist = updatedPlaylists.find((p) => p.id === 'p1');
    expect(chillPlaylist.videos).toHaveLength(2); // v2 + v1
    expect(chillPlaylist.videos).toContainEqual(mockVideo1);

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('Added to "Chill Vibes"');
  });

  it('does not add track if already exists', () => {
    const mockUpdate = vi.fn();
    const mockToast = vi.fn();

    render(
      <CustomPlaylistSubmenu
        videos={[mockVideo2]} // Already in p1
        customPlaylists={mockPlaylists}
        onUpdateCustomPlaylists={mockUpdate}
        onShowToast={mockToast}
      />,
    );

    fireEvent.click(
      screen.getByRole('menuitem', { name: /Add to Custom Playlist/i }),
    );
    fireEvent.click(screen.getByText('Chill Vibes'));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('Track already in this playlist');
  });

  it('creates a new playlist and adds tracks', () => {
    const mockUpdate = vi.fn();
    const mockClose = vi.fn();
    const mockToast = vi.fn();

    render(
      <CustomPlaylistSubmenu
        videos={mockVideos}
        customPlaylists={mockPlaylists}
        onUpdateCustomPlaylists={mockUpdate}
        onClose={mockClose}
        onShowToast={mockToast}
      />,
    );

    fireEvent.click(
      screen.getByRole('menuitem', { name: /Add to Custom Playlist/i }),
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: /\+ Create New Playlist/i }),
    );

    const input = screen.getByPlaceholderText('Playlist name…');
    fireEvent.change(input, { target: { value: 'My New Mix' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updatedPlaylists = mockUpdate.mock.calls[0][0];
    expect(updatedPlaylists).toHaveLength(3);
    const newPlaylist = updatedPlaylists[2];
    expect(newPlaylist.name).toBe('My New Mix');
    expect(newPlaylist.videos).toEqual(mockVideos);

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('Created "My New Mix"');
  });

  it('cancels creation on Escape key', () => {
    render(
      <CustomPlaylistSubmenu
        videos={mockVideos}
        customPlaylists={mockPlaylists}
        onUpdateCustomPlaylists={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole('menuitem', { name: /Add to Custom Playlist/i }),
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: /\+ Create New Playlist/i }),
    );

    const input = screen.getByPlaceholderText('Playlist name…');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(
      screen.queryByPlaceholderText('Playlist name…'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /\+ Create New Playlist/i }),
    ).toBeInTheDocument();
  });
});
