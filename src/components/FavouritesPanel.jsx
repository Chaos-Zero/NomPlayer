import { useState } from 'react';
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

function SortableFavItem({ video, onPlay, onRemove }) {
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

    const [imgError, setImgError] = useState(false);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`fav-item${isDragging ? ' dragging' : ''}`}
        >
            {/* Drag handle */}
            <span
                className="drag-handle"
                {...attributes}
                {...listeners}
                aria-label="Drag to reorder"
                title="Drag to reorder"
            >
                ⠿
            </span>

            {/* Thumbnail */}
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

            {/* Info — click to play */}
            <div
                className="playlist-item-info"
                style={{ cursor: 'pointer' }}
                onClick={() => onPlay(video)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onPlay(video)}
            >
                <div className="playlist-item-title" style={{ fontSize: 12 }}>
                    {video.title || video.videoId}
                </div>
                {video.channelTitle && (
                    <div className="playlist-item-meta">{video.channelTitle}</div>
                )}
            </div>

            {/* Remove */}
            <button
                className="fav-remove-btn"
                onClick={() => onRemove(video.videoId)}
                title="Remove from favourites"
                aria-label="Remove from favourites"
            >
                ✕
            </button>
        </div>
    );
}

export default function FavouritesPanel({ favourites, onReorder, onClose, onPlay, onRemove }) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragEnd(event) {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIdx = favourites.findIndex(f => f.videoId === active.id);
            const newIdx = favourites.findIndex(f => f.videoId === over.id);
            onReorder(arrayMove(favourites, oldIdx, newIdx));
        }
    }

    return (
        <>
            {/* Backdrop */}
            <div className="fav-panel-backdrop" onClick={onClose} aria-hidden="true" />

            {/* Panel */}
            <div className="fav-panel" role="dialog" aria-label="Favourites" aria-modal="true">
                <div className="fav-panel-header">
                    <div className="fav-panel-title">
                        <span>★</span>
                        Favourites
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
                            {favourites.length}
                        </span>
                    </div>
                    <button className="btn-close" onClick={onClose} aria-label="Close favourites">✕</button>
                </div>

                <div className="fav-panel-body">
                    {favourites.length === 0 ? (
                        <div className="fav-empty">
                            <div className="fav-empty-icon">☆</div>
                            <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                No favourites yet
                            </div>
                            <div className="fav-hint">
                                Click the ☆ icon on any video in the playlist to save it here.
                                You can drag items to reorder them.
                            </div>
                        </div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={favourites.map(f => f.videoId)}
                                strategy={verticalListSortingStrategy}
                            >
                                {favourites.map(video => (
                                    <SortableFavItem
                                        key={video.videoId}
                                        video={video}
                                        onPlay={onPlay}
                                        onRemove={onRemove}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </div>
        </>
    );
}
