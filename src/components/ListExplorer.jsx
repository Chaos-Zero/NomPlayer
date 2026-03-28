import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  getDisplayProfileName,
  deriveProfileAvatarUrl,
} from '../lib/playerState.js';
import { ingestYouTubeTrackSources } from '../lib/trackCatalog.js';
import { fetchCommunityFeedback, upsertUserFeedback } from '../lib/feedback.js';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PointerSensor as CorePointerSensor } from '@dnd-kit/core';
import { SortableSupportItem, SupportItem } from './FavouritesPanel';
import { ContextMenuPortal } from './ContextMenuPortal';
import ExportIcon from './ExportIcon.jsx';
import YouTubeIcon from './YouTubeIcon.jsx';

function PlaylistPlusIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M6.25 4.67V15.33C6.25 15.91 6.89 16.27 7.39 15.96L15.75 10.63C16.22 10.33 16.22 9.67 15.75 9.37L7.39 4.04C6.89 3.73 6.25 4.09 6.25 4.67Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M8.75 3A.75.75 0 0 0 8 3.75V4H4.75a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H12v-.25A.75.75 0 0 0 11.25 3h-2.5ZM5 6.5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 .75.75v11a2.25 2.25 0 0 1-2.25 2.25h-5A2.25 2.25 0 0 1 5 17.5v-11Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function FocusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M3.25 4A2.25 2.25 0 0 1 5.5 1.75h9A2.25 2.25 0 0 1 16.75 4v9a2.25 2.25 0 0 1-2.25 2.25h-9A2.25 2.25 0 0 1 3.25 13V4ZM5.5 3.25a.75.75 0 0 0-.75.75v3.25h10.5V4a.75.75 0 0 0-.75-.75h-9Zm10.5 5.25H4.75v4.5c0 .414.336.75.75.75h9a.75.75 0 0 0 .75-.75V8.5Z" />
    </svg>
  );
}

function UnfocusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 10Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
    </svg>
  );
}

function LockIcon() {
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

function HeartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582 20.77 20.77 0 0 1-1.162.682l-.019.01-.005.003L9.653 16.915z" />
    </svg>
  );
}

const dropAnimationConfig = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5',
      },
    },
  }),
};

class CustomPointerSensor extends CorePointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown',
      handler: ({ nativeEvent: event }) => {
        return [0, 2].includes(event.button);
      },
    },
  ];
}

