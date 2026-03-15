import { useEffect, useMemo, useRef, useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { parseYouTubeInput, fetchPlaylistItems, singleVideoEntry } from '../utils/youtube.js';

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 140;
const PANEL_CLOSE_MS = 240;
const SUCCESS_FLASH_MS = 1000;
const API_KEY = import.meta.env.VITE_YT_API_KEY || '';

function SupportItem({
    index,
    video,
    onRemove,
    onDoubleQueue,
    onOpenContextMenu,
    selectionMode,
    isSelected,
    onToggleSelected,
    itemAriaPrefix,
    removeButtonTitle,
    removeButtonAriaLabel,
}) {
    const [imgError, setImgError] = useState(false);

    return (
        <div
            className={`fav-item${isSelected ? ' selected' : ''}`}
            onContextMenu={event => onOpenContextMenu(event, video)}
            onDoubleClick={() => {
                if (!selectionMode) {
                    onDoubleQueue(video);
                }
            }}
        >
            {selectionMode && (
                <button
                    className={`support-select-toggle${isSelected ? ' active' : ''}`}
                    type="button"
                    aria-label={isSelected ? `Deselect ${video.title}` : `Select ${video.title}`}
                    aria-pressed={isSelected}
                    onClick={event => {
                        event.stopPropagation();
                        onToggleSelected(video.videoId);
                    }}
                />
            )}

            <div className="list-entry-number support-list-number" aria-hidden="true">
                {index + 1}
            </div>

            {video.thumbnail && !imgError ? (
                <img
                    className="playlist-thumb"
                    src={video.thumbnail}
                    alt=""
                    onError={() => setImgError(true)}
                    style={{ width: 64, height: 36 }}
                />
            ) : (
                <div
                    className="playlist-thumb-placeholder"
                    style={{ width: 64, height: 36, fontSize: 14 }}
                >
                    ▶
                </div>
            )}

            <div
                className="playlist-item-info"
                style={{ cursor: selectionMode ? 'pointer' : 'default' }}
                role="button"
                tabIndex={0}
                aria-label={`${itemAriaPrefix} ${video.title}`}
                onClick={() => {
                    if (selectionMode) {
                        onToggleSelected(video.videoId);
                    }
                }}
                onKeyDown={event => {
                    if (event.key !== 'Enter') return;
                    if (selectionMode) {
                        onToggleSelected(video.videoId);
                    } else {
                        onDoubleQueue(video);
                    }
                }}
            >
                <div className="playlist-item-title" style={{ fontSize: 12 }}>
                    {video.title || video.videoId}
                </div>
                {video.channelTitle && (
                    <div className="playlist-item-meta">{video.channelTitle}</div>
                )}
            </div>

            {!selectionMode && (
                <button
                    className="fav-remove-btn"
                    onClick={event => {
                        event.stopPropagation();
                        onRemove(video.videoId);
                    }}
                    title={removeButtonTitle}
                    aria-label={removeButtonAriaLabel}
                >
                    ✕
                </button>
            )}
        </div>
    );
}

function SortableSupportItem({
    index,
    video,
    onRemove,
    onDoubleQueue,
    onOpenContextMenu,
    itemAriaPrefix,
    removeButtonTitle,
    removeButtonAriaLabel,
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: video.videoId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`fav-sortable-wrap${isDragging ? ' dragging' : ''}`}
        >
            <div
                className="drag-handle"
                {...attributes}
                {...listeners}
                aria-label="Drag to reorder"
                title="Drag to reorder"
            >
                ⠿
            </div>
            <SupportItem
                index={index}
                video={video}
                onRemove={onRemove}
                onDoubleQueue={onDoubleQueue}
                onOpenContextMenu={onOpenContextMenu}
                selectionMode={false}
                isSelected={false}
                onToggleSelected={() => {}}
                itemAriaPrefix={itemAriaPrefix}
                removeButtonTitle={removeButtonTitle}
                removeButtonAriaLabel={removeButtonAriaLabel}
            />
        </div>
    );
}

