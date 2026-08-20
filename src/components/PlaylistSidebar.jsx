import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useVirtualizer } from '@tanstack/react-virtual';
import { ContextMenuPortal } from './ContextMenuPortal';
import CustomPlaylistSubmenu from './CustomPlaylistSubmenu.jsx';
import SupportLevelSubmenu from './SupportLevelSubmenu.jsx';
import CollectionAdder from './CollectionAdder.jsx';
import FilterSearchControl from './FilterSearchControl.jsx';
import ExportIcon from './ExportIcon.jsx';
import PrivacyToggle from './PrivacyToggle.jsx';
import SharePlaylistConfirmDialog from './SharePlaylistConfirmDialog.jsx';
import YouTubeIcon from './YouTubeIcon.jsx';
import ScrollingText from './ScrollingText.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';
import { getDisplayProfileName } from '../lib/playerState.js';
import { getMediaThumbnailUrl } from '../utils/media.js';
import { buildPlaylistShareUrl } from '../lib/communityPlaylists.js';
import {
  CheckDownIcon,
  LocateIcon,
  ShareIcon,
  SortByRatingIcon,
  SpeechBubbleIcon,
} from './Icons.jsx';

const VGMC_PLAYLIST_ID = import.meta.env.VITE_VGMC_PLAYLIST_ID || '';

// Passed to PlaylistItem as onToggleSelected outside of selection mode,
// where it's unreachable (PlaylistItem only calls it when selectionMode is
// true) but still a prop PlaylistItem's memo() has to compare - a shared
// reference so it doesn't defeat that memo on every render the way a fresh
// inline () => {} would.
const noop = () => {};

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
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

function PlaylistTabIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 5.25H10.75" />
      <path d="M4.5 9.75H10.75" />
      <path d="M4.5 14.25H10.75" />
      <path
        fill="currentColor"
        stroke="none"
        d="M13.25 6.25L16.25 8.5L13.25 10.75V6.25Z"
      />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582 20.77 20.77 0 0 1-1.162.682l-.019.01-.005.003L9.653 16.915z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2l2.35 4.76 5.26.76-3.81 3.71.9 5.24L10 14.12l-4.7 2.47.9-5.24-3.81-3.71 5.26-.76L10 2z" />
    </svg>
  );
}

function getPlaylistItemDisplay(video) {
  const hasTrackTitle =
    typeof video?.trackTitle === 'string' && video.trackTitle.trim();
  const hasGameTitle =
    typeof video?.gameTitle === 'string' && video.gameTitle.trim();
  const hasCatalogMetadata = Boolean(hasTrackTitle || hasGameTitle);

  return {
    hasCatalogMetadata,
    primaryTitle:
      (hasTrackTitle && video.trackTitle) ||
      (hasCatalogMetadata && video.displayTitle) ||
      video?.title ||
      video?.videoId,
    secondaryTitle:
      (hasGameTitle && video.gameTitle) || video?.channelTitle || '',
  };
}

// A row's title/meta text has to share its line with the rating badge,
// comment bubble, and support heart on the right (see .playlist-item-actions),
// same as every other row - but a long title/game name that's actively
// scrolling (see ScrollingText's marquee) renders its *full* text, with
// nothing else CSS truncation would otherwise clip it to, and that full
// text can end up feeling like it's crowding into those icons as it
// scrolls past. Capping the displayed string here (search/aria-label still
// use the untruncated getPlaylistItemDisplay() value, only what's actually
// painted goes through this) keeps every row - scrolling or not - a
// predictable length that comfortably clears them.
function truncateForDisplay(text, maxLength = 32) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

