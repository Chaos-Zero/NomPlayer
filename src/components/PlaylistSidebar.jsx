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
import ScrollingText from './ScrollingText.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';

const CONTEXT_MENU_WIDTH = 180;
const CONTEXT_MENU_HEIGHT = 96;

function FastForwardIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.75 4.95v10.1c0 .58.64.94 1.14.64l6.45-4.98c.44-.34.44-1.08 0-1.42L4.89 4.31c-.5-.3-1.14.06-1.14.64Z" />
      <path d="M10.5 4.95v10.1c0 .58.64.94 1.14.64l6.45-4.98c.44-.34.44-1.08 0-1.42l-6.45-4.98c-.5-.3-1.14.06-1.14.64Z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.25 4.75 12.5 10l-5.25 5.25" />
    </svg>
  );
}

function PlaylistTabIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.5 5.25H10.75" />
      <path d="M4.5 9.75H10.75" />
      <path d="M4.5 14.25H10.75" />
      <path d="M13.25 6.25L16.25 8.5L13.25 10.75V6.25Z" />
    </svg>
  );
}

function PlaylistItem({
  orderNumber,
  video,
  isActive,
  isFlashing,
  listenedStatus,
  onSelect,
  isSupported,
  isNominated,
  onToggleSupport,
  onOpenContextMenu,
  selectionMode,
  isSelected,
  onToggleSelected,
}) {
  const [imgError, setImgError] = useState(false);
  const tickLabel =
    listenedStatus === 'complete'
      ? 'Completed'
      : listenedStatus === 'partial'
        ? 'Started'
        : null;
  const supportLabel = isNominated
    ? 'Nomination tracks cannot be changed from the playlist'
    : isSupported
      ? 'Remove from support list'
      : 'Add to support list';
  const supportTooltip = isNominated
    ? 'In Nomination List'
    : isSupported
      ? 'Remove Support'
      : 'Add to support list';
  const starStateClass = isNominated
    ? ' nominated locked'
    : isSupported
      ? ' supported'
      : '';
  const supportGlyph = isNominated ? '★' : isSupported ? '♥' : '♡';

  return (
    <div
      className={`playlist-item${isActive ? ' active' : ''}${isFlashing ? ' flash' : ''}${isSelected ? ' selected' : ''}`}
      onClick={() => {
        if (selectionMode) {
          onToggleSelected(video.videoId);
          return;
        }

        onSelect(video.videoId);
      }}
      onContextMenu={(event) => onOpenContextMenu(event, video)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;

        if (selectionMode) {
          onToggleSelected(video.videoId);
          return;
        }

        onSelect(video.videoId);
      }}
      aria-label={
        selectionMode ? `Select ${video.title}` : `Play ${video.title}`
      }
    >
      {selectionMode && (
        <button
          className={`support-select-toggle${isSelected ? ' active' : ''}`}
          type="button"
          aria-label={
            isSelected ? `Deselect ${video.title}` : `Select ${video.title}`
          }
          aria-pressed={isSelected}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelected(video.videoId);
          }}
        />
      )}

      <div className="list-entry-number" aria-hidden="true">
        {orderNumber}
      </div>

      {video.thumbnail && !imgError ? (
        <img
          className="playlist-thumb"
          src={video.thumbnail}
          alt=""
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="playlist-thumb-placeholder">▶</div>
      )}

      <div className="playlist-item-info">
        {isActive && !selectionMode ? (
          <ScrollingText
            className="playlist-item-title-scroll"
            text={video.title || video.videoId}
            truncateWhenStatic
          />
        ) : (
          <div className="playlist-item-title">
            {video.title || video.videoId}
          </div>
        )}
        {video.channelTitle && (
          <div className="playlist-item-meta">{video.channelTitle}</div>
        )}
      </div>

      <div className="playlist-item-actions">
        <span
          className={`item-status-tick${listenedStatus ? ` ${listenedStatus}` : ' empty'}`}
          aria-hidden={!tickLabel}
          aria-label={tickLabel || undefined}
          title={tickLabel || undefined}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8.5 6.6 11.6 12.5 4.9" />
          </svg>
        </span>
        <button
          className={`item-fav-btn${starStateClass}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSupport(video);
          }}
          title={supportTooltip}
          aria-label={supportLabel}
          disabled={isNominated}
        >
          {supportGlyph}
        </button>
      </div>
    </div>
  );
}

function SortablePlaylistItem({
  orderNumber,
  video,
  isActive,
  isFlashing,
  listenedStatus,
  onSelect,
  isSupported,
  isNominated,
  onToggleSupport,
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
      <PlaylistItem
        orderNumber={orderNumber}
        video={video}
        isActive={isActive}
        isFlashing={isFlashing}
        listenedStatus={listenedStatus}
        onSelect={onSelect}
        isSupported={isSupported}
        isNominated={isNominated}
        onToggleSupport={onToggleSupport}
        onOpenContextMenu={onOpenContextMenu}
        selectionMode={false}
        isSelected={false}
        onToggleSelected={() => {}}
      />
    </div>
  );
}

export default function PlaylistSidebar({
  playlist,
  currentIndex,
  flashVideoIds = [],
  isShuffleEnabled = false,
  isPreviewModeEnabled = false,
  isCollapsed = false,
  showOriginalOrder = false,
  onShuffle,
  onTogglePreview,
  onToggleCollapse,
  onToggleOrderView,
  onSelect,
  onReorder,
  supportList,
  nominationList = [],
  listenedStatusById = {},
  onToggleSupport,
  onAddToSupportList,
  onRemoveFromPlaylist,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const isMobileLayout = useMediaQuery('(max-width: 960px)');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);
  const collapseGestureRef = useRef(null);
  const supportIds = useMemo(
    () => new Set(supportList.map((entry) => entry.videoId)),
    [supportList],
  );
  const nominationIds = useMemo(
    () => new Set(nominationList.map((entry) => entry.videoId)),
    [nominationList],
  );
  const flashIds = useMemo(() => new Set(flashVideoIds), [flashVideoIds]);
  const selectedIdSet = useMemo(
    () =>
      new Set(
        selectedIds.filter((videoId) =>
          playlist.some((video) => video.videoId === videoId),
        ),
      ),
    [playlist, selectedIds],
  );
  const selectedVideos = useMemo(
    () => playlist.filter((video) => selectedIdSet.has(video.videoId)),
    [playlist, selectedIdSet],
  );
  const canReorder = !selectionMode && (!isShuffleEnabled || showOriginalOrder);

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
    function clearGesture() {
      collapseGestureRef.current = null;
    }

    function handlePointerMove(event) {
      const gesture = collapseGestureRef.current;
      if (!gesture || !isMobileLayout) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        gesture.moved = true;
      }

      if (gesture.toggled) return;

      if (isCollapsed && deltaX <= -32) {
        gesture.toggled = true;
        onToggleCollapse();
      } else if (!isCollapsed && deltaX >= 32) {
        gesture.toggled = true;
        onToggleCollapse();
      }
    }

    function handlePointerUp(event) {
      const gesture = collapseGestureRef.current;
      if (!gesture) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (
        isMobileLayout &&
        !gesture.toggled &&
        Math.abs(deltaX) < 8 &&
        Math.abs(deltaY) < 8
      ) {
        onToggleCollapse();
      }

      clearGesture();
    }

    function handlePointerCancel() {
      clearGesture();
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [isCollapsed, isMobileLayout, onToggleCollapse]);

  function handleCollapseTabPointerDown(event) {
    if (!isMobileLayout) return;

    collapseGestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      toggled: false,
    };
  }

  function handleCollapseTabClick(event) {
    if (isMobileLayout) {
      event.preventDefault();
      return;
    }

    onToggleCollapse();
  }

  function handleDragEdgePointerDown(event) {
    if (!isMobileLayout) return;

    collapseGestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      toggled: false,
    };
  }

  const shouldShowCollapseTab = !isMobileLayout || isCollapsed;
  const showMobileHeaderClose = isMobileLayout && !isCollapsed;

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = playlist.findIndex((video) => video.videoId === active.id);
    const newIdx = playlist.findIndex((video) => video.videoId === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    onReorder?.(arrayMove(playlist, oldIdx, newIdx));
  }

  function handleToggleSelectionMode() {
    setSelectionMode((previousValue) => {
      const nextValue = !previousValue;
      if (!nextValue) {
        setSelectedIds([]);
        setContextMenu(null);
      }
      return nextValue;
    });
  }

  function handleToggleSelected(videoId) {
    setSelectedIds((previousIds) =>
      previousIds.includes(videoId)
        ? previousIds.filter((id) => id !== videoId)
        : [...previousIds, videoId],
    );
  }

  function handleSelectAll() {
    setSelectedIds(playlist.map((video) => video.videoId));
  }

  function renderHeader() {
    return (
      <div className="sidebar-header">
        <div className="sidebar-header-main">
          <span className="sidebar-title">Playlist</span>
          <span className="sidebar-count">{playlist.length} videos</span>
        </div>

        <div className="sidebar-header-actions">
          {isMobileLayout && (
            <>
              <button
                className={`sidebar-icon-btn shuffle${isShuffleEnabled ? ' active' : ''}`}
                type="button"
                onClick={onShuffle}
                disabled={playlist.length < 2}
                aria-label="Shuffle playlist"
                title="Shuffle playlist"
              >
                🔀
              </button>
              <button
                className={`sidebar-icon-btn preview${isPreviewModeEnabled ? ' active' : ''}`}
                type="button"
                onClick={onTogglePreview}
                disabled={playlist.length === 0}
                aria-label="Preview mode"
                aria-pressed={isPreviewModeEnabled}
                title="Preview mode"
              >
                <FastForwardIcon />
              </button>
            </>
          )}
          {playlist.length > 0 && (
            <button
              className={`fav-panel-action-btn${selectionMode ? ' active' : ''}`}
              type="button"
              onClick={handleToggleSelectionMode}
            >
              {selectionMode ? 'Done' : 'Select'}
            </button>
          )}
          {showMobileHeaderClose && (
            <button
              className="btn-close"
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse playlist"
              title="Collapse playlist"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!playlist.length) {
    return (
      <div
        className={`sidebar playlist-sidebar${isCollapsed ? ' collapsed' : ''}`}
      >
        {shouldShowCollapseTab && (
          <button
            className={`playlist-collapse-tab${isCollapsed ? ' collapsed' : ''}`}
            type="button"
            onPointerDown={handleCollapseTabPointerDown}
            onClick={handleCollapseTabClick}
            aria-label={isCollapsed ? 'Expand playlist' : 'Collapse playlist'}
            title={isCollapsed ? 'Expand playlist' : 'Collapse playlist'}
          >
            {isCollapsed ? <PlaylistTabIcon /> : <ChevronIcon />}
          </button>
        )}
        {!isCollapsed && isMobileLayout && (
          <div
            className="playlist-drag-edge"
            onPointerDown={handleDragEdgePointerDown}
            data-testid="playlist-drag-edge"
            aria-hidden="true"
          />
        )}
        {!isCollapsed && renderHeader()}
        {!isCollapsed && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 32, opacity: 0.3 }}>🎵</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              No playlist loaded
            </div>
            <div style={{ fontSize: 11 }}>
              Paste a YouTube URL above to get started
            </div>
          </div>
        )}
      </div>
    );
  }

  function handleOpenContextMenu(event, video) {
    event.preventDefault();

    const left = Math.min(
      event.clientX,
      window.innerWidth - CONTEXT_MENU_WIDTH - 8,
    );
    const top = Math.min(
      event.clientY,
      window.innerHeight - CONTEXT_MENU_HEIGHT - 8,
    );

    setContextMenu({ left: Math.max(8, left), top: Math.max(8, top), video });
  }

  function handleSupport(video) {
    onAddToSupportList(video);
    setContextMenu(null);
  }

  function handleRemove(videoId) {
    onRemoveFromPlaylist(videoId);
    setContextMenu(null);
  }

  const showOrderToggle = isShuffleEnabled && playlist.length > 1;
  const showSelectionActions = selectionMode && playlist.length > 0;

  return (
    <div
      className={`sidebar playlist-sidebar${isCollapsed ? ' collapsed' : ''}`}
    >
      {shouldShowCollapseTab && (
        <button
          className={`playlist-collapse-tab${isCollapsed ? ' collapsed' : ''}`}
          type="button"
          onPointerDown={handleCollapseTabPointerDown}
          onClick={handleCollapseTabClick}
          aria-label={isCollapsed ? 'Expand playlist' : 'Collapse playlist'}
          title={isCollapsed ? 'Expand playlist' : 'Collapse playlist'}
        >
          {isCollapsed ? <PlaylistTabIcon /> : <ChevronIcon />}
        </button>
      )}
      {!isCollapsed && isMobileLayout && (
        <div
          className="playlist-drag-edge"
          onPointerDown={handleDragEdgePointerDown}
          data-testid="playlist-drag-edge"
          aria-hidden="true"
        />
      )}
      {!isCollapsed && renderHeader()}
      {!isCollapsed && (
        <div
          className={`playlist-order-toggle${showOrderToggle ? ' visible' : ''}`}
        >
          <div className="playlist-order-toggle-inner">
            <button
              className="sidebar-toolbar-btn"
              type="button"
              onClick={onToggleOrderView}
              disabled={!showOrderToggle}
            >
              {showOriginalOrder ? 'Show play order' : 'Show original order'}
            </button>
          </div>
        </div>
      )}
      {!isCollapsed && showSelectionActions && (
        <div className="fav-panel-selection-toolbar playlist-selection-toolbar">
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
            onClick={() => {
              if (!selectedVideos.length) return;
              const removedIds = selectedVideos.map((video) => video.videoId);
              setSelectedIds([]);
              onRemoveFromPlaylist(removedIds);
            }}
            disabled={selectedVideos.length === 0}
          >
            Remove from Playlist
          </button>
        </div>
      )}
      {!isCollapsed && (
        <div className="playlist-list" role="list">
          {selectionMode ? (
            playlist.map((video, index) => (
              <PlaylistItem
                key={video.videoId}
                orderNumber={(video.loadIndex ?? index) + 1}
                video={video}
                isActive={index === currentIndex}
                isFlashing={flashIds.has(video.videoId)}
                listenedStatus={listenedStatusById[video.videoId] || null}
                onSelect={onSelect}
                isSupported={supportIds.has(video.videoId)}
                isNominated={nominationIds.has(video.videoId)}
                onToggleSupport={onToggleSupport}
                onOpenContextMenu={handleOpenContextMenu}
                selectionMode={true}
                isSelected={selectedIdSet.has(video.videoId)}
                onToggleSelected={handleToggleSelected}
              />
            ))
          ) : canReorder ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={playlist.map((video) => video.videoId)}
                strategy={verticalListSortingStrategy}
              >
                {playlist.map((video, index) => (
                  <SortablePlaylistItem
                    key={video.videoId}
                    orderNumber={(video.loadIndex ?? index) + 1}
                    video={video}
                    isActive={index === currentIndex}
                    isFlashing={flashIds.has(video.videoId)}
                    listenedStatus={listenedStatusById[video.videoId] || null}
                    onSelect={onSelect}
                    isSupported={supportIds.has(video.videoId)}
                    isNominated={nominationIds.has(video.videoId)}
                    onToggleSupport={onToggleSupport}
                    onOpenContextMenu={handleOpenContextMenu}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            playlist.map((video, index) => (
              <PlaylistItem
                key={video.videoId}
                orderNumber={(video.loadIndex ?? index) + 1}
                video={video}
                isActive={index === currentIndex}
                isFlashing={flashIds.has(video.videoId)}
                listenedStatus={listenedStatusById[video.videoId] || null}
                onSelect={onSelect}
                isSupported={supportIds.has(video.videoId)}
                isNominated={nominationIds.has(video.videoId)}
                onToggleSupport={onToggleSupport}
                onOpenContextMenu={handleOpenContextMenu}
                selectionMode={false}
                isSelected={false}
                onToggleSelected={() => {}}
              />
            ))
          )}
        </div>
      )}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="playlist-context-menu"
          role="menu"
          style={{ top: contextMenu.top, left: contextMenu.left }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="playlist-context-menu-item"
            type="button"
            role="menuitem"
            onClick={() => handleSupport(contextMenu.video)}
            disabled={
              supportIds.has(contextMenu.video.videoId) ||
              nominationIds.has(contextMenu.video.videoId)
            }
          >
            Support
          </button>
          <button
            className="playlist-context-menu-item danger"
            type="button"
            role="menuitem"
            onClick={() => handleRemove(contextMenu.video.videoId)}
          >
            Remove from Playlist
          </button>
        </div>
      )}
    </div>
  );
}