function CollectionAdder({
    tone,
    addButtonLabel,
    onAddDirectItems,
}) {
    const [urlValue, setUrlValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [error, setError] = useState('');
    const [toastMessage, setToastMessage] = useState('');
    const inputRef = useRef(null);
    const activeRequestRef = useRef(0);
    const successTimeoutRef = useRef(null);
    const toastTimeoutRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;

        const frameId = window.requestAnimationFrame(() => {
            inputRef.current?.focus();
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [isOpen]);

    useEffect(() => () => {
        if (successTimeoutRef.current) {
            window.clearTimeout(successTimeoutRef.current);
        }
        if (toastTimeoutRef.current) {
            window.clearTimeout(toastTimeoutRef.current);
        }
    }, []);

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

    function showToast(message) {
        if (toastTimeoutRef.current) {
            window.clearTimeout(toastTimeoutRef.current);
        }

        setToastMessage(message);
        toastTimeoutRef.current = window.setTimeout(() => {
            toastTimeoutRef.current = null;
            setToastMessage('');
        }, 2600);
    }

    function openAdder() {
        clearSuccessFlash();
        setError('');
        setIsOpen(true);
    }

    function closeAdder() {
        activeRequestRef.current += 1;
        clearSuccessFlash();
        setLoading(false);
        setError('');
        setUrlValue('');
        setIsOpen(false);
    }

    async function handleSubmit(event) {
        event?.preventDefault();

        if (!isOpen) {
            openAdder();
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
            let items = [];

            if (parsed.type === 'video') {
                const item = await singleVideoEntry(parsed.videoId);
                if (requestId !== activeRequestRef.current) return;
                items = [item];
            } else {
                items = await fetchPlaylistItems(parsed.playlistId, API_KEY);
                if (requestId !== activeRequestRef.current) return;

                if (items.length === 0) {
                    setError('Playlist is empty or private.');
                    return;
                }
            }

            const addResult = onAddDirectItems(items);
            if (requestId !== activeRequestRef.current) return;

            const normalizedResult = typeof addResult === 'number'
                ? { addedCount: addResult, blockedNominationCount: 0 }
                : {
                    addedCount: addResult?.addedCount ?? 0,
                    blockedNominationCount: addResult?.blockedNominationCount ?? 0,
                };

            if (normalizedResult.blockedNominationCount > 0 && tone === 'support') {
                showToast(
                    parsed.type === 'playlist'
                        ? 'Some songs in this playlist have already been added as Nominations'
                        : 'You have already added this link as a Nomination'
                );
            }

            if (!normalizedResult.addedCount) {
                if (normalizedResult.blockedNominationCount > 0) {
                    setUrlValue('');
                    return;
                }

                setError(
                    tone === 'support'
                        ? 'Nothing new could be added to the support list.'
                        : 'Nothing new could be added to nominations.'
                );
                return;
            }

            setUrlValue('');
            flashSuccess();
        } catch (err) {
            if (requestId !== activeRequestRef.current) return;

            if (err.message === 'NO_API_KEY') {
                setError('Add VITE_YT_API_KEY to .env to load playlists.');
            } else {
                setError(err.message || 'Failed to load videos.');
            }
        } finally {
            if (requestId === activeRequestRef.current) {
                setLoading(false);
            }
        }
    }

    return (
        <div className={`collection-adder${isOpen ? ' open' : ''}${showSuccess ? ' success' : ''}`}>
            {toastMessage && (
                <div className="collection-adder-toast" role="status" aria-live="polite">
                    {toastMessage}
                </div>
            )}
            <div className="collection-adder-shell">
                <div className="collection-adder-stage">
                    <button
                        className="collection-adder-face collection-adder-front"
                        type="button"
                        onClick={openAdder}
                    >
                        {addButtonLabel}
                    </button>

                    <form
                        className={`collection-adder-face collection-adder-back${showSuccess ? ' success' : ''}`}
                        onSubmit={handleSubmit}
                    >
                        <input
                            ref={inputRef}
                            className="collection-adder-input"
                            type="text"
                            placeholder="Paste a YouTube video or playlist URL…"
                            value={urlValue}
                            onChange={event => {
                                setUrlValue(event.target.value);
                                setError('');
                                if (showSuccess) {
                                    clearSuccessFlash();
                                }
                            }}
                        />
                        <button
                            className={`collection-adder-submit${showSuccess ? ' success' : ''}`}
                            type="submit"
                            disabled={!showSuccess && !urlValue.trim()}
                            aria-label={showSuccess ? 'Load successful' : undefined}
                        >
                            {showSuccess ? '✓' : loading ? 'Loading…' : 'Load'}
                        </button>
                        <button
                            className="collection-adder-close"
                            type="button"
                            aria-label={`Close ${addButtonLabel.toLowerCase()}`}
                            onClick={closeAdder}
                        >
                            ✕
                        </button>
                    </form>
                </div>
            </div>

            {error && (
                <div className="collection-adder-error">
                    ⚠ {error}
                </div>
            )}
        </div>
    );
}

export default function FavouritesPanel({
    supportList,
    onReorder,
    onClose,
    onPlayNow,
    onAddToPlaylist,
    onRemove,
    isOpen = true,
    onExited,
    title = 'Support list',
    titleIcon = '★',
    tone = 'support',
    emptyIcon = '☆',
    emptyTitle = 'No support items yet',
    emptyHint = 'Double-click an item to queue it, or right-click for Play Now, Add to Current Playlist, and Remove Support.',
    itemAriaPrefix = 'Support',
    removeButtonTitle = 'Remove from support list',
    removeButtonAriaLabel = 'Remove from support list',
    contextRemoveLabel = 'Remove Support',
    closeLabel = 'Close support list',
    addButtonLabel = 'Add Supports',
    onAddDirectItems = () => 0,
}) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [contextMenu, setContextMenu] = useState(null);
    const contextMenuRef = useRef(null);

    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    useEffect(() => {
        if (!contextMenu) return undefined;

        function closeContextMenu() {
            setContextMenu(null);
        }

        function handlePointerDown(event) {
            if (contextMenuRef.current?.contains(event.target)) return;
            closeContextMenu();
        }

        function handleKeyDown(event) {
            if (event.key === 'Escape') {
                closeContextMenu();
            }
        }

        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', closeContextMenu, true);

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', closeContextMenu, true);
        };
    }, [contextMenu]);

    useEffect(() => {
        if (isOpen) return undefined;

        const timeoutId = window.setTimeout(() => {
            onExited?.();
        }, PANEL_CLOSE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [isOpen, onExited]);

    function handleDragEnd(event) {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIdx = supportList.findIndex(entry => entry.videoId === active.id);
            const newIdx = supportList.findIndex(entry => entry.videoId === over.id);
            onReorder(arrayMove(supportList, oldIdx, newIdx));
        }
    }

    function handleToggleSelected(videoId) {
        setSelectedIds(prev => (
            prev.includes(videoId)
                ? prev.filter(id => id !== videoId)
                : [...prev, videoId]
        ));
    }

    function handleToggleSelectionMode() {
        setSelectionMode(prev => {
            const nextValue = !prev;
            if (!nextValue) {
                setSelectedIds([]);
                setContextMenu(null);
            }
            return nextValue;
        });
    }

    function handleSelectAll() {
        setSelectedIds(supportList.map(video => video.videoId));
    }

    function openContextMenu(event, videos, mode) {
        const left = Math.min(
            event.clientX,
            window.innerWidth - CONTEXT_MENU_WIDTH - 8
        );
        const top = Math.min(
            event.clientY,
            window.innerHeight - CONTEXT_MENU_HEIGHT - 8
        );

        setContextMenu({
            left: Math.max(8, left),
            top: Math.max(8, top),
            videos,
            mode,
        });
    }

    function handleOpenContextMenu(event, video) {
        event.preventDefault();
        event.stopPropagation();

        if (selectionMode) {
            const nextSelectedIds = selectedIdSet.has(video.videoId)
                ? selectedIds
                : [video.videoId];

            if (!selectedIdSet.has(video.videoId)) {
                setSelectedIds(nextSelectedIds);
            }

            const selectedLookup = new Set(nextSelectedIds);
            const selectedVideos = supportList.filter(entry => selectedLookup.has(entry.videoId));
            openContextMenu(event, selectedVideos, 'multi');
            return;
        }

        openContextMenu(event, [video], 'single');
    }

    function handleDoubleQueue(video) {
        onAddToPlaylist([video]);
    }

    function handlePlayNow() {
        if (!contextMenu?.videos[0]) return;
        onPlayNow(contextMenu.videos[0]);
        setContextMenu(null);
    }

    function handleAddToCurrentPlaylist() {
        if (!contextMenu?.videos.length) return;
        onAddToPlaylist(contextMenu.videos);
        setContextMenu(null);
    }

    function handleRemoveSupport() {
        if (!contextMenu?.videos.length) return;
        const removedIds = contextMenu.videos.map(video => video.videoId);
        setSelectedIds(prev => prev.filter(id => !removedIds.includes(id)));
        onRemove(removedIds);
        setContextMenu(null);
    }

    const showSelectAll = selectionMode && supportList.length > 0;

    return (
        <>
            <div
                className={`fav-panel-backdrop${isOpen ? '' : ' closing'}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                className={`fav-panel ${tone}${isOpen ? '' : ' closing'}`}
                role="dialog"
                aria-label={title}
                aria-modal="true"
            >
                <div className="fav-panel-header">
                    <div className="fav-panel-title">
                        <span className="fav-panel-title-icon">{titleIcon}</span>
                        {title}
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-muted)',
                                background: 'var(--bg-glass)',
                                padding: '2px 8px',
                                borderRadius: 99,
                                border: '1px solid var(--border)',
                            }}
                        >
                            {supportList.length}
                        </span>
                    </div>
                    <div className="fav-panel-actions">
                        {showSelectAll && (
                            <button
                                className="fav-panel-action-btn"
                                type="button"
                                onClick={handleSelectAll}
                            >
                                Select all
                            </button>
                        )}
                        {supportList.length > 0 && (
                            <button
                                className={`fav-panel-action-btn${selectionMode ? ' active' : ''}`}
                                type="button"
                                onClick={handleToggleSelectionMode}
                            >
                                {selectionMode ? 'Done' : 'Select'}
                            </button>
                        )}
                        <button className="btn-close" onClick={onClose} aria-label={closeLabel}>✕</button>
                    </div>
                </div>

                <div className="fav-panel-body">
                    {supportList.length === 0 ? (
                        <div className="fav-empty">
                            <div className="fav-empty-icon">{emptyIcon}</div>
                            <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                {emptyTitle}
                            </div>
                            <div className="fav-hint">{emptyHint}</div>
                        </div>
                    ) : selectionMode ? (
                        supportList.map((video, index) => (
                            <SupportItem
                                key={video.videoId}
                                index={index}
                                video={video}
                                onRemove={onRemove}
                                onDoubleQueue={handleDoubleQueue}
                                onOpenContextMenu={handleOpenContextMenu}
                                selectionMode={true}
                                isSelected={selectedIdSet.has(video.videoId)}
                                onToggleSelected={handleToggleSelected}
                                itemAriaPrefix={itemAriaPrefix}
                                removeButtonTitle={removeButtonTitle}
                                removeButtonAriaLabel={removeButtonAriaLabel}
                            />
                        ))
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={supportList.map(entry => entry.videoId)}
                                strategy={verticalListSortingStrategy}
                            >
                                {supportList.map((video, index) => (
                                    <SortableSupportItem
                                        key={video.videoId}
                                        index={index}
                                        video={video}
                                        onRemove={onRemove}
                                        onDoubleQueue={handleDoubleQueue}
                                        onOpenContextMenu={handleOpenContextMenu}
                                        itemAriaPrefix={itemAriaPrefix}
                                        removeButtonTitle={removeButtonTitle}
                                        removeButtonAriaLabel={removeButtonAriaLabel}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
                </div>

                <div className="fav-panel-footer">
                    <CollectionAdder
                        tone={tone}
                        addButtonLabel={addButtonLabel}
                        onAddDirectItems={onAddDirectItems}
                    />
                </div>

                {contextMenu && isOpen && (
                    <div
                        ref={contextMenuRef}
                        className="support-context-menu"
                        role="menu"
                        style={{ top: contextMenu.top, left: contextMenu.left }}
                        onClick={event => event.stopPropagation()}
                    >
                        {contextMenu.mode === 'single' && (
                            <button
                                className="support-context-menu-item"
                                type="button"
                                role="menuitem"
                                onClick={handlePlayNow}
                            >
                                Play Now
                            </button>
                        )}
                        <button
                            className="support-context-menu-item"
                            type="button"
                            role="menuitem"
                            onClick={handleAddToCurrentPlaylist}
                        >
                            Add to Current Playlist
                        </button>
                        <button
                            className="support-context-menu-item danger"
                            type="button"
                            role="menuitem"
                            onClick={handleRemoveSupport}
                        >
                            {contextRemoveLabel}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