// Memoized: a large playlist renders one of these per track, and most of
// them get identical props again whenever the list re-renders for a reason
// that only actually touches one or two rows (e.g. listenedStatusById
// gaining an entry for whichever track just finished).
const PlaylistItem = memo(function PlaylistItem({
  orderNumber,
  video,
  isActive,
  isFlashing,
  listenedStatus,
  onSelect,
  isSupported,
  supportLevel,
  isNominated,
  isRetired,
  onToggleSupport,
  onOpenSupportDropdown,
  onOpenContextMenu,
  selectionMode,
  isSelected,
  onToggleSelected,
  commentActivity = null,
  onShowComments,
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
    : isRetired
      ? 'This song is retired'
      : isSupported
        ? 'Remove from support list'
        : 'Add to support list';
  const supportTooltip = isNominated
    ? 'In Nomination List'
    : isRetired
      ? 'This song is retired'
      : isSupported
        ? 'Remove Support'
        : 'Add to support list';
  const starStateClass = isNominated
    ? ' nominated locked'
    : isRetired
      ? ' retired-blocked'
      : isSupported
        ? ` supported level-${supportLevel}`
        : '';
  const supportGlyph = isNominated
    ? '★'
    : isSupported
      ? supportLevel === 3
        ? '🔒'
        : '♥'
      : '♡';
  const { hasCatalogMetadata, primaryTitle, secondaryTitle } =
    getPlaylistItemDisplay(video);
  const accessibleTitle = primaryTitle || video.videoId;

  return (
    <div
      className={`playlist-item${isActive ? ' active' : ''}${isFlashing ? ' flash' : ''}${isSelected ? ' selected' : ''}${isRetired ? ' retired' : ''}${video.provider === 'bandcamp' ? ' provider-bandcamp' : ''}`}
      onClick={() => {
        if (selectionMode) {
          onToggleSelected(video.videoId);
        }
      }}
      onDoubleClick={() => {
        if (!selectionMode) {
          onSelect(video.videoId, true);
        }
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
        selectionMode ? `Select ${accessibleTitle}` : `Play ${accessibleTitle}`
      }
    >
      {selectionMode && (
        <button
          className={`support-select-toggle${isSelected ? ' active' : ''}`}
          type="button"
          aria-label={
            isSelected
              ? `Deselect ${accessibleTitle}`
              : `Select ${accessibleTitle}`
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
            className={`playlist-item-title-scroll${hasCatalogMetadata ? ' metadata' : ''}`}
            text={truncateForDisplay(primaryTitle || video.videoId)}
            truncateWhenStatic
          />
        ) : (
          <div
            className={`playlist-item-title${hasCatalogMetadata ? ' metadata' : ''}`}
          >
            {truncateForDisplay(primaryTitle || video.videoId)}
          </div>
        )}
        {secondaryTitle && (
          <div
            className={`playlist-item-meta${hasCatalogMetadata ? ' metadata' : ''}`}
          >
            {truncateForDisplay(secondaryTitle)}
          </div>
        )}
      </div>

      <div className="playlist-item-actions">
        {/* A rating and the comment bubble both fighting for space next to
            the title is how titles end up crowding into the icons - when
            there's a comment button to fold it into, show the rating inside
            that button instead of as its own separate field. Only when
            there's no comment button (onShowComments unset) does the rating
            get its own badge, so it's never simply dropped. */}
        {video.rating != null && !onShowComments && (
          <span
            className="list-explorer-peer-rating sidebar-rating"
            title="Your rating"
          >
            {video.rating}
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
        <div className="item-fav-container">
          <button
            className={`item-fav-btn${starStateClass}`}
            onClick={(event) => {
              event.stopPropagation();
              if (!isSupported) {
                onToggleSupport(video);
              }
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenSupportDropdown(
                video,
                {
                  top: rect.top,
                  left: rect.left + rect.width / 2,
                },
                { showRemove: isSupported, supportLevel },
              );
            }}
            aria-label={supportLabel}
            title={supportTooltip}
            disabled={isNominated || isRetired}
          >
            {supportGlyph}
          </button>
        </div>
      </div>
    </div>
  );
});

// Same reasoning as PlaylistItem above, for the draggable variant used
// while the list is reorderable.
const SortablePlaylistItem = memo(function SortablePlaylistItem({
  orderNumber,
  video,
  isActive,
  isFlashing,
  listenedStatus,
  onSelect,
  isSupported,
  supportLevel,
  isNominated,
  isRetired,
  onToggleSupport,
  onOpenSupportDropdown,
  onOpenContextMenu,
  commentActivity = null,
  onShowComments,
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
        supportLevel={supportLevel}
        isNominated={isNominated}
        isRetired={isRetired}
        onToggleSupport={onToggleSupport}
        onOpenSupportDropdown={onOpenSupportDropdown}
        onOpenContextMenu={onOpenContextMenu}
        selectionMode={false}
        isSelected={false}
        onToggleSelected={noop}
        commentActivity={commentActivity}
        onShowComments={onShowComments}
      />
    </div>
  );
});

function PlaylistSidebar({
  playlist,
  currentIndex,
  flashVideoIds = [],
  isShuffleEnabled = false,
  isShuffleAvailable = true,
  isPreviewModeEnabled = false,
  isCollapsed = false,
  showOriginalOrder = false,
  onShuffle,
  onMoveListenedToBottom,
  isListenedToBottomActive = false,
  onTogglePreview,
  onToggleCollapse,
  onToggleOrderView,
  onSelect,
  onReorder,
  supportList,
  nominationList = [],
  listenedStatusById = {},
  onToggleSupport,
  onToggleNomination,
  onRemoveFromPlaylist,
  onAddDirectItems = () => 0,
  onAddDirectToCustomPlaylist = null,
  retiredVideoIds = new Set(),
  isDesktopOverlayPlaylistOpen = false,
  onToggleDesktopOverlay,
  pendingMetadataCount = 0,
  onOpenMetadataDialog = () => {},
  onDismissMetadataBanner = () => {},
  onUpdateMetadata = () => {},
  authUser = null,
  onOpenSupportDropdown,
  onExport,
  onSavePlaylist,
  activePage,
  activePlaylistView = { type: 'personal' },
  onSwitchView,
  communityNominations = [],
  globalActivityByVideoId = new Map(),
  onShowComments,
  supabase = null,
  lastCommunityPlaylist = null,
  onNavigateToCommunityPlaylists,
  customPlaylists,
  onUpdateCustomPlaylists,
  onShowToast,
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleTogglePrivacy = async (playlistId, isPublic) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('user_playlists')
        .update({ is_public: isPublic })
        .eq('id', playlistId);
      if (error) throw error;
      onUpdateCustomPlaylists?.(
        (customPlaylists || []).map((p) =>
          p.id === playlistId ? { ...p, is_public: isPublic } : p,
        ),
      );
    } catch (err) {
      console.error(err);
      onShowToast?.('Failed to update playlist privacy');
    }
  };

  // Copies a `?playlist=<id>` link (see the shared-link boot loader in
  // App.jsx). Only public playlists are readable by anyone but the owner
  // (RLS), so a private playlist can't just be shared as-is, a private one
  // goes through SharePlaylistConfirmDialog (rendered below) rather than
  // silently publishing it.
  const [playlistToShare, setPlaylistToShare] = useState(null);
  const [isPublishingForShare, setIsPublishingForShare] = useState(false);

  const handleSharePlaylist = (playlistId) => {
    const pl = (customPlaylists || []).find((p) => p.id === playlistId);
    if (!pl) return;
    if (!pl.is_public) {
      setPlaylistToShare(pl);
      return;
    }
    navigator.clipboard
      .writeText(buildPlaylistShareUrl(playlistId))
      .then(() => onShowToast?.('Share link copied to clipboard'))
      .catch((err) => {
        console.error(err);
        onShowToast?.('Failed to copy share link');
      });
  };

  const handleConfirmMakePublicAndShare = async () => {
    if (!playlistToShare) return;
    setIsPublishingForShare(true);
    try {
      await handleTogglePrivacy(playlistToShare.id, true);
      await navigator.clipboard.writeText(
        buildPlaylistShareUrl(playlistToShare.id),
      );
      onShowToast?.(
        `Made "${playlistToShare.name}" public and copied its share link`,
      );
      setPlaylistToShare(null);
    } catch (err) {
      console.error(err);
      onShowToast?.('Failed to copy share link');
    } finally {
      setIsPublishingForShare(false);
    }
  };
  const dropdownRef = useRef(null);
  const [sidebarPlaylists, setSidebarPlaylists] = useState(null);
  const [playlistsExpanded, setPlaylistsExpanded] = useState(false);
  const [playlistLoadingId, setPlaylistLoadingId] = useState(null);
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
  const [isSortingByRating, setIsSortingByRating] = useState(false);
  // null (nomination order) -> 'desc' (highest ranked first) -> 'asc' -> null
  const [rankingSortDirection, setRankingSortDirection] = useState(null);
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState('');
  // Only one of the footer's two flip-card controls (search, add-to-queue)
  // is ever open at a time - each hides the other while it's open.
  const [isFooterSearchOpen, setIsFooterSearchOpen] = useState(false);
  const [isFooterAddOpen, setIsFooterAddOpen] = useState(false);
  const collapseGestureRef = useRef(null);
  const listContainerRef = useRef(null);
  const supportIds = useMemo(
    () => new Set(supportList.map((entry) => entry.videoId)),
    [supportList],
  );
  // Each row looks up its own supportLevel while rendering; a linear
  // supportList.find() per row makes that an O(playlist x supportList) scan
  // over the whole list on every render. Building this map once keeps each
  // row's lookup O(1).
  const supportLevelByVideoId = useMemo(
    () => new Map(supportList.map((entry) => [entry.videoId, entry])),
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
  const normalizedPlaylistSearchQuery = playlistSearchQuery
    .trim()
    .toLowerCase();
  const displayPlaylist = useMemo(() => {
    let list = playlist;
    if (rankingSortDirection) {
      // Your own rating (out of 10), not the community's VGMC support total,
      // that's what the "Total" column on the standings tab already covers.
      list = [...playlist].sort((a, b) => {
        const ratingA = a.rating ?? -1;
        const ratingB = b.rating ?? -1;
        const diff =
          rankingSortDirection === 'desc'
            ? ratingB - ratingA
            : ratingA - ratingB;
        if (diff !== 0) return diff;
        return (a.loadIndex ?? 0) - (b.loadIndex ?? 0);
      });
    } else if (isSortingByRating) {
      list = [...playlist].sort((a, b) => {
        const ratingA = a.rating ?? -1;
        const ratingB = b.rating ?? -1;
        if (ratingB !== ratingA) return ratingB - ratingA;
        return (a.loadIndex ?? 0) - (b.loadIndex ?? 0);
      });
    }

    // Search only ever narrows *which* rows render, it never reorders them,
    // so it can't disturb playback order, shuffle, or drag-to-reorder state.
    if (!normalizedPlaylistSearchQuery) return list;
    return list.filter((video) => {
      const { primaryTitle, secondaryTitle } = getPlaylistItemDisplay(video);
      const haystack =
        `${primaryTitle || ''} ${secondaryTitle || ''}`.toLowerCase();
      return haystack.includes(normalizedPlaylistSearchQuery);
    });
  }, [
    playlist,
    isSortingByRating,
    rankingSortDirection,
    normalizedPlaylistSearchQuery,
  ]);

  // Windows all three render paths (multi-select mode, drag-to-reorder, and
  // read-only community-playlist previews) down to just the rows actually
  // in view, so a long playlist doesn't cost hundreds of live DOM nodes.
  // Shared across all three paths since they all render displayPlaylist at
  // the same row height; only one is ever mounted at a time. The
  // drag-to-reorder path pairs this with dnd-kit the same way
  // ListExplorer.jsx already does for its columns - SortableContext gets
  // every id so it knows the full order, only the rows actually on screen
  // get mounted/measured. Row slot is 68px: .playlist-item's padding (8px x2) plus
  // its 45px thumbnail plus its 1px transparent border x2, plus the 4px
  // gap the flex layout normally puts between rows (reproduced per-row
  // below via paddingBottom, since that gap doesn't exist between
  // absolutely-positioned siblings). .playlist-item-title is
  // single-line/ellipsized (see index.css) so this is also the real
  // height - no per-row remeasurement needed.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: displayPlaylist.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 68,
    overscan: 8,
    // Without this, the virtualizer's first render assumes a 0-height
    // viewport (its real height is only known once the ResizeObserver it
    // sets up internally reports back) and renders nothing until then - a
    // guessed-tall-enough starting rect means there's a full list on
    // screen immediately instead of a one-frame flash of empty space.
    initialRect: { width: 0, height: 800 },
  });

  // `currentIndex` is an index into `playlist` (the natural, unsorted and
  // unfiltered order), never into `displayPlaylist`. Resolving it to the
  // actual playing video's id here, once, lets every row below match by
  // identity instead of position, position is meaningless once search or
  // rating-sort has reordered/narrowed what's rendered.
  const currentVideoId = playlist[currentIndex]?.videoId ?? null;

  // displayPlaylist, not playlist: every consumer of selectedVideos (Add to
  // Queue, Export, Save YT Playlist, bulk Remove, "Add to Playlist"
  // from the multi-select context menu) should add/act on selections in
  // the order they're actually shown on screen - filtered by search and/or
  // rating-sorted, whichever is currently active - not the underlying
  // natural playlist order. A selected-but-currently-filtered-out video
  // (still possible via handleSelectAll below, or a stale selection left
  // over from before a filter was typed) is naturally excluded here too,
  // since it won't be in displayPlaylist either.
  const selectedVideos = useMemo(
    () => displayPlaylist.filter((video) => selectedIdSet.has(video.videoId)),
    [displayPlaylist, selectedIdSet],
  );

  const isReadOnlyView = activePlaylistView.type === 'community-playlist';
  const isVgmcPlaylistView =
    isReadOnlyView &&
    Boolean(VGMC_PLAYLIST_ID) &&
    activePlaylistView.id === VGMC_PLAYLIST_ID;
  // "community-playlist" is the view type for anything opened via the
  // browse-community-playlists path, own playlists included - loading your
  // own playlist that way rather than through "My Custom Playlists"
  // (type "custom-playlist", already reorderable below) doesn't make it
  // any less yours. Ownership only depends on whether its id is one of
  // this user's own customPlaylists, never on which path loaded it.
  const isOwnPlaylistViaCommunity =
    isReadOnlyView &&
    (customPlaylists || []).some((pl) => pl.id === activePlaylistView.id);
  const canReorder =
    !selectionMode &&
    (!isShuffleEnabled || showOriginalOrder) &&
    !isSortingByRating &&
    !rankingSortDirection &&
    (!isReadOnlyView || isOwnPlaylistViaCommunity);
  // Also on isCollapsed, not just activePage - collapsing (mobile: slides
  // the whole sidebar away; desktop: down to a thin tab) is this sidebar's
  // version of a panel closing, and without this the Select button was
  // still showing "Done" (and the selection still live) the next time it
  // expanded, since nothing reset selectionMode on collapse - only on an
  // explicit Select/Done click. contextMenu isn't rendered conditionally on
  // isCollapsed the way the rest of this sidebar's content is (see
  // ContextMenuPortal below), so it's cleared here too rather than
  // potentially floating on its own, detached from a sidebar that's no
  // longer showing the row it was opened on.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds([]);
    setContextMenu(null);
  }, [activePage, isCollapsed]);

  // A filter left over from the last list you were looking at (e.g.
  // Nominations) would otherwise silently keep hiding rows in whatever list
  // you switch to next, so clear it whenever the active view changes.
  useEffect(() => {
    setPlaylistSearchQuery('');
  }, [activePlaylistView.type, activePlaylistView.id]);

  // "Track current song": user-controlled via the header toggle beside Move
  // Listened to Bottom, on by default. Simple on/off rather than trying to
  // infer intent from scroll position, filter state, etc., if it's on, the
  // active row gets scrolled into view; if you scrolled away on purpose,
  // turn it off.
  const [isTrackingActive, setIsTrackingActive] = useState(true);

  // Rows below resolve `isActive` by video id (see `currentVideoId` above),
  // not position, so it's correct even while sorted/filtered - which means
  // tracking can safely follow the active row through a sort/search change
  // too, not just the natural order.
  const isPlaylistFilteredOrSorted =
    isSortingByRating ||
    Boolean(rankingSortDirection) ||
    Boolean(normalizedPlaylistSearchQuery);

  // Was a container.querySelector('.playlist-item.active') + scrollIntoView()
  // - broke once the list was windowed, since the active row usually isn't
  // even mounted (that's the whole point of virtualizing). scrollToIndex
  // asks the virtualizer to scroll there directly, which works whether or
  // not the row currently has a DOM node.
  const focusActiveRow = useCallback(() => {
    if (!listContainerRef.current) return;
    const activeIndex = displayPlaylist.findIndex(
      (video) => video.videoId != null && video.videoId === currentVideoId,
    );
    if (activeIndex === -1) return;
    rowVirtualizer.scrollToIndex(activeIndex, { align: 'center' });
  }, [displayPlaylist, currentVideoId, rowVirtualizer]);

  // Scrolls the active row into view on: landing on a different playlist/view,
  // the current track changing (new track, skip/back), or the list being
  // reordered/narrowed by search or rating-sort (including toggling one of
  // those on/off) - as long as tracking is on.
  useEffect(() => {
    if (!isTrackingActive) return;
    focusActiveRow();
  }, [
    activePlaylistView.type,
    activePlaylistView.id,
    currentIndex,
    isPlaylistFilteredOrSorted,
    isTrackingActive,
    focusActiveRow,
  ]);

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

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Reset cache when auth changes so the next dropdown open fetches fresh data
  useEffect(() => {
    setSidebarPlaylists(null);
  }, [authUser?.id]);

  useEffect(() => {
    // null = not yet fetched; array (even empty) = already fetched, don't retry
    if (!isDropdownOpen || !supabase || sidebarPlaylists !== null) return;
    let cancelled = false;
    let query = supabase
      .from('user_playlists')
      .select('id, name, created_at, user_playlist_tracks(count)')
      .eq('is_active_queue', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (authUser?.id) {
      query = query.or(`is_public.eq.true,user_id.eq.${authUser.id}`);
    } else {
      query = query.eq('is_public', true);
    }

    query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Sidebar playlist fetch error:', error);
        setSidebarPlaylists([]);
        return;
      }
      setSidebarPlaylists(
        (data || []).map((pl) => ({
          id: pl.id,
          name: pl.name,
          trackCount: Number(pl.user_playlist_tracks?.[0]?.count ?? 0),
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isDropdownOpen, supabase, sidebarPlaylists, authUser?.id]);

  useEffect(() => {
    if (!isDropdownOpen) setPlaylistsExpanded(false);
  }, [isDropdownOpen]);

  async function fetchPlaylistTracks(playlistId) {
    const { data, error } = await supabase
      .from('user_playlist_tracks')
      .select(
        `id, order_index, track_id, provider, external_id, cached_title, cached_channel, cached_thumbnail,
         tracks(id, canonical_game_title, canonical_track_title,
           track_sources(provider, external_id, cached_title, cached_channel_title, cached_thumbnail_url, is_primary))`,
      )
      .eq('playlist_id', playlistId)
      .order('order_index');
    if (error) throw error;
    return (data || [])
      .map((pt) => {
        if (pt.track_id != null) {
          const track = pt.tracks;
          const src =
            track?.track_sources?.find((s) => s.is_primary) ??
            track?.track_sources?.[0];
          if (!src) return null;
          return {
            id: pt.id,
            videoId: src.external_id,
            provider: src.provider || 'youtube',
            trackId: pt.track_id,
            title:
              src.cached_title ||
              [track.canonical_game_title, track.canonical_track_title]
                .filter(Boolean)
                .join(' – '),
            displayTitle:
              track.canonical_track_title ||
              src.cached_title ||
              src.external_id,
            channelTitle:
              src.cached_channel_title ||
              (!src.provider || src.provider === 'youtube' ? 'YouTube' : ''),
            thumbnail:
              src.cached_thumbnail_url ||
              getMediaThumbnailUrl({
                provider: src.provider,
                videoId: src.external_id,
              }),
            gameTitle: track.canonical_game_title,
            trackTitle: track.canonical_track_title,
            comment: '',
            addedAt: new Date().toISOString(),
          };
        }
        if (pt.external_id) {
          return {
            id: pt.id,
            videoId: pt.external_id,
            provider: pt.provider || 'youtube',
            trackId: null,
            title: pt.cached_title || pt.external_id,
            displayTitle: pt.cached_title || pt.external_id,
            channelTitle: pt.cached_channel || 'YouTube',
            thumbnail:
              pt.cached_thumbnail ||
              getMediaThumbnailUrl({
                provider: pt.provider,
                videoId: pt.external_id,
              }),
            gameTitle: '',
            trackTitle: '',
            comment: '',
            addedAt: new Date().toISOString(),
          };
        }
        return null;
      })
      .filter(Boolean);
  }

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
        closeContextMenu();
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
    // displayPlaylist, not playlist - "Select all" while a search filter
    // (or rating-sort) is active should only pick up what's actually on
    // screen, matching selectedVideos above. Selecting a video hidden by
    // the current filter would be invisible (its checkbox isn't even
    // rendered) and, without this, would still silently ride along into
    // the next add/export/remove once the filter cleared.
    setSelectedIds(displayPlaylist.map((video) => video.videoId));
  }

  function renderHeader() {
    const isCommunityView = activePlaylistView.type === 'community';
    const isNominationsView = activePlaylistView.type === 'nominations';
    const isSupportView = activePlaylistView.type === 'support';
    const isCommunityPlaylistView =
      activePlaylistView.type === 'community-playlist' ||
      activePlaylistView.type === 'custom-playlist';

    const activeUser = isCommunityView
      ? communityNominations.find((u) => u.userId === activePlaylistView.userId)
      : null;

    let displayTitle = 'Queue';
    if (isCommunityView) {
      displayTitle = getDisplayProfileName(activeUser?.username) || 'Community';
    } else if (isNominationsView) {
      displayTitle = 'Nominations';
    } else if (isSupportView) {
      displayTitle = 'Supports';
    } else if (isCommunityPlaylistView) {
      displayTitle = activePlaylistView.name || 'Playlist';
    }

    const currentAvatar = isCommunityView ? activeUser?.avatarUrl : null;

    return (
      <>
        <div className="playlist-title-bar">
          <ScrollingText
            className="playlist-title-scroll"
            text={displayTitle}
            truncateWhenStatic
          />
          <span className="playlist-title-count">
            {playlist.length} {playlist.length === 1 ? 'video' : 'videos'}
          </span>
        </div>
        <div className="sidebar-header">
          <div
            className="sidebar-header-main community-dropdown-wrapper"
            ref={dropdownRef}
          >
            <button
              className={`community-view-trigger${isDropdownOpen ? ' active' : ''}`}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-expanded={isDropdownOpen}
              aria-haspopup="listbox"
            >
              <div className="community-view-avatar-slot">
                {currentAvatar ? (
                  <img
                    src={currentAvatar}
                    alt=""
                    className="community-view-avatar"
                  />
                ) : (
                  <div className="community-view-avatar-fallback">
                    {isCommunityView ? (
                      '👤'
                    ) : isNominationsView ? (
                      <StarIcon />
                    ) : isSupportView ? (
                      <HeartIcon />
                    ) : isCommunityPlaylistView ? (
                      <PlaylistTabIcon />
                    ) : (
                      <MusicIcon />
                    )}
                  </div>
                )}
              </div>
              {/* Name + count now live in .playlist-title-bar above, so this
                  trigger just labels what it switches between. */}
              <div className="community-view-text">
                <span className="sidebar-title">Lists</span>
              </div>
              <span className="community-view-chevron">
                <ChevronIcon />
              </span>
            </button>

            {isDropdownOpen && (
              <div className="community-view-dropdown" role="listbox">
                {!playlistsExpanded ? (
                  <div className="community-view-dropdown-scroll">
                    <button
                      className={`community-option${activePlaylistView.type === 'personal' ? ' selected' : ''}`}
                      onClick={() => {
                        onSwitchView({ type: 'personal' });
                        setIsDropdownOpen(false);
                      }}
                      role="option"
                      aria-selected={activePlaylistView.type === 'personal'}
                    >
                      <div className="community-option-avatar">
                        <div className="community-view-avatar-fallback">
                          <MusicIcon />
                        </div>
                      </div>
                      <div className="community-option-info">
                        <span className="community-option-name">My Queue</span>
                      </div>
                    </button>

                    <button
                      className={`community-option${activePlaylistView.type === 'nominations' ? ' selected' : ''}`}
                      onClick={() => {
                        onSwitchView({ type: 'nominations' });
                        setIsDropdownOpen(false);
                      }}
                      role="option"
                      aria-selected={activePlaylistView.type === 'nominations'}
                    >
                      <div className="community-option-avatar">
                        <div className="community-view-avatar-fallback">
                          <StarIcon />
                        </div>
                      </div>
                      <div className="community-option-info">
                        <span className="community-option-name">
                          My Nominations
                        </span>
                      </div>
                    </button>

                    <button
                      className={`community-option${activePlaylistView.type === 'support' ? ' selected' : ''}`}
                      onClick={() => {
                        onSwitchView({ type: 'support' });
                        setIsDropdownOpen(false);
                      }}
                      role="option"
                      aria-selected={activePlaylistView.type === 'support'}
                    >
                      <div className="community-option-avatar">
                        <div className="community-view-avatar-fallback">
                          <HeartIcon />
                        </div>
                      </div>
                      <div className="community-option-info">
                        <span className="community-option-name">
                          My Support List
                        </span>
                      </div>
                    </button>

                    <div
                      className={`community-option community-option-expandable${isCommunityPlaylistView ? ' selected' : ''}`}
                    >
                      <button
                        className="community-option-main"
                        role="option"
                        aria-selected={isCommunityPlaylistView}
                        onClick={() => {
                          if (lastCommunityPlaylist) {
                            if (
                              lastCommunityPlaylist.type === 'custom-playlist'
                            ) {
                              // Own playlist: load into view only, same as the
                              // community-playlist branch below - selecting
                              // from this dropdown must never start or
                              // interrupt playback.
                              onSwitchView({
                                type: 'custom-playlist',
                                name: lastCommunityPlaylist.name,
                                id: lastCommunityPlaylist.id,
                              });
                            } else {
                              onSwitchView({
                                type: 'community-playlist',
                                videos: lastCommunityPlaylist.videos,
                                name: lastCommunityPlaylist.name,
                                id: lastCommunityPlaylist.id,
                              });
                            }
                          } else {
                            onNavigateToCommunityPlaylists?.();
                          }
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="community-option-avatar">
                          <div className="community-view-avatar-fallback">
                            <PlaylistTabIcon />
                          </div>
                        </div>
                        <div className="community-option-info">
                          <span className="community-option-name">
                            {isCommunityPlaylistView
                              ? activePlaylistView.name
                              : lastCommunityPlaylist?.name ||
                                'Community Playlists'}
                          </span>
                          {isCommunityPlaylistView && (
                            <span className="community-option-count">
                              {activePlaylistView.type === 'custom-playlist'
                                ? (customPlaylists?.find(
                                    (p) => p.id === activePlaylistView.id,
                                  )?.videos?.length ?? 0)
                                : (activePlaylistView.videos?.length ?? 0)}{' '}
                              tracks
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        className="community-option-expand-btn community-option-expand-btn--right"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlaylistsExpanded(true);
                        }}
                        aria-label="Browse community playlists"
                      >
                        <ChevronIcon />
                      </button>
                    </div>

                    <div className="community-dropdown-divider">
                      Community Nominations
                    </div>

                    {communityNominations.map((item) => (
                      <button
                        key={item.userId}
                        className={`community-option${isCommunityView && activePlaylistView.userId === item.userId ? ' selected' : ''}`}
                        onClick={() => {
                          onSwitchView({
                            type: 'community',
                            userId: item.userId,
                          });
                          setIsDropdownOpen(false);
                        }}
                        role="option"
                        aria-selected={
                          isCommunityView &&
                          activePlaylistView.userId === item.userId
                        }
                      >
                        <div className="community-option-avatar">
                          {item.avatarUrl ? (
                            <img src={item.avatarUrl} alt="" />
                          ) : (
                            <div className="community-view-avatar-fallback">
                              👤
                            </div>
                          )}
                        </div>
                        <div className="community-option-info">
                          <span className="community-option-name">
                            {getDisplayProfileName(item.username)}
                          </span>
                          <span className="community-option-count">
                            {item.nominations.length} nominations
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="community-view-dropdown-scroll community-playlists-panel">
                    <button
                      className="community-playlists-back"
                      onClick={() => setPlaylistsExpanded(false)}
                    >
                      <span className="community-playlists-back-chevron">
                        <ChevronIcon />
                      </span>
                      <div className="community-option-info">
                        <span className="community-option-name">
                          Back to Menu
                        </span>
                      </div>
                    </button>

                    {sidebarPlaylists === null && (
                      <div
                        className="community-option-count"
                        style={{ padding: '8px 16px' }}
                      >
                        Loading…
                      </div>
                    )}

                    {sidebarPlaylists !== null &&
                      sidebarPlaylists.length === 0 && (
                        <div
                          className="community-option-count"
                          style={{
                            padding: '8px 16px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          No playlists found
                        </div>
                      )}

                    {(sidebarPlaylists || []).map((pl) => (
                      <button
                        key={pl.id}
                        className={`community-option${isCommunityPlaylistView && activePlaylistView.id === pl.id ? ' selected' : ''}`}
                        disabled={playlistLoadingId === pl.id}
                        onClick={async () => {
                          const isOwn = customPlaylists?.some(
                            (p) => p.id === pl.id,
                          );
                          if (isOwn) {
                            // Own playlist: load into view only, same as the
                            // community playlist path below - selecting from
                            // this dropdown must never start or interrupt
                            // playback.
                            onSwitchView({
                              type: 'custom-playlist',
                              name: pl.name,
                              id: pl.id,
                            });
                            setIsDropdownOpen(false);
                            return;
                          }
                          if (!supabase) return;
                          setPlaylistLoadingId(pl.id);
                          try {
                            const videos = await fetchPlaylistTracks(pl.id);
                            if (videos.length) {
                              // Community playlist: load into view only, don't start playback.
                              onSwitchView({
                                type: 'community-playlist',
                                videos,
                                name: pl.name,
                                id: pl.id,
                              });
                            }
                          } finally {
                            setPlaylistLoadingId(null);
                          }
                          setIsDropdownOpen(false);
                        }}
                        role="option"
                        aria-selected={
                          isCommunityPlaylistView &&
                          activePlaylistView.id === pl.id
                        }
                      >
                        <div className="community-option-avatar">
                          <div className="community-view-avatar-fallback">
                            <PlaylistTabIcon />
                          </div>
                        </div>
                        <div className="community-option-info">
                          <span className="community-option-name">
                            {pl.name}
                          </span>
                          <span className="community-option-count">
                            {playlistLoadingId === pl.id
                              ? 'Loading…'
                              : `${pl.trackCount} tracks`}
                          </span>
                        </div>
                      </button>
                    ))}

                    <button
                      className="community-option-browse"
                      onClick={() => {
                        onNavigateToCommunityPlaylists?.();
                        setIsDropdownOpen(false);
                      }}
                    >
                      Browse all playlists →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sidebar-header-actions">
            {/* ... existing actions ... */}
            {isMobileLayout && (
              <>
                <button
                  className={`sidebar-icon-btn shuffle${isShuffleEnabled ? ' active' : ''}${!isShuffleAvailable ? ' disabled' : ''}`}
                  type="button"
                  onClick={isShuffleAvailable ? onShuffle : undefined}
                  disabled={!isShuffleAvailable}
                  aria-label={
                    isShuffleAvailable
                      ? 'Shuffle queue'
                      : 'Add at least 2 tracks to shuffle'
                  }
                  title={
                    isShuffleAvailable
                      ? 'Shuffle queue'
                      : 'Add at least 2 tracks to shuffle'
                  }
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
              <>
                <button
                  className={`fav-panel-action-btn icon-only${isTrackingActive ? ' active' : ''}`}
                  type="button"
                  onClick={() => setIsTrackingActive((previous) => !previous)}
                  title={
                    isTrackingActive
                      ? 'Tracking current song (click to stop)'
                      : 'Track current song'
                  }
                  aria-label="Track current song"
                  aria-pressed={isTrackingActive}
                >
                  <LocateIcon />
                </button>
                {isVgmcPlaylistView && (
                  <button
                    className={`fav-panel-action-btn icon-only${isListenedToBottomActive ? ' active' : ''}`}
                    type="button"
                    onClick={onMoveListenedToBottom}
                    disabled={playlist.length < 2}
                    title="Move started songs to bottom of playlist"
                    aria-label="Move started songs to bottom of playlist"
                  >
                    <CheckDownIcon />
                  </button>
                )}
                {activePlaylistView.type === 'custom-playlist' ? (
                  <div
                    style={{
                      marginLeft: 8,
                      marginRight: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <button
                      className="fav-panel-action-btn icon-only"
                      type="button"
                      onClick={() => handleSharePlaylist(activePlaylistView.id)}
                      title="Copy share link"
                      aria-label="Copy share link"
                    >
                      <ShareIcon />
                    </button>
                    <PrivacyToggle
                      isPublic={
                        customPlaylists?.find(
                          (p) => p.id === activePlaylistView.id,
                        )?.is_public
                      }
                      onToggle={(val) =>
                        handleTogglePrivacy(activePlaylistView.id, val)
                      }
                    />
                  </div>
                ) : isVgmcPlaylistView ? (
                  <button
                    className={`fav-panel-action-btn icon-only${rankingSortDirection ? ' active' : ''}`}
                    type="button"
                    onClick={() =>
                      setRankingSortDirection((previousValue) =>
                        previousValue === null
                          ? 'desc'
                          : previousValue === 'desc'
                            ? 'asc'
                            : null,
                      )
                    }
                    title={
                      rankingSortDirection === 'desc'
                        ? 'Sorted by your rating, highest first, click for lowest first'
                        : rankingSortDirection === 'asc'
                          ? 'Sorted by your rating, lowest first, click to reset'
                          : 'Sort by your rating'
                    }
                    aria-label="Sort by your rating"
                  >
                    <SortByRatingIcon
                      direction={
                        rankingSortDirection === 'asc' ? 'asc' : 'desc'
                      }
                    />
                  </button>
                ) : (
                  <button
                    className="fav-panel-action-btn icon-only"
                    type="button"
                    onClick={() =>
                      onExport?.(
                        selectionMode && selectedVideos.length > 0
                          ? selectedVideos
                          : playlist,
                      )
                    }
                    title="Export for VGMC"
                    aria-label="Export for VGMC"
                  >
                    <ExportIcon />
                  </button>
                )}
                <button
                  className="fav-panel-action-btn icon-only"
                  type="button"
                  onClick={() =>
                    onSavePlaylist?.(
                      selectionMode && selectedVideos.length > 0
                        ? selectedVideos
                        : playlist,
                    )
                  }
                  title="Create YT Playlist"
                  aria-label="Create YT Playlist"
                >
                  <YouTubeIcon />
                </button>
                {(activePlaylistView.type === 'nominations' ||
                  activePlaylistView.type === 'support') && (
                  <button
                    className={`fav-panel-action-btn icon-only${isSortingByRating ? ' active' : ''}`}
                    type="button"
                    onClick={() => setIsSortingByRating(!isSortingByRating)}
                    title="Order by rating"
                    aria-label="Order by rating"
                  >
                    <SortByRatingIcon />
                  </button>
                )}
                <button
                  className={`fav-panel-action-btn${selectionMode ? ' active' : ''}`}
                  type="button"
                  onClick={handleToggleSelectionMode}
                >
                  {selectionMode ? 'Done' : 'Select'}
                </button>
              </>
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
      </>
    );
  }

  function renderAddControl() {
    const isNominationsView = activePlaylistView.type === 'nominations';
    const isSupportView = activePlaylistView.type === 'support';
    const isCommunityView = activePlaylistView.type === 'community';
    const tone = isNominationsView
      ? 'nomination'
      : isSupportView
        ? 'support'
        : 'playlist';
    // Search is a read-only view filter, available on every list including
    // ones you don't own (e.g. someone else's shared/community playlist).
    // Adding is a mutation, so it stays restricted to lists you can actually
    // modify, same restriction as before.
    const canModifyList = !isCommunityView && !isReadOnlyView;

    return (
      <div className="playlist-sidebar-add">
        {playlist.length > 0 && (
          <FilterSearchControl
            tone={tone}
            query={playlistSearchQuery}
            onQueryChange={setPlaylistSearchQuery}
            onOpenChange={setIsFooterSearchOpen}
            hidden={isFooterAddOpen}
            extraClassName="playlist-filter-search"
            ariaLabel="Search in playlist"
            placeholder="Search in Playlist…"
            closeAriaLabel="Close playlist search"
          />
        )}
        {canModifyList && authUser && pendingMetadataCount > 0 && (
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
        {canModifyList &&
          (isSortingByRating && (isNominationsView || isSupportView) ? (
            <div
              className={`collection-adder tone-${tone} compact sorting-active`}
              key="sorting"
            >
              <div className="collection-adder-shell" style={{ height: 42 }}>
                <div className="collection-adder-stage">
                  <div className="collection-adder-face collection-adder-front">
                    +
                  </div>
                  <button
                    className="collection-save-order-back"
                    type="button"
                    onClick={() => {
                      onReorder?.(displayPlaylist);
                      setIsSortingByRating(false);
                    }}
                  >
                    Save Order
                  </button>
                </div>
              </div>
            </div>
          ) : activePlaylistView.type === 'custom-playlist' &&
            onAddDirectToCustomPlaylist ? (
            <CollectionAdder
              tone="playlist"
              addButtonLabel="+"
              addButtonAriaLabel="Add to playlist"
              addButtonTitle="Add to playlist"
              inputPlaceholder="Paste a YouTube link to add to this playlist…"
              onAddDirectItems={onAddDirectToCustomPlaylist}
              onOpenChange={setIsFooterAddOpen}
              hidden={isFooterSearchOpen}
              compact
            />
          ) : (
            <CollectionAdder
              tone={
                tone === 'nomination' || tone === 'support' ? tone : 'playlist'
              }
              addButtonLabel="+"
              addButtonAriaLabel="Add to queue"
              addButtonTitle="Add to queue"
              onAddDirectItems={onAddDirectItems}
              onOpenChange={setIsFooterAddOpen}
              hidden={isFooterSearchOpen}
              compact
            />
          ))}
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
              Use the header search or add a YouTube link to get started
            </div>
          </div>
        )}
        {!isCollapsed && renderAddControl()}
      </div>
    );
  }

  function handleOpenContextMenu(event, video) {
    event.preventDefault();

    if (selectionMode && selectedIdSet.has(video.videoId)) {
      setContextMenu({
        left: event.clientX,
        top: event.clientY,
        video,
        videos: selectedVideos,
        mode: 'multi',
      });
      return;
    }

    setContextMenu({
      left: event.clientX,
      top: event.clientY,
      video,
      videos: [video],
      mode: 'single',
    });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  function handleOpenSupportDropdown(video, position, options) {
    onOpenSupportDropdown(video, position, options);
  }

  function handleRemove(videoId) {
    onRemoveFromPlaylist(videoId);
    closeContextMenu();
  }

  function handleUpdateMetadata(videos) {
    onUpdateMetadata(videos);
    closeContextMenu();
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
      {isDesktopOverlayPlaylistOpen && (
        <div
          className="playlist-overlay-backdrop desktop-only"
          onClick={() => onToggleDesktopOverlay?.(false)}
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
          {activePlaylistView.type !== 'personal' && (
            <button
              className="fav-panel-action-btn selection-accent"
              type="button"
              onClick={() => onAddDirectItems(selectedVideos)}
              disabled={selectedVideos.length === 0}
            >
              Add to Queue
            </button>
          )}
          {!isReadOnlyView && (
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
              {activePlaylistView.type === 'personal'
                ? 'Remove from Queue'
                : 'Remove from List'}
            </button>
          )}
        </div>
      )}
      {!isCollapsed && (
        <div className="playlist-list" role="list" ref={listContainerRef}>
          {selectionMode ? (
            <div
              style={{
                position: 'relative',
                // .playlist-list lays its children out with display: flex,
                // and this div's own children are all position: absolute
                // (so they don't contribute to its content size) - without
                // flexShrink: 0, the flex algorithm's default shrink
                // behavior can compress this below the height it's actually
                // asking for, which is the one thing genuinely different
                // from before virtualization (many naturally-sized flex
                // children instead of one explicitly-sized one).
                flexShrink: 0,
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const { index } = virtualItem;
                const video = displayPlaylist[index];
                if (!video) return null;
                return (
                  <div
                    key={video.videoId}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      paddingBottom: '4px',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <PlaylistItem
                      orderNumber={
                        (showOriginalOrder || normalizedPlaylistSearchQuery
                          ? (video.loadIndex ?? index)
                          : index) + 1
                      }
                      video={video}
                      isActive={
                        video.videoId != null &&
                        video.videoId === currentVideoId
                      }
                      isFlashing={flashIds.has(video.videoId)}
                      listenedStatus={listenedStatusById[video.videoId] || null}
                      onSelect={onSelect}
                      isSupported={supportIds.has(video.videoId)}
                      supportLevel={
                        supportLevelByVideoId.get(video.videoId)
                          ?.supportLevel || 1
                      }
                      isNominated={nominationIds.has(video.videoId)}
                      isRetired={retiredVideoIds.has(video.videoId)}
                      onToggleSupport={onToggleSupport}
                      onOpenSupportDropdown={handleOpenSupportDropdown}
                      onOpenContextMenu={handleOpenContextMenu}
                      selectionMode={true}
                      isSelected={selectedIdSet.has(video.videoId)}
                      onToggleSelected={handleToggleSelected}
                      commentActivity={
                        globalActivityByVideoId.get(video.videoId) ?? null
                      }
                      onShowComments={onShowComments}
                    />
                  </div>
                );
              })}
            </div>
          ) : canReorder ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              {/* SortableContext gets the full ordered id list regardless of
                  what's actually mounted below - dnd-kit needs that to know
                  the target order, it doesn't need every id to have a live
                  DOM node. Same windowing technique as the two branches
                  above, proven together with dnd-kit already in
                  ListExplorer.jsx (its columns are both sortable and
                  virtualized the same way). */}
              <SortableContext
                items={displayPlaylist.map((video) => video.videoId)}
                strategy={verticalListSortingStrategy}
              >
                {/* flexShrink: 0 here for the same reason as the
                    selectionMode branch above - its children are all
                    position: absolute, so nothing stops the flex
                    algorithm's default shrink from compressing this below
                    its actual requested height. */}
                <div
                  style={{
                    position: 'relative',
                    flexShrink: 0,
                    height: `${rowVirtualizer.getTotalSize()}px`,
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const { index } = virtualItem;
                    const video = displayPlaylist[index];
                    if (!video) return null;
                    return (
                      <div
                        key={video.videoId}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          paddingBottom: '4px',
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <SortablePlaylistItem
                          orderNumber={
                            (showOriginalOrder || normalizedPlaylistSearchQuery
                              ? (video.loadIndex ?? index)
                              : index) + 1
                          }
                          video={video}
                          isActive={
                            video.videoId != null &&
                            video.videoId === currentVideoId
                          }
                          isFlashing={flashIds.has(video.videoId)}
                          listenedStatus={
                            listenedStatusById[video.videoId] || null
                          }
                          onSelect={onSelect}
                          isSupported={supportIds.has(video.videoId)}
                          supportLevel={
                            supportLevelByVideoId.get(video.videoId)
                              ?.supportLevel || 1
                          }
                          isNominated={nominationIds.has(video.videoId)}
                          isRetired={retiredVideoIds.has(video.videoId)}
                          onToggleSupport={onToggleSupport}
                          onOpenSupportDropdown={handleOpenSupportDropdown}
                          onOpenContextMenu={handleOpenContextMenu}
                          commentActivity={
                            globalActivityByVideoId.get(video.videoId) ?? null
                          }
                          onShowComments={onShowComments}
                        />
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            // Same flexShrink: 0 reasoning as the other two branches above.
            <div
              style={{
                position: 'relative',
                flexShrink: 0,
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const { index } = virtualItem;
                const video = displayPlaylist[index];
                if (!video) return null;
                return (
                  <div
                    key={video.videoId}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      paddingBottom: '4px',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <PlaylistItem
                      orderNumber={
                        (showOriginalOrder || normalizedPlaylistSearchQuery
                          ? (video.loadIndex ?? index)
                          : index) + 1
                      }
                      video={video}
                      isActive={
                        video.videoId != null &&
                        video.videoId === currentVideoId
                      }
                      isFlashing={flashIds.has(video.videoId)}
                      listenedStatus={listenedStatusById[video.videoId] || null}
                      onSelect={onSelect}
                      isSupported={supportIds.has(video.videoId)}
                      supportLevel={
                        supportLevelByVideoId.get(video.videoId)
                          ?.supportLevel || 1
                      }
                      isNominated={nominationIds.has(video.videoId)}
                      isRetired={retiredVideoIds.has(video.videoId)}
                      onToggleSupport={onToggleSupport}
                      onOpenSupportDropdown={handleOpenSupportDropdown}
                      onOpenContextMenu={handleOpenContextMenu}
                      selectionMode={false}
                      isSelected={false}
                      onToggleSelected={noop}
                      commentActivity={
                        globalActivityByVideoId.get(video.videoId) ?? null
                      }
                      onShowComments={onShowComments}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {!isCollapsed && renderAddControl()}
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.left}
          y={contextMenu.top}
          onClose={closeContextMenu}
          className="playlist-context-menu"
        >
          <button
            className="playlist-context-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(contextMenu.video.videoId, true);
              closeContextMenu();
            }}
          >
            Play Now
          </button>

          <div className="context-menu-divider" />

          {/* Adding to the queue is always an action on *your own* queue, so
              unlike nominating/supporting/custom-playlist actions below it's
              never restricted by who owns the list currently being viewed -
              only 'personal' (the queue itself) has no reason to offer it. */}
          {activePlaylistView.type !== 'personal' && (
            <button
              className="playlist-context-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                onAddDirectItems(contextMenu.videos);
                closeContextMenu();
                if (selectionMode) {
                  setSelectionMode(false);
                }
              }}
            >
              Add{' '}
              {contextMenu.videos.length > 1
                ? `(${contextMenu.videos.length}) `
                : ''}
              to My Queue
            </button>
          )}

          {!nominationIds.has(contextMenu.video.videoId) && (
            <button
              className="playlist-context-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleNomination(contextMenu.video);
                closeContextMenu();
              }}
            >
              Add to My Nominations
            </button>
          )}

          {!nominationIds.has(contextMenu.video.videoId) && (
            <SupportLevelSubmenu
              videos={[contextMenu.video]}
              currentLevel={
                supportLevelByVideoId.get(contextMenu.video.videoId)
                  ?.supportLevel || 1
              }
              onToggleSupport={onToggleSupport}
              onClose={closeContextMenu}
              itemClassName="playlist-context-menu-item"
            />
          )}

          <CustomPlaylistSubmenu
            videos={contextMenu.videos}
            customPlaylists={customPlaylists}
            onUpdateCustomPlaylists={onUpdateCustomPlaylists}
            onShowToast={onShowToast}
            onClose={closeContextMenu}
            itemClassName="playlist-context-menu-item"
          />
          {!isReadOnlyView && activePlaylistView.type !== 'community' && (
            <>
              {authUser && (
                <>
                  <div className="context-menu-divider" />
                  <button
                    className="playlist-context-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => handleUpdateMetadata(contextMenu.videos)}
                  >
                    Update Metadata
                  </button>
                </>
              )}
              <div className="context-menu-divider" />
              <button
                className="playlist-context-menu-item danger"
                type="button"
                role="menuitem"
                onClick={() => handleRemove(contextMenu.video.videoId)}
              >
                {activePlaylistView.type === 'personal'
                  ? 'Remove from Queue'
                  : 'Remove from List'}
              </button>
            </>
          )}
        </ContextMenuPortal>
      )}

      <SharePlaylistConfirmDialog
        isOpen={!!playlistToShare}
        isSubmitting={isPublishingForShare}
        playlistName={playlistToShare?.name || ''}
        onClose={() => setPlaylistToShare(null)}
        onConfirm={handleConfirmMakePublicAndShare}
      />
    </div>
  );
}

// Always mounted and re-rendered on every App state change otherwise
// (playback progress, unrelated dialogs, etc.) despite most of its props
// rarely changing - see App.jsx's stable handleReorderActivePlaylistView
// and friends, which this depends on to make memoization actually stick.
export default memo(PlaylistSidebar);
