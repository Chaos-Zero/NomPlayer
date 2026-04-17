import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NominationUpdateCard } from '../../components/HomePage';

describe('NominationUpdateCard', () => {
  const mockUpdate = {
    userId: 'user-1',
    username: 'Alice#1234',
    avatarUrl: 'alice.jpg',
    updatedAt: '2026-03-31T10:00:00Z',
    nominations: [
      {
        videoId: 'video-1',
        title: 'Original Title',
      },
    ],
  };

  const mockMetadataById = {
    'video-1': {
      trackTitle: 'Resolved Track',
      gameTitle: 'Resolved Game',
    },
  };

  const mockResolveTrack = vi.fn((video) => {
    const meta = mockMetadataById[video.videoId];
    if (!meta) return video;
    return {
      ...video,
      trackTitle: meta.trackTitle || video.trackTitle,
      gameTitle: meta.gameTitle || video.gameTitle,
      title: meta.trackTitle
        ? `${meta.gameTitle} - ${meta.trackTitle}`
        : video.title || meta.trackTitle || 'Unknown Track',
    };
  });

  it('renders track info and hover action buttons', () => {
    render(
      <NominationUpdateCard
        update={mockUpdate}
        metadataById={mockMetadataById}
        resolveTrack={mockResolveTrack}
      />,
    );

    // Check titles are resolved from metadata
    expect(screen.getByText('Resolved Game')).toBeDefined();
    expect(screen.getByText('Resolved Track')).toBeDefined();

    // Check action buttons (by title)
    expect(screen.getByTitle('View comments')).toBeDefined();
    expect(screen.getByTitle('Add to current playlist')).toBeDefined();
    expect(screen.getByTitle('Play now')).toBeDefined();
  });

  it('calls onAddTrack with resolved metadata when add button is clicked', () => {
    const onAddTrack = vi.fn();
    render(
      <NominationUpdateCard
        update={mockUpdate}
        metadataById={mockMetadataById}
        onAddTrack={onAddTrack}
        resolveTrack={mockResolveTrack}
      />,
    );

    const addBtn = screen.getByTitle('Add to current playlist');
    fireEvent.click(addBtn);

    expect(onAddTrack).toHaveBeenCalledWith([
      expect.objectContaining({
        videoId: 'video-1',
        trackTitle: 'Resolved Track',
        gameTitle: 'Resolved Game',
        title: 'Resolved Game - Resolved Track',
      }),
    ]);
  });

  it('calls onPlayTrack with resolved metadata when play button is clicked', () => {
    const onPlayTrack = vi.fn();
    render(
      <NominationUpdateCard
        update={mockUpdate}
        metadataById={mockMetadataById}
        onPlayTrack={onPlayTrack}
        resolveTrack={mockResolveTrack}
      />,
    );

    const playBtn = screen.getByTitle('Play now');
    fireEvent.click(playBtn);

    expect(onPlayTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: 'video-1',
        trackTitle: 'Resolved Track',
        gameTitle: 'Resolved Game',
        title: 'Resolved Game - Resolved Track',
      }),
      mockUpdate,
    );
  });

  it('calls onShowComments with track and button coordinates', () => {
    const onShowComments = vi.fn();
    render(
      <NominationUpdateCard
        update={mockUpdate}
        metadataById={mockMetadataById}
        onShowComments={onShowComments}
        resolveTrack={mockResolveTrack}
      />,
    );

    const commentBtn = screen.getByTitle('View comments');

    // Mock getBoundingClientRect
    commentBtn.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 200,
      width: 40,
      height: 40,
    }));

    fireEvent.click(commentBtn);

    expect(onShowComments).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: 'video-1' }),
      expect.objectContaining({ top: 100, left: 200 }),
    );
  });
});
