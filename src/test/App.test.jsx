import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';

const appTestState = vi.hoisted(() => ({
    topBarProps: null,
    videoPlayerProps: null,
    playlistSidebarProps: null,
    supportPanelProps: null,
}));

vi.mock('../components/TopBar.jsx', () => ({
    default: function MockTopBar(props) {
        appTestState.topBarProps = props;
        return <div data-testid="topbar-mock" />;
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
                <span>{props.playlist.map(video => video.title).join(', ')}</span>
            </div>
        );
    },
}));

vi.mock('../components/FavouritesPanel.jsx', () => ({
    default: function MockSupportListPanel(props) {
        appTestState.supportPanelProps = props;
        return (
            <div data-testid="support-list-panel-mock">
                <span>{props.supportList.map(video => video.title).join(', ')}</span>
            </div>
        );
    },
}));

describe('App', () => {
    beforeEach(() => {
        localStorage.clear();
        appTestState.topBarProps = null;
        appTestState.videoPlayerProps = null;
        appTestState.playlistSidebarProps = null;
        appTestState.supportPanelProps = null;
    });

    it('autoplays a loaded single video when the playlist is empty', () => {
        render(<App />);

        act(() => {
            appTestState.topBarProps.onLoad(
                [{ videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' }],
                { mode: 'append', autoplay: true }
            );
        });

        expect(screen.getByTestId('video-player-mock')).toHaveTextContent('Alpha');
        expect(screen.getByTestId('video-player-mock')).toHaveTextContent('playing');
        expect(appTestState.playlistSidebarProps.playlist).toHaveLength(1);
    });

    it('appends a loaded single video to the existing playlist without interrupting playback', () => {
        render(<App />);

        act(() => {
            appTestState.topBarProps.onLoad(
                [{ videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' }],
                { mode: 'append', autoplay: true }
            );
        });

        act(() => {
            appTestState.topBarProps.onLoad(
                [{ videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: '' }],
                { mode: 'append', autoplay: true }
            );
        });

        expect(appTestState.playlistSidebarProps.playlist.map(video => video.title)).toEqual(['Alpha', 'Beta']);
        expect(appTestState.videoPlayerProps.video.title).toBe('Alpha');
        expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
    });

    it('does not append duplicate videos to the playlist', () => {
        render(<App />);

        act(() => {
            appTestState.topBarProps.onLoad(
                [{ videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' }],
                { mode: 'append', autoplay: true }
            );
        });

        act(() => {
            appTestState.topBarProps.onLoad(
                [{ videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' }],
                { mode: 'append', autoplay: true }
            );
        });

        expect(appTestState.playlistSidebarProps.playlist.map(video => video.title)).toEqual(['Alpha']);
    });

    it('removes playlist entries and keeps playback on the next available track', () => {
        render(<App />);

        act(() => {
            appTestState.topBarProps.onLoad(
                [
                    { videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' },
                    { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: '' },
                ],
                { startVideoId: 'alpha1234567' }
            );
        });

        act(() => {
            appTestState.playlistSidebarProps.onRemoveFromPlaylist('alpha1234567');
        });

        expect(appTestState.playlistSidebarProps.playlist.map(video => video.title)).toEqual(['Beta']);
        expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
    });

    it('queues a support-list song without interrupting the current playback and highlights the queued item', () => {
        render(<App />);

        act(() => {
            appTestState.topBarProps.onLoad(
                [{ videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' }],
                { mode: 'append', autoplay: true }
            );
        });

        act(() => {
            appTestState.topBarProps.setShowSupportList(true);
        });

        act(() => {
            appTestState.supportPanelProps.onAddToPlaylist([
                { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: '' },
            ]);
        });

        expect(appTestState.playlistSidebarProps.playlist.map(video => video.title)).toEqual(['Alpha', 'Beta']);
        expect(appTestState.playlistSidebarProps.currentIndex).toBe(0);
        expect(appTestState.playlistSidebarProps.flashVideoIds).toEqual(['beta12345678']);
        expect(appTestState.videoPlayerProps.video.title).toBe('Alpha');
        expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
    });

    it('plays a support-list song immediately without adding it to the playlist', () => {
        render(<App />);

        act(() => {
            appTestState.topBarProps.onLoad(
                [{ videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' }],
                { mode: 'append', autoplay: true }
            );
        });

        act(() => {
            appTestState.topBarProps.setShowSupportList(true);
        });

        act(() => {
            appTestState.supportPanelProps.onPlayNow(
                { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: '' }
            );
        });

        expect(appTestState.playlistSidebarProps.currentIndex).toBeNull();
        expect(appTestState.playlistSidebarProps.playlist.map(video => video.title)).toEqual(['Alpha']);
        expect(appTestState.videoPlayerProps.video.title).toBe('Beta');
        expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
    });

    it('resumes the next playlist song after a Play Now track ends', () => {
        render(<App />);

        act(() => {
            appTestState.topBarProps.onLoad(
                [
                    { videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' },
                    { videoId: 'gamma1234567', title: 'Gamma', thumbnail: 'g.jpg', channelTitle: '' },
                ],
                { startVideoId: 'alpha1234567', autoplay: true }
            );
        });

        act(() => {
            appTestState.topBarProps.setShowSupportList(true);
        });

        act(() => {
            appTestState.supportPanelProps.onPlayNow(
                { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: '' }
            );
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

        act(() => {
            appTestState.topBarProps.onLoad(
                [
                    { videoId: 'alpha1234567', title: 'Alpha', thumbnail: 'a.jpg', channelTitle: '' },
                ],
                { mode: 'append', autoplay: true }
            );
        });

        act(() => {
            appTestState.topBarProps.onLoad(
                [
                    { videoId: 'beta12345678', title: 'Beta', thumbnail: 'b.jpg', channelTitle: '' },
                    { videoId: 'gamma1234567', title: 'Gamma', thumbnail: 'g.jpg', channelTitle: '' },
                ],
                { mode: 'append', startVideoId: 'gamma1234567' }
            );
        });

        expect(appTestState.playlistSidebarProps.playlist.map(video => video.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
        expect(appTestState.playlistSidebarProps.currentIndex).toBe(0);
        expect(appTestState.videoPlayerProps.video.title).toBe('Alpha');
        expect(appTestState.videoPlayerProps.isPlaying).toBe(true);
    });
});
