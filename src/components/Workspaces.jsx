import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { getDisplayProfileName } from '../lib/playerState.js';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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

function PlaylistPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
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
  onUpdateRating,
}) {
  const [localComment, setLocalComment] = useState(track?.comment || '');

  if (!track) {
    return (
      <div className="workspace-info-panel empty">
        <div className="workspace-info-placeholder">
          <div className="placeholder-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
            </svg>
          </div>
          <h3>No Track Selected</h3>
          <p>
            Click a track in any list to view detailed metadata, ratings, and
            community support.
          </p>
        </div>
      </div>
    );
  }

  const personalFeedback = communityData.feedback.find(
    (f) => f.user_id === authUser?.id,
  ) || { rating: null, note: '' };
  const peerFeedback = communityData.feedback.filter(
    (f) => f.user_id !== authUser?.id,
  );

  const vgmcStatus =
    track.tournaments?.length > 0
      ? `VGMC ${track.tournaments[0].sequence_number}`
      : 'New to VGMC';

  const handleCommentChange = (e) => {
    const val = e.target.value;
    setLocalComment(val);
    onUpdateComment(track.videoId, val);
  };

  return (
    <div className="workspace-info-panel">
      <div className="workspace-info-header">
        <button
          className="workspace-info-close"
          onClick={onClose}
          title="Deselect track"
        >
          ✕
        </button>
        <div className="workspace-info-hero">
          <img
            src={track.thumbnail || track.sourceThumbnailUrl}
            alt=""
            className="workspace-info-img"
          />
          <div className="workspace-info-titles">
            <h2>{track.displayTitle || track.title}</h2>
            <p className="workspace-info-game">
              {track.gameTitle || track.channelTitle}
            </p>
            <span className="workspace-info-vgmc-badge">{vgmcStatus}</span>
          </div>
        </div>
      </div>

      <div className="workspace-info-content">
        <section className="workspace-info-section">
          <h4>Your Feedback</h4>
          <div className="workspace-info-personal">
            <div className="workspace-info-rating-row">
              <span className="label">Rating:</span>
              <select
                className="workspace-info-rating-select"
                value={personalFeedback.rating || ''}
                onChange={(e) =>
                  onUpdateRating(
                    track.videoId,
                    parseInt(e.target.value) || null,
                  )
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
              className="workspace-info-note-editor"
              placeholder="Add personal notes or comments..."
              value={localComment}
              onChange={handleCommentChange}
            />
          </div>
        </section>

        <section className="workspace-info-section">
          <h4>Community Support</h4>
          <div className="workspace-support-bar">
            {Object.keys(communityData.supports).length === 0 ? (
              <div className="support-segment empty" style={{ width: '100%' }}>
                No support recorded yet
              </div>
            ) : (
              [3, 2, 1].map((level) => {
                const count = communityData.supports[level] || 0;
                const total = Object.values(communityData.supports).reduce(
                  (a, b) => a + b,
                  0,
                );
                const width = count > 0 ? (count / total) * 100 : 0;
                return (
                  <div
                    key={level}
                    className={`support-segment level-${level}`}
                    style={{ width: `${width}%` }}
                    title={`Level ${level} Support: ${count}`}
                  >
                    {count > 0 && <span>{count}</span>}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="workspace-info-section community">
          <h4>Community Activity</h4>
          {isLoading ? (
            <p className="workspace-info-loading">Loading community data...</p>
          ) : peerFeedback.length === 0 ? (
            <p className="workspace-info-empty">No community feedback yet.</p>
          ) : (
            <div className="workspace-peer-list">
              {peerFeedback.map((f, i) => (
                <div key={i} className="workspace-peer-item">
                  <div className="workspace-peer-header">
                    <span className="workspace-peer-user">
                      {getDisplayProfileName(f.profiles?.username, 'Anonymous')}
                    </span>
                    {f.rating && (
                      <span className="workspace-peer-rating">
                        {f.rating}/10
                      </span>
                    )}
                  </div>
                  {f.note && <p className="workspace-peer-note">{f.note}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SortableWorkspaceCard({
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.5 : 1, // Visual feedback for local dragging if enabled
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`workspace-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isReadOnly ? 'read-only' : ''}`}
      onClick={() => onSelect?.(video.videoId)}
      onContextMenu={(e) => onContextMenu?.(e, video)}
    >
      <div className="workspace-card-inner">
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
        <div className="workspace-card-main">
          <SupportItem
            video={video}
            onRemove={isReadOnly ? null : () => onRemove(video.videoId)}
            onDoubleQueue={() => onPlayNow(video)}
            onOpenContextMenu={onContextMenu}
            itemAriaPrefix="Workspace track"
          />
        </div>
      </div>
    </div>
  );
}

function WorkspaceColumn({
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

  const handleAdd = (e) => {
    e.preventDefault();
    if (!addUrl.trim()) return;
    onAddByUrl?.(addUrl);
    setAddUrl('');
  };

  return (
    <div
      ref={setNodeRef}
      className={`workspace-column ${isFocused ? 'focused' : ''}`}
    >
      <div
        className="workspace-column-header"
        style={{ '--column-accent': `var(${colorVar})` }}
      >
        <div className="workspace-column-title-group">
          {isCustom && playlists.length > 0 ? (
            <div className="workspace-playlist-selector-shell">
              <select
                className="workspace-playlist-select"
                value={activePlaylistId || ''}
                onChange={(e) => onSelectPlaylist?.(e.target.value)}
              >
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>
              <div className="workspace-column-subtitle">{subtitle}</div>
            </div>
          ) : (
            <div className="workspace-column-title-row">
              <h3>{title}</h3>
              {subtitle && (
                <span className="workspace-column-subtitle">{subtitle}</span>
              )}
            </div>
          )}
        </div>
        <div className="workspace-column-actions">
          {canAddAll && videos && videos.length > 0 && (
            <button
              className="workspace-column-btn"
              onClick={onAddAll}
              title="Add all tracks to current playlist"
            >
              <PlaylistPlusIcon />
            </button>
          )}
          {isFocused ? (
            <button
              className="workspace-column-btn"
              onClick={onUnfocus}
              title="Exit full view"
            >
              <UnfocusIcon />
            </button>
          ) : (
            <button
              className="workspace-column-btn"
              onClick={onFocus}
              title="Focus on this list"
            >
              <FocusIcon />
            </button>
          )}
          {canClose && (
            <button
              className="workspace-column-btn close"
              onClick={onClose}
              title="Close list"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className="workspace-column-content">
        {onAddByUrl && (
          <form className="workspace-quick-add" onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="Paste YouTube link to add track..."
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
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
          <div className="workspace-list">
            {!videos || videos.length === 0 ? (
              <div className="workspace-list-empty">
                <span>No tracks here yet</span>
              </div>
            ) : (
              videos.map((video, index) => (
                <SortableWorkspaceCard
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

export default function Workspaces({
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

  // Find the currently selected track object
  const selectedTrack = useMemo(() => {
    if (!selectedTrackId) return null;
    let track = null;
    [
      nominationList,
      supportList,
      playlist,
      ...(activeCustomPlaylist ? [activeCustomPlaylist.videos] : []),
    ].some((list) => {
      track = list.find((v) => v.videoId === selectedTrackId);
      return !!track;
    });
    return track;
  }, [
    selectedTrackId,
    nominationList,
    supportList,
    playlist,
    activeCustomPlaylist,
  ]);

  // Fetch community data when selection changes
  useEffect(() => {
    if (!selectedTrackId || !supabase) {
      setCommunityData({ feedback: [], supports: {} });
      return;
    }

    let active = true;
    setIsLoadingCommunity(true);

    const fetchData = async () => {
      try {
        // Fetch feedback (all users)
        const { data: feedbackData } = await supabase
          .from('track_user_feedback')
          .select('*, profiles(username)')
          .eq('track_id', selectedTrackId || '') // This might need track uuid if using trackId
          .order('updated_at', { ascending: false });

        // Fetch support counts by level
        const { data: supportData } = await supabase
          .from('track_supports')
          .select('level')
          .eq('track_id', selectedTrackId || '');

        if (active) {
          const supports = (supportData || []).reduce((acc, curr) => {
            acc[curr.level] = (acc[curr.level] || 0) + 1;
            return acc;
          }, {});
          setCommunityData({ feedback: feedbackData || [], supports });
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
  const [newNominations, setNewNominations] = useState([]);

  useEffect(() => {
    const fetchPeerLists = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc(
        'get_dashboard_nomination_lists',
      );
      if (!error && data) {
        setAllPeerLists(data);
      }
    };
    fetchPeerLists();
  }, [supabase]);

  useEffect(() => {
    if (!showNewNominations || !supabase) return;
    const fetchNewNominations = async () => {
      // Find tracks with no tournament appearances
      const { data, error } = await supabase
        .from('tracks')
        .select(
          `
          id,
          canonical_game_title,
          canonical_track_title,
          track_sources (
            provider,
            external_id,
            cached_thumbnail_url,
            cached_title,
            cached_channel_title
          ),
          track_tournament_appearances (
            tournament_id
          )
        `,
        )
        .eq('is_retired', false);

      if (!error && data) {
        const unfiltered = data.filter(
          (t) => t.track_tournament_appearances.length === 0,
        );
        const mapped = unfiltered
          .map((t) => {
            const primary =
              t.track_sources.find((s) => s.provider === 'youtube') ||
              t.track_sources[0];
            return {
              videoId: primary?.external_id,
              title: t.canonical_track_title || primary?.cached_title,
              displayTitle: t.canonical_track_title,
              gameTitle: t.canonical_game_title,
              channelTitle: primary?.cached_channel_title,
              thumbnail: primary?.cached_thumbnail_url,
              comment: '',
              tournaments: [],
            };
          })
          .filter((t) => t.videoId);
        setNewNominations(mapped);
      }
    };
    fetchNewNominations();
  }, [showNewNominations, supabase]);

  const togglePeerList = (user) => {
    if (peerColumns.some((c) => c.user_id === user.user_id)) {
      setPeerColumns(peerColumns.filter((c) => c.user_id !== user.user_id));
    } else {
      setPeerColumns([
        ...peerColumns,
        {
          ...user,
          videos: user.nominations.map((n) => ({
            ...n,
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
    ].some((list) => {
      video = list.find((v) => v.videoId === videoId);
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
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      video,
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handlePlayNow = (video) => {
    onPlayNow(video);
    closeContextMenu();
  };

  const handleAddTrackToPlaylist = (video) => {
    onAddToPlaylist(video);
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

  const handleCreatePlaylist = () => {
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

  return (
    <div
      className={`workspaces-container ${focusedListId ? 'has-focused' : ''} ${selectedTrackId ? 'has-selection' : ''}`}
    >
      <div className="workspaces-header">
        <div className="workspaces-title-group">
          <h1>Workspaces</h1>
          <p>A fluid space to organize and manage your musical collections</p>
        </div>
        <div className="workspaces-global-actions">
          <div className="workspace-toolbar">
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
          <button
            className="workspace-action-btn primary"
            onClick={handleCreatePlaylist}
          >
            <span>New Playlist</span>
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="workspaces-layout">
          <div className="workspaces-grid">
            <WorkspaceColumn
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
            />

            <WorkspaceColumn
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
            />

            {showCurrentPlaylist && (
              <WorkspaceColumn
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
              />
            )}

            {showNewNominations && (
              <WorkspaceColumn
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
              />
            )}

            {peerColumns.map((col) => (
              <WorkspaceColumn
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
              />
            ))}

            {activeCustomPlaylist && (
              <WorkspaceColumn
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
              />
            )}
          </div>

          <TrackInfoPanel
            key={selectedTrackId}
            track={selectedTrack}
            communityData={communityData}
            isLoading={isLoadingCommunity}
            onClose={() => setSelectedTrackId(null)}
            authUser={authUser}
            onUpdateComment={(videoId, comment) =>
              handleUpdateComment(
                selectedTrackId ? findListId(selectedTrackId) : null,
                videoId,
                comment,
              )
            }
            onUpdateRating={async (videoId, rating) => {
              if (!supabase || !authUser) return;
              const { error } = await supabase
                .from('track_user_feedback')
                .upsert({
                  track_id: selectedTrack.id, // We need the track UUID here
                  user_id: authUser.id,
                  rating,
                  updated_at: new Date().toISOString(),
                });
              if (!error) {
                onShowToast(`Rating updated to ${rating || 'none'}`);
                // Refresh community data
                const { data } = await supabase
                  .from('track_user_feedback')
                  .select('*, profiles(username, avatar_url)')
                  .eq('track_id', selectedTrack.id);
                setCommunityData((prev) => ({ ...prev, feedback: data || [] }));
              }
            }}
          />
        </div>

        {contextMenu && (
          <ContextMenuPortal
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={closeContextMenu}
            className="db-context-menu"
          >
            <div
              className="context-menu-item"
              onClick={() => handlePlayNow(contextMenu.video)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.25 4.67V15.33C6.25 15.91 6.89 16.27 7.39 15.96L15.75 10.63C16.22 10.33 16.22 9.67 15.75 9.37L7.39 4.04C6.89 3.73 6.25 4.09 6.25 4.67Z" />
              </svg>
              <span>Play Now</span>
            </div>
            <div
              className="context-menu-item"
              onClick={() => handleAddTrackToPlaylist(contextMenu.video)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
              </svg>
              <span>Add to Playlist</span>
            </div>
            <div className="context-menu-separator" />
            <div
              className="context-menu-item danger"
              onClick={() => {
                const listId = String(
                  nominationList.some(
                    (v) => v.videoId === contextMenu.video.videoId,
                  )
                    ? 'nominations'
                    : supportList.some(
                          (v) => v.videoId === contextMenu.video.videoId,
                        )
                      ? 'support'
                      : playlist.some(
                            (v) => v.videoId === contextMenu.video.videoId,
                          )
                        ? 'current'
                        : activeCustomPlaylistId,
                );
                handleRemoveTrack(listId, contextMenu.video.videoId);
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.75 3A.75.75 0 0 0 8 3.75V4H4.75a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H12v-.25A.75.75 0 0 0 11.25 3h-2.5ZM5 6.5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 .75.75v11a2.25 2.25 0 0 1-2.25 2.25h-5A2.25 2.25 0 0 1 5 17.5v-11Z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Remove from List</span>
            </div>
          </ContextMenuPortal>
        )}

        <DragOverlay dropAnimation={dropAnimationConfig}>
          {activeVideo ? (
            <div className="workspace-item-drag-preview">
              <img src={activeVideo.thumbnail} alt="" />
              <div className="workspace-item-drag-info">
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
