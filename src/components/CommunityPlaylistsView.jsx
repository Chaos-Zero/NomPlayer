import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getDisplayProfileName } from '../lib/playerState.js';
import { getMediaThumbnailUrl } from '../utils/media.js';
import {
  PencilIcon,
  SaveIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from './Icons.jsx';
import PrivacyToggle from './PrivacyToggle.jsx';
import CreatePlaylistDialog from './CreatePlaylistDialog.jsx';
import DeletePlaylistConfirmDialog from './DeletePlaylistConfirmDialog.jsx';

function PlaySvg() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M6.25 4.67v10.66c0 .58.64.94 1.14.63l8.36-5.33c.47-.3.47-.96 0-1.26L7.39 4.04c-.5-.31-1.14.05-1.14.63z" />
    </svg>
  );
}

const COVER_GRADIENTS = [
  ['#7c3aed', '#3b1d6e'],
  ['#0ea5e9', '#1d4ed8'],
  ['#f59e0b', '#92400e'],
  ['#10b981', '#0ea5e9'],
  ['#ec4899', '#7c3aed'],
  ['#ef4444', '#7c3aed'],
  ['#6366f1', '#ec4899'],
  ['#f472b6', '#f59e0b'],
  ['#1d4ed8', '#10b981'],
  ['#38bdf8', '#7c3aed'],
];

