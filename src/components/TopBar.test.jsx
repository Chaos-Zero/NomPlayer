import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopBar from './TopBar.jsx';
import { parseYouTubeInput, singleVideoEntry } from '../utils/youtube.js';

vi.mock('../utils/youtube.js', () => ({
    parseYouTubeInput: vi.fn(),
    fetchPlaylistItems: vi.fn(),
    singleVideoEntry: vi.fn(),
}));

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
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Load' }));

        await waitFor(() => {
            expect(props.onLoad).toHaveBeenCalledWith([item], { mode: 'append', autoplay: true });
        });
    });

    it('ignores stale single-video responses when a newer request finishes later', async () => {
        const first = createDeferred();
        const second = createDeferred();
        const firstItem = { videoId: 'first-video', title: 'First', thumbnail: 'a.jpg', channelTitle: '' };
        const secondItem = { videoId: 'second-video', title: 'Second', thumbnail: 'b.jpg', channelTitle: '' };

        parseYouTubeInput
            .mockReturnValueOnce({ type: 'video', videoId: firstItem.videoId })
            .mockReturnValueOnce({ type: 'video', videoId: secondItem.videoId });
        singleVideoEntry
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);

        const { container, props } = renderTopBar();
        const input = screen.getByRole('textbox');
        const form = container.querySelector('form');

        fireEvent.change(input, { target: { value: 'first url' } });
        fireEvent.submit(form);

        fireEvent.change(input, { target: { value: 'second url' } });
        fireEvent.submit(form);

        await act(async () => {
            second.resolve(secondItem);
        });

        await waitFor(() => {
            expect(props.onLoad).toHaveBeenCalledWith([secondItem], { mode: 'append', autoplay: true });
        });

        await act(async () => {
            first.resolve(firstItem);
        });

        expect(props.onLoad).toHaveBeenCalledTimes(1);
    });
});
