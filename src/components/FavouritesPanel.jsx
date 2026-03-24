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
import CollectionAdder from './CollectionAdder.jsx';

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 140;
const PANEL_CLOSE_MS = 240;

function getPlaylistItemDisplay(video) {
  const hasTrackTitle =
    typeof video?.trackTitle === 'string' && video.trackTitle.trim();
  const hasGameTitle =
    typeof video?.gameTitle === 'string' && video.gameTitle.trim();
  const hasCatalogMetadata = Boolean(hasTrackTitle || hasGameTitle);

  return {
    gameTitle: hasCatalogMetadata ? video.gameTitle : '',
    trackTitle: hasCatalogMetadata ? video.trackTitle : video.title,
    hasCatalogMetadata,
  };
}

function SupportItem({
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
  tone,
}) {
  const [imgError, setImgError] = useState(false);
  const display = getPlaylistItemDisplay(video);

  return (
    <div
      className={`fav-item${isSelected ? ' selected' : ''}`}
      onContextMenu={(event) => onOpenContextMenu(event, video)}
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
          aria-label={
            isSelected
              ? `Deselect ${display.trackTitle}`
              : `Select ${display.trackTitle}`
          }
          aria-pressed={isSelected}
          onClick={(event) => {
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
        aria-label={`${itemAriaPrefix} ${display.trackTitle}`}
        onClick={() => {
          if (selectionMode) {
            onToggleSelected(video.videoId);
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          if (selectionMode) {
            onToggleSelected(video.videoId);
          } else {
            onDoubleQueue(video);
          }
        }}
      >
        <div className="playlist-item-title" style={{ fontSize: 12 }}>
          {display.hasCatalogMetadata ? (
            <div className="playlist-item-title-meta">
              {display.gameTitle && (
                <div
                  className="meta-game-title"
                  style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}
                >
                  {display.gameTitle}
                </div>
              )}
              {display.trackTitle && (
                <div className="meta-track-title">{display.trackTitle}</div>
              )}
            </div>
          ) : (
            <div className="playlist-item-title-raw">
              {display.trackTitle || video.videoId}
            </div>
          )}
        </div>
        {!display.hasCatalogMetadata && video.channelTitle && (
          <div className="playlist-item-meta">{video.channelTitle}</div>
        )}
      </div>

      {!selectionMode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            paddingRight: '12px',
          }}
        >
          {tone === 'support' && (
            <span
              className={`support-tier-icon level-${video.supportLevel || 1}`}
              style={{
                fontSize: '14px',
                opacity: 0.8,
                color:
                  video.supportLevel === 2
                    ? 'var(--support-pink)'
                    : video.supportLevel === 3
                      ? 'var(--support-gold)'
                      : 'var(--gold)',
              }}
            >
              {video.supportLevel === 3 ? '🔒' : '♥'}
            </span>
          )}
          <button
            className="fav-remove-btn"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(video.videoId);
            }}
            title={removeButtonTitle}
            aria-label={removeButtonAriaLabel}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function SortableSupportItem({
  video,
  onRemove,
  onDoubleQueue,
  onOpenContextMenu,
  itemAriaPrefix,
  removeButtonTitle,
  removeButtonAriaLabel,
  tone,
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
        itemAriaPrefix={itemAriaPrefix}
        removeButtonTitle={removeButtonTitle}
        removeButtonAriaLabel={removeButtonAriaLabel}
        tone={tone}
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
  onToggleSupport,
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
  pendingMetadataCount = 0,
  onOpenMetadataDialog = () => {},
  onDismissMetadataBanner = () => {},
  onUpdateMetadata = () => {},
  authUser = null,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const contextMenuRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedVideos = useMemo(
    () => supportList.filter((video) => selectedIdSet.has(video.videoId)),
    [selectedIdSet, supportList],
  );

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    },
    [],
  );

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
      const oldIdx = supportList.findIndex(
        (entry) => entry.videoId === active.id,
      );
      const newIdx = supportList.findIndex(
        (entry) => entry.videoId === over.id,
      );
      onReorder(arrayMove(supportList, oldIdx, newIdx));
    }
  }

  function handleToggleSelected(videoId) {
    setSelectedIds((prev) =>
      prev.includes(videoId)
        ? prev.filter((id) => id !== videoId)
        : [...prev, videoId],
    );
  }

  function showToast(message) {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    setToastMessage(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      toastTimeoutRef.current = null;
      setToastMessage('');
    }, 2400);
  }

  function handleToggleSelectionMode() {
    setSelectionMode((prev) => {
      const nextValue = !prev;
      if (!nextValue) {
        setSelectedIds([]);
        setContextMenu(null);
      }
      return nextValue;
    });
  }

  function handleSelectAll() {
    setSelectedIds(supportList.map((video) => video.videoId));
  }

  function openContextMenu(event, videos, mode) {
    const left = Math.min(
      event.clientX,
      window.innerWidth - CONTEXT_MENU_WIDTH - 8,
    );
    const top = Math.min(
      event.clientY,
      window.innerHeight - CONTEXT_MENU_HEIGHT - 8,
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
      const selectedVideos = supportList.filter((entry) =>
        selectedLookup.has(entry.videoId),
      );
      openContextMenu(event, selectedVideos, 'multi');
      return;
    }

    openContextMenu(event, [video], 'single');
  }

  function handleDoubleQueue(video) {
    handleQueueVideos([video]);
  }

  function normalizeAddResult(videos, addResult) {
    if (typeof addResult === 'number') {
      return addResult;
    }

    if (typeof addResult?.addedCount === 'number') {
      return addResult.addedCount;
    }

    return videos.length;
  }

  function handleQueueVideos(videos) {
    if (!videos.length) return;

    const addResult = onAddToPlaylist(videos);
    const addedCount = normalizeAddResult(videos, addResult);

    if (addedCount > 0) {
      showToast(
        addedCount === 1
          ? 'Added 1 song to current playlist'
          : `Added ${addedCount} songs to current playlist`,
      );
      return;
    }

    showToast('Those songs are already in the current playlist');
  }

  function handlePlayNow() {
    if (!contextMenu?.videos[0]) return;
    onPlayNow(contextMenu.videos[0]);
    setContextMenu(null);
  }

  function handleAddToCurrentPlaylist() {
    if (!contextMenu?.videos.length) return;
    handleQueueVideos(contextMenu.videos);
    setContextMenu(null);
  }

  function handleRemoveSupport() {
    if (!contextMenu?.videos.length) return;
    const removedIds = contextMenu.videos.map((video) => video.videoId);
    setSelectedIds((prev) => prev.filter((id) => !removedIds.includes(id)));
    onRemove(removedIds);
    setContextMenu(null);
  }

  const showSelectionActions = selectionMode && supportList.length > 0;

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
        {toastMessage && (
          <div className="fav-panel-toast" role="status" aria-live="polite">
            {toastMessage}
          </div>
        )}
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
            {supportList.length > 0 && (
              <button
                className={`fav-panel-action-btn${selectionMode ? ' active' : ''}`}
                type="button"
                onClick={handleToggleSelectionMode}
              >
                {selectionMode ? 'Done' : 'Select'}
              </button>
            )}
            <button
              className="btn-close"
              onClick={onClose}
              aria-label={closeLabel}
            >
              ✕
            </button>
          </div>
        </div>

        {showSelectionActions && (
          <div className="fav-panel-selection-toolbar">
            <button
              className="fav-panel-action-btn selection-accent"
              type="button"
              onClick={handleSelectAll}
            >
              Select all
            </button>
            <button
              className="fav-panel-action-btn selection-accent"
              type="button"
              onClick={() => handleQueueVideos(selectedVideos)}
              disabled={selectedVideos.length === 0}
            >
              Add to Current Playlist
            </button>
            <button
              className="fav-panel-action-btn selection-accent"
              type="button"
              onClick={() => {
                if (!selectedVideos.length) return;
                const removedIds = selectedVideos.map((video) => video.videoId);
                setSelectedIds([]);
                onRemove(removedIds);
              }}
              disabled={selectedVideos.length === 0}
            >
              {contextRemoveLabel}
            </button>
          </div>
        )}

        <div className="fav-panel-body">
          {supportList.length === 0 ? (
            <div className="fav-empty">
              <div className="fav-empty-icon">{emptyIcon}</div>
              <div
                style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                }}
              >
                {emptyTitle}
              </div>
              <div className="fav-hint">{emptyHint}</div>
            </div>
          ) : selectionMode ? (
            supportList.map((video) => (
              <SupportItem
                key={video.videoId}
                video={video}
                onRemove={onRemove}
                onDoubleQueue={handleDoubleQueue}
                onOpenContextMenu={handleOpenContextMenu}
                selectionMode={true}
                isSelected={selectedIdSet.has(video.videoId)}
                onToggleSelected={handleToggleSelected}
                onToggleSupport={onToggleSupport}
                itemAriaPrefix={itemAriaPrefix}
                removeButtonTitle={removeButtonTitle}
                removeButtonAriaLabel={removeButtonAriaLabel}
                tone={tone}
              />
            ))
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={supportList.map((entry) => entry.videoId)}
                strategy={verticalListSortingStrategy}
              >
                {supportList.map((video) => (
                  <SortableSupportItem
                    key={video.videoId}
                    video={video}
                    onRemove={onRemove}
                    onDoubleQueue={handleDoubleQueue}
                    onOpenContextMenu={handleOpenContextMenu}
                    onToggleSupport={onToggleSupport}
                    itemAriaPrefix={itemAriaPrefix}
                    removeButtonTitle={removeButtonTitle}
                    removeButtonAriaLabel={removeButtonAriaLabel}
                    tone={tone}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="fav-panel-footer">
          {authUser && pendingMetadataCount > 0 && (
            <div className="metadata-banner">
              <div className="metadata-banner-text">
                Add metadata to {pendingMetadataCount}{' '}
                {pendingMetadataCount === 1 ? 'new track' : 'new tracks'}?
              </div>
              <div className="metadata-banner-actions">
                <button
                  className="metadata-banner-btn yes"
                  onClick={onOpenMetadataDialog}
                >
                  Yes
                </button>
                <button
                  className="metadata-banner-btn no"
                  onClick={onDismissMetadataBanner}
                >
                  No
                </button>
              </div>
            </div>
          )}
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
            onClick={(event) => event.stopPropagation()}
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
            <div
              style={{
                height: '1px',
                background: 'var(--border)',
                margin: '4px 0',
              }}
            />
            <button
              className="support-context-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                contextMenu.videos.forEach((v) => onToggleSupport(v, 1));
                setContextMenu(null);
              }}
            >
              <span style={{ color: 'var(--gold)', marginRight: 8 }}>♥</span>{' '}
              Set Standard Support
            </button>
            <button
              className="support-context-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                contextMenu.videos.forEach((v) => onToggleSupport(v, 2));
                setContextMenu(null);
              }}
            >
              <span style={{ color: 'var(--support-pink)', marginRight: 8 }}>
                ♥
              </span>{' '}
              Set High Support
            </button>
            <button
              className="support-context-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                contextMenu.videos.forEach((v) => onToggleSupport(v, 3));
                setContextMenu(null);
              }}
            >
              <span style={{ color: 'var(--support-gold)', marginRight: 8 }}>
                🔒
              </span>{' '}
              Set Definite Support
            </button>
            <div
              style={{
                height: '1px',
                background: 'var(--border)',
                margin: '4px 0',
              }}
            />
            {authUser && (
              <button
                className="support-context-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  onUpdateMetadata(contextMenu.videos);
                  setContextMenu(null);
                }}
              >
                Update Metadata
              </button>
            )}
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
