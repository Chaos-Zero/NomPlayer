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

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 140;

function SupportItem({
    video,
    onRemove,
    onDoubleQueue,
    onOpenContextMenu,
    selectionMode,
    isSelected,
    onToggleSelected,
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
                aria-label={`Support ${video.title}`}
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
                    title="Remove from support list"
                    aria-label="Remove from support list"
                >
                    ✕
                </button>
            )}
        </div>
    );
}

function SortableSupportItem({
    video,
    onRemove,
    onDoubleQueue,
    onOpenContextMenu,
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
                video={video}
                onRemove={onRemove}
                onDoubleQueue={onDoubleQueue}
                onOpenContextMenu={onOpenContextMenu}
                selectionMode={false}
                isSelected={false}
                onToggleSelected={() => {}}
            />
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
            <div className="fav-panel-backdrop" onClick={onClose} aria-hidden="true" />

            <div className="fav-panel" role="dialog" aria-label="Support list" aria-modal="true">
                <div className="fav-panel-header">
                    <div className="fav-panel-title">
                        <span>★</span>
                        Support list
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
                        <button className="btn-close" onClick={onClose} aria-label="Close support list">✕</button>
                    </div>
                </div>

                <div className="fav-panel-body">
                    {supportList.length === 0 ? (
                        <div className="fav-empty">
                            <div className="fav-empty-icon">☆</div>
                            <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                No support items yet
                            </div>
                            <div className="fav-hint">
                                Double-click an item to queue it, or right-click for Play Now, Add to Current Playlist,
                                and Remove Support.
                            </div>
                        </div>
                    ) : selectionMode ? (
                        supportList.map(video => (
                            <SupportItem
                                key={video.videoId}
                                video={video}
                                onRemove={onRemove}
                                onDoubleQueue={handleDoubleQueue}
                                onOpenContextMenu={handleOpenContextMenu}
                                selectionMode={true}
                                isSelected={selectedIdSet.has(video.videoId)}
                                onToggleSelected={handleToggleSelected}
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
                                {supportList.map(video => (
                                    <SortableSupportItem
                                        key={video.videoId}
                                        video={video}
                                        onRemove={onRemove}
                                        onDoubleQueue={handleDoubleQueue}
                                        onOpenContextMenu={handleOpenContextMenu}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
                </div>

                {contextMenu && (
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
                            Remove Support
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
