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
import CustomPlaylistSubmenu from './CustomPlaylistSubmenu.jsx';
import SupportLevelSubmenu from './SupportLevelSubmenu.jsx';
import ExportIcon from './ExportIcon.jsx';
import YouTubeIcon from './YouTubeIcon.jsx';
import ScrollingText from './ScrollingText.jsx';
import {
  HeartIcon,
  SupportOrderIcon,
  RatingOrderIcon,
  LockIcon,
  SpeechBubbleIcon,
  EyeIcon,
  PlayIcon,
} from './Icons.jsx';

const SUPPORT_LEVELS = [1, 2, 3];
const SUPPORT_LEVEL_LABELS = {
  1: 'Possible Support',
  2: 'Likely Support',
  3: 'Definite Support',
};

const PANEL_CLOSE_MS = 240;

function getPlaylistItemDisplay(video) {
  const isUnknown = (str) =>
    !str ||
    str.trim().toLowerCase() === 'metadata needed' ||
    str.trim().toLowerCase() === 'unknown track';

  const hasTrackTitle =
    typeof video?.trackTitle === 'string' && !isUnknown(video.trackTitle);
  const hasGameTitle =
    typeof video?.gameTitle === 'string' && !isUnknown(video.gameTitle);

  const hasCatalogMetadata = Boolean(hasTrackTitle || hasGameTitle);

  return {
    gameTitle: hasCatalogMetadata ? video.gameTitle : 'Metadata Needed',
    trackTitle: hasCatalogMetadata ? video.trackTitle : video.title,
    hasCatalogMetadata,
  };
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
  itemAriaPrefix,
  removeButtonTitle,
  removeButtonAriaLabel,
  tone,
  commentActivity = null,
  onShowComments,
  userComment = null,
  showBreakdown = false,
}) {
  const [imgError, setImgError] = useState(false);
  const display = getPlaylistItemDisplay(video);
  const totalSupport =
    (video.supportCount1 || 0) +
    (video.supportCount2 || 0) +
    (video.supportCount3 || 0);
  const dominantSupportClass =
    video.supportCount3 > 0
      ? 'highest'
      : video.supportCount2 > 0
        ? 'strong'
        : 'normal';

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

      <div
        className="playlist-thumb-wrapper"
        style={{
          position: 'relative',
          width: 64,
          height: 36,
          flexShrink: 0,
          cursor: 'pointer',
          borderRadius: 4,
          overflow: 'hidden',
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!selectionMode) {
            onDoubleQueue(video);
          }
        }}
      >
        {video.thumbnail && !imgError ? (
          <img
            className="playlist-thumb"
            src={video.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            className="playlist-thumb-placeholder"
            style={{
              width: '100%',
              height: '100%',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ▶
          </div>
        )}
        <div className="playlist-thumb-play-overlay">
          <PlayIcon />
        </div>
      </div>

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
          <div
            key={`${video.videoId}:${display.hasCatalogMetadata ? 'meta' : 'raw'}`}
            className={`playlist-item-title-container ${display.hasCatalogMetadata ? 'is-metadata' : 'is-raw'}`}
          >
            {display.hasCatalogMetadata ? (
              <div className="playlist-item-title-meta">
                {display.gameTitle && (
                  <div className="meta-game-title">{display.gameTitle}</div>
                )}
                <div className="meta-track-title">{display.trackTitle}</div>
              </div>
            ) : (
              <div className="playlist-item-title-raw">
                <div className="meta-game-placeholder">Metadata Needed</div>
                <div className="meta-track-raw-title">
                  {display.trackTitle || video.videoId}
                </div>
              </div>
            )}
          </div>
        </div>
        {!display.hasCatalogMetadata && video.channelTitle && (
          <div className="playlist-item-meta">{video.channelTitle}</div>
        )}
        {userComment && (
          <div className="card-comment-indicator" title={userComment}>
            <SpeechBubbleIcon />
            <span>{userComment}</span>
          </div>
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
          <div className="fav-item-support-stats" style={{ flexShrink: 0 }}>
            {showBreakdown ? (
              <>
                {video.supportCount1 > 0 && (
                  <div
                    className="fav-support-stat normal"
                    title={`${video.supportCount1} Possible Supports`}
                  >
                    <HeartIcon />
                    <span>{video.supportCount1}</span>
                  </div>
                )}
                {video.supportCount2 > 0 && (
                  <div
                    className="fav-support-stat strong"
                    title={`${video.supportCount2} Likely Supports`}
                  >
                    <HeartIcon />
                    <span>{video.supportCount2}</span>
                  </div>
                )}
                {video.supportCount3 > 0 && (
                  <div
                    className="fav-support-stat highest"
                    title={`${video.supportCount3} Definite Supports`}
                  >
                    <LockIcon />
                    <span>{video.supportCount3}</span>
                  </div>
                )}
              </>
            ) : (
              totalSupport > 0 && (
                <div
                  className={`fav-support-stat ${dominantSupportClass}`}
                  title={`${totalSupport} Total Supports`}
                >
                  {video.supportCount3 > 0 ? <LockIcon /> : <HeartIcon />}
                  <span>{totalSupport}</span>
                </div>
              )
            )}
          </div>

          {/* A rating and the comment bubble both fighting for space here is
              how titles end up crowding into the icons - when there's a
              comment button to fold it into, show the rating inside that
              button instead of as its own separate field. Only when there's
              no comment button (onShowComments unset) does the rating get
              its own badge, so it's never simply dropped. */}
          {video.rating != null && !onShowComments && (
            <span
              className="list-explorer-peer-rating"
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {video.rating}/10
            </span>
          )}

          {onShowComments && (
            <button
              className={`comment-bubble-btn${
                commentActivity === 'commented'
                  ? ' has-comments'
                  : commentActivity === 'rated'
                    ? ' has-rated'
                    : ' empty'
              }`}
              type="button"
              title={
                video.rating != null
                  ? `Your rating: ${video.rating}, view community comments`
                  : commentActivity
                    ? 'View community comments'
                    : 'Add a comment or score'
              }
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onShowComments?.(video, {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                });
              }}
            >
              {video.rating != null ? (
                <span className="comment-bubble-rating">{video.rating}</span>
              ) : (
                <SpeechBubbleIcon />
              )}
            </button>
          )}

          {tone === 'support' && (
            <button
              className={`support-tier-icon-btn level-${video.supportLevel || 1}`}
              onClick={(event) => {
                event.stopPropagation();
                // Opens the community tab (same panel the comment bubble opens),
                // which also has its own "Your Support" control, so this icon no
                // longer needs its own popover for changing level, right-click ->
                // Support Level still covers that for anyone who preferred it.
                const rect = event.currentTarget.getBoundingClientRect();
                onShowComments?.(video, {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                });
              }}
              aria-label="Open community tab"
              title="View community support & comments"
              style={{
                fontSize: '14px',
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
  onToggleNomination,
  itemAriaPrefix,
  removeButtonTitle,
  removeButtonAriaLabel,
  tone,
  commentActivity = null,
  onShowComments,
  showBreakdown = false,
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
        onToggleNomination={onToggleNomination}
        onOpenSupportDropdown={onOpenSupportDropdown}
        tone={tone}
        commentActivity={commentActivity}
        onShowComments={onShowComments}
        showBreakdown={showBreakdown}
      />
    </div>
  );
}

/** Eye-button popover for the support list: checkboxes for which support
 * levels (Possible/Likely/Definite) stay visible. Closes on outside click
 * or Escape, same convention as SupportLevelDropdown. */
function SupportLevelFilterDropdown({
  selectedLevels,
  onToggleLevel,
  onClose,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="user-menu-popover support-level-filter-dropdown"
      role="menu"
    >
      <div className="user-menu-summary support-level-filter-summary">
        Show support levels
      </div>
      {SUPPORT_LEVELS.map((level) => (
        <label key={level} className="support-level-filter-option">
          <input
            type="checkbox"
            checked={selectedLevels.has(level)}
            onChange={() => onToggleLevel(level)}
          />
          <span
            className={`item-fav-btn supported level-${level}`}
            style={{
              width: '18px',
              height: '18px',
              display: 'inline-flex',
              opacity: 1,
            }}
          >
            {level === 3 ? <LockIcon /> : <HeartIcon />}
          </span>
          {SUPPORT_LEVEL_LABELS[level]}
        </label>
      ))}
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
  onToggleNomination,
  onExport,
  onSavePlaylist,
  isOpen = true,
  onExited,
  title = 'Support list',
  titleIcon = '★',
  tone = 'support',
  emptyIcon = '☆',
  emptyTitle = 'No support items yet',
  emptyHint = 'Double-click an item to queue it, or right-click for Play Now, Add to My Queue, and Remove Support.',
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
  highlightAdd = false,
  onPlayList,
  globalActivityByVideoId = new Map(),
  onShowComments,
  customPlaylists,
  onUpdateCustomPlaylists,
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
  const [showSupportBreakdown, setShowSupportBreakdown] = useState(false);
  // null (list order) -> 'desc' (highest first) -> 'asc' (lowest first) -> null,
  // same three-state cycle as the VGMC playlist's rating-sort direction button.
  const [ratingSortDirection, setRatingSortDirection] = useState(null);
  // Support-list only, same cycle as ratingSortDirection.
  const [supportLevelSortDirection, setSupportLevelSortDirection] =
    useState(null);
  const [visibleSupportLevels, setVisibleSupportLevels] = useState(
    () => new Set(SUPPORT_LEVELS),
  );
  const [showLevelFilterMenu, setShowLevelFilterMenu] = useState(false);
  const isSupportTone = tone === 'support';
  const toastTimeoutRef = useRef(null);

  // Closing the panel mid-selection left the Select button showing "Done"
  // (and its selection still live) the next time the panel opened, since
  // nothing reset selectionMode on close - only on an explicit Select/Done
  // click. Adjusted here during render rather than in a useEffect (React's
  // recommended way to reset state in response to a prop change - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // so it takes effect the same render isOpen flips, not one render later.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setSelectionMode(false);
      setSelectedIds([]);
      setContextMenu(null);
    }
  }

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Map to keep track of original indices (1-based)
  const originalIndexMap = useMemo(() => {
    const map = new Map();
    supportList.forEach((video, index) => {
      map.set(video.videoId, index + 1);
    });
    return map;
  }, [supportList]);

  const displayList = useMemo(() => {
    let list = supportList;

    if (isSupportTone && visibleSupportLevels.size < SUPPORT_LEVELS.length) {
      list = list.filter((video) =>
        visibleSupportLevels.has(video.supportLevel || 1),
      );
    }

    if (isSupportTone && supportLevelSortDirection) {
      list = [...list].sort((a, b) => {
        const levelA = a.supportLevel || 1;
        const levelB = b.supportLevel || 1;
        const diff =
          supportLevelSortDirection === 'desc'
            ? levelB - levelA
            : levelA - levelB;
        if (diff !== 0) return diff;
        // Stable sort using original index for ties
        return (
          (originalIndexMap.get(a.videoId) || 0) -
          (originalIndexMap.get(b.videoId) || 0)
        );
      });
    } else if (ratingSortDirection) {
      list = [...list].sort((a, b) => {
        const ratingA = a.rating ?? -1;
        const ratingB = b.rating ?? -1;
        const diff =
          ratingSortDirection === 'desc'
            ? ratingB - ratingA
            : ratingA - ratingB;
        if (diff !== 0) return diff;
        // Stable sort using original index for ties
        return (
          (originalIndexMap.get(a.videoId) || 0) -
          (originalIndexMap.get(b.videoId) || 0)
        );
      });
    }

    return list;
  }, [
    supportList,
    isSupportTone,
    visibleSupportLevels,
    supportLevelSortDirection,
    ratingSortDirection,
    originalIndexMap,
  ]);

  // displayList, not supportList: every consumer of selectedVideos (Add to
  // Current Playlist, Remove Support, and the multi-select context menu's
  // own copy below) should act on selections in the order/subset actually
  // shown on screen - filtered by support level and/or sorted by rating,
  // whichever is currently active - not the underlying natural order. Same
  // fix as PlaylistSidebar's selectedVideos/displayPlaylist.
  const selectedVideos = useMemo(
    () => displayList.filter((video) => selectedIdSet.has(video.videoId)),
    [selectedIdSet, displayList],
  );

  // Reorders only the videos currently visible under the level filter,
  // leaving any filtered-out videos pinned at their existing positions -
  // otherwise "Save Order" while filtered would drop the hidden ones.
  function applyDisplayOrder(sortedVisibleList) {
    if (sortedVisibleList.length === supportList.length) {
      return sortedVisibleList;
    }
    const visibleIds = new Set(sortedVisibleList.map((v) => v.videoId));
    let cursor = 0;
    return supportList.map((video) =>
      visibleIds.has(video.videoId) ? sortedVisibleList[cursor++] : video,
    );
  }

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
        closeContextMenu();
      }
      return nextValue;
    });
  }

  function handleSelectAll() {
    // Only what the level filter is currently showing, not everything
    // underneath it.
    setSelectedIds(displayList.map((video) => video.videoId));
  }

  function openContextMenu(event, videos, mode) {
    setContextMenu({
      left: event.clientX,
      top: event.clientY,
      videos,
      mode,
    });
  }

  function closeContextMenu() {
    setContextMenu(null);
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
      // displayList, not supportList - same reasoning as the outer
      // selectedVideos memo above, this is just a same-render-cycle
      // recomputation of it since nextSelectedIds can differ from the
      // selectedIds state this render started with.
      const selectedVideos = displayList.filter((entry) =>
        selectedLookup.has(entry.videoId),
      );
      openContextMenu(event, selectedVideos, 'multi');
      return;
    }

    openContextMenu(event, [video], 'single');
  }

  function handleDoubleQueue(video) {
    onPlayNow(video);
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
    closeContextMenu();
  }

  function handleAddToCurrentPlaylist() {
    if (!contextMenu?.videos.length) return;
    handleQueueVideos(contextMenu.videos);
    closeContextMenu();
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
        <div className="fav-panel-title-bar">
          <span className="fav-panel-title-icon">{titleIcon}</span>
          <ScrollingText
            className="fav-panel-title-scroll"
            text={title}
            truncateWhenStatic
          />
          <span className="fav-panel-title-count">
            {supportList.length} {supportList.length === 1 ? 'video' : 'videos'}
          </span>
        </div>
        <div className="fav-panel-header">
          <div className="fav-panel-actions">
            {supportList.length > 0 && (
              <>
                <button
                  className="fav-panel-action-btn icon-only"
                  type="button"
                  onClick={onPlayList}
                  title="Start list in sidebar"
                  aria-label="Start list in sidebar"
                >
                  <PlayIcon />
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
                {isSupportTone && (
                  <div className="support-level-filter-wrapper">
                    <button
                      className={`fav-panel-action-btn icon-only${visibleSupportLevels.size < SUPPORT_LEVELS.length ? ' active' : ''}`}
                      type="button"
                      onClick={() => setShowLevelFilterMenu((v) => !v)}
                      title="Filter by support level"
                      aria-label="Filter by support level"
                      aria-haspopup="true"
                      aria-expanded={showLevelFilterMenu}
                    >
                      <EyeIcon />
                    </button>
                    {showLevelFilterMenu && (
                      <SupportLevelFilterDropdown
                        selectedLevels={visibleSupportLevels}
                        onToggleLevel={(level) => {
                          setVisibleSupportLevels((previousValue) => {
                            const next = new Set(previousValue);
                            if (next.has(level)) {
                              next.delete(level);
                            } else {
                              next.add(level);
                            }
                            return next;
                          });
                        }}
                        onClose={() => setShowLevelFilterMenu(false)}
                      />
                    )}
                  </div>
                )}
                {isSupportTone && (
                  <button
                    className={`fav-panel-action-btn icon-only${supportLevelSortDirection ? ' active' : ''}`}
                    type="button"
                    onClick={() => {
                      setSupportLevelSortDirection((previousValue) =>
                        previousValue === null
                          ? 'desc'
                          : previousValue === 'desc'
                            ? 'asc'
                            : null,
                      );
                      setRatingSortDirection(null);
                      if (selectionMode) setSelectionMode(false);
                    }}
                    title={
                      supportLevelSortDirection === 'desc'
                        ? 'Sorted by support level, highest first, click for lowest first'
                        : supportLevelSortDirection === 'asc'
                          ? 'Sorted by support level, lowest first, click to reset'
                          : 'Order by support level'
                    }
                    aria-label="Order by support level"
                  >
                    <SupportOrderIcon
                      direction={
                        supportLevelSortDirection === 'asc' ? 'asc' : 'desc'
                      }
                    />
                  </button>
                )}
                <button
                  className={`fav-panel-action-btn icon-only${ratingSortDirection ? ' active' : ''}`}
                  type="button"
                  onClick={() => {
                    setRatingSortDirection((previousValue) =>
                      previousValue === null
                        ? 'desc'
                        : previousValue === 'desc'
                          ? 'asc'
                          : null,
                    );
                    setSupportLevelSortDirection(null);
                    if (selectionMode) setSelectionMode(false);
                  }}
                  title={
                    ratingSortDirection === 'desc'
                      ? 'Sorted by your rating, highest first, click for lowest first'
                      : ratingSortDirection === 'asc'
                        ? 'Sorted by your rating, lowest first, click to reset'
                        : 'Order by rating'
                  }
                  aria-label="Order by rating"
                >
                  <RatingOrderIcon
                    direction={ratingSortDirection === 'asc' ? 'asc' : 'desc'}
                  />
                </button>
                <button
                  className={`fav-panel-action-btn${showSupportBreakdown ? ' active' : ''}`}
                  type="button"
                  onClick={() => setShowSupportBreakdown((v) => !v)}
                  title={
                    showSupportBreakdown
                      ? 'Show support total'
                      : 'Show support breakdown'
                  }
                  aria-label={
                    showSupportBreakdown
                      ? 'Show support total'
                      : 'Show support breakdown'
                  }
                >
                  {showSupportBreakdown ? 'Total' : 'Breakdown'}
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
              Add to My Queue
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
          ) : displayList.length === 0 ? (
            <div className="fav-empty">
              <div className="fav-empty-icon">👁️</div>
              <div
                style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                }}
              >
                No songs at the selected support levels
              </div>
              <div className="fav-hint">
                Open the filter and check a level to show it again.
              </div>
            </div>
          ) : selectionMode ? (
            displayList.map((video) => (
              <SupportItem
                key={video.videoId}
                orderNumber={originalIndexMap.get(video.videoId)}
                video={video}
                onRemove={onRemove}
                onDoubleQueue={handleDoubleQueue}
                onOpenContextMenu={handleOpenContextMenu}
                onToggleNomination={onToggleNomination}
                selectionMode={true}
                isSelected={selectedIdSet.has(video.videoId)}
                onToggleSelected={handleToggleSelected}
                onToggleSupport={onToggleSupport}
                onOpenSupportDropdown={onOpenSupportDropdown}
                itemAriaPrefix={itemAriaPrefix}
                removeButtonTitle={removeButtonTitle}
                removeButtonAriaLabel={removeButtonAriaLabel}
                tone={tone}
                commentActivity={
                  globalActivityByVideoId.get(video.videoId) ?? null
                }
                onShowComments={onShowComments}
                showBreakdown={showSupportBreakdown}
              />
            ))
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayList.map((entry) => entry.videoId)}
                strategy={verticalListSortingStrategy}
              >
                {displayList.map((video) => (
                  <SortableSupportItem
                    key={video.videoId}
                    orderNumber={originalIndexMap.get(video.videoId)}
                    video={video}
                    onRemove={onRemove}
                    onDoubleQueue={handleDoubleQueue}
                    onOpenContextMenu={handleOpenContextMenu}
                    onToggleNomination={onToggleNomination}
                    onToggleSupport={onToggleSupport}
                    onOpenSupportDropdown={onOpenSupportDropdown}
                    itemAriaPrefix={itemAriaPrefix}
                    removeButtonTitle={removeButtonTitle}
                    removeButtonAriaLabel={removeButtonAriaLabel}
                    tone={tone}
                    commentActivity={
                      globalActivityByVideoId.get(video.videoId) ?? null
                    }
                    onShowComments={onShowComments}
                    showBreakdown={showSupportBreakdown}
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
          {ratingSortDirection || supportLevelSortDirection ? (
            <div
              className={`collection-adder tone-${tone} sorting-active`}
              key="sorting"
            >
              <div className="collection-adder-shell" style={{ height: 58 }}>
                <div className="collection-adder-stage">
                  <div className="collection-adder-face collection-adder-front">
                    {addButtonLabel}
                  </div>
                  <button
                    className="collection-save-order-back"
                    type="button"
                    onClick={() => {
                      onReorder?.(applyDisplayOrder(displayList));
                      const reorderedBySupportLevel = Boolean(
                        supportLevelSortDirection,
                      );
                      setRatingSortDirection(null);
                      setSupportLevelSortDirection(null);
                      showToast(
                        reorderedBySupportLevel
                          ? 'Support list reordered by support level'
                          : 'Support list reordered by rating',
                      );
                    }}
                  >
                    Save Order
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <CollectionAdder
              tone={tone}
              addButtonLabel={addButtonLabel}
              onAddDirectItems={onAddDirectItems}
              highlight={highlightAdd}
            />
          )}
        </div>

        {contextMenu && isOpen && (
          <ContextMenuPortal
            x={contextMenu.left}
            y={contextMenu.top}
            onClose={closeContextMenu}
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

            <div className="context-menu-divider" />

            <button
              className="support-context-menu-item"
              type="button"
              role="menuitem"
              onClick={handleAddToCurrentPlaylist}
            >
              Add to My Queue
            </button>

            {tone !== 'nomination' && onToggleNomination && (
              <button
                className="support-context-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleNomination(contextMenu.videos);
                  closeContextMenu();
                }}
              >
                Add to My Nominations
              </button>
            )}
            {tone === 'nomination' && (
              <button
                className="support-context-menu-item danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  const removedIds = contextMenu.videos.map(
                    (video) => video.videoId,
                  );
                  onRemove(removedIds);
                  closeContextMenu();
                  if (selectionMode) {
                    setSelectedIds([]);
                  }
                }}
              >
                {contextRemoveLabel}
              </button>
            )}

            {tone !== 'nomination' && onToggleSupport && (
              <SupportLevelSubmenu
                videos={contextMenu.videos}
                currentLevel={contextMenu.videos[0]?.supportLevel || 1}
                onToggleSupport={onToggleSupport}
                onClose={closeContextMenu}
                itemClassName="support-context-menu-item"
                showRemove={false}
              />
            )}
            {tone !== 'nomination' && (
              <button
                className="support-context-menu-item danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  const removedIds = contextMenu.videos.map(
                    (video) => video.videoId,
                  );
                  onRemove(removedIds);
                  closeContextMenu();
                  if (selectionMode) {
                    setSelectedIds([]);
                  }
                }}
              >
                {contextRemoveLabel}
              </button>
            )}

            <CustomPlaylistSubmenu
              videos={contextMenu.videos}
              customPlaylists={customPlaylists}
              onUpdateCustomPlaylists={onUpdateCustomPlaylists}
              onShowToast={showToast}
              onClose={closeContextMenu}
              itemClassName="support-context-menu-item"
            />

            {authUser && (
              <>
                <div className="context-menu-divider" />
                <button
                  className="support-context-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onUpdateMetadata(contextMenu.videos);
                    closeContextMenu();
                  }}
                >
                  Update Metadata
                </button>
              </>
            )}
          </ContextMenuPortal>
        )}
      </div>
    </>
  );
}
