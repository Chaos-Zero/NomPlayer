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
import { ContextMenuPortal } from './ContextMenuPortal';
import CollectionAdder from './CollectionAdder.jsx';
import ExportIcon from './ExportIcon.jsx';
import YouTubeIcon from './YouTubeIcon.jsx';

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

export function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8H7V5.5a3 3 0 1 1 6 0V9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582 20.77 20.77 0 0 1-1.162.682l-.019.01-.005.003L9.653 16.915z" />
    </svg>
  );
}

export function SupportItem({
  orderNumber,
  video,
  onRemove,
  onDoubleQueue,
  onOpenContextMenu,
  selectionMode,
  isSelected,
  onToggleSelected,
  onOpenSupportDropdown,
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

      {orderNumber != null && (
        <div className="list-entry-number" aria-hidden="true">
          {orderNumber}
        </div>
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
            <button
              className={`support-tier-icon-btn level-${video.supportLevel || 1}`}
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                onOpenSupportDropdown(video, {
                  top: rect.top,
                  left: rect.left + rect.width / 2,
                });
              }}
              aria-label="Change support level"
              title="Change support level"
              style={{
                fontSize: '14px',
                opacity: 0.8,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color:
                  video.supportLevel === 2
                    ? 'var(--support-pink)'
                    : video.supportLevel === 3
                      ? 'var(--support-gold)'
                      : 'var(--gold)',
              }}
            >
              {video.supportLevel === 3 ? <LockIcon /> : <HeartIcon />}
            </button>
          )}
          {onRemove && (
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
          )}
        </div>
      )}
    </div>
  );
}

export function SortableSupportItem({
  orderNumber,
  video,
  uniqueId,
  onRemove,
  onDoubleQueue,
  onOpenContextMenu,
  onOpenSupportDropdown,
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
  } = useSortable({ id: uniqueId || video.videoId });

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
        orderNumber={orderNumber}
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
        onOpenSupportDropdown={onOpenSupportDropdown}
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
  onExport,
  onSavePlaylist,
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
  onOpenSupportDropdown = () => {},
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
    setContextMenu({
      left: event.clientX,
      top: event.clientY,
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
              <>
                <button
                  className="fav-panel-action-btn icon-only"
                  type="button"
                  onClick={() =>
                    onExport?.(
                      selectionMode && selectedVideos.length > 0
                        ? selectedVideos
                        : supportList,
                    )
                  }
                  title="Export for VGMC"
                  aria-label="Export for VGMC"
                >
                  <ExportIcon />
                </button>
                <button
                  className="fav-panel-action-btn icon-only"
                  type="button"
                  onClick={() =>
                    onSavePlaylist?.(
                      selectionMode && selectedVideos.length > 0
                        ? selectedVideos
                        : supportList,
                    )
                  }
                  title="Create YT Playlist"
                  aria-label="Create YT Playlist"
                >
                  <YouTubeIcon />
                </button>
                <button
                  className={`fav-panel-action-btn${selectionMode ? ' active' : ''}`}
                  type="button"
                  onClick={handleToggleSelectionMode}
                >
                  {selectionMode ? 'Done' : 'Select'}
                </button>
              </>
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
            supportList.map((video, index) => (
              <SupportItem
                key={video.videoId}
                orderNumber={index + 1}
                video={video}
                onRemove={onRemove}
                onDoubleQueue={handleDoubleQueue}
                onOpenContextMenu={handleOpenContextMenu}
                selectionMode={true}
                isSelected={selectedIdSet.has(video.videoId)}
                onToggleSelected={handleToggleSelected}
                onToggleSupport={onToggleSupport}
                onOpenSupportDropdown={onOpenSupportDropdown}
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
                {supportList.map((video, index) => (
                  <SortableSupportItem
                    key={video.videoId}
                    orderNumber={index + 1}
                    video={video}
                    onRemove={onRemove}
                    onDoubleQueue={handleDoubleQueue}
                    onOpenContextMenu={handleOpenContextMenu}
                    onToggleSupport={onToggleSupport}
                    onOpenSupportDropdown={onOpenSupportDropdown}
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
          <ContextMenuPortal
            x={contextMenu.left}
            y={contextMenu.top}
            onClose={() => setContextMenu(null)}
            className="support-context-menu"
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
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onOpenSupportDropdown(
                  contextMenu.videos[0],
                  {
                    top: rect.top,
                    left: rect.left + rect.width / 2,
                  },
                  contextMenu.videos,
                );
                setContextMenu(null);
              }}
            >
              Update Support
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
          </ContextMenuPortal>
        )}
      </div>
    </>
  );
}
