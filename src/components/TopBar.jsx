import { useEffect, useRef, useState } from 'react';
import { parseYouTubeInput, fetchPlaylistItems, singleVideoEntry } from '../utils/youtube.js';

const API_KEY = import.meta.env.VITE_YT_API_KEY || '';
const SUCCESS_FLASH_MS = 1000;

export default function TopBar({
    isPlaying, setIsPlaying,
    onPrev, onNext,
    showSupportList, setShowSupportList,
    onLoad,
}) {
    const [urlValue, setUrlValue] = useState('');
    const [isInputOpen, setIsInputOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [controlsOffset, setControlsOffset] = useState(0);
    const [error, setError] = useState('');
    const topbarRef = useRef(null);
    const formRef = useRef(null);
    const errorRef = useRef(null);
    const centerZoneRef = useRef(null);
    const rightZoneRef = useRef(null);
    const inputRef = useRef(null);
    const activeRequestRef = useRef(0);
    const successTimeoutRef = useRef(null);

    useEffect(() => {
        if (!isInputOpen) return undefined;

        const frameId = window.requestAnimationFrame(() => {
            inputRef.current?.focus();
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [isInputOpen]);

    useEffect(() => () => {
        if (successTimeoutRef.current) {
            window.clearTimeout(successTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        const topbarNode = topbarRef.current;
        const formNode = formRef.current;
        const centerNode = centerZoneRef.current;
        const rightNode = rightZoneRef.current;
        if (!topbarNode || !formNode || !centerNode || !rightNode) return undefined;

        const collisionPadding = 18;
        let frameId = 0;

        function measure() {
            const isCompactLayout = window.matchMedia?.('(max-width: 960px)').matches ?? false;
            if (isCompactLayout) {
                setControlsOffset(0);
                return;
            }

            const topbarRect = topbarNode.getBoundingClientRect();
            const formRect = formNode.getBoundingClientRect();
            const errorRect = errorRef.current?.getBoundingClientRect() ?? null;
            const centerRect = centerNode.getBoundingClientRect();
            const rightRect = rightNode.getBoundingClientRect();

            const baseCenter = topbarRect.width / 2;
            const occupiedLeftEdge = Math.max(
                formRect.right,
                errorRect?.right ?? formRect.right
            );
            const minCenter = (occupiedLeftEdge - topbarRect.left) + collisionPadding + (centerRect.width / 2);
            const maxCenter = (rightRect.left - topbarRect.left) - collisionPadding - (centerRect.width / 2);

            let nextOffset = 0;
            if (minCenter <= maxCenter) {
                const targetCenter = Math.min(maxCenter, Math.max(baseCenter, minCenter));
                nextOffset = targetCenter - baseCenter;
            } else {
                const overlapLeft = minCenter - baseCenter;
                const overlapRight = baseCenter - maxCenter;
                nextOffset = overlapLeft >= overlapRight ? overlapLeft : -overlapRight;
            }

            setControlsOffset(previousOffset => (
                Math.abs(previousOffset - nextOffset) < 0.5
                    ? previousOffset
                    : nextOffset
            ));
        }

        function scheduleMeasure() {
            window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(measure);
        }

        scheduleMeasure();

        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(scheduleMeasure);

        resizeObserver?.observe(topbarNode);
        resizeObserver?.observe(formNode);
        if (errorRef.current) {
            resizeObserver?.observe(errorRef.current);
        }
        resizeObserver?.observe(centerNode);
        resizeObserver?.observe(rightNode);
        window.addEventListener('resize', scheduleMeasure);

        return () => {
            window.cancelAnimationFrame(frameId);
            resizeObserver?.disconnect();
            window.removeEventListener('resize', scheduleMeasure);
        };
    }, [error, isInputOpen, showSuccess]);

    function clearSuccessFlash() {
        if (successTimeoutRef.current) {
            window.clearTimeout(successTimeoutRef.current);
            successTimeoutRef.current = null;
        }
        setShowSuccess(false);
    }

    function flashSuccess() {
        clearSuccessFlash();
        setShowSuccess(true);
        successTimeoutRef.current = window.setTimeout(() => {
            successTimeoutRef.current = null;
            setShowSuccess(false);
        }, SUCCESS_FLASH_MS);
    }

    function openInput() {
        clearSuccessFlash();
        setError('');
        setIsInputOpen(true);
    }

    function closeInput() {
        activeRequestRef.current += 1;
        clearSuccessFlash();
        setLoading(false);
        setError('');
        setUrlValue('');
        setIsInputOpen(false);
    }

    async function handleSubmit(e) {
        e?.preventDefault();

        if (!isInputOpen) {
            openInput();
            return;
        }

        const trimmedUrl = urlValue.trim();
        if (!trimmedUrl) return;

        const parsed = parseYouTubeInput(trimmedUrl);
        if (!parsed) {
            setError('Could not recognise that URL or ID');
            return;
        }

        const requestId = activeRequestRef.current + 1;
        activeRequestRef.current = requestId;

        clearSuccessFlash();
        setError('');
        setLoading(true);
        try {
            if (parsed.type === 'video') {
                const item = await singleVideoEntry(parsed.videoId);
                if (requestId !== activeRequestRef.current) return;
                onLoad([item], { mode: 'append', autoplay: true });
            } else {
                const items = await fetchPlaylistItems(parsed.playlistId, API_KEY);
                if (requestId !== activeRequestRef.current) return;
                if (items.length === 0) {
                    setError('Playlist is empty or private.');
                } else {
                    onLoad(items, { mode: 'append', startVideoId: parsed.videoId || null });
                }
            }

            if (requestId === activeRequestRef.current) {
                setUrlValue('');
                flashSuccess();
            }
        } catch (err) {
            if (requestId !== activeRequestRef.current) return;
            if (err.message === 'NO_API_KEY') {
                setError('Add VITE_YT_API_KEY to .env to load playlists.');
            } else {
                setError(err.message || 'Failed to load playlist.');
            }
        } finally {
            if (requestId === activeRequestRef.current) {
                setLoading(false);
            }
        }
    }

    return (
        <div ref={topbarRef} className={`topbar${isInputOpen ? ' input-open' : ''}`}>
            <div className="topbar-side topbar-left">
                <div className="topbar-load-area">
                    <form
                        ref={formRef}
                        className={`url-form${isInputOpen ? ' open' : ''}${showSuccess ? ' success' : ''}`}
                        onSubmit={handleSubmit}
                    >
                        <div className="url-input-wrap">
                            <input
                                ref={inputRef}
                                className="url-input"
                                type="text"
                                placeholder="Paste a YouTube video or playlist URL…"
                                value={urlValue}
                                onChange={e => {
                                    setUrlValue(e.target.value);
                                    setError('');
                                    if (showSuccess) {
                                        clearSuccessFlash();
                                    }
                                }}
                                id="url-input"
                            />
                        </div>
                        <button
                            className={`btn btn-primary url-submit-btn${showSuccess ? ' success' : ''}`}
                            type={isInputOpen ? 'submit' : 'button'}
                            disabled={isInputOpen && !showSuccess && !urlValue.trim()}
                            id="load-btn"
                            aria-label={showSuccess ? 'Load successful' : undefined}
                            onClick={!isInputOpen ? openInput : undefined}
                        >
                            {showSuccess ? '✓' : loading ? 'Loading…' : isInputOpen ? 'Load' : 'Add to playlist'}
                        </button>
                        <button
                            className="btn btn-icon url-close-btn"
                            type="button"
                            aria-label="Close add to playlist"
                            onClick={closeInput}
                            tabIndex={isInputOpen ? 0 : -1}
                        >
                            ✕
                        </button>
                    </form>
                </div>

                {error && (
                    <span ref={errorRef} className="url-error">
                        ⚠ {error}
                    </span>
                )}
            </div>

            <div
                ref={centerZoneRef}
                className="topbar-center"
                style={{ '--topbar-controls-offset': `${controlsOffset}px` }}
            >
                <div className="controls-divider" aria-hidden="true" />
                <div className="playback-controls">
                    <button
                        className="btn btn-icon"
                        onClick={onPrev}
                        title="Previous"
                        id="prev-btn"
                        aria-label="Previous video"
                    >⏮</button>

                    <button
                        className="btn btn-play"
                        onClick={() => setIsPlaying(p => !p)}
                        title={isPlaying ? 'Pause' : 'Play'}
                        id="play-pause-btn"
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>

                    <button
                        className="btn btn-icon"
                        onClick={onNext}
                        title="Next"
                        id="next-btn"
                        aria-label="Next video"
                    >⏭</button>
                </div>
                <div className="controls-divider" aria-hidden="true" />
            </div>

            <div ref={rightZoneRef} className="topbar-side topbar-right">
                <button
                    className={`star-btn${showSupportList ? ' active' : ''}`}
                    onClick={() => setShowSupportList(s => !s)}
                    title={showSupportList ? 'Hide Support List' : 'Show Support List'}
                    id="fav-toggle-btn"
                    aria-label="Toggle support list"
                >
                    ★
                </button>
            </div>
        </div>
    );
}