function playlistGradient(id = '') {
  const num = parseInt(id.replace(/-/g, '').slice(0, 8), 16) || 0;
  const [a, b] = COVER_GRADIENTS[Math.abs(num) % COVER_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function avatarInitials(username = '') {
  const name = getDisplayProfileName(username) || '?';
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr) {
  const d = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  if (d < 1) return 'today';
  if (d < 2) return '1d ago';
  if (d < 7) return `${Math.floor(d)}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function CplAvatar({ username, userId, avatarUrl, size = 'sm' }) {
  return (
    <div
      className={`cpl-avatar cpl-avatar-${size}`}
      style={
        avatarUrl
          ? {}
          : { background: playlistGradient(userId || username || '') }
      }
      aria-hidden
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 'inherit',
          }}
        />
      ) : (
        avatarInitials(username)
      )}
    </div>
  );
}

function SortControls({ sortBy, onChange }) {
  return (
    <div className="cpl-sort-row">
      {[
        ['newest', 'Newest'],
        ['most-tracks', 'Most tracks'],
        ['a-z', 'A–Z'],
      ].map(([val, label]) => (
        <button
          key={val}
          className={`cpl-sort-btn${sortBy === val ? ' on' : ''}`}
          onClick={() => onChange(val)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PlaylistCard({
  playlist,
  onLoad,
  onAdd,
  onSelect,
  onTogglePrivacy,
  onDelete,
  onToggleEdit,
  isEditing,
  loadingId,
  isOwn,
}) {
  const busy = loadingId === playlist.id;
  const isPrivate = isOwn && !playlist.is_public;
  return (
    <div
      className="cpl-card"
      onClick={() => onSelect?.(playlist)}
      style={{ cursor: 'pointer' }}
    >
      <div className="cpl-card-cover">
        {playlist.firstThumbnail ? (
          <img
            src={playlist.firstThumbnail}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            className="cpl-card-gradient"
            style={{ background: playlistGradient(playlist.id) }}
          />
        )}
        <span className="cpl-track-badge">{playlist.trackCount} tracks</span>
        {isPrivate && <span className="cpl-private-badge">Private</span>}
        <div className="cpl-card-overlay">
          <button
            className="cpl-play-btn"
            onClick={(e) => {
              e.stopPropagation();
              onLoad(playlist);
            }}
            disabled={busy}
            title="Play Playlist"
          >
            <PlaySvg />
          </button>
        </div>
      </div>
      <div className="cpl-card-body">
        <div className="cpl-card-name">{playlist.name}</div>
        <div className="cpl-card-creator">
          <CplAvatar
            username={playlist.profile?.username}
            userId={playlist.user_id}
            avatarUrl={playlist.profile?.avatar_url}
          />
          <span className="cpl-card-username">
            {getDisplayProfileName(playlist.profile?.username)}
          </span>
          <span className="cpl-card-date">{timeAgo(playlist.created_at)}</span>
        </div>
        <div className="cpl-card-actions">
          <button
            className="cpl-action-btn cpl-action-primary"
            onClick={(e) => {
              e.stopPropagation();
              onLoad(playlist);
            }}
            disabled={busy}
          >
            {busy ? '…' : 'Play'}
          </button>
          <button
            className="cpl-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAdd(playlist);
            }}
            disabled={busy}
          >
            Add
          </button>
          {isOwn && (
            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {onToggleEdit && (
                <button
                  className={`cpl-action-btn cpl-edit-btn${isEditing ? ' is-editing' : ''}`}
                  onClick={() => onToggleEdit(playlist)}
                  title={isEditing ? 'Save changes' : 'Edit Playlist'}
                >
                  {isEditing ? <SaveIcon /> : <PencilIcon />}
                </button>
              )}
              {onDelete && (
                <button
                  className="cpl-action-btn cpl-delete-btn"
                  onClick={() => onDelete(playlist)}
                  title="Delete Playlist"
                >
                  <TrashIcon />
                </button>
              )}
              {onTogglePrivacy && (
                <PrivacyToggle
                  isPublic={playlist.is_public}
                  onToggle={(newIsPublic) =>
                    onTogglePrivacy(playlist.id, newIsPublic)
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Plain (non-draggable) content for one track row - used as-is when the
// panel is read-only, and wrapped by SortableCommunityTrackItem below when
// the owner has edit mode open. Kept dumb about dnd-kit entirely, same split
// PlaylistSidebar.jsx uses for PlaylistItem/SortablePlaylistItem.
function CommunityTrackItem({
  track,
  playlist,
  tracks,
  isEditing,
  isOwner,
  onPlay,
  onContextMenu,
  onRemove,
}) {
  return (
    <div
      className="cpl-track-item"
      style={{
        display: 'flex',
        gap: 12,
        padding: '8px 12px',
        alignItems: 'center',
        borderRadius: 6,
        transition: 'background 0.2s',
        cursor: 'pointer',
      }}
      onDoubleClick={() => onPlay(playlist, tracks, track.videoId || track.id)}
      onContextMenu={(e) =>
        onContextMenu?.(e, track, {
          sourceListId: 'community-playlist',
          isOwner,
          onRemove: onRemove ? () => onRemove(track.id) : undefined,
        })
      }
    >
      <img
        src={track.thumbnail}
        alt=""
        style={{
          borderRadius: 4,
          width: 72,
          height: 40,
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#fff',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          }}
        >
          {track.trackTitle || track.displayTitle}
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-muted, #9ca3af)',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          }}
        >
          {track.gameTitle || track.channelTitle}
        </span>
      </div>
      {isEditing && onRemove && (
        <button
          className="cpl-track-remove-btn"
          type="button"
          aria-label={`Remove ${track.trackTitle || track.displayTitle || 'track'} from playlist`}
          title="Remove from playlist"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(track.id);
          }}
        >
          <XIcon size={14} />
        </button>
      )}
    </div>
  );
}

// Drag-to-reorder wrapper, mounted only while edit mode's DndContext is
// active (see CommunityPlaylistPanel) - same shape as PlaylistSidebar's
// SortablePlaylistItem: the drag handle lives outside CommunityTrackItem
// entirely, so that component never has to know dnd-kit exists.
function SortableCommunityTrackItem(props) {
  const { track } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, display: 'flex', alignItems: 'center', gap: 4 }}
    >
      <button
        type="button"
        className="cpl-track-drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        ⠿
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CommunityTrackItem {...props} />
      </div>
    </div>
  );
}

function CommunityPlaylistPanel({
  playlist,
  tracks,
  isLoading,
  onClose,
  onPlay,
  onAdd,
  onContextMenu,
  isOwner,
  onRemoveTrack,
  isEditing,
  isSavingEdit,
  editNameValue,
  onEditNameChange,
  onToggleEdit,
  onCancelEdit,
  onReorderTracks,
}) {
  const fullTitle = playlist?.name || '';
  const gameTitle = playlist
    ? getDisplayProfileName(playlist.profile?.username)
    : '';
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tracks.findIndex((t) => t.id === active.id);
    const newIndex = tracks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderTracks?.(oldIndex, newIndex);
  }

  return (
    <div className={`list-explorer-info-panel ${playlist ? 'is-open' : ''}`}>
      <div className="list-explorer-info-content-wrapper">
        {playlist && (
          <>
            <div className="list-explorer-info-header">
              <button
                className="list-explorer-info-close"
                onClick={onClose}
                title="Deselect playlist"
              >
                ✕
              </button>
              <div className="list-explorer-info-hero">
                {playlist.firstThumbnail ? (
                  <img
                    src={playlist.firstThumbnail}
                    alt=""
                    className="list-explorer-info-img"
                    style={{ display: 'block' }}
                  />
                ) : (
                  <div
                    className="list-explorer-info-img"
                    style={{
                      display: 'block',
                      background: playlistGradient(playlist.id),
                    }}
                  />
                )}
                <div className="list-explorer-info-titles">
                  <div className="list-explorer-info-title-group">
                    <p className="list-explorer-info-game">{gameTitle}</p>
                    <span className="list-explorer-info-separator"> - </span>
                    {isEditing ? (
                      <input
                        className="cpl-edit-name-input"
                        type="text"
                        value={editNameValue}
                        onChange={(e) => onEditNameChange(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onToggleEdit?.();
                          if (e.key === 'Escape') onCancelEdit?.();
                        }}
                        autoFocus
                      />
                    ) : (
                      <h2
                        className="list-explorer-info-song"
                        style={{ fontSize: '1.4em' }}
                      >
                        {fullTitle}
                      </h2>
                    )}
                  </div>
                  <span className="list-explorer-info-vgmc-badge">
                    {playlist.trackCount} tracks
                  </span>
                </div>
              </div>
            </div>

            <div className="list-explorer-info-content">
              <section
                className="list-explorer-info-section community"
                style={{ padding: '0 20px 20px' }}
              >
                <div
                  className="cpl-featured-actions"
                  style={{ marginBottom: 20, display: 'flex', gap: 8 }}
                >
                  <button
                    className="btn btn-primary"
                    onClick={() => onPlay(playlist, tracks)}
                    style={{ flex: 1 }}
                  >
                    Play Playlist
                  </button>
                  <button
                    className="btn"
                    onClick={() => onAdd(playlist, tracks)}
                    style={{ flex: 1 }}
                  >
                    Add to My Queue
                  </button>
                  {isOwner && onToggleEdit && (
                    <button
                      className={`btn${isEditing ? ' btn-primary' : ''}`}
                      onClick={onToggleEdit}
                      disabled={isSavingEdit}
                      title={isEditing ? 'Save changes' : 'Edit playlist'}
                    >
                      {isEditing ? <SaveIcon /> : <PencilIcon />}
                      {isEditing ? (isSavingEdit ? 'Saving…' : 'Save') : 'Edit'}
                    </button>
                  )}
                </div>

                <div
                  className="cpl-track-list"
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  {isLoading ? (
                    <p className="list-explorer-info-loading">
                      Loading tracks...
                    </p>
                  ) : tracks.length === 0 ? (
                    <p className="list-explorer-info-empty">No tracks yet.</p>
                  ) : isEditing ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={tracks.map((t) => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {tracks.map((t) => (
                          <SortableCommunityTrackItem
                            key={t.id}
                            track={t}
                            playlist={playlist}
                            tracks={tracks}
                            isEditing={isEditing}
                            isOwner={isOwner}
                            onPlay={onPlay}
                            onContextMenu={onContextMenu}
                            onRemove={onRemoveTrack}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  ) : (
                    tracks.map((t) => (
                      <CommunityTrackItem
                        key={t.id}
                        track={t}
                        playlist={playlist}
                        tracks={tracks}
                        isEditing={isEditing}
                        isOwner={isOwner}
                        onPlay={onPlay}
                        onContextMenu={onContextMenu}
                        onRemove={onRemoveTrack}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function CommunityPlaylistsView({
  supabase,
  authUser,
  onPlayPlaylist,
  onAddToPlaylist,
  onShowToast,
  onSelectionChange,
  onContextMenu,
  lastMetadataUpdateBatch,
  customPlaylists,
  onUpdateCustomPlaylists,
}) {
  const [playlists, setPlaylists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  // Lazy initializer, not useState(Math.random()) - a plain call there gets
  // re-evaluated (and its result thrown away) on every render, which is
  // exactly what react-hooks/purity flags: React reads it only on the true
  // first mount, but the render body still calls the impure function every
  // time. Passing a function instead hands the call off to React, which
  // only ever invokes it once.
  const [featuredSeed, setFeaturedSeed] = useState(() => Math.random());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const authUserId = authUser?.id ?? null;

  // Re-rolled whenever the browsed user changes, so the `featured` pick
  // below draws a fresh pool member instead of staying locked to whichever
  // pick was made for the previous user. Adjusted during render (React's
  // recommended way to reset state in response to a prop/value change -
  // see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than a useEffect, and setFeaturedSeed(() => Math.random())
  // rather than setFeaturedSeed(Math.random()) - same reasoning as the
  // lazy useState initializer above, handing React a function to call
  // itself is what satisfies react-hooks/purity, not calling the impure
  // function directly in the render body.
  const [prevSelectedUserId, setPrevSelectedUserId] = useState(selectedUserId);
  if (selectedUserId !== prevSelectedUserId) {
    setPrevSelectedUserId(selectedUserId);
    setFeaturedSeed(() => Math.random());
  }

  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedPlaylistTracks, setSelectedPlaylistTracks] = useState([]);
  const [isLoadingPanel, setIsLoadingPanel] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit mode: rename + track reorder/remove for a playlist the viewer
  // owns. Only one playlist can be "in edit mode" at a time, and it's
  // always the currently selected one - the track list it edits only
  // exists once a playlist is open in the panel. editNameValue is staged
  // locally and only written to Supabase on Save (see handleSaveEdit);
  // reorder/remove act on the live playlist immediately instead (see
  // handleReorderTracks/handleRemoveFromPanel), same as the rest of this
  // view's Supabase writes.
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    onSelectionChange?.(!!selectedPlaylist);
  }, [selectedPlaylist, onSelectionChange]);

  const fetchPlaylists = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('user_playlists')
        .select(
          'id, name, is_public, created_at, updated_at, user_id, user_playlist_tracks(count)',
        )
        .eq('is_active_queue', false)
        .order('created_at', { ascending: false });

      if (authUserId) {
        query = query.or(`is_public.eq.true,user_id.eq.${authUserId}`);
      } else {
        query = query.eq('is_public', true);
      }

      const { data: rawPls, error: plErr } = await query;
      if (plErr) throw plErr;

      const playlistIds = (rawPls || []).map((p) => p.id);
      const userIds = [...new Set((rawPls || []).map((p) => p.user_id))];

      let profileMap = {};
      let thumbnailMap = {};

      await Promise.all([
        userIds.length > 0 &&
          supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', userIds)
            .then(({ data }) => {
              (data || []).forEach((p) => {
                profileMap[p.id] = p;
              });
            }),
        playlistIds.length > 0 &&
          supabase
            .from('user_playlist_tracks')
            .select(
              'playlist_id, order_index, provider, external_id, cached_thumbnail, tracks(track_sources(provider, external_id, cached_thumbnail_url, is_primary))',
            )
            .in('playlist_id', playlistIds)
            .order('order_index', { ascending: true })
            .then(({ data }) => {
              for (const pt of data || []) {
                if (thumbnailMap[pt.playlist_id]) continue;
                const src =
                  pt.tracks?.track_sources?.find((s) => s.is_primary) ??
                  pt.tracks?.track_sources?.[0];
                if (src) {
                  thumbnailMap[pt.playlist_id] =
                    src.cached_thumbnail_url ||
                    getMediaThumbnailUrl({
                      provider: src.provider,
                      videoId: src.external_id,
                    });
                } else if (pt.external_id) {
                  thumbnailMap[pt.playlist_id] =
                    pt.cached_thumbnail ||
                    getMediaThumbnailUrl({
                      provider: pt.provider,
                      videoId: pt.external_id,
                    });
                }
              }
            }),
      ]);

      setPlaylists(
        (rawPls || []).map((pl) => ({
          ...pl,
          trackCount: Number(pl.user_playlist_tracks?.[0]?.count ?? 0),
          profile: profileMap[pl.user_id] || null,
          firstThumbnail: thumbnailMap[pl.id] || null,
        })),
      );
    } catch (err) {
      console.error('CommunityPlaylistsView fetch error:', err);
      onShowToast?.('Failed to load community playlists');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, authUserId, onShowToast]);

  // The canonical "fetch on mount" effect - fetchPlaylists' own first line
  // is setIsLoading(true), which is what react-hooks/set-state-in-effect is
  // flagging below. Splitting that out so this effect's own body stays
  // setState-free would mean every other caller of fetchPlaylists (a
  // manual refresh, or after creating/deleting a playlist) also has to
  // remember to set it themselves - more places to get it wrong, for a
  // rule whose own guidance (https://react.dev/learn/you-might-not-need-an-effect#fetching-data)
  // still calls this exact pattern out as a legitimate Effect.
  useEffect(() => {
    if (!supabase) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlaylists();
  }, [supabase, fetchPlaylists]);

  const lastAppliedBatchRef = useRef(null);
  useEffect(() => {
    if (
      !lastMetadataUpdateBatch ||
      lastMetadataUpdateBatch === lastAppliedBatchRef.current ||
      !selectedPlaylistTracks.length
    )
      return;
    lastAppliedBatchRef.current = lastMetadataUpdateBatch;

    const updateMap = new Map();
    for (const u of lastMetadataUpdateBatch) {
      updateMap.set(u.oldVideoId || u.videoId, u);
      if (u.trackId) {
        updateMap.set(u.trackId, u);
      }
    }

    setSelectedPlaylistTracks((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        const up = updateMap.get(t.videoId) || updateMap.get(t.trackId);
        if (!up) return t;
        changed = true;
        return {
          ...t,
          videoId: up.videoId || t.videoId,
          trackId: up.trackId || t.trackId,
          trackTitle:
            up.trackTitle !== undefined ? up.trackTitle : t.trackTitle,
          gameTitle: up.gameTitle !== undefined ? up.gameTitle : t.gameTitle,
          title: up.title || t.title,
          thumbnail: up.thumbnail || t.thumbnail,
          channelTitle: up.channelTitle || t.channelTitle,
        };
      });
      return changed ? next : prev;
    });
  }, [lastMetadataUpdateBatch, selectedPlaylistTracks.length]);

  async function fetchTracks(playlistId) {
    const { data, error } = await supabase
      .from('user_playlist_tracks')
      .select(
        `id, order_index, track_id, provider, external_id, cached_title, cached_channel, cached_thumbnail,
         tracks (
           id, canonical_game_title, canonical_track_title,
           track_sources (
             provider, external_id, cached_title, cached_channel_title,
             cached_thumbnail_url, is_primary
           )
         )`,
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

  async function handleSelectPlaylist(playlist) {
    if (selectedPlaylist?.id === playlist.id) return;
    // The panel can only ever show one playlist's tracks at a time, so
    // switching away from whichever one was being edited leaves nothing
    // for that edit session to act on - drop it rather than leave a stale
    // "Save" button pointing at a playlist that's no longer open.
    setEditingPlaylistId(null);
    setEditNameValue('');
    setSelectedPlaylist(playlist);
    setIsLoadingPanel(true);
    try {
      const tracks = await fetchTracks(playlist.id);
      setSelectedPlaylistTracks(tracks);
    } catch (err) {
      console.error(err);
      onShowToast?.('Failed to load playlist tracks');
    } finally {
      setIsLoadingPanel(false);
    }
  }

  async function handleTogglePrivacy(playlistId, isPublic) {
    try {
      const { error } = await supabase
        .from('user_playlists')
        .update({ is_public: isPublic })
        .eq('id', playlistId);
      if (error) throw error;
      setPlaylists((prev) =>
        prev.map((pl) =>
          pl.id === playlistId ? { ...pl, is_public: isPublic } : pl,
        ),
      );
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist((prev) => ({ ...prev, is_public: isPublic }));
      }

      if (onUpdateCustomPlaylists && customPlaylists) {
        onUpdateCustomPlaylists(
          customPlaylists.map((pl) =>
            pl.id === playlistId ? { ...pl, is_public: isPublic } : pl,
          ),
        );
      }
    } catch (err) {
      console.error(err);
      onShowToast?.('Failed to update playlist privacy');
    }
  }
  async function handleDeletePlaylist(playlist) {
    setPlaylistToDelete(playlist);
  }

  async function handleConfirmDelete() {
    if (!playlistToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('user_playlists')
        .delete()
        .eq('id', playlistToDelete.id);
      if (error) throw error;

      setPlaylists((prev) => prev.filter((p) => p.id !== playlistToDelete.id));
      onShowToast?.(`Deleted "${playlistToDelete.name}"`);

      if (selectedPlaylist?.id === playlistToDelete.id) {
        setSelectedPlaylist(null);
      }
      if (editingPlaylistId === playlistToDelete.id) {
        setEditingPlaylistId(null);
        setEditNameValue('');
      }

      if (onUpdateCustomPlaylists && customPlaylists) {
        onUpdateCustomPlaylists(
          customPlaylists.filter((p) => p.id !== playlistToDelete.id),
        );
      }
      setPlaylistToDelete(null);
    } catch (err) {
      console.error(err);
      onShowToast?.('Failed to delete playlist');
    } finally {
      setIsDeleting(false);
    }
  }

  function handleClosePanel() {
    setSelectedPlaylist(null);
    setEditingPlaylistId(null);
    setEditNameValue('');
  }

  async function handleRemoveFromPanel(trackId) {
    if (!selectedPlaylist) return;
    try {
      const { error } = await supabase
        .from('user_playlist_tracks')
        .delete()
        .eq('id', trackId);
      if (error) throw error;
      setSelectedPlaylistTracks((prev) => prev.filter((t) => t.id !== trackId));
      onShowToast?.('Track removed from playlist');
    } catch (err) {
      console.error(err);
      onShowToast?.('Failed to remove track');
    }
  }

  // Reorder is applied optimistically (like the rest of this view's edits)
  // and persisted immediately, there's no separate "save" step for it, only
  // the rename is staged - see editNameValue/handleSaveEdit below. Only
  // rows whose order_index actually changed get written.
  async function handleReorderTracks(oldIndex, newIndex) {
    const prevTracks = selectedPlaylistTracks;
    const reordered = arrayMove(prevTracks, oldIndex, newIndex);
    setSelectedPlaylistTracks(reordered);

    const prevIndexById = new Map(prevTracks.map((t, i) => [t.id, i]));
    const changed = reordered
      .map((t, i) => ({ id: t.id, order_index: i }))
      .filter(({ id, order_index }) => prevIndexById.get(id) !== order_index);
    if (!changed.length) return;

    try {
      const results = await Promise.all(
        changed.map(({ id, order_index }) =>
          supabase
            .from('user_playlist_tracks')
            .update({ order_index })
            .eq('id', id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
    } catch (err) {
      console.error(err);
      onShowToast?.('Failed to save new track order');
      setSelectedPlaylistTracks(prevTracks);
    }
  }

  function startEditing(playlist) {
    // handleSelectPlaylist resets editingPlaylistId to null as its own
    // first step (see its "switching away" comment) - it has to run before
    // the two sets below, not after, or its reset fires last and wins,
    // leaving edit mode off even though this card's Edit button was just
    // pressed. handleSelectPlaylist is async but everything it does before
    // its first await (including that reset) runs synchronously here.
    if (selectedPlaylist?.id !== playlist.id) {
      handleSelectPlaylist(playlist);
    }
    setEditingPlaylistId(playlist.id);
    setEditNameValue(playlist.name);
  }

  function cancelEditing() {
    setEditingPlaylistId(null);
    setEditNameValue('');
  }

  async function handleSaveEdit() {
    const playlistId = editingPlaylistId;
    if (!playlistId) return;
    const trimmed = editNameValue.trim();
    const original = playlists.find((p) => p.id === playlistId);

    if (!trimmed || !original || trimmed === original.name) {
      setEditingPlaylistId(null);
      setEditNameValue('');
      return;
    }

    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from('user_playlists')
        .update({ name: trimmed })
        .eq('id', playlistId);
      if (error) throw error;

      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, name: trimmed } : p)),
      );
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist((prev) => ({ ...prev, name: trimmed }));
      }
      if (onUpdateCustomPlaylists && customPlaylists) {
        onUpdateCustomPlaylists(
          customPlaylists.map((p) =>
            p.id === playlistId ? { ...p, name: trimmed } : p,
          ),
        );
      }
      onShowToast?.('Playlist renamed');
      setEditingPlaylistId(null);
      setEditNameValue('');
    } catch (err) {
      console.error(err);
      onShowToast?.('Failed to rename playlist');
      // Leave edit mode open on failure so the typed name isn't lost.
    } finally {
      setIsSavingEdit(false);
    }
  }

  function handleToggleEdit(playlist) {
    if (editingPlaylistId === playlist.id) {
      handleSaveEdit();
    } else {
      startEditing(playlist);
    }
  }

  function handlePanelPlay(playlist, tracks, startVideoId = null) {
    if (!tracks.length) {
      onShowToast?.('This playlist has no tracks yet');
      return;
    }
    onPlayPlaylist?.(tracks, {
      id: playlist.id,
      name: playlist.name,
      startVideoId,
      autoplay: true,
    });
    onShowToast?.(`Playing "${playlist.name}", ${tracks.length} tracks`);
  }

  function handlePanelAdd(playlist, tracks) {
    if (!tracks.length) {
      onShowToast?.('This playlist has no tracks yet');
      return;
    }
    onAddToPlaylist(tracks);
    onShowToast?.(`Added ${tracks.length} tracks to your queue`);
  }

  async function handleLoad(playlist) {
    setLoadingId(playlist.id);
    try {
      const videos = await fetchTracks(playlist.id);
      if (!videos.length) {
        onShowToast?.('This playlist has no tracks yet');
        return;
      }
      onPlayPlaylist?.(videos, {
        id: playlist.id,
        name: playlist.name,
        autoplay: true,
      });
      onShowToast?.(`Playing "${playlist.name}", ${videos.length} tracks`);
    } catch {
      onShowToast?.('Failed to load playlist');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleAdd(playlist) {
    setLoadingId(playlist.id);
    try {
      const videos = await fetchTracks(playlist.id);
      if (!videos.length) {
        onShowToast?.('This playlist has no tracks yet');
        return;
      }
      onAddToPlaylist(videos);
      onShowToast?.(`Added ${videos.length} tracks to your queue`);
    } catch {
      onShowToast?.('Failed to add playlist');
    } finally {
      setLoadingId(null);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const users = useMemo(() => {
    const map = new Map();
    for (const pl of playlists) {
      if (!map.has(pl.user_id)) {
        map.set(pl.user_id, { ...pl.profile, user_id: pl.user_id, count: 0 });
      }
      map.get(pl.user_id).count++;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [playlists]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (getDisplayProfileName(u.username) || u.username || '')
        .toLowerCase()
        .includes(q),
    );
  }, [users, userSearch]);

  const viewPlaylists = useMemo(() => {
    const base = selectedUserId
      ? playlists.filter((p) => p.user_id === selectedUserId)
      : playlists;
    if (sortBy === 'most-tracks')
      return [...base].sort((a, b) => b.trackCount - a.trackCount);
    if (sortBy === 'a-z')
      return [...base].sort((a, b) => a.name.localeCompare(b.name));
    return base;
  }, [playlists, selectedUserId, sortBy]);

  const featured = useMemo(() => {
    // Pick from all public playlists that have tracks
    let publicPool = playlists.filter((p) => p.is_public && p.trackCount > 0);

    // If a specific user is selected, featured pick must be from that user
    if (selectedUserId) {
      publicPool = publicPool.filter((p) => p.user_id === selectedUserId);
    }

    if (!publicPool.length) return null;
    return publicPool[Math.floor(featuredSeed * publicPool.length)];
  }, [playlists, featuredSeed, selectedUserId]);

  // "Now" (for the 7-day cutoff below) is captured once via useState's lazy
  // initializer, same reasoning as featuredSeed above - calling Date.now()
  // fresh inside the memo instead is exactly what react-hooks/purity flags,
  // and a ref recomputed during render (tried first) turned out to trip an
  // even stricter rule, react-hooks/refs doesn't allow reading *or* writing
  // ref values during render at all. This view doesn't stay mounted for the
  // days it'd take a cutoff frozen at open to visibly drift - it isn't a
  // persistent, kept-alive surface the way the video player is - so
  // freezing it for this component's lifetime is a fine trade for not
  // calling an impure function on every render.
  const [cutoff] = useState(() => Date.now() - 7 * 86400000);

  const newThisWeek = useMemo(() => {
    return playlists.filter((p) => new Date(p.created_at).getTime() > cutoff);
  }, [playlists, cutoff]);

  const totalTracks = useMemo(
    () => playlists.reduce((s, p) => s + p.trackCount, 0),
    [playlists],
  );

  const selectedUser = users.find((u) => u.user_id === selectedUserId);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="cpl-state-screen">
        <div className="cpl-spinner" />
        <span>Loading community playlists…</span>
      </div>
    );
  }

  if (!playlists.length) {
    return (
      <div className="cpl-state-screen">
        <p className="cpl-empty-title">No public playlists yet</p>
        <p className="cpl-empty-sub">
          Make your playlists public to share them with the community!
        </p>
      </div>
    );
  }

  return (
    <div className="cpl-layout">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="cpl-sidebar">
        <div className="cpl-sidebar-head">
          <h3>Browse by user</h3>
          <div className="cpl-sidebar-search">
            <SearchIcon className="cpl-sidebar-search-icon" />
            <input
              placeholder="Find a user…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="cpl-user-list">
          {selectedUserId && (
            <button
              className="cpl-back-btn"
              onClick={() => setSelectedUserId(null)}
            >
              ← All playlists
            </button>
          )}
          {filteredUsers.map((u) => (
            <button
              key={u.user_id}
              className={`cpl-user-row${u.user_id === selectedUserId ? ' active' : ''}`}
              onClick={() =>
                setSelectedUserId(
                  u.user_id === selectedUserId ? null : u.user_id,
                )
              }
            >
              <CplAvatar
                username={u.username}
                userId={u.user_id}
                avatarUrl={u.avatar_url}
                size="md"
              />
              <div className="cpl-user-info">
                <div className="cpl-user-name">
                  {getDisplayProfileName(u.username)}
                </div>
                <div className="cpl-user-count">
                  {u.count} playlist{u.count !== 1 ? 's' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="cpl-main">
        {!selectedUserId ? (
          /* ── Editorial landing ────────────────────────────────────────── */
          <>
            <div className="cpl-hero-band">
              <div className="cpl-hero-left">
                <div className="cpl-hero-eyebrow">Community Playlists</div>
                <div class="cpl-spotlight-name">
                  <br />
                  <h2>
                    {playlists.length} playlist{' '}
                    {playlists.length !== 1 ? 's' : ''}
                    available for listening
                  </h2>
                  <br />
                </div>
                <p className="cpl-hero-sub">
                  Custom playlist made by and for the community.\n Take a listen
                  or add playlists to your queue!
                </p>
                <br />
                <div className="cpl-hero-stats">
                  {[
                    [playlists.length, 'Playlists'],
                    [totalTracks, 'Total tracks'],
                    [newThisWeek.length, 'New this week'],
                  ].map(([val, lbl]) => (
                    <div key={lbl} className="cpl-hero-stat">
                      <span className="cpl-stat-val">{val}</span>
                      <span className="cpl-stat-lbl">{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>

              {featured && (
                <div
                  className="cpl-featured-card"
                  onClick={() => handleSelectPlaylist(featured)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="cpl-featured-cover">
                    {featured.firstThumbnail ? (
                      <img
                        src={featured.firstThumbnail}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background: playlistGradient(featured.id),
                        }}
                      />
                    )}
                    <span className="cpl-track-badge">
                      {featured.trackCount} tracks
                    </span>
                  </div>
                  <div className="cpl-featured-body">
                    <div className="cpl-spin-badge">
                      <span className="cpl-spin-dot" />
                      Featured pick
                    </div>
                    <div className="cpl-featured-name">{featured.name}</div>
                    <div className="cpl-featured-creator">
                      <CplAvatar
                        username={featured.profile?.username}
                        userId={featured.user_id}
                        avatarUrl={featured.profile?.avatar_url}
                      />
                      <span>
                        by {getDisplayProfileName(featured.profile?.username)} ·{' '}
                        {timeAgo(featured.created_at)}
                      </span>
                    </div>
                    <div className="cpl-featured-actions">
                      <button
                        className="cpl-action-btn cpl-action-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoad(featured);
                        }}
                        disabled={loadingId === featured.id}
                      >
                        {loadingId === featured.id ? '…' : 'Play Playlist'}
                      </button>
                      <button
                        className="cpl-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdd(featured);
                        }}
                        disabled={loadingId === featured.id}
                      >
                        Add to My Queue
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="cpl-content">
              {newThisWeek.length > 0 && (
                <section>
                  <div className="cpl-section-head">
                    <h2>New this week</h2>
                    <span className="cpl-section-aside">
                      {newThisWeek.length} added
                    </span>
                  </div>
                  <div className="cpl-new-strip">
                    {newThisWeek.map((pl) => (
                      <button
                        key={pl.id}
                        className="cpl-new-card"
                        onClick={() => handleSelectPlaylist(pl)}
                        title={`View "${pl.name}"`}
                      >
                        <div className="cpl-new-cover">
                          {pl.firstThumbnail ? (
                            <img
                              src={pl.firstThumbnail}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                background: playlistGradient(pl.id),
                              }}
                            />
                          )}
                          <span className="cpl-track-badge cpl-track-badge-sm">
                            {pl.trackCount}
                          </span>
                        </div>
                        <div className="cpl-new-body">
                          <div className="cpl-new-name">{pl.name}</div>
                          <div className="cpl-new-meta">
                            <CplAvatar
                              username={pl.profile?.username}
                              userId={pl.user_id}
                              avatarUrl={pl.profile?.avatar_url}
                              size="xs"
                            />
                            <span>
                              {getDisplayProfileName(pl.profile?.username)} ·{' '}
                              {timeAgo(pl.created_at)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="cpl-section-head">
                  <h2>All playlists</h2>
                  <div className="cpl-section-controls">
                    <SortControls sortBy={sortBy} onChange={setSortBy} />
                    <span className="cpl-section-aside">
                      {viewPlaylists.length} total
                    </span>
                  </div>
                </div>
                <div className="cpl-grid cpl-grid-4">
                  {viewPlaylists.map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      playlist={pl}
                      onSelect={handleSelectPlaylist}
                      onLoad={handleLoad}
                      onAdd={handleAdd}
                      onTogglePrivacy={handleTogglePrivacy}
                      onDelete={handleDeletePlaylist}
                      onToggleEdit={handleToggleEdit}
                      isEditing={editingPlaylistId === pl.id}
                      loadingId={loadingId}
                      isOwn={pl.user_id === authUser?.id}
                    />
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          /* ── User / Featured view ─────────────────────────────────────── */
          <>
            {featured && (
              <div
                className="cpl-spotlight"
                onClick={() => handleSelectPlaylist(featured)}
                style={{ cursor: 'pointer' }}
              >
                <div className="cpl-spotlight-left">
                  <div className="cpl-spotlight-meta">
                    <span className="cpl-spin-badge">
                      <span className="cpl-spin-dot" />
                      Featured
                    </span>
                    <span className="cpl-spotlight-count">
                      {featured.trackCount} tracks
                    </span>
                  </div>
                  <div className="cpl-spotlight-name">{featured.name}</div>
                  <div className="cpl-spotlight-creator">
                    <CplAvatar
                      username={featured.profile?.username}
                      userId={featured.user_id}
                      avatarUrl={featured.profile?.avatar_url}
                    />
                    <span>
                      by {getDisplayProfileName(featured.profile?.username)} ·{' '}
                      {timeAgo(featured.created_at)}
                    </span>
                  </div>
                  <div className="cpl-spotlight-actions">
                    <button
                      className="cpl-action-btn cpl-action-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoad(featured);
                      }}
                      disabled={loadingId === featured.id}
                    >
                      {loadingId === featured.id ? '…' : 'Load into queue'}
                    </button>
                    <button
                      className="cpl-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdd(featured);
                      }}
                      disabled={loadingId === featured.id}
                    >
                      Add to My Queue
                    </button>
                  </div>
                </div>
                <div className="cpl-spotlight-cover">
                  {featured.firstThumbnail ? (
                    <img
                      src={featured.firstThumbnail}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: playlistGradient(featured.id),
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="cpl-content">
              <section>
                <div className="cpl-section-head">
                  <h2>
                    {selectedUser
                      ? `${getDisplayProfileName(selectedUser.username)}'s playlists`
                      : 'Playlists'}
                  </h2>
                  <div className="cpl-section-controls">
                    <SortControls sortBy={sortBy} onChange={setSortBy} />
                    <span className="cpl-section-aside">
                      {viewPlaylists.length} playlist
                      {viewPlaylists.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="cpl-grid cpl-grid-3">
                  {viewPlaylists.map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      playlist={pl}
                      onSelect={handleSelectPlaylist}
                      onLoad={handleLoad}
                      onAdd={handleAdd}
                      onTogglePrivacy={handleTogglePrivacy}
                      onDelete={handleDeletePlaylist}
                      onToggleEdit={handleToggleEdit}
                      isEditing={editingPlaylistId === pl.id}
                      loadingId={loadingId}
                      isOwn={pl.user_id === authUser?.id}
                    />
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>

      <CommunityPlaylistPanel
        playlist={selectedPlaylist}
        tracks={selectedPlaylistTracks}
        isLoading={isLoadingPanel}
        onClose={handleClosePanel}
        onPlay={handlePanelPlay}
        onAdd={handlePanelAdd}
        onContextMenu={onContextMenu}
        isOwner={selectedPlaylist?.user_id === authUser?.id}
        onRemoveTrack={
          selectedPlaylist?.user_id === authUser?.id
            ? handleRemoveFromPanel
            : null
        }
        isEditing={
          !!selectedPlaylist && editingPlaylistId === selectedPlaylist.id
        }
        isSavingEdit={isSavingEdit}
        editNameValue={editNameValue}
        onEditNameChange={setEditNameValue}
        onToggleEdit={
          selectedPlaylist
            ? () => handleToggleEdit(selectedPlaylist)
            : undefined
        }
        onCancelEdit={cancelEditing}
        onReorderTracks={handleReorderTracks}
      />

      {authUser && (
        <button
          className="cpl-fab-create"
          onClick={() => setShowCreateDialog(true)}
          title="New custom playlist"
          aria-label="Create new playlist"
        >
          +
        </button>
      )}

      {showCreateDialog && (
        <CreatePlaylistDialog
          onConfirm={async (name) => {
            setShowCreateDialog(false);
            try {
              const { error } = await supabase.from('user_playlists').insert({
                name,
                is_public: false,
                user_id: authUser.id,
                is_active_queue: false,
              });
              if (error) throw error;
              await fetchPlaylists();
              onShowToast?.(`Created "${name}"`);
            } catch (err) {
              console.error(err);
              onShowToast?.('Failed to create playlist');
            }
          }}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}

      <DeletePlaylistConfirmDialog
        isOpen={!!playlistToDelete}
        isSubmitting={isDeleting}
        playlistName={playlistToDelete?.name || ''}
        onClose={() => setPlaylistToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