function TrackInfoPanel({
  track,
  communityData,
  isLoading,
  onClose,
  authUser,
  onUpdateComment,
  onSaveFeedback,
}) {
  const personalFeedback = useMemo(() => {
    if (!track || !communityData.feedback || !authUser?.id)
      return { rating: null, note: '' };

    // Uid matching - be aggressive but specific to the track
    const myId = authUser.id;
    const currentTrackId = track?.trackId || track?.id;

    const found = communityData.feedback.find((f) => {
      // Must be for this track (if we have track_id in the feedback)
      if (currentTrackId && f.track_id && f.track_id !== currentTrackId)
        return false;

      // Direct column match
      if (f.user_id === myId || f.userId === myId) return true;
      // Nested profile match
      if (f.profiles?.id === myId || f.user_profile?.user_id === myId)
        return true;
      return false;
    });

    return found || { rating: null, note: '' };
  }, [track, communityData.feedback, authUser?.id]);

  const [localComment, setLocalComment] = useState(personalFeedback.note || '');
  const [localRating, setLocalRating] = useState(personalFeedback.rating || '');

  // Sync local state when DB feedback arrives or track changes
  // Using the "Adjusting state during render" pattern to avoid linting errors and
  // ensure the most efficient update without cascading effects.
  const [prevSync, setPrevSync] = useState({
    note: personalFeedback.note,
    rating: personalFeedback.rating,
    videoId: track?.videoId,
  });

  if (
    personalFeedback.note !== prevSync.note ||
    personalFeedback.rating !== prevSync.rating ||
    track?.videoId !== prevSync.videoId
  ) {
    setPrevSync({
      note: personalFeedback.note,
      rating: personalFeedback.rating,
      videoId: track?.videoId,
    });
    setLocalComment(personalFeedback.note || track?.comment || '');
    setLocalRating(personalFeedback.rating || '');
  }

  const peerFeedback = useMemo(() => {
    if (!track || !communityData.feedback) return [];
    return communityData.feedback.filter((f) => f.user_id !== authUser?.id);
  }, [track, communityData.feedback, authUser?.id]);

  const supportSummary = useMemo(() => {
    const list = communityData.supports || {};
    const total = Object.values(list).reduce((a, b) => a + b, 0);
    return { ...list, total };
  }, [communityData.supports]);

  const trackTournaments = useMemo(() => {
    if (!track) return [];
    return communityData.tournaments || track.tournaments || [];
  }, [track, communityData.tournaments]);

  const vgmcStatus =
    trackTournaments.length > 0
      ? `VGMC ${trackTournaments[0].sequence_number}`
      : 'New to VGMC';

  const handleCommentChange = (ev) => {
    const val = ev.target.value;
    setLocalComment(val);
    onUpdateComment(track.videoId, val);
  };

  // Split title if it contains " - "
  const fullTitle = track?.displayTitle || track?.title || '';
  let songTitle = fullTitle;
  let gameTitle = track?.gameTitle || track?.channelTitle || '';

  if (fullTitle.includes(' - ')) {
    const parts = fullTitle.split(' - ');
    gameTitle = parts[0].trim();
    songTitle = parts.slice(1).join(' - ').trim();
  }

  return (
    <div className={`list-explorer-info-panel ${track ? 'is-open' : ''}`}>
      <div className="list-explorer-info-content-wrapper">
        {track && (
          <>
            <div className="list-explorer-info-header">
              <button
                className="list-explorer-info-close"
                onClick={onClose}
                title="Deselect track"
              >
                ✕
              </button>
              <div className="list-explorer-info-hero">
                <img
                  src={track.thumbnail || track.sourceThumbnailUrl}
                  alt=""
                  className="list-explorer-info-img"
                />
                <div className="list-explorer-info-titles">
                  <div className="list-explorer-info-title-group">
                    <p className="list-explorer-info-game">{gameTitle}</p>
                    <span className="list-explorer-info-separator"> - </span>
                    <h2 className="list-explorer-info-song">{songTitle}</h2>
                  </div>
                  <span className="list-explorer-info-vgmc-badge">
                    {vgmcStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="list-explorer-info-content">
              <section className="list-explorer-info-section">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <h4>Your Feedback</h4>
                </div>
                <div className="list-explorer-info-personal">
                  <div className="list-explorer-info-rating-row">
                    <span className="label">Rating:</span>
                    <select
                      className="list-explorer-info-rating-select"
                      value={localRating}
                      onChange={(ev) =>
                        setLocalRating(parseInt(ev.target.value) || '')
                      }
                    >
                      <option value="">No Rating</option>
                      {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
                        <option key={r} value={r}>
                          {r} / 10
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    className="list-explorer-info-note-editor"
                    placeholder="Add personal notes or comments..."
                    value={localComment}
                    onChange={handleCommentChange}
                  />
                  <div className="list-explorer-info-feedback-actions">
                    <button
                      className="btn-save-feedback"
                      onClick={() => onSaveFeedback(localRating, localComment)}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Saving...' : 'Save Feedback'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="list-explorer-info-section">
                <h4>Community Support</h4>
                <div className="list-explorer-support-summary">
                  {supportSummary.total > 0 ? (
                    <div className="list-explorer-support-icons">
                      {supportSummary[3] > 0 && (
                        <div
                          className="support-badge highest"
                          title={`${supportSummary[3]} Highest Supports`}
                        >
                          <LockIcon />
                          <span>{supportSummary[3]}</span>
                        </div>
                      )}
                      {supportSummary[2] > 0 && (
                        <div
                          className="support-badge high"
                          title={`${supportSummary[2]} High Supports`}
                        >
                          <HeartIcon />
                          <span>{supportSummary[2]}</span>
                        </div>
                      )}
                      {supportSummary[1] > 0 && (
                        <div
                          className="support-badge normal"
                          title={`${supportSummary[1]} Normal Supports`}
                        >
                          <HeartIcon />
                          <span>{supportSummary[1]}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="list-explorer-support-empty">
                      No community support yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="list-explorer-info-section community">
                <h4>Community Activity</h4>
                {isLoading ? (
                  <p className="list-explorer-info-loading">
                    Loading community data...
                  </p>
                ) : peerFeedback.length === 0 ? (
                  <p className="list-explorer-info-empty">
                    No community feedback yet.
                  </p>
                ) : (
                  <div className="list-explorer-peer-list">
                    {peerFeedback.map((f, i) => (
                      <div key={i} className="list-explorer-peer-item">
                        <img
                          src={deriveProfileAvatarUrl(
                            f.profiles,
                            f.profiles?.avatar_url,
                          )}
                          alt=""
                          className="list-explorer-peer-avatar"
                        />
                        <div className="list-explorer-peer-content">
                          <div className="list-explorer-peer-header">
                            <span className="list-explorer-peer-user">
                              {getDisplayProfileName(
                                f.profiles?.username,
                                'Anonymous',
                              )}
                            </span>
                            {f.rating && (
                              <span className="list-explorer-peer-rating">
                                {f.rating}/10
                              </span>
                            )}
                          </div>
                          {f.note && (
                            <p className="list-explorer-peer-note">{f.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SortableListExplorerCard({
  sortableId,
  video,
  isSelected,
  onSelect,
  onContextMenu,
  onPlayNow,
  onRemove,
  isReadOnly = false,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: isReadOnly,
  });

  const isDraggingStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const listId = sortableId.split(':')[0];
  const isSupportList = listId === 'support';
  const supportLevel = video.supportLevel || 1;

  return (
    <div
      ref={setNodeRef}
      style={isDraggingStyle}
      className={`list-explorer-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isReadOnly ? 'read-only' : ''}`}
      onClick={() => onSelect?.(video.videoId)}
      onContextMenu={(e) => onContextMenu?.(e, video)}
    >
      <div className="list-explorer-card-inner">
        {!isReadOnly && (
          <div
            className="drag-handle"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            ⠿
          </div>
        )}
        <div className="list-explorer-card-main">
          <SupportItem
            video={video}
            onRemove={isReadOnly ? null : () => onRemove(video.videoId)}
            onDoubleQueue={() => onPlayNow(video)}
            onOpenContextMenu={onContextMenu}
            itemAriaPrefix="List Explorer track"
          />
          {isSupportList && (
            <div
              className={`list-explorer-card-support-icon-overlay level-${supportLevel}`}
            >
              {supportLevel === 3 ? <LockIcon /> : <HeartIcon />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListExplorerColumn({
  id,
  title,
  subtitle,
  videos,
  isFocused,
  onFocus,
  onUnfocus,
  onPlayNow,
  onRemove,
  colorVar = '--accent',
  playlists = [],
  activePlaylistId = null,
  onSelectPlaylist = null,
  onAddByUrl = null,
  selectedTrackId = null,
  onSelectTrack = null,
  onContextMenu = null,
  canClose = false,
  onClose = null,
  canAddAll = false,
  onAddAll = null,
  isReadOnly = false,
  onExport,
  onSavePlaylist,
}) {
  const [addUrl, setAddUrl] = useState('');
  const { setNodeRef } = useDroppable({
    id: `column-${id}`,
    data: {
      listId: id,
    },
  });

  const isCustom =
    id !== 'nominations' &&
    id !== 'support' &&
    id !== 'current' &&
    !id.startsWith('peer-') &&
    id !== 'new-nominations';

  const handleAdd = (ev) => {
    ev.preventDefault();
    if (!addUrl.trim()) return;
    onAddByUrl?.(addUrl);
    setAddUrl('');
  };

  return (
    <div
      ref={setNodeRef}
      className={`list-explorer-column ${isFocused ? 'focused' : ''}`}
      data-column-id={id}
    >
      <div
        className="list-explorer-column-header"
        style={{ '--column-accent': `var(${colorVar})` }}
      >
        <div className="list-explorer-column-title-group">
          {isCustom && playlists.length > 0 ? (
            <div className="list-explorer-playlist-selector-shell">
              <select
                className="list-explorer-playlist-select"
                value={activePlaylistId || ''}
                onChange={(ev) => onSelectPlaylist?.(ev.target.value)}
              >
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>
              <div className="list-explorer-column-subtitle">{subtitle}</div>
            </div>
          ) : (
            <div className="list-explorer-column-title-row">
              <h3>{title}</h3>
              {subtitle && (
                <span className="list-explorer-column-subtitle">
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="list-explorer-column-actions">
          {canAddAll && videos && videos.length > 0 && (
            <button
              className="list-explorer-column-btn"
              onClick={onAddAll}
              title="Add all tracks to current playlist"
            >
              <PlaylistPlusIcon />
            </button>
          )}
          {videos && videos.length > 0 && (
            <>
              <button
                className="list-explorer-column-btn"
                onClick={() => onExport?.(videos)}
                title="Export for VGMC"
              >
                <ExportIcon />
              </button>
              <button
                className="list-explorer-column-btn"
                onClick={() => onSavePlaylist?.(videos)}
                title="Create YouTube Playlist"
              >
                <YouTubeIcon />
              </button>
            </>
          )}
          {isFocused ? (
            <button
              className="list-explorer-column-btn"
              onClick={onUnfocus}
              title="Exit full view"
            >
              <UnfocusIcon />
            </button>
          ) : (
            <button
              className="list-explorer-column-btn"
              onClick={onFocus}
              title="Focus on this list"
            >
              <FocusIcon />
            </button>
          )}
          {canClose && (
            <button
              className="list-explorer-column-btn close"
              onClick={onClose}
              title="Close list"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className="list-explorer-column-content">
        {onAddByUrl && (
          <form className="list-explorer-quick-add" onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="Paste YouTube link to add track..."
              value={addUrl}
              onChange={(ev) => setAddUrl(ev.target.value)}
            />
            <button type="submit" title="Add track">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
            </button>
          </form>
        )}

        <SortableContext
          items={(videos || []).map((v) => `${id}:${v.videoId}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="list-explorer-list">
            {!videos || videos.length === 0 ? (
              <div className="list-explorer-list-empty">
                <span>No tracks here yet</span>
              </div>
            ) : (
              videos.map((video, index) => (
                <SortableListExplorerCard
                  key={`${id}:${video.videoId}`}
                  sortableId={`${id}:${video.videoId}`}
                  video={video}
                  index={index}
                  isSelected={selectedTrackId === video.videoId}
                  onSelect={onSelectTrack}
                  onContextMenu={onContextMenu}
                  onPlayNow={onPlayNow}
                  onRemove={onRemove}
                  isReadOnly={isReadOnly}
                />
              ))
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export default function ListExplorer({
  playlist,
  supportList,
  nominationList,
  customPlaylists,
  onUpdatePlaylist,
  onUpdateSupportList,
  onUpdateNominationList,
  onUpdateCustomPlaylists,
  onPlayNow,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onShowToast,
  authUser,
  supabase,
  onUpdateMetadata,
  onExport,
  onSavePlaylist,
}) {
  const [focusedListId, setFocusedListId] = useState(null);
  const [activeCustomPlaylistId, setActiveCustomPlaylistId] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [communityData, setCommunityData] = useState({
    feedback: [],
    supports: {},
  });
  const [isLoadingCommunity, setIsLoadingCommunity] = useState(false);
  const [dragButton, setDragButton] = useState(0);
  const gridRef = useRef(null);

  // Initialize active custom playlist if not set
  useEffect(() => {
    if (!activeCustomPlaylistId && (customPlaylists?.length || 0) > 0) {
      setActiveCustomPlaylistId(customPlaylists[0].id);
    }
  }, [customPlaylists, activeCustomPlaylistId]);

  const activeCustomPlaylist = useMemo(() => {
    if (!customPlaylists) return null;
    return (
      customPlaylists.find((pl) => pl.id === activeCustomPlaylistId) ||
      customPlaylists[0] ||
      null
    );
  }, [customPlaylists, activeCustomPlaylistId]);

  const [activeVideo, setActiveVideo] = useState(null);

  const sensors = useSensors(
    useSensor(CustomPointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [peerColumns, setPeerColumns] = useState([]);
  const [allPeerLists, setAllPeerLists] = useState([]);
  const [showNewNominations, setShowNewNominations] = useState(false);

  useEffect(() => {
    const fetchPeerLists = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc(
        'get_dashboard_nomination_lists',
        { limit_count: 20 },
      );
      if (!error && data) {
        setAllPeerLists(data);
      }
    };
    fetchPeerLists();
  }, [supabase]);
  // Derived New Nominations from overall community lists
  const newNominations = useMemo(() => {
    if (!allPeerLists) return [];

    const allNoms = [];
    const seenIds = new Set();

    // Collect all unique nominations from peers
    allPeerLists.forEach((peer) => {
      (peer.nominations || []).forEach((n) => {
        // Map to frontend format if needed (though RPC should already provide it)
        const videoId = n.videoId || n.video_id || n.id;
        if (videoId && !seenIds.has(videoId)) {
          seenIds.add(videoId);
          allNoms.push({
            ...n,
            videoId,
            title: n.title || n.track_title || n.canonical_track_title,
            gameTitle: n.gameTitle || n.game_title || n.canonical_game_title,
            channelTitle: n.channelTitle || n.game_title,
            thumbnail:
              n.thumbnail ||
              n.cached_thumbnail_url ||
              `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          });
        }
      });
    });

    // Filter out tracks already in our current views
    const myTrackIds = new Set([
      ...nominationList.map((t) => t.videoId),
      ...supportList.map((t) => t.videoId),
      ...playlist.map((t) => t.videoId),
    ]);

    return allNoms.filter((n) => !myTrackIds.has(n.videoId));
  }, [allPeerLists, nominationList, supportList, playlist]);

  const togglePeerList = (user) => {
    if (peerColumns.some((c) => c.user_id === user.user_id)) {
      setPeerColumns(peerColumns.filter((c) => c.user_id !== user.user_id));
    } else {
      setPeerColumns([
        ...peerColumns,
        {
          ...user,
          videos: (user.nominations || []).map((n) => ({
            ...n,
            videoId: n.videoId || n.video_id || n.id,
            title: n.title || n.track_title || n.canonical_track_title,
            channelTitle:
              n.channelTitle || n.game_title || n.canonical_game_title,
            thumbnail:
              n.thumbnail ||
              n.cached_thumbnail_url ||
              n.sourceThumbnailUrl ||
              `https://i.ytimg.com/vi/${n.videoId || n.video_id || n.id}/mqdefault.jpg`,
            comment: n.comment || '',
          })),
        },
      ]);
    }
  };

  const findListId = useCallback(
    (videoId) => {
      if (nominationList.some((v) => v.videoId === videoId))
        return 'nominations';
      if (supportList.some((v) => v.videoId === videoId)) return 'support';
      if (playlist.some((v) => v.videoId === videoId)) return 'current';
      if (activeCustomPlaylist?.videos.some((v) => v.videoId === videoId))
        return activeCustomPlaylist.id;
      return null;
    },
    [nominationList, supportList, playlist, activeCustomPlaylist],
  );

  const getListById = (id) => {
    if (id === 'nominations') return nominationList;
    if (id === 'support') return supportList;
    if (id === 'current') return playlist;
    return customPlaylists.find((pl) => pl.id === id)?.videos || [];
  };

  const setListById = (id, newList) => {
    if (id === 'nominations') onUpdateNominationList(newList);
    else if (id === 'support') onUpdateSupportList(newList);
    else if (id === 'current') onUpdatePlaylist(newList);
    else {
      onUpdateCustomPlaylists(
        customPlaylists.map((pl) =>
          pl.id === id ? { ...pl, videos: newList } : pl,
        ),
      );
    }
  };

  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  const handleDragStart = (event) => {
    const { active } = event;
    const activeId = String(active.id);
    const videoId = activeId.includes(':') ? activeId.split(':')[1] : activeId;

    const nativeEvent = event.activatorEvent;
    setDragButton(nativeEvent.button);

    let video = null;
    [
      nominationList,
      supportList,
      playlist,
      ...(activeCustomPlaylist ? [activeCustomPlaylist.videos] : []),
      newNominations,
      ...peerColumns.map((c) => c.videos),
    ].some((list) => {
      video = (list || []).find(
        (v) => v.videoId === videoId || v.id === videoId,
      );
      return !!video;
    });
    setActiveVideo(video);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveVideo(null);
    if (!over) return;

    // Parse IDs: they are either "{listId}:{videoId}" or just "{videoId}" or "column-{listId}"
    const parseId = (id) => {
      const sId = String(id);
      if (sId.includes(':')) {
        const [listId, videoId] = sId.split(':');
        return { listId, videoId };
      }
      if (sId.startsWith('column-')) {
        return { listId: sId.replace('column-', ''), videoId: null };
      }
      // Fallback: search for list
      const videoId = sId;
      if (nominationList.some((v) => v.videoId === videoId))
        return { listId: 'nominations', videoId };
      if (supportList.some((v) => v.videoId === videoId))
        return { listId: 'support', videoId };
      if (playlist.some((v) => v.videoId === videoId))
        return { listId: 'current', videoId };
      if (activeCustomPlaylist?.videos.some((v) => v.videoId === videoId))
        return { listId: activeCustomPlaylist.id, videoId };
      return { listId: null, videoId };
    };

    const source = parseId(active.id);
    const target = parseId(over.id);

    const sourceListId = source.listId;
    const targetListId = target.listId || over.data.current?.listId;

    if (!sourceListId || !targetListId) return;

    const sourceVideoId = source.videoId;
    const targetVideoId = target.videoId;

    if (sourceListId === targetListId) {
      if (sourceVideoId !== targetVideoId && targetVideoId) {
        const list = getListById(sourceListId);
        const oldIndex = list.findIndex((v) => v.videoId === sourceVideoId);
        const newIndex = list.findIndex((v) => v.videoId === targetVideoId);
        setListById(sourceListId, arrayMove(list, oldIndex, newIndex));
      }
    } else {
      const sourceList = getListById(sourceListId);
      const targetList = getListById(targetListId);
      const video = sourceList.find((v) => v.videoId === sourceVideoId);

      if (video) {
        const alreadyInTarget = targetList.some(
          (v) => v.videoId === sourceVideoId,
        );

        // Logic: Move if Right-click OR Support -> Nominations. Otherwise Copy.
        const shouldMove =
          dragButton === 2 ||
          (sourceListId === 'support' && targetListId === 'nominations');

        if (!alreadyInTarget) {
          const targetIndex = targetVideoId
            ? targetList.findIndex((v) => v.videoId === targetVideoId)
            : -1;
          const newList = [...targetList];
          if (targetIndex !== -1) {
            newList.splice(targetIndex, 0, video);
          } else {
            newList.push(video);
          }
          setListById(targetListId, newList);

          if (shouldMove) {
            setListById(
              sourceListId,
              sourceList.filter((v) => v.videoId !== sourceVideoId),
            );
            onShowToast(
              `Moved track to ${targetListId === 'current' ? 'Playlist' : 'List'}`,
            );
          } else {
            onShowToast(
              `Copied track to ${targetListId === 'current' ? 'Playlist' : 'List'}`,
            );
          }
        } else if (shouldMove) {
          // Already in target, just remove from source if it was a move operation
          setListById(
            sourceListId,
            sourceList.filter((v) => v.videoId !== sourceVideoId),
          );
          onShowToast(`Moved track (already exists in target)`);
        }
      }
    }
  };

  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = (e, video) => {
    // Suppress context menu if currently dragging (especially for right-click drag)
    if (activeVideo) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    // Determine which list this video belongs to
    let sourceListId = activeCustomPlaylistId;
    if (nominationList.some((v) => v.videoId === video.videoId))
      sourceListId = 'nominations';
    else if (supportList.some((v) => v.videoId === video.videoId))
      sourceListId = 'support';
    else if (playlist.some((v) => v.videoId === video.videoId))
      sourceListId = 'current';
    else if (
      peerColumns.some((pl) =>
        pl.videos?.some((v) => v.videoId === video.videoId),
      )
    )
      sourceListId = 'peer';
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      video,
      sourceListId,
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handlePlayNow = (video) => {
    onPlayNow(video);
    closeContextMenu();
  };

  const handleAddTrackToPlaylist = (video) => {
    onAddToPlaylist([video]);
    onShowToast('Track added to playlist');
    closeContextMenu();
  };

  const handleRemoveTrack = (listId, videoId) => {
    if (listId === 'nominations')
      onUpdateNominationList(
        nominationList.filter((v) => v.videoId !== videoId),
      );
    else if (listId === 'support')
      onUpdateSupportList(supportList.filter((v) => v.videoId !== videoId));
    else if (listId === 'current') onRemoveFromPlaylist(videoId);
    else {
      onUpdateCustomPlaylists(
        customPlaylists.map((p) =>
          p.id === listId
            ? { ...p, videos: p.videos.filter((v) => v.videoId !== videoId) }
            : p,
        ),
      );
    }
    closeContextMenu();
    onShowToast('Removed track from list');
  };

  const handleUpdateComment = useCallback(
    (listId, videoId, comment) => {
      const updateList = (list) =>
        list.map((v) => (v.videoId === videoId ? { ...v, comment } : v));
      if (listId === 'nominations')
        onUpdateNominationList(updateList(nominationList));
      else if (listId === 'support')
        onUpdateSupportList(updateList(supportList));
      else if (listId === 'current') onUpdatePlaylist(updateList(playlist));
      else {
        onUpdateCustomPlaylists(
          customPlaylists.map((pl) =>
            pl.id === listId ? { ...pl, videos: updateList(pl.videos) } : pl,
          ),
        );
      }
    },
    [
      nominationList,
      supportList,
      playlist,
      customPlaylists,
      onUpdatePlaylist,
      onUpdateSupportList,
      onUpdateNominationList,
      onUpdateCustomPlaylists,
    ],
  );

  const handleRenamePlaylist = (id) => {
    const pl = customPlaylists.find((p) => p.id === id);
    if (!pl) return;
    const newName = prompt('Enter new name:', pl.name);
    if (newName && newName !== pl.name) {
      onUpdateCustomPlaylists(
        customPlaylists.map((p) => (p.id === id ? { ...p, name: newName } : p)),
      );
    }
  };

  const handleRemovePlaylist = (id) => {
    const pl = customPlaylists.find((p) => p.id === id);
    if (!pl) return;
    if (confirm(`Are you sure you want to delete "${pl.name}"?`)) {
      onUpdateCustomPlaylists(customPlaylists.filter((p) => p.id !== id));
      if (focusedListId === id) setFocusedListId(null);
    }
  };

  /* const handleCreatePlaylist = () => {
     const name = prompt('Enter playlist name:');
     if (name) {
       onUpdateCustomPlaylists([
         ...customPlaylists,
         {
           id: `pl-${Math.random().toString(36).slice(2, 11)}`,
           name,
           videos: [],
         },
       ]);
     }
   };
 */
  const handleAddByUrl = async (id, url) => {
    const videoIdMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*e\/))([^&?/#]+)/,
    );
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    if (!videoId) {
      onShowToast('Invalid YouTube URL');
      return;
    }
    const currentList = getListById(id);
    if (currentList.some((v) => v.videoId === videoId)) {
      onShowToast('Track already in this list');
      return;
    }
    const newTrack = {
      videoId,
      title: 'Loading metadata...',
      displayTitle: 'YouTube Track',
      channelTitle: 'YouTube',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      comment: '',
      addedAt: new Date().toISOString(),
    };
    setListById(id, [...currentList, newTrack]);
    onShowToast('Added track to playlist');
  };

  const handleAddAllToCurrent = (tracks) => {
    const newTracks = tracks.filter(
      (t) => !playlist.some((p) => p.videoId === t.videoId),
    );
    if (newTracks.length === 0) {
      onShowToast('All tracks are already in your playlist');
      return;
    }
    onUpdatePlaylist([...playlist, ...newTracks]);
    onShowToast(`Added ${newTracks.length} tracks to playlist`);
  };

  const [showCurrentPlaylist, setShowCurrentPlaylist] = useState(true);

  // Find the currently selected track object from ALL visible lists
  const selectedTrack = useMemo(() => {
    if (!selectedTrackId) return null;
    let track = null;
    [
      nominationList,
      supportList,
      playlist,
      ...(activeCustomPlaylist ? [activeCustomPlaylist.videos] : []),
      newNominations,
      ...peerColumns.map((c) => c.videos),
    ].some((list) => {
      track = (list || []).find(
        (v) => v.videoId === selectedTrackId || v.id === selectedTrackId,
      );
      return !!track;
    });
    return track;
  }, [
    selectedTrackId,
    nominationList,
    supportList,
    playlist,
    activeCustomPlaylist,
    newNominations,
    peerColumns,
  ]);

  // Fetch community data when selection changes
  useEffect(() => {
    if (!selectedTrackId || !supabase) {
      setCommunityData({ feedback: [], supports: {}, tournaments: [] });
      return;
    }

    let active = true;
    setIsLoadingCommunity(true);

    const fetchData = async () => {
      try {
        // Fetch track metadata from catalog for track_id and tournament info
        const { data: catalogData } = await supabase
          .from('track_catalog')
          .select('track_id, tournaments')
          .eq('source_external_id', selectedTrackId)
          .single();

        const trackIdForFeedback = catalogData?.track_id;

        // Fetch feedback (all users)
        let feedbackData = [];
        let supportData = [];

        if (trackIdForFeedback) {
          try {
            feedbackData = await fetchCommunityFeedback(
              supabase,
              trackIdForFeedback,
            );
          } catch (err) {
            console.error('Error fetching community feedback:', err);
          }

          // Fetch support counts by level
          const { data: sData } = await supabase
            .from('track_supports')
            .select('level')
            .eq('track_id', trackIdForFeedback);
          supportData = sData || [];
        }

        if (active) {
          const supports = supportData.reduce((acc, curr) => {
            acc[curr.level] = (acc[curr.level] || 0) + 1;
            return acc;
          }, {});
          setCommunityData({
            feedback: feedbackData,
            supports,
            tournaments: catalogData?.tournaments || [],
          });
        }
      } catch (err) {
        console.error('Error fetching community data:', err);
      } finally {
        if (active) setIsLoadingCommunity(false);
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, [selectedTrackId, supabase]);

  // Track active column IDs to detect specific additions
  const activeColumnIds = useMemo(() => {
    const ids = ['nominations', 'support'];
    if (showCurrentPlaylist) ids.push('current');
    if (showNewNominations) ids.push('new-nominations');
    peerColumns.forEach((col) => ids.push(`peer-${col.user_id}`));
    if (activeCustomPlaylist) ids.push(activeCustomPlaylist.id);
    return ids;
  }, [
    showCurrentPlaylist,
    showNewNominations,
    peerColumns,
    activeCustomPlaylist,
  ]);

  const prevActiveColumnIdsRef = useRef([]);

  // Auto-scroll when new columns are added
  useEffect(() => {
    const prevIds = prevActiveColumnIdsRef.current;
    const newIds = activeColumnIds.filter((id) => !prevIds.includes(id));
    prevActiveColumnIdsRef.current = activeColumnIds;

    // We only want to scroll if there's exactly one new ID (representing a user action)
    // and if it's not the initial render (prevIds.length > 0)
    if (newIds.length > 0 && prevIds.length > 0) {
      const scrollId = newIds[newIds.length - 1]; // Target the latest added one
      // Provide a small delay for DOM to update and layout to settle
      const timeoutId = setTimeout(() => {
        if (gridRef.current) {
          const element = gridRef.current.querySelector(
            `[data-column-id="${scrollId}"]`,
          );
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', inline: 'end' });
          }
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [activeColumnIds]);

  return (
    <div
      className={`list-explorer-container ${focusedListId ? 'has-focused' : ''} ${selectedTrackId ? 'has-selection' : ''}`}
    >
      <div className="list-explorer-header">
        <div className="list-explorer-title-group">
          <h1>List Explorer</h1>
          <p>
            Manage your lists, see other users' lists, and view info on each
            track
          </p>
        </div>
        <div className="list-explorer-global-actions">
          <div className="list-explorer-toolbar">
            <div className="toolbar-group">
              <span className="toolbar-label">Show:</span>
              <button
                className={`toolbar-toggle ${showCurrentPlaylist ? 'active' : ''}`}
                onClick={() => setShowCurrentPlaylist(!showCurrentPlaylist)}
              >
                Current Playlist
              </button>
              <button
                className={`toolbar-toggle ${showNewNominations ? 'active' : ''}`}
                onClick={() => setShowNewNominations(!showNewNominations)}
              >
                New Nominations
              </button>
            </div>
            <div className="toolbar-separator" />
            <div className="toolbar-group">
              <span className="toolbar-label">Other Users:</span>
              <select
                className="toolbar-select"
                onChange={(e) => {
                  const user = allPeerLists.find(
                    (u) => u.user_id === e.target.value,
                  );
                  if (user) togglePeerList(user);
                  e.target.value = '';
                }}
                value=""
              >
                <option value="" disabled>
                  Select a user...
                </option>
                {allPeerLists
                  .filter((u) => u.user_id !== authUser?.id)
                  .map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {getDisplayProfileName(user.username)} (
                      {user.nominations.length} songs)
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <TrackInfoPanel
          key={selectedTrack?.videoId || 'none'}
          track={selectedTrack}
          communityData={communityData}
          isLoading={isLoadingCommunity || isSavingFeedback}
          onClose={() => setSelectedTrackId(null)}
          authUser={authUser}
          onUpdateComment={(videoId, comment) =>
            handleUpdateComment(
              selectedTrackId ? findListId(selectedTrackId) : null,
              videoId,
              comment,
            )
          }
          onSaveFeedback={async (rating, note) => {
            if (!supabase || !authUser || !selectedTrack) return;
            setIsSavingFeedback(true);
            try {
              let trackId = selectedTrack.trackId || selectedTrack.id;
              // Ingest if missing UUID
              if (!trackId || !/^[0-9a-f-]{36}$/i.test(trackId)) {
                const ingested = await ingestYouTubeTrackSources(supabase, [
                  selectedTrack,
                ]);
                if (ingested && ingested.length > 0) {
                  trackId = ingested[0].track_id;
                  // Update local list state
                  const updateId = (list) =>
                    list.map((v) =>
                      v.videoId === selectedTrack.videoId
                        ? { ...v, trackId }
                        : v,
                    );
                  onUpdateNominationList(updateId(nominationList));
                  onUpdateSupportList(updateId(supportList));
                  onUpdatePlaylist(updateId(playlist));
                }
              }

              if (!trackId) {
                onShowToast('Could not link track for feedback.');
                return;
              }

              await upsertUserFeedback(supabase, authUser.id, trackId, {
                rating: rating || null,
                note: note || null,
              });

              onShowToast('Feedback saved!');

              // Refresh community feedback
              const feedbackData = await fetchCommunityFeedback(
                supabase,
                trackId,
              );
              setCommunityData((prev) => ({
                ...prev,
                feedback: feedbackData || [],
              }));
            } catch (err) {
              console.error('Error saving feedback:', err);
              onShowToast('Failed to save feedback.');
            } finally {
              setIsSavingFeedback(false);
            }
          }}
        />

        <div className="list-explorer-layout">
          <div ref={gridRef} className="list-explorer-grid">
            <ListExplorerColumn
              id="nominations"
              title="Nominations"
              subtitle={`${nominationList.length} tracks`}
              videos={nominationList}
              isFocused={focusedListId === 'nominations'}
              onFocus={() => setFocusedListId('nominations')}
              onUnfocus={() => setFocusedListId(null)}
              onPlayNow={onPlayNow}
              colorVar="--accent"
              onUpdateComment={(videoId, comment) =>
                handleUpdateComment('nominations', videoId, comment)
              }
              onRename={() => {}}
              onRemovePlaylist={() => {}}
              onRemove={(videoId) =>
                onUpdateNominationList(
                  nominationList.filter((v) => v.videoId !== videoId),
                )
              }
              selectedTrackId={selectedTrackId}
              onSelectTrack={setSelectedTrackId}
              onContextMenu={handleContextMenu}
              canAddAll={true}
              onAddAll={() => handleAddAllToCurrent(nominationList)}
              onExport={onExport}
              onSavePlaylist={onSavePlaylist}
            />

            <ListExplorerColumn
              id="support"
              title="Support List"
              subtitle={`${supportList.length} tracks`}
              videos={supportList}
              isFocused={focusedListId === 'support'}
              onFocus={() => setFocusedListId('support')}
              onUnfocus={() => setFocusedListId(null)}
              onPlayNow={onPlayNow}
              colorVar="--support-pink"
              onUpdateComment={(videoId, comment) =>
                handleUpdateComment('support', videoId, comment)
              }
              onRename={() => {}}
              onRemovePlaylist={() => {}}
              onRemove={(videoId) =>
                onUpdateSupportList(
                  supportList.filter((v) => v.videoId !== videoId),
                )
              }
              selectedTrackId={selectedTrackId}
              onSelectTrack={setSelectedTrackId}
              onContextMenu={handleContextMenu}
              canAddAll={true}
              onAddAll={() => handleAddAllToCurrent(supportList)}
              onExport={onExport}
              onSavePlaylist={onSavePlaylist}
            />

            {showCurrentPlaylist && (
              <ListExplorerColumn
                id="current"
                title="Current Playlist"
                subtitle={`${playlist.length} tracks`}
                videos={playlist}
                isFocused={focusedListId === 'current'}
                onFocus={() => setFocusedListId('current')}
                onUnfocus={() => setFocusedListId(null)}
                onPlayNow={onPlayNow}
                colorVar="--info"
                onUpdateComment={(videoId, comment) =>
                  handleUpdateComment('current', videoId, comment)
                }
                onRename={() => {}}
                onRemovePlaylist={() => {}}
                onRemove={onRemoveFromPlaylist}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                onContextMenu={handleContextMenu}
                canClose={true}
                onClose={() => setShowCurrentPlaylist(false)}
                onExport={onExport}
                onSavePlaylist={onSavePlaylist}
              />
            )}

            {showNewNominations && (
              <ListExplorerColumn
                id="new-nominations"
                title="New Nominations"
                subtitle={`${newNominations.length} tracks`}
                videos={newNominations}
                isFocused={focusedListId === 'new-nominations'}
                onFocus={() => setFocusedListId('new-nominations')}
                onUnfocus={() => setFocusedListId(null)}
                onPlayNow={onPlayNow}
                colorVar="--accent"
                onUpdateComment={() => {}}
                onRename={() => {}}
                onRemovePlaylist={() => {}}
                onRemove={() => {}}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                onContextMenu={handleContextMenu}
                canClose={true}
                onClose={() => setShowNewNominations(false)}
                canAddAll={true}
                onAddAll={() => handleAddAllToCurrent(newNominations)}
                isReadOnly={true}
                onExport={onExport}
                onSavePlaylist={onSavePlaylist}
              />
            )}

            {peerColumns.map((col) => (
              <ListExplorerColumn
                key={col.user_id}
                id={`peer-${col.user_id}`}
                title={`${getDisplayProfileName(col.username)}'s Noms`}
                subtitle={`${col.videos.length} tracks`}
                videos={col.videos}
                isFocused={focusedListId === `peer-${col.user_id}`}
                onFocus={() => setFocusedListId(`peer-${col.user_id}`)}
                onUnfocus={() => setFocusedListId(null)}
                onPlayNow={onPlayNow}
                colorVar="--gold"
                onUpdateComment={() => {}}
                onRename={() => {}}
                onRemovePlaylist={() =>
                  setPeerColumns(
                    peerColumns.filter((c) => c.user_id !== col.user_id),
                  )
                }
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                onContextMenu={handleContextMenu}
                onRemove={() => {}}
                canClose={true}
                onClose={() =>
                  setPeerColumns(
                    peerColumns.filter((c) => c.user_id !== col.user_id),
                  )
                }
                canAddAll={true}
                onAddAll={() => handleAddAllToCurrent(col.videos)}
                isReadOnly={true}
                onExport={onExport}
                onSavePlaylist={onSavePlaylist}
              />
            ))}

            {activeCustomPlaylist && (
              <ListExplorerColumn
                id={activeCustomPlaylist.id}
                title={activeCustomPlaylist.name}
                subtitle={`${activeCustomPlaylist.videos.length} tracks`}
                videos={activeCustomPlaylist.videos}
                isFocused={focusedListId === activeCustomPlaylist.id}
                onFocus={() => setFocusedListId(activeCustomPlaylist.id)}
                onUnfocus={() => setFocusedListId(null)}
                onPlayNow={onPlayNow}
                colorVar="--gold"
                onUpdateComment={(videoId, comment) =>
                  handleUpdateComment(activeCustomPlaylist.id, videoId, comment)
                }
                onRename={handleRenamePlaylist}
                onRemovePlaylist={handleRemovePlaylist}
                playlists={customPlaylists}
                activePlaylistId={activeCustomPlaylistId}
                onSelectPlaylist={setActiveCustomPlaylistId}
                onAddByUrl={(url) =>
                  handleAddByUrl(activeCustomPlaylist.id, url)
                }
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                onContextMenu={handleContextMenu}
                canClose={true}
                onClose={() => setActiveCustomPlaylistId(null)}
                canAddAll={true}
                onAddAll={() =>
                  handleAddAllToCurrent(activeCustomPlaylist.videos)
                }
                onRemove={(videoId) => {
                  onUpdateCustomPlaylists(
                    customPlaylists.map((p) =>
                      p.id === activeCustomPlaylist.id
                        ? {
                            ...p,
                            videos: p.videos.filter(
                              (v) => v.videoId !== videoId,
                            ),
                          }
                        : p,
                    ),
                  );
                }}
                onExport={onExport}
                onSavePlaylist={onSavePlaylist}
              />
            )}
          </div>
        </div>

        {contextMenu && (
          <ContextMenuPortal
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={closeContextMenu}
            className="database-context-menu"
          >
            <button
              className="database-context-menu-item"
              onClick={() => handlePlayNow(contextMenu.video)}
            >
              <PlayIcon />
              <span>Play Now</span>
            </button>
            {contextMenu.sourceListId !== 'current' && (
              <button
                className="database-context-menu-item"
                onClick={() => {
                  handleAddTrackToPlaylist(contextMenu.video);
                  closeContextMenu();
                }}
              >
                <PlaylistPlusIcon />
                <span>Add to Playlist</span>
              </button>
            )}
            <button
              className="database-context-menu-item"
              onClick={() => {
                onUpdateMetadata?.(contextMenu.video);
                closeContextMenu();
              }}
            >
              <EditIcon />
              <span>Update Metadata</span>
            </button>
            {contextMenu.sourceListId !== 'nominations' &&
              contextMenu.sourceListId !== 'peer' && (
                <>
                  <div
                    style={{
                      height: '1px',
                      background: 'rgba(255,255,255,0.08)',
                      margin: '4px 8px',
                    }}
                  />
                  <button
                    className="database-context-menu-item danger"
                    onClick={() => {
                      handleRemoveTrack(
                        contextMenu.sourceListId,
                        contextMenu.video.videoId,
                      );
                    }}
                  >
                    <TrashIcon />
                    <span>Remove from List</span>
                  </button>
                </>
              )}
          </ContextMenuPortal>
        )}

        <DragOverlay dropAnimation={dropAnimationConfig}>
          {activeVideo ? (
            <div className="list-explorer-item-drag-preview">
              <img src={activeVideo.thumbnail} alt="" />
              <div className="list-explorer-item-drag-info">
                <span className="title">
                  {activeVideo.displayTitle || activeVideo.title}
                </span>
                <span className="channel">{activeVideo.channelTitle}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
