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
import CustomPlaylistSubmenu from './CustomPlaylistSubmenu.jsx';
import CollectionAdder from './CollectionAdder.jsx';
import ExportIcon from './ExportIcon.jsx';
import PrivacyToggle from './PrivacyToggle.jsx';
import YouTubeIcon from './YouTubeIcon.jsx';
import ScrollingText from './ScrollingText.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';
import { getDisplayProfileName } from '../lib/playerState.js';
import { SortByRatingIcon, SpeechBubbleIcon } from './Icons.jsx';

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

function PlaylistItem({
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
      className={`playlist-item${isActive ? ' active' : ''}${isFlashing ? ' flash' : ''}${isSelected ? ' selected' : ''}${isRetired ? ' retired' : ''}`}
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
            text={primaryTitle || video.videoId}
            truncateWhenStatic
          />
        ) : (
          <div
            className={`playlist-item-title${hasCatalogMetadata ? ' metadata' : ''}`}
          >
            {primaryTitle || video.videoId}
          </div>
        )}
        {secondaryTitle && (
          <div
            className={`playlist-item-meta${hasCatalogMetadata ? ' metadata' : ''}`}
          >
            {secondaryTitle}
          </div>
        )}
      </div>

      <div className="playlist-item-actions">
        {video.rating != null && (
          <span className="list-explorer-peer-rating sidebar-rating">
            {video.rating}
          </span>
        )}
        {commentActivity && (
          <button
            className={`comment-bubble-btn${commentActivity === 'commented' ? ' has-comments' : ' has-rated'}`}
            type="button"
            title="View community comments"
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
            <SpeechBubbleIcon />
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
              onOpenSupportDropdown(video, {
                top: rect.top,
                left: rect.left + rect.width / 2,
              });
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
}

function SortablePlaylistItem({
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
        onToggleSelected={() => {}}
        commentActivity={commentActivity}
        onShowComments={onShowComments}
      />
    </div>
  );
}

export default function PlaylistSidebar({
  playlist,
  currentIndex,
  flashVideoIds = [],
  isShuffleEnabled = false,
  isShuffleAvailable = true,
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
  onPlayCustomPlaylist,
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
  const displayPlaylist = useMemo(() => {
    if (!isSortingByRating) return playlist;
    return [...playlist].sort((a, b) => {
      const ratingA = a.rating ?? -1;
      const ratingB = b.rating ?? -1;
      if (ratingB !== ratingA) return ratingB - ratingA;
      return (a.loadIndex ?? 0) - (b.loadIndex ?? 0);
    });
  }, [playlist, isSortingByRating]);

  const selectedVideos = useMemo(
    () => playlist.filter((video) => selectedIdSet.has(video.videoId)),
    [playlist, selectedIdSet],
  );

  const isReadOnlyView = activePlaylistView.type === 'community-playlist';
  const canReorder =
    !selectionMode &&
    (!isShuffleEnabled || showOriginalOrder) &&
    !isSortingByRating &&
    !isReadOnlyView;
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, [activePage]);

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
        `id, order_index, track_id, youtube_video_id, cached_title, cached_channel, cached_thumbnail,
         tracks(id, canonical_game_title, canonical_track_title,
           track_sources(external_id, cached_title, cached_channel_title, cached_thumbnail_url, is_primary))`,
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
            channelTitle: src.cached_channel_title || 'YouTube',
            thumbnail:
              src.cached_thumbnail_url ||
              `https://i.ytimg.com/vi/${src.external_id}/mqdefault.jpg`,
            comment: '',
            addedAt: new Date().toISOString(),
          };
        }
        if (pt.youtube_video_id) {
          return {
            id: pt.id,
            videoId: pt.youtube_video_id,
            trackId: null,
            title: pt.cached_title || pt.youtube_video_id,
            displayTitle: pt.cached_title || pt.youtube_video_id,
            channelTitle: pt.cached_channel || 'YouTube',
            thumbnail:
              pt.cached_thumbnail ||
              `https://i.ytimg.com/vi/${pt.youtube_video_id}/mqdefault.jpg`,
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
            <div className="community-view-text">
              <span className="sidebar-title">{displayTitle}</span>
              <span className="sidebar-count">
                {playlist.length} {playlist.length === 1 ? 'video' : 'videos'}
              </span>
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
                            onPlayCustomPlaylist?.(lastCommunityPlaylist.id);
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
                          // Own playlist: play it via onPlayCustomPlaylist so
                          // both activePlaylistView AND playingPlaylistView are updated.
                          onPlayCustomPlaylist?.(pl.id);
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
                        <span className="community-option-name">{pl.name}</span>
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
                disabled={!isShuffleAvailable || playlist.length < 2}
                aria-label={
                  isShuffleAvailable
                    ? 'Shuffle queue'
                    : 'Play from My Queue to use shuffle'
                }
                title={
                  isShuffleAvailable
                    ? 'Shuffle queue'
                    : 'Play from My Queue to use shuffle'
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
              {activePlaylistView.type === 'custom-playlist' ? (
                <div style={{ marginLeft: 8, marginRight: 8, display: 'flex' }}>
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

    return (
      <div className="playlist-sidebar-add">
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
        {isSortingByRating && (isNominationsView || isSupportView) ? (
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
        ) : !isCommunityView ? (
          activePlaylistView.type === 'custom-playlist' &&
          onAddDirectToCustomPlaylist ? (
            <CollectionAdder
              tone="playlist"
              addButtonLabel="+"
              addButtonAriaLabel="Add to playlist"
              addButtonTitle="Add to playlist"
              inputPlaceholder="Paste a YouTube link to add to this playlist…"
              onAddDirectItems={onAddDirectToCustomPlaylist}
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
              compact
            />
          )
        ) : null}
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

  function handleOpenSupportDropdown(video, position) {
    onOpenSupportDropdown(video, position);
  }

  function handleRemove(videoId) {
    onRemoveFromPlaylist(videoId);
    setContextMenu(null);
  }

  function handleUpdateMetadata(videos) {
    onUpdateMetadata(videos);
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
        <div className="playlist-list" role="list">
          {selectionMode ? (
            displayPlaylist.map((video, index) => (
              <PlaylistItem
                key={video.videoId}
                orderNumber={(video.loadIndex ?? index) + 1}
                video={video}
                isActive={index === currentIndex}
                isFlashing={flashIds.has(video.videoId)}
                listenedStatus={listenedStatusById[video.videoId] || null}
                onSelect={onSelect}
                isSupported={supportIds.has(video.videoId)}
                supportLevel={
                  supportList.find((entry) => entry.videoId === video.videoId)
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
            ))
          ) : canReorder ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayPlaylist.map((video) => video.videoId)}
                strategy={verticalListSortingStrategy}
              >
                {displayPlaylist.map((video, index) => (
                  <SortablePlaylistItem
                    key={video.videoId}
                    orderNumber={(video.loadIndex ?? index) + 1}
                    video={video}
                    isActive={index === currentIndex}
                    isFlashing={flashIds.has(video.videoId)}
                    listenedStatus={listenedStatusById[video.videoId] || null}
                    onSelect={onSelect}
                    isSupported={supportIds.has(video.videoId)}
                    supportLevel={
                      supportList.find(
                        (entry) => entry.videoId === video.videoId,
                      )?.supportLevel || 1
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
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            displayPlaylist.map((video, index) => (
              <PlaylistItem
                key={video.videoId}
                orderNumber={(video.loadIndex ?? index) + 1}
                video={video}
                isActive={index === currentIndex}
                isFlashing={flashIds.has(video.videoId)}
                listenedStatus={listenedStatusById[video.videoId] || null}
                onSelect={onSelect}
                isSupported={supportIds.has(video.videoId)}
                supportLevel={
                  supportList.find((entry) => entry.videoId === video.videoId)
                    ?.supportLevel || 1
                }
                isNominated={nominationIds.has(video.videoId)}
                isRetired={retiredVideoIds.has(video.videoId)}
                onToggleSupport={onToggleSupport}
                onOpenSupportDropdown={handleOpenSupportDropdown}
                onOpenContextMenu={handleOpenContextMenu}
                selectionMode={false}
                isSelected={false}
                onToggleSelected={() => {}}
                commentActivity={
                  globalActivityByVideoId.get(video.videoId) ?? null
                }
                onShowComments={onShowComments}
              />
            ))
          )}
        </div>
      )}
      {!isCollapsed && renderAddControl()}
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.left}
          y={contextMenu.top}
          onClose={() => setContextMenu(null)}
          className="playlist-context-menu"
        >
          <button
            className="playlist-context-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(contextMenu.video.videoId, true);
              setContextMenu(null);
            }}
          >
            Play Now
          </button>

          <div className="context-menu-divider" />

          {!nominationIds.has(contextMenu.video.videoId) && (
            <button
              className="playlist-context-menu-item"
              type="button"
              role="menuitem"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onOpenSupportDropdown(contextMenu.video, {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                });
                setContextMenu(null);
              }}
            >
              Update Support
            </button>
          )}
          {supportIds.has(contextMenu.video.videoId) &&
            !nominationIds.has(contextMenu.video.videoId) && (
              <>
                <div className="context-menu-divider" />
                <button
                  className="playlist-context-menu-item danger"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleSupport(contextMenu.video, 0);
                    setContextMenu(null);
                  }}
                >
                  Remove Support
                </button>
              </>
            )}

          {!nominationIds.has(contextMenu.video.videoId) && (
            <button
              className="playlist-context-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleNomination(contextMenu.video);
                setContextMenu(null);
              }}
            >
              Add to Nominations
            </button>
          )}

          <CustomPlaylistSubmenu
            videos={contextMenu.videos}
            customPlaylists={customPlaylists}
            onUpdateCustomPlaylists={onUpdateCustomPlaylists}
            onShowToast={onShowToast}
            onClose={() => setContextMenu(null)}
            itemClassName="playlist-context-menu-item"
          />

          {activePlaylistView.type === 'community' && (
            <button
              className="playlist-context-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                onAddDirectItems(contextMenu.videos);
                setContextMenu(null);
                if (selectionMode) {
                  setSelectionMode(false);
                }
              }}
            >
              Add{' '}
              {contextMenu.videos.length > 1
                ? `(${contextMenu.videos.length}) `
                : ''}
              to Queue
            </button>
          )}
          {!isReadOnlyView && activePlaylistView.type !== 'community' && (
            <>
              {authUser && (
                <button
                  className="playlist-context-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => handleUpdateMetadata(contextMenu.videos)}
                >
                  Update Metadata
                </button>
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
    </div>
  );
}
