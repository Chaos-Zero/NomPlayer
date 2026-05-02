import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  getDisplayProfileName,
  deriveProfileAvatarUrl,
} from '../lib/playerState.js';
import { ingestYouTubeTrackSources } from '../lib/trackCatalog.js';
import { fetchRawCommunityNominations } from '../lib/dashboard.js';
import {
  fetchCommunityFeedback,
  upsertUserFeedback,
  deleteUserFeedback,
  fetchDetailedUserActivity,
  fetchRecentComments,
} from '../lib/feedback.js';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import ViewSelectorDropdown from './ViewSelectorDropdown.jsx';
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
import PrivacyToggle from './PrivacyToggle.jsx';
import { SortableSupportItem, SupportItem } from './FavouritesPanel.jsx';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import {
  HeartIcon,
  LockIcon,
  PencilIcon,
  XIcon,
  SpeechBubbleIcon,
  FilterIcon,
  StarIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from './Icons.jsx';
import { ContextMenuPortal } from './ContextMenuPortal';
import ExportIcon from './ExportIcon.jsx';
import YouTubeIcon from './YouTubeIcon.jsx';
import { CommunityPlaylistsView } from './CommunityPlaylistsView.jsx';

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
  isLoadingData,
  isSaving,
  isEditing,
  setIsEditing,
  onClose,
  authUser,
  onUpdateComment,
  onSaveFeedback,
  onDeleteFeedback,
  userProfile,
}) {
  const [supportersMenu, setSupportersMenu] = useState(null);
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
    isLoading: isLoadingData,
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
      isLoading: isLoadingData,
    });
    setLocalComment(personalFeedback.note || track?.comment || '');
    setLocalRating(personalFeedback.rating || '');

    if (!isLoadingData) {
      if (!personalFeedback.rating && !personalFeedback.note) {
        setIsEditing(true);
      } else {
        setIsEditing(false);
      }
    }
  }

  if (isLoadingData !== prevSync.isLoading) {
    setPrevSync((prev) => ({ ...prev, isLoading: isLoadingData }));

    if (!isLoadingData) {
      const hasFeedback = personalFeedback.rating || personalFeedback.note;
      if (!hasFeedback) {
        setIsEditing(true);
      } else {
        setIsEditing(false);
      }
    }
  }

  const hasChanges = useMemo(() => {
    const savedRating = personalFeedback.rating || 0;
    const savedNote = personalFeedback.note || '';

    return (
      (localRating || 0) !== (savedRating || 0) ||
      (localComment || '') !== (savedNote || '')
    );
  }, [localRating, localComment, personalFeedback]);

  // Merged community feedback (no longer filtering our own)
  const communityList = useMemo(() => {
    return communityData.feedback || [];
  }, [communityData.feedback]);

  const supportSummary = useMemo(() => {
    const list = communityData.supports || {};
    const total = Object.values(list).reduce(
      (a, b) => a + (typeof b === 'object' ? b.count : b),
      0,
    );
    return { ...list, total };
  }, [communityData.supports]);

  const trackTournaments = useMemo(() => {
    if (!track) return [];
    return communityData.tournaments || track.tournaments || [];
  }, [track, communityData.tournaments]);

  const vgmcStatus = (() => {
    if (!trackTournaments.length) return 'New to VGMC';
    const seq =
      trackTournaments[0].sequenceNumber ?? trackTournaments[0].sequence_number;
    return seq != null ? `VGMC ${seq}` : 'New to VGMC';
  })();

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

  const handleShowSupporters = (event, level) => {
    event.stopPropagation();

    const summary = supportSummary[level];
    if (!summary || !summary.names || summary.names.length === 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    setSupportersMenu({
      names: summary.names,
      level,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

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
              {authUser && isEditing && (
                <section className="list-explorer-info-section">
                  <div className="section-header-row">
                    <h4>Your Feedback</h4>
                    {userProfile && (
                      <div className="user-feedback-identity">
                        <img
                          src={deriveProfileAvatarUrl(
                            userProfile,
                            userProfile.avatar_url,
                          )}
                          alt=""
                          className="list-explorer-peer-avatar miniature"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <span className="list-explorer-peer-user">
                          {getDisplayProfileName(
                            userProfile.username,
                            'Anonymous',
                          )}
                        </span>
                      </div>
                    )}
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
                    {(hasChanges ||
                      isSaving ||
                      personalFeedback.rating ||
                      personalFeedback.note) && (
                      <div className="feedback-save-row">
                        <div className="feedback-save-row-left">
                          {(personalFeedback.rating ||
                            personalFeedback.note) && (
                            <button
                              className="btn btn-ghost btn-delete-feedback"
                              onClick={onDeleteFeedback}
                              disabled={isSaving}
                              style={{
                                color: 'var(--text-dim)',
                                fontSize: '11px',
                                padding: '6px 10px',
                                marginLeft: '-10px',
                              }}
                            >
                              Delete Feedback
                            </button>
                          )}
                        </div>

                        <div className="feedback-save-row-right">
                          <button
                            className="btn btn-ghost"
                            onClick={() => {
                              setLocalComment(
                                personalFeedback.note || track?.comment || '',
                              );
                              setLocalRating(personalFeedback.rating || '');
                              if (
                                personalFeedback.rating ||
                                personalFeedback.note
                              ) {
                                setIsEditing(false);
                              }
                            }}
                            disabled={isSaving}
                          >
                            Cancel
                          </button>
                          {hasChanges && (
                            <button
                              className="btn btn-primary btn-save-feedback"
                              onClick={() => {
                                onSaveFeedback(localRating, localComment);
                                setIsEditing(false);
                              }}
                              disabled={isSaving}
                            >
                              {isSaving ? 'Saving...' : 'Save Feedback'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {supportSummary.total > 0 && (
                <section className="list-explorer-info-section">
                  <h4>Community Support</h4>
                  <div className="list-explorer-support-summary">
                    <div className="list-explorer-support-icons">
                      {supportSummary[3]?.count > 0 && (
                        <button
                          className="support-badge highest"
                          type="button"
                          onClick={(e) => handleShowSupporters(e, 3)}
                          title={`${supportSummary[3].count} Definite Supports (Click to see names)`}
                        >
                          <LockIcon />
                          <span>{supportSummary[3].count}</span>
                        </button>
                      )}
                      {supportSummary[2]?.count > 0 && (
                        <button
                          className="support-badge high"
                          type="button"
                          onClick={(e) => handleShowSupporters(e, 2)}
                          title={`${supportSummary[2].count} Likely Supports (Click to see names)`}
                        >
                          <HeartIcon />
                          <span>{supportSummary[2].count}</span>
                        </button>
                      )}
                      {supportSummary[1]?.count > 0 && (
                        <button
                          className="support-badge normal"
                          type="button"
                          onClick={(e) => handleShowSupporters(e, 1)}
                          title={`${supportSummary[1].count} Possible Supports (Click to see names)`}
                        >
                          <HeartIcon />
                          <span>{supportSummary[1].count}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}

              <section className="list-explorer-info-section community">
                <h4>Community Activity</h4>
                {isLoadingData ? (
                  <p className="list-explorer-info-loading">
                    Loading community data...
                  </p>
                ) : communityList.length === 0 ? (
                  <p className="list-explorer-info-empty">
                    No community feedback yet.
                  </p>
                ) : (
                  <div className="list-explorer-peer-list">
                    {communityList.map((f, i) => (
                      <div
                        key={i}
                        className={`list-explorer-peer-item${f.user_id === authUser?.id ? ' is-owner' : ''}`}
                      >
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

                        {f.user_id === authUser?.id && (
                          <div className="list-explorer-peer-actions">
                            <button
                              className="btn btn-ghost btn-edit-activity"
                              title="Edit Feedback"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                                // Scroll to top of the panel content
                                const content = e.currentTarget.closest(
                                  '.list-explorer-info-content-wrapper',
                                );
                                if (content) {
                                  content.scrollTo({
                                    top: 0,
                                    behavior: 'smooth',
                                  });
                                }
                              }}
                            >
                              <PencilIcon className="activity-action-icon" />
                            </button>
                            <button
                              className="btn btn-ghost btn-delete-activity"
                              title="Delete Feedback"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteFeedback();
                              }}
                            >
                              <XIcon className="activity-action-icon" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
      {supportersMenu && (
        <ContextMenuPortal
          x={supportersMenu.x}
          y={supportersMenu.y}
          onClose={() => setSupportersMenu(null)}
          className="supporters-popover"
        >
          <div className="supporters-popover-header">
            {supportersMenu.level === 3
              ? 'Definite'
              : supportersMenu.level === 2
                ? 'Likely'
                : 'Possible'}{' '}
            Supports
          </div>
          <div
            className="supporters-list"
            onClick={() => setSupportersMenu(null)}
          >
            {supportersMenu.names.map((name, i) => (
              <div key={i} className="supporters-list-item">
                {name}
              </div>
            ))}
          </div>
        </ContextMenuPortal>
      )}
    </div>
  );
}

function SortableListExplorerCard({
  sortableId,
  video,
  index,
  isSelected,
  onSelect,
  onContextMenu,
  onPlayNow,
  onRemove,
  onOpenSupportDropdown,
  isReadOnly = false,
  commentActivity = null,
  userComment = null,
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
    // Always allow dragging so items can be copied to other lists
    disabled: false,
  });

  const isDraggingStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const listId = sortableId.split(':')[0];
  const isSupportList = listId === 'support';

  return (
    <div
      ref={setNodeRef}
      style={isDraggingStyle}
      className={`list-explorer-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isReadOnly ? 'read-only' : ''} ${isSupportList ? 'is-support-list' : ''}`}
      onClick={() => onSelect?.(video.videoId)}
      onDoubleClick={() => onPlayNow(video)}
      onContextMenu={(e) => onContextMenu?.(e, video)}
    >
      <div className="list-explorer-card-inner">
        {/* Always show drag handle so items can be picked up from any column */}
        <div
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label="Drag to copy or reorder"
          title={
            isReadOnly
              ? 'Drag to copy to another list'
              : 'Drag to reorder or move'
          }
        >
          ⠿
        </div>
        <div className="list-explorer-card-main">
          <SupportItem
            orderNumber={index !== undefined ? index + 1 : undefined}
            video={video}
            onRemove={isReadOnly ? null : () => onRemove(video.videoId)}
            onDoubleQueue={() => onPlayNow(video)}
            onOpenContextMenu={onContextMenu}
            onOpenSupportDropdown={onOpenSupportDropdown}
            onShowComments={() => onSelect?.(video.videoId)}
            tone={isSupportList ? 'support' : undefined}
            itemAriaPrefix="List Explorer track"
            commentActivity={commentActivity}
            userComment={userComment}
          />
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
  onRename = null,
  onRemovePlaylist = null,
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
  globalActivityByVideoId = null,
  onPlayExplorerList = null,
  userToggle = null,
  isPublic = false,
  onTogglePrivacy = null,
}) {
  const [addUrl, setAddUrl] = useState('');
  const playlistSelectRef = useRef(null);
  const { setNodeRef } = useDroppable({
    id: `column-${id}`,
    data: {
      listId: id,
    },
  });

  const listScrollRef = useRef(null);
  const safeVideos = videos || [];
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: safeVideos.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => 82,
    overscan: 5,
  });
  const virtualItems = virtualizer.getVirtualItems();

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
              <div className="list-explorer-playlist-selector-wrapper">
                <select
                  ref={playlistSelectRef}
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
                <ChevronDownIcon className="playlist-selector-chevron" />
              </div>
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
          {isCustom && subtitle && (
            <span className="list-explorer-column-subtitle">{subtitle}</span>
          )}
          {isCustom && onRename && !isReadOnly && (
            <button
              className="list-explorer-column-btn"
              onClick={() => onRename(activePlaylistId)}
              title="Rename playlist"
            >
              <PencilIcon />
            </button>
          )}
          {isCustom && onRemovePlaylist && !isReadOnly && (
            <button
              className="list-explorer-column-btn danger"
              onClick={() => onRemovePlaylist(activePlaylistId)}
              title="Delete playlist"
            >
              <TrashIcon />
            </button>
          )}
          {videos && videos.length > 0 && (
            <button
              className="list-explorer-column-btn"
              onClick={() => {
                onPlayExplorerList?.(id);
              }}
              title="Start this list"
            >
              <PlayIcon />
            </button>
          )}
          {userToggle && (
            <button
              className={`list-explorer-column-btn column-user-toggle ${!userToggle.active ? 'is-inactive' : ''}`}
              onClick={userToggle.onToggle}
              title={
                userToggle.active
                  ? 'Hide my nominations'
                  : 'Show my nominations'
              }
            >
              <img
                src={deriveProfileAvatarUrl(
                  userToggle.user,
                  userToggle.user?.avatar_url,
                )}
                alt="My toggle"
                className="column-user-avatar"
              />
            </button>
          )}
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
        <div className="list-explorer-list-scroll" ref={listScrollRef}>
          <SortableContext
            items={safeVideos.map((v) => `${id}:${v.videoId}`)}
            strategy={verticalListSortingStrategy}
          >
            {safeVideos.length === 0 ? (
              <div className="list-explorer-list-empty">
                <span>No tracks here yet</span>
              </div>
            ) : (
              <div
                className="list-explorer-list"
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  position: 'relative',
                }}
              >
                {virtualItems.map((virtualItem) => {
                  const video = safeVideos[virtualItem.index];
                  return (
                    <div
                      key={`${id}:${video.videoId}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        paddingBottom: '16px',
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <SortableListExplorerCard
                        sortableId={`${id}:${video.videoId}`}
                        video={video}
                        index={virtualItem.index}
                        isSelected={selectedTrackId === video.videoId}
                        onSelect={onSelectTrack}
                        onContextMenu={onContextMenu}
                        onPlayNow={onPlayNow}
                        onRemove={onRemove}
                        isReadOnly={isReadOnly}
                        commentActivity={
                          globalActivityByVideoId?.get(video.videoId) ??
                          (!!video.comment &&
                          (id.startsWith('peer-') || id === 'new-nominations')
                            ? 'commented'
                            : null)
                        }
                        userComment={video.comment}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </SortableContext>
        </div>

        {onAddByUrl && !isReadOnly && (
          <div
            className="list-explorer-quick-add-row"
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
          >
            {onTogglePrivacy && !isReadOnly && (
              <PrivacyToggle
                isPublic={isPublic}
                onToggle={(val) => onTogglePrivacy(activePlaylistId, val)}
              />
            )}
            <form
              className="list-explorer-quick-add"
              onSubmit={handleAdd}
              style={{ flex: 1 }}
            >
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
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsView({
  data,
  isLoading,
  authUser,
  onSelectTrack,
  onEditTrack,
  onDeleteFeedback,
  onPlayNow,
}) {
  const [sortMode, setSortMode] = useState('latest');

  if (isLoading) {
    return (
      <div className="comments-view-loading-overlay">
        <div className="lottie-player-container">
          <DotLottieReact
            src="/loading.lottie"
            autoplay
            loop
            style={{ width: '220px', height: '220px' }}
          />
        </div>
        <div className="database-loading-text">
          Loading your community activity...
        </div>
      </div>
    );
  }

  const groupData = (items) => {
    const groups = {};
    items.forEach((f) => {
      // Use track_id from the feedback record if tracks object is missing
      const trackId = f.tracks?.id || f.track_id;
      if (!trackId) return;

      if (!groups[trackId]) {
        groups[trackId] = {
          track: f.tracks,
          items: [],
          latestDate: new Date(f.updated_at),
          avgRating: 0,
        };
      }
      groups[trackId].items.push(f);
      const itemDate = new Date(f.updated_at);
      if (itemDate > groups[trackId].latestDate) {
        groups[trackId].latestDate = itemDate;
      }
    });

    // Calculate averages and sort groups
    return Object.values(groups)
      .map((g) => {
        const ratings = g.items
          .map((i) => i.rating)
          .filter((r) => r !== null && r !== undefined);
        const avg =
          ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
            : 0;
        return { ...g, avgRating: avg };
      })
      .sort((a, b) => b.latestDate - a.latestDate);
  };

  const cycleSortMode = () => {
    if (sortMode === 'latest') setSortMode('rating_desc');
    else if (sortMode === 'rating_desc') setSortMode('rating_asc');
    else setSortMode('latest');
  };

  const getSortTooltip = () => {
    if (sortMode === 'latest') return 'Sorted by: Newest Activity';
    if (sortMode === 'rating_desc') return 'Sorted by: Highest Rated';
    if (sortMode === 'rating_asc') return 'Sorted by: Lowest Rated';
    return '';
  };

  const personalGroups = groupData(data.personal || []);
  let peerGroups = groupData(data.peer || []);
  const highlightGroups = groupData(data.highlights || []);

  // Apply custom sorting ONLY to the peerGroups (Nomination Comments)
  if (sortMode !== 'latest') {
    peerGroups = [...peerGroups].sort((a, b) => {
      if (sortMode === 'rating_desc') return b.avgRating - a.avgRating;
      if (sortMode === 'rating_asc') {
        if (a.avgRating === 0) return 1;
        if (b.avgRating === 0) return -1;
        return a.avgRating - b.avgRating;
      }
      return b.latestDate - a.latestDate;
    });
  }

  const renderGroupedCard = (group, isPersonal) => {
    const { track, items, latestDate } = group;
    // Fallback for track info if needed
    const sources = track?.track_sources || [];
    const videoId = sources[0]?.external_id;
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    return (
      <Motion.div
        key={`${isPersonal ? 'p' : 'c'}-${track?.id || items[0]?.user_id}`}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="activity-card grouped"
        onClick={() => videoId && onSelectTrack(videoId)}
        onDoubleClick={() => {
          if (videoId) {
            onPlayNow?.({
              videoId,
              canonical_track_title: track?.canonical_track_title,
              canonical_game_title: track?.canonical_game_title,
            });
          }
        }}
      >
        <div className="activity-card-header">
          <img src={thumbnail} alt="" className="activity-card-thumb" />
          <div className="activity-card-meta">
            <div className="activity-card-title-row">
              <div className="activity-card-title">
                {track?.canonical_track_title || 'Unknown Track'}
              </div>
              <div className="activity-card-date-row">
                {isPersonal && (
                  <div className="activity-card-header-actions">
                    <button
                      className="btn btn-ghost btn-edit-activity-header"
                      title="Edit Feedback"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        onEditTrack?.(
                          {
                            ...track,
                            videoId: videoId,
                            trackId: track?.id,
                            trackTitle: track?.canonical_track_title,
                            gameTitle: track?.canonical_game_title,
                          },
                          {
                            top: rect.top,
                            left: rect.left,
                            width: rect.width,
                            height: rect.height,
                          },
                        );
                      }}
                    >
                      <PencilIcon className="activity-action-icon miniature" />
                    </button>
                    <button
                      className="btn btn-ghost btn-delete-activity-header"
                      title="Delete Feedback"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFeedback?.({
                          ...track,
                          videoId: videoId,
                          trackId: track?.id,
                          trackTitle: track?.canonical_track_title,
                          gameTitle: track?.canonical_game_title,
                        });
                      }}
                    >
                      <XIcon className="activity-action-icon miniature" />
                    </button>
                  </div>
                )}
                <div className="activity-card-date">
                  {latestDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </div>
            <div className="activity-card-game">
              {track?.canonical_game_title || 'Unknown Game'}
            </div>
          </div>
        </div>

        <div className="activity-card-feedback-list">
          {items.map((f, idx) => (
            <div
              key={`${f.id || f.user_id || idx}`}
              className={`list-explorer-peer-item${isPersonal ? ' is-owner' : ''}`}
            >
              {!isPersonal && (
                <img
                  src={deriveProfileAvatarUrl(
                    f.profiles,
                    f.profiles?.avatar_url,
                  )}
                  alt=""
                  className="list-explorer-peer-avatar"
                />
              )}
              <div className="list-explorer-peer-content">
                <div className="list-explorer-peer-header">
                  {isPersonal ? (
                    <span className="list-explorer-peer-user">You</span>
                  ) : (
                    <span className="list-explorer-peer-user">
                      {getDisplayProfileName(f.profiles?.username, 'Anonymous')}
                    </span>
                  )}
                  <div className="list-explorer-peer-indicators">
                    {f.isSupported && (
                      <span
                        className={`list-explorer-peer-support level-${f.supportLevel}`}
                        title={
                          f.supportLevel === 3
                            ? `Definite Support`
                            : f.supportLevel === 2
                              ? `Likely Support`
                              : `Possible Support`
                        }
                      >
                        {f.supportLevel === 3 ? (
                          <LockIcon className="indicator-icon" />
                        ) : (
                          <HeartIcon className="indicator-icon" />
                        )}
                      </span>
                    )}
                    {f.rating && (
                      <span className="list-explorer-peer-rating">
                        {f.rating}/10
                      </span>
                    )}
                  </div>
                </div>
                {f.note && <p className="list-explorer-peer-note">{f.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </Motion.div>
    );
  };

  if (!authUser) {
    return (
      <div className="list-explorer-grid comments-mode comments-mode-guest">
        <div
          className="list-explorer-column"
          style={{ '--column-accent': 'var(--accent)' }}
        >
          <div className="list-explorer-column-header">
            <div className="list-explorer-column-title-group">
              <div className="list-explorer-column-title-row">
                <h3>Recent Comments</h3>
                <span className="list-explorer-column-subtitle">
                  {highlightGroups.length} tracks
                </span>
              </div>
            </div>
          </div>
          <div className="list-explorer-column-content">
            <div className="comments-guest-banner">
              <span>Sign in to leave your own ratings and comments</span>
            </div>
            <div className="list-explorer-list">
              {highlightGroups.length > 0 ? (
                highlightGroups.map((g) => renderGroupedCard(g, false))
              ) : (
                <div className="list-explorer-list-empty">
                  <span>No community comments yet.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="list-explorer-grid comments-mode">
      <div
        className="list-explorer-column"
        style={{ '--column-accent': 'var(--support-pink)' }}
      >
        <div className="list-explorer-column-header">
          <div className="list-explorer-column-title-group">
            <div className="list-explorer-column-title-row">
              <h3>Your Feedback</h3>
              <span className="list-explorer-column-subtitle">
                {personalGroups.length} tracks
              </span>
            </div>
          </div>
        </div>

        <div className="list-explorer-column-content">
          <div className="list-explorer-list">
            {personalGroups.length > 0 ? (
              personalGroups.map((g) => renderGroupedCard(g, true))
            ) : (
              <div className="list-explorer-list-empty">
                <span>You haven't left any comments yet.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="list-explorer-column"
        style={{ '--column-accent': 'var(--gold)' }}
      >
        <div className="list-explorer-column-header">
          <div className="list-explorer-column-title-group">
            <div className="list-explorer-column-title-row">
              <h3>Nomination Comments</h3>
              <div className="list-explorer-column-header-actions">
                <span className="list-explorer-column-subtitle">
                  {peerGroups.length} tracks
                </span>
                <button
                  className={`list-explorer-sort-btn ${sortMode !== 'latest' ? 'is-active' : ''}`}
                  onClick={cycleSortMode}
                  title={getSortTooltip()}
                >
                  <FilterIcon />
                  {sortMode.includes('rating') && (
                    <span className="sort-indicator">
                      {sortMode === 'rating_desc' ? 'H' : 'L'}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="list-explorer-column-content">
          <div className="list-explorer-list">
            {peerGroups.length > 0 ? (
              peerGroups.map((g) => renderGroupedCard(g, false))
            ) : (
              <div className="list-explorer-list-empty">
                <span>No comments on your nominations yet.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="list-explorer-column"
        style={{ '--column-accent': 'var(--text-muted)' }}
      >
        <div className="list-explorer-column-header">
          <div className="list-explorer-column-title-group">
            <div className="list-explorer-column-title-row">
              <h3>Recent Comments</h3>
              <span className="list-explorer-column-subtitle">
                {highlightGroups.length} tracks
              </span>
            </div>
          </div>
        </div>

        <div className="list-explorer-column-content">
          <div className="list-explorer-list">
            {highlightGroups.length > 0 ? (
              highlightGroups.map((g) => renderGroupedCard(g, false))
            ) : (
              <div className="list-explorer-list-empty">
                <span>No community interactions found.</span>
              </div>
            )}
          </div>
        </div>
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
  onToggleNomination,
  onPlayNow,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onShowToast,
  authUser,
  userProfile,
  supabase,
  onUpdateMetadata,
  onExport,
  onSavePlaylist,
  lastMetadataUpdateBatch,
  onOpenSupportDropdown,
  onPlayExplorerList,
  onPlayCommunityListFromTrack,
  onPlayCommunityPlaylist,
  catalogTrackByVideoId,
  initialView = 'lists',
  onRefreshFeedback,
  onShowComments,
  refreshKey,
  onFeedbackSaved,
}) {
  const [focusedListId, setFocusedListId] = useState(null);
  const [activeCustomPlaylistId, setActiveCustomPlaylistId] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [hasCommunitySelection, setHasCommunitySelection] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState(null);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [globalActivityByVideoId, setGlobalActivityByVideoId] = useState(
    new Map(),
  );
  const [communityData, setCommunityData] = useState({
    feedback: [],
    supports: {},
  });
  const [showMyNominations, setShowMyNominations] = useState(true);
  const [explorerView, setExplorerView] = useState(initialView);
  const [activityData, setActivityData] = useState({
    personal: [],
    peer: [],
    highlights: [],
  });
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isLoadingCommunity, setIsLoadingCommunity] = useState(false);
  const [remoteTrackData, setRemoteTrackData] = useState(null);
  const [dragButton, setDragButton] = useState(0);
  const gridRef = useRef(null);
  const hasAutoOpenedCustomPlaylists = useRef(false);
  const [showCustomPlaylists, setShowCustomPlaylists] = useState(false);

  // Set the first active custom playlist on load if none selected
  useEffect(() => {
    if (!activeCustomPlaylistId && (customPlaylists?.length || 0) > 0) {
      setActiveCustomPlaylistId(customPlaylists[0].id);
    }
  }, [customPlaylists, activeCustomPlaylistId]);

  // Auto-show custom playlists column on first hydration (login or first create)
  useEffect(() => {
    if (
      !hasAutoOpenedCustomPlaylists.current &&
      (customPlaylists?.length || 0) > 0
    ) {
      hasAutoOpenedCustomPlaylists.current = true;
      setShowCustomPlaylists(true);
    }
  }, [customPlaylists]);

  // Reset selection when switching views
  useEffect(() => {
    setSelectedTrackId(null);
    setSelectedColumnId(null);
    setIsEditingInfo(false);
  }, [explorerView]);

  const activeCustomPlaylist = useMemo(() => {
    return (
      customPlaylists.find((pl) => pl.id === activeCustomPlaylistId) || null
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
      try {
        const raw = await fetchRawCommunityNominations(supabase);
        setAllPeerLists(raw);
      } catch {
        // non-critical; peer lists remain empty
      }
    };
    fetchPeerLists();
  }, [supabase]);

  // Fetch global comment status (tracks with feedback from others)
  useEffect(() => {
    const fetchGlobalCommentStatus = async () => {
      if (!supabase) return;

      try {
        // Get all external_ids that have community feedback notes (excluding ours if logged in)
        let query = supabase
          .from('track_user_feedback')
          .select(
            `
            note,
            tracks!inner (
              track_sources (
                external_id
              )
            )
          `,
          )
          .not('note', 'is', null);

        if (authUser?.id) {
          query = query.neq('user_id', authUser.id);
        }

        const { data, error } = await query;
        if (!error && data) {
          const activity = new Map();
          data.forEach((d) => {
            if (d.note && d.note.trim().length > 0) {
              const sources = d.tracks?.track_sources || [];
              sources.forEach((s) => {
                if (s.external_id) {
                  activity.set(s.external_id, 'commented');
                }
              });
            }
          });
          setGlobalActivityByVideoId(activity);
        }
      } catch (err) {
        console.error('Error fetching global comment status:', err);
      }
    };
    fetchGlobalCommentStatus();
  }, [supabase, authUser]);

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
    if (id === 'new-nominations') return newNominations;
    if (id.startsWith('peer-')) {
      const userId = id.replace('peer-', '');
      const peer = peerColumns.find((c) => c.user_id === userId);
      return peer?.videos || [];
    }
    return customPlaylists.find((pl) => pl.id === id)?.videos || [];
  };

  const handleDeleteFeedback = async (trackToDelete) => {
    if (!supabase || !authUser || !trackToDelete) return;
    if (
      !window.confirm(
        'Delete your feedback for this track? This cannot be undone.',
      )
    )
      return;

    setIsSavingFeedback(true);
    try {
      let trackId = trackToDelete.trackId || trackToDelete.id;
      if (!trackId || !/^[0-9a-f-]{36}$/i.test(trackId)) {
        // Ingest if somehow track info lost UUID
        const ingested = await ingestYouTubeTrackSources(supabase, [
          trackToDelete,
        ]);
        if (ingested && ingested.length > 0) {
          trackId = ingested[0].track_id;
        }
      }

      if (!trackId) throw new Error('Could not identify track.');

      await deleteUserFeedback(supabase, authUser.id, trackId);

      // Update local card data immediately
      setActivityData((prev) => ({
        ...prev,
        personal: prev.personal.filter(
          (f) => (f.tracks?.id || f.track_id) !== trackId,
        ),
      }));

      // Update local playlist state (for the list columns)
      const updateLocal = (list) =>
        list.map((v) =>
          v.videoId === trackToDelete.videoId ? { ...v, comment: null } : v,
        );
      onUpdateNominationList(updateLocal(nominationList));
      onUpdateSupportList(updateLocal(supportList));
      onUpdatePlaylist(updateLocal(playlist));

      onShowToast?.('Feedback deleted.', 'dashboard');
      onFeedbackSaved?.(trackToDelete.videoId, { rating: null, note: '' });
      onRefreshFeedback?.();

      // Trigger a full activity refresh to catch everything else
      setActivityRefreshKey((prev) => prev + 1);
    } catch (err) {
      console.error('Delete failed:', err);
      onShowToast?.('Failed to delete feedback.', 'error');
    } finally {
      setIsSavingFeedback(false);
    }
  };

  const setListById = (id, newList) => {
    // Only allow updates to user's own lists
    if (id === 'nominations') onUpdateNominationList(newList);
    else if (id === 'support') onUpdateSupportList(newList);
    else if (id === 'current') onUpdatePlaylist(newList);
    else if (id === 'new-nominations' || id.startsWith('peer-')) {
      // These are read-only columns for the current user session
      return;
    } else {
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
        // Rule: If dragging FROM a read-only list, it MUST be a copy.
        const isSourceReadOnly =
          sourceListId === 'new-nominations' ||
          sourceListId.startsWith('peer-');

        const shouldMove =
          !isSourceReadOnly &&
          (dragButton === 2 ||
            (sourceListId === 'support' && targetListId === 'nominations'));

        if (!alreadyInTarget) {
          // Rule: Nomination and Support cannot overlap
          if (targetListId === 'support') {
            const isNominated = nominationList.some(
              (v) => v.videoId === sourceVideoId,
            );
            if (isNominated) {
              onShowToast(
                'Track already exists in your nomination list',
                'error',
              );
              return;
            }
          }

          const targetIndex = targetVideoId
            ? targetList.findIndex((v) => v.videoId === targetVideoId)
            : -1;
          const newList = [...targetList];
          if (targetIndex !== -1) {
            newList.splice(targetIndex, 0, video);
          } else {
            newList.push(video);
          }

          // Rule: Nominations take priority and remove from support
          if (targetListId === 'nominations') {
            const isInSupport = supportList.some(
              (v) => v.videoId === sourceVideoId,
            );
            if (isInSupport) {
              onUpdateSupportList(
                supportList.filter((v) => v.videoId !== sourceVideoId),
              );
            }
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
  const [renameDialog, setRenameDialog] = useState(null); // { id, name }
  const [renameValue, setRenameValue] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(null); // { id, name }
  const [playlistSubmenuOpen, setPlaylistSubmenuOpen] = useState(false);
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const newPlaylistInputRef = useRef(null);

  const handleContextMenu = (e, video, options = {}) => {
    // Suppress context menu if currently dragging (especially for right-click drag)
    if (activeVideo) {
      e.preventDefault();
      return;
    }
    e.preventDefault();

    const explicitSourceListId = options?.sourceListId;
    const isOwner = options?.isOwner;
    const onRemove = options?.onRemove;

    // Determine which list this video belongs to
    let sourceListId = explicitSourceListId;
    if (!sourceListId) {
      sourceListId = activeCustomPlaylistId;
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
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      video,
      sourceListId,
      isOwner,
      onRemove,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setPlaylistSubmenuOpen(false);
    setShowNewPlaylistInput(false);
    setNewPlaylistName('');
  };

  const handleAddToCustomPlaylist = (video, playlistId) => {
    const pl = customPlaylists.find((p) => p.id === playlistId);
    if (!pl) return;
    if (pl.videos.some((v) => v.videoId === video.videoId)) {
      onShowToast('Track already in this playlist');
      return;
    }
    onUpdateCustomPlaylists(
      customPlaylists.map((p) =>
        p.id === playlistId ? { ...p, videos: [...p.videos, video] } : p,
      ),
    );
    setActiveCustomPlaylistId(playlistId);
    onShowToast(`Added to "${pl.name}"`);
    closeContextMenu();
  };

  const handleCreateAndAddPlaylist = (video, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newPlaylist = {
      id: crypto.randomUUID(),
      name: trimmed,
      videos: video ? [video] : [],
    };
    onUpdateCustomPlaylists([...customPlaylists, newPlaylist]);
    setActiveCustomPlaylistId(newPlaylist.id);
    onShowToast(`Created "${trimmed}"`);
    closeContextMenu();
  };

  const handlePlayNow = (video) => {
    const sourceListId = contextMenu?.sourceListId;
    if (onPlayCommunityListFromTrack && sourceListId?.startsWith('peer-')) {
      const userId = sourceListId.replace('peer-', '');
      const col = peerColumns.find((c) => c.user_id === userId);
      onPlayCommunityListFromTrack(
        userId,
        video.videoId,
        col?.videos ?? [video],
      );
    } else if (
      sourceListId === 'nominations' ||
      sourceListId === 'support' ||
      sourceListId === 'current'
    ) {
      onPlayExplorerList(sourceListId, video.videoId);
    } else if (
      activeCustomPlaylistId &&
      sourceListId === activeCustomPlaylistId
    ) {
      onPlayExplorerList(activeCustomPlaylistId, video.videoId);
    } else {
      onPlayNow(video);
    }
    closeContextMenu();
  };

  const handleAddTrackToPlaylist = (video) => {
    onAddToPlaylist([video]);
    onShowToast('Track added to queue');
    closeContextMenu();
  };

  const isVideoSupported = (videoId) =>
    supportList?.some((h) => h.videoId === videoId);

  const handleToggleTrackSupport = (video, event) => {
    if (onOpenSupportDropdown) {
      const rect = event.currentTarget.getBoundingClientRect();
      onOpenSupportDropdown(video, {
        top: rect.top,
        left: rect.left + rect.width / 2,
      });
      setContextMenu(null);
    } else {
      // Fallback to simple toggle
      if (isVideoSupported(video.videoId)) {
        onUpdateSupportList?.(
          supportList.filter((h) => h.videoId !== video.videoId),
        );
      } else {
        onUpdateSupportList?.([...supportList, { ...video, supportLevel: 1 }]);
      }
      setContextMenu(null);
    }
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
    setRenameDialog({ id, name: pl.name });
    setRenameValue(pl.name);
  };

  const confirmRename = () => {
    if (!renameDialog) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== renameDialog.name) {
      onUpdateCustomPlaylists(
        customPlaylists.map((p) =>
          p.id === renameDialog.id ? { ...p, name: trimmed } : p,
        ),
      );
    }
    setRenameDialog(null);
    setRenameValue('');
  };

  const handleRemovePlaylist = (id) => {
    const pl = customPlaylists.find((p) => p.id === id);
    if (!pl) return;
    setDeleteDialog({ id, name: pl.name });
  };

  const confirmDelete = () => {
    if (!deleteDialog) return;
    onUpdateCustomPlaylists(
      customPlaylists.filter((p) => p.id !== deleteDialog.id),
    );
    if (focusedListId === deleteDialog.id) setFocusedListId(null);
    setDeleteDialog(null);
  };

  const handleToggleCustomPlaylistPrivacy = (id, isPublic) => {
    onUpdateCustomPlaylists(
      customPlaylists.map((p) =>
        p.id === id ? { ...p, is_public: isPublic } : p,
      ),
    );
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

    // Rule: Nomination and Support cannot overlap
    if (id === 'support') {
      const isNominated = nominationList.some((v) => v.videoId === videoId);
      if (isNominated) {
        onShowToast('Track already exists in your nomination list', 'error');
        return;
      }
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

    // Rule: Nominations take priority and remove from support
    if (id === 'nominations') {
      const isInSupport = supportList.some((v) => v.videoId === videoId);
      if (isInSupport) {
        onUpdateSupportList(supportList.filter((v) => v.videoId !== videoId));
      }
    }

    setListById(id, [...currentList, newTrack]);
    onShowToast('Added track to queue');
  };

  const handleAddAllToCurrent = (tracks) => {
    const newTracks = tracks.filter(
      (t) => !playlist.some((p) => p.videoId === t.videoId),
    );
    if (newTracks.length === 0) {
      onShowToast('All tracks are already in your queue');
      return;
    }
    onUpdatePlaylist([...playlist, ...newTracks]);
    onShowToast(`Added ${newTracks.length} tracks to queue`);
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

    // Fallback 1: Check in-memory catalog from App (covers local JSON snapshot)
    if (!track && selectedTrackId && catalogTrackByVideoId?.[selectedTrackId]) {
      const cat = catalogTrackByVideoId[selectedTrackId];
      track = {
        videoId: selectedTrackId,
        id: selectedTrackId,
        trackId: cat.trackId,
        canonical_track_title: cat.trackTitle || cat.displayTitle || cat.title,
        canonical_game_title: cat.gameTitle || cat.channelTitle,
        isTransient: true,
      };
    }

    // Fallback 2: Check loaded community activity data
    if (!track && selectedTrackId) {
      const allGroups = [
        ...(activityData.personal || []),
        ...(activityData.peer || []),
        ...(activityData.highlights || []),
      ];
      const foundGroup = allGroups.find((g) => {
        const vid = g.track?.track_sources?.[0]?.external_id || g.track_id;
        return vid === selectedTrackId;
      });
      if (foundGroup && foundGroup.track) {
        track = {
          videoId: selectedTrackId,
          id: selectedTrackId,
          canonical_track_title: foundGroup.track.canonical_track_title,
          canonical_game_title: foundGroup.track.canonical_game_title,
          isTransient: true,
        };
      }
    }

    // Fallback 3: Check remote metadata state from catalog fetch
    if (
      !track &&
      remoteTrackData &&
      remoteTrackData.videoId === selectedTrackId
    ) {
      track = remoteTrackData;
    }

    return track;
  }, [
    selectedTrackId,
    nominationList,
    supportList,
    playlist,
    activeCustomPlaylist,
    newNominations,
    peerColumns,
    activityData,
    remoteTrackData,
    catalogTrackByVideoId,
  ]);

  // Fetch community data when selection changes
  useEffect(() => {
    if (!selectedTrackId || !supabase) {
      setCommunityData({ feedback: [], supports: {}, tournaments: [] });
      return;
    }

    let active = true;
    setIsLoadingCommunity(true);
    setRemoteTrackData(null); // Reset cache so we don't show ghost metadata

    const fetchData = async () => {
      try {
        // Fetch track metadata from catalog for track_id and tournament info
        // 1. Try to find the track in the full catalog (local JSON + remote)
        let catalogData = null;
        try {
          const { findTrackInCatalog } = await import('../lib/trackCatalog.js');
          catalogData = await findTrackInCatalog(supabase, selectedTrackId);
        } catch (err) {
          console.error('Error searching catalog:', err);
        }

        // 2. If not in catalog, fallback to a direct database fetch
        if (!catalogData) {
          try {
            const { data } = await supabase
              .from('track_catalog')
              .select(
                'track_id, canonical_track_title, canonical_game_title, tournaments(sequence_number), track_sources(external_id)',
              )
              .eq('source_external_id', selectedTrackId)
              .maybeSingle();
            catalogData = data;
          } catch (err) {
            console.error('Error fetching fallback catalog data:', err);
          }
        }

        if (active && catalogData) {
          // Update remote metadata cache so the panel can load
          setRemoteTrackData({
            videoId: selectedTrackId,
            id: selectedTrackId,
            trackId: catalogData.track_id || catalogData.trackId,
            canonical_track_title:
              catalogData.canonical_track_title ||
              catalogData.trackTitle ||
              catalogData.displayTitle,
            canonical_game_title:
              catalogData.canonical_game_title || catalogData.gameTitle,
            tournaments: catalogData.tournaments,
            isTransient: true,
          });
        }

        const trackIdForFeedback =
          catalogData?.track_id || catalogData?.trackId;

        // Fetch feedback (all users)
        let feedbackData = [];

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
          const { data: supportData, error: sError } = await supabase
            .from('track_supports')
            .select('level, user_id')
            .eq('track_id', trackIdForFeedback);

          if (sError) throw sError;

          if (active) {
            const supports = {};
            if (supportData && supportData.length > 0) {
              // Group by level first
              supportData.forEach((row) => {
                if (!supports[row.level]) {
                  supports[row.level] = { count: 0, names: [], userIds: [] };
                }
                supports[row.level].count += 1;
                if (row.user_id) supports[row.level].userIds.push(row.user_id);
              });

              // Also resolve usernames from the current feedback list (fast cache)
              const profileMap = new Map();
              feedbackData.forEach((f) => {
                if (f.user_id && f.profiles) {
                  profileMap.set(f.user_id, f.profiles.username);
                }
              });

              // Fetch any missing profiles for supporters who haven't left feedback
              const missingUserIds = [
                ...new Set(
                  supportData
                    .map((r) => r.user_id)
                    .filter((id) => id && !profileMap.has(id)),
                ),
              ];
              if (missingUserIds.length > 0) {
                try {
                  const { data: extraProfiles } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('id', missingUserIds);

                  if (extraProfiles) {
                    extraProfiles.forEach((p) =>
                      profileMap.set(p.id, p.username),
                    );
                  }
                } catch (err) {
                  console.error('Error fetching extra profiles:', err);
                }
              }

              // Merge names
              Object.values(supports).forEach((tier) => {
                tier.names = tier.userIds.map((uid) => {
                  const username = profileMap.get(uid);
                  return getDisplayProfileName(username, 'Anonymous listener');
                });
              });
            }

            setCommunityData({
              feedback: feedbackData,
              supports,
              tournaments: catalogData?.tournaments || [],
            });
          }
        } else if (active) {
          setCommunityData({
            feedback: [],
            supports: {},
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
    if (showCustomPlaylists && activeCustomPlaylist)
      ids.push(activeCustomPlaylist.id);
    return ids;
  }, [
    showCurrentPlaylist,
    showCustomPlaylists,
    showNewNominations,
    peerColumns,
    activeCustomPlaylist,
  ]);

  const prevActiveColumnIdsRef = useRef([]);
  const nominationListRef = useRef(nominationList);
  useEffect(() => {
    nominationListRef.current = nominationList;
  }, [nominationList]);

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

  // Auto-scroll the grid when the info panel opens to bring the selected column into view
  useEffect(() => {
    // Only auto-scroll on desktop (where the panel pushes content horizontally)
    if (
      window.innerWidth > 960 &&
      selectedTrackId &&
      selectedColumnId &&
      gridRef.current
    ) {
      // Small delay to allow layout to settle after potential margin changes
      const timeoutId = setTimeout(() => {
        const element = gridRef.current?.querySelector(
          `[data-column-id="${selectedColumnId}"]`,
        );
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            inline: 'center',
            block: 'nearest',
          });
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedTrackId, selectedColumnId]);

  // Fetch user activity data when view switches to comments or on mount
  useEffect(() => {
    const fetchActivity = async () => {
      if (!supabase) return;
      setIsLoadingActivity(true);
      try {
        if (!authUser?.id) {
          const highlights = await fetchRecentComments(supabase, 20);
          setActivityData({ personal: [], peer: [], highlights });
          return;
        }

        const nominatedTrackIds = (nominationListRef.current || [])
          .map((v) => v.trackId || v.id)
          .filter((id) => id && /^[0-9a-f-]{36}$/i.test(id));

        const data = await fetchDetailedUserActivity(
          supabase,
          authUser.id,
          nominatedTrackIds,
        );
        setActivityData(data);
      } catch (err) {
        console.error('Failed to fetch activity:', err);
      } finally {
        setIsLoadingActivity(false);
      }
    };

    if (
      explorerView === 'comments' ||
      activityRefreshKey > 0 ||
      refreshKey > 0
    ) {
      fetchActivity();
    }
  }, [explorerView, activityRefreshKey, refreshKey, supabase, authUser?.id]);

  return (
    <div
      className={`list-explorer-container ${focusedListId ? 'has-focused' : ''} ${(selectedTrackId && explorerView === 'lists') || hasCommunitySelection ? 'has-selection' : ''}`}
    >
      <div className="list-explorer-header">
        <div className="list-explorer-title-group">
          <h1>List Explorer</h1>
          <ViewSelectorDropdown
            value={explorerView}
            onChange={setExplorerView}
          />
        </div>
        <div className="list-explorer-global-actions">
          {explorerView === 'lists' && (
            <div className="list-explorer-toolbar">
              <div className="toolbar-group">
                <span className="toolbar-label">Show:</span>
                <button
                  className={`toolbar-toggle ${showCurrentPlaylist ? 'active' : ''}`}
                  onClick={() => setShowCurrentPlaylist(!showCurrentPlaylist)}
                >
                  My Queue
                </button>
                <button
                  className={`toolbar-toggle ${showCustomPlaylists ? 'active' : ''}`}
                  onClick={() => {
                    const next = !showCustomPlaylists;
                    setShowCustomPlaylists(next);
                    if (
                      next &&
                      !activeCustomPlaylistId &&
                      customPlaylists.length > 0
                    ) {
                      setActiveCustomPlaylistId(customPlaylists[0].id);
                    }
                  }}
                >
                  Custom Playlists
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
          )}
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
          isLoadingData={isLoadingCommunity}
          isSaving={isSavingFeedback}
          isEditing={isEditingInfo}
          setIsEditing={setIsEditingInfo}
          onClose={() => {
            setSelectedTrackId(null);
            setSelectedColumnId(null);
          }}
          authUser={authUser}
          userProfile={userProfile}
          onUpdateComment={(videoId, comment) =>
            handleUpdateComment(
              selectedTrackId ? findListId(selectedTrackId) : null,
              videoId,
              comment,
            )
          }
          onDeleteFeedback={() => handleDeleteFeedback(selectedTrack)}
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

              const savedData = await upsertUserFeedback(
                supabase,
                authUser.id,
                trackId,
                {
                  rating: rating || null,
                  note: note || null,
                },
              );

              // Update local playlist state to match new feedback
              const updateLocalComment = (list) =>
                list.map((v) =>
                  v.videoId === selectedTrack.videoId
                    ? { ...v, comment: note || null }
                    : v,
                );
              onUpdateNominationList(updateLocalComment(nominationList));
              onUpdateSupportList(updateLocalComment(supportList));
              onUpdatePlaylist(updateLocalComment(playlist));

              onShowToast('Feedback saved!');
              onFeedbackSaved?.(selectedTrack.videoId, {
                rating: rating || null,
                note: note || '',
              });
              onRefreshFeedback?.();

              // Update community data with the saved record (with profile)
              if (savedData) {
                const recordWithProfile = {
                  ...savedData,
                  profiles: {
                    username: userProfile?.username,
                    avatar_url: userProfile?.avatar_url,
                  },
                };

                setCommunityData((prev) => {
                  const filtered = prev.feedback.filter(
                    (f) => f.user_id !== authUser.id,
                  );
                  return {
                    ...prev,
                    feedback: [recordWithProfile, ...filtered],
                  };
                });
              } else {
                // Fallback: Refresh community feedback
                const feedbackData = await fetchCommunityFeedback(
                  supabase,
                  trackId,
                );
                setCommunityData((prev) => ({
                  ...prev,
                  feedback: feedbackData || [],
                }));
              }
            } catch (err) {
              console.error('Error saving feedback:', err);
              onShowToast('Failed to save feedback.');
            } finally {
              setIsSavingFeedback(false);
            }
          }}
        />

        <div className="list-explorer-layout">
          <AnimatePresence mode="wait">
            {explorerView === 'lists' ? (
              <Motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                ref={gridRef}
                className="list-explorer-grid"
              >
                <ListExplorerColumn
                  id="nominations"
                  title="Nominations"
                  subtitle={`${showMyNominations ? nominationList.length : 0} tracks`}
                  videos={showMyNominations ? nominationList : []}
                  isFocused={focusedListId === 'nominations'}
                  onFocus={() => setFocusedListId('nominations')}
                  onUnfocus={() => setFocusedListId(null)}
                  onPlayNow={(video) =>
                    onPlayExplorerList('nominations', video.videoId)
                  }
                  colorVar="--accent"
                  userToggle={
                    authUser?.profile
                      ? {
                          user: authUser.profile,
                          active: showMyNominations,
                          onToggle: () =>
                            setShowMyNominations(!showMyNominations),
                        }
                      : null
                  }
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
                  onSelectTrack={(vid) => {
                    setSelectedTrackId(vid);
                    setSelectedColumnId('nominations');
                  }}
                  onContextMenu={handleContextMenu}
                  canAddAll={true}
                  onAddAll={() => handleAddAllToCurrent(nominationList)}
                  onAddByUrl={(url) => handleAddByUrl('nominations', url)}
                  onPlayExplorerList={onPlayExplorerList}
                  onExport={onExport}
                  onSavePlaylist={onSavePlaylist}
                  globalActivityByVideoId={globalActivityByVideoId}
                />

                <ListExplorerColumn
                  id="support"
                  title="Support List"
                  subtitle={`${supportList.length} tracks`}
                  videos={supportList}
                  isFocused={focusedListId === 'support'}
                  onFocus={() => setFocusedListId('support')}
                  onUnfocus={() => setFocusedListId(null)}
                  onPlayNow={(video) =>
                    onPlayExplorerList('support', video.videoId)
                  }
                  colorVar="--support-orange"
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
                  onSelectTrack={(vid) => {
                    setSelectedTrackId(vid);
                    setSelectedColumnId('support');
                  }}
                  onContextMenu={handleContextMenu}
                  canAddAll={true}
                  onAddAll={() => handleAddAllToCurrent(supportList)}
                  onAddByUrl={(url) => handleAddByUrl('support', url)}
                  onPlayExplorerList={onPlayExplorerList}
                  onExport={onExport}
                  onSavePlaylist={onSavePlaylist}
                  globalActivityByVideoId={globalActivityByVideoId}
                />

                {showCurrentPlaylist && (
                  <ListExplorerColumn
                    id="current"
                    title="My Queue"
                    subtitle={`${playlist.length} tracks`}
                    videos={playlist}
                    isFocused={focusedListId === 'current'}
                    onFocus={() => setFocusedListId('current')}
                    onUnfocus={() => setFocusedListId(null)}
                    onPlayNow={(video) =>
                      onPlayExplorerList('current', video.videoId)
                    }
                    colorVar="--playlist-white"
                    onUpdateComment={(videoId, comment) =>
                      handleUpdateComment('current', videoId, comment)
                    }
                    onRename={() => {}}
                    onRemovePlaylist={() => {}}
                    onRemove={onRemoveFromPlaylist}
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={(vid) => {
                      setSelectedTrackId(vid);
                      setSelectedColumnId('current');
                    }}
                    onContextMenu={handleContextMenu}
                    canClose={true}
                    onClose={() => setShowCurrentPlaylist(false)}
                    onExport={onExport}
                    onSavePlaylist={onSavePlaylist}
                    onPlayExplorerList={onPlayExplorerList}
                    globalActivityByVideoId={globalActivityByVideoId}
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
                    onSelectTrack={(vid) => {
                      setSelectedTrackId(vid);
                      setSelectedColumnId('new-nominations');
                    }}
                    onContextMenu={handleContextMenu}
                    canClose={true}
                    onClose={() => setShowNewNominations(false)}
                    canAddAll={true}
                    onAddAll={() => handleAddAllToCurrent(newNominations)}
                    isReadOnly={true}
                    onExport={onExport}
                    onSavePlaylist={onSavePlaylist}
                    onPlayExplorerList={onPlayExplorerList}
                    globalActivityByVideoId={globalActivityByVideoId}
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
                    onPlayNow={(video) =>
                      onPlayCommunityListFromTrack
                        ? onPlayCommunityListFromTrack(
                            col.user_id,
                            video.videoId,
                            col.videos,
                          )
                        : onPlayNow(video)
                    }
                    colorVar="--custom-blue"
                    onUpdateComment={() => {}}
                    onRename={() => {}}
                    onRemovePlaylist={() =>
                      setPeerColumns(
                        peerColumns.filter((c) => c.user_id !== col.user_id),
                      )
                    }
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={(vid) => {
                      setSelectedTrackId(vid);
                      setSelectedColumnId(`peer-${col.user_id}`);
                    }}
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
                    onPlayExplorerList={onPlayExplorerList}
                    isReadOnly={true}
                    onExport={onExport}
                    onSavePlaylist={onSavePlaylist}
                    globalActivityByVideoId={globalActivityByVideoId}
                  />
                ))}

                {showCustomPlaylists && activeCustomPlaylist && (
                  <ListExplorerColumn
                    id={activeCustomPlaylist.id}
                    title={activeCustomPlaylist.name}
                    subtitle={`${activeCustomPlaylist.videos.length} tracks`}
                    videos={activeCustomPlaylist.videos}
                    isFocused={focusedListId === activeCustomPlaylist.id}
                    onFocus={() => setFocusedListId(activeCustomPlaylist.id)}
                    onUnfocus={() => setFocusedListId(null)}
                    onPlayNow={(video) =>
                      onPlayExplorerList(activeCustomPlaylist.id, video.videoId)
                    }
                    colorVar="--custom-blue"
                    onUpdateComment={(videoId, comment) =>
                      handleUpdateComment(
                        activeCustomPlaylist.id,
                        videoId,
                        comment,
                      )
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
                    onSelectTrack={(vid) => {
                      setSelectedTrackId(vid);
                      setSelectedColumnId(activeCustomPlaylist.id);
                    }}
                    onContextMenu={handleContextMenu}
                    canClose={true}
                    onClose={() => setShowCustomPlaylists(false)}
                    onAddAll={() =>
                      handleAddAllToCurrent(activeCustomPlaylist.videos)
                    }
                    isPublic={activeCustomPlaylist.is_public}
                    onTogglePrivacy={handleToggleCustomPlaylistPrivacy}
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
                    globalActivityByVideoId={globalActivityByVideoId}
                    onPlayExplorerList={onPlayExplorerList}
                  />
                )}
              </Motion.div>
            ) : explorerView === 'comments' ? (
              <Motion.div
                key="comments"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="comments-view-scroll-shell"
                style={{ flex: 1, overflow: 'hidden' }}
              >
                <CommentsView
                  data={activityData}
                  isLoading={isLoadingActivity}
                  authUser={authUser}
                  onSelectTrack={(track) => {
                    setSelectedTrackId(
                      track.videoId || track.video_id || track.id,
                    );
                    setSelectedColumnId('comments');
                    setIsEditingInfo(false);
                  }}
                  onEditTrack={(track, rect) => {
                    onShowComments?.(track, rect, true);
                  }}
                  onDeleteFeedback={handleDeleteFeedback}
                  onPlayNow={onPlayNow}
                />
              </Motion.div>
            ) : (
              <Motion.div
                key="community-playlists"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
              >
                <CommunityPlaylistsView
                  supabase={supabase}
                  authUser={authUser}
                  onSelectionChange={setHasCommunitySelection}
                  onPlayPlaylist={onPlayCommunityPlaylist}
                  onContextMenu={handleContextMenu}
                  lastMetadataUpdateBatch={lastMetadataUpdateBatch}
                  onAddToPlaylist={(videos) => {
                    const existing = new Set(playlist.map((v) => v.videoId));
                    onUpdatePlaylist([
                      ...playlist,
                      ...videos.filter((v) => !existing.has(v.videoId)),
                    ]);
                  }}
                  onShowToast={onShowToast}
                  customPlaylists={customPlaylists}
                  onUpdateCustomPlaylists={onUpdateCustomPlaylists}
                />
              </Motion.div>
            )}
          </AnimatePresence>
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

            <div className="context-menu-divider" />

            {contextMenu.sourceListId !== 'current' && (
              <button
                className="database-context-menu-item"
                onClick={() => handleAddTrackToPlaylist(contextMenu.video)}
              >
                <PlaylistPlusIcon />
                <span>Add to My Queue</span>
              </button>
            )}

            {!nominationList.some(
              (v) => v.videoId === contextMenu.video.videoId,
            ) && (
              <button
                className="database-context-menu-item"
                onClick={() => {
                  onToggleNomination?.(contextMenu.video);
                  closeContextMenu();
                }}
              >
                <StarIcon />
                <span>Add to Nomination List</span>
              </button>
            )}

            {contextMenu.sourceListId !== 'nominations' && (
              <button
                className="database-context-menu-item"
                onClick={(e) => handleToggleTrackSupport(contextMenu.video, e)}
              >
                <HeartIcon />
                <span>Add to Support List</span>
              </button>
            )}

            <button
              className={`database-context-menu-item${playlistSubmenuOpen ? ' active' : ''}`}
              onClick={() => {
                setPlaylistSubmenuOpen((v) => !v);
                setShowNewPlaylistInput(false);
                setNewPlaylistName('');
              }}
            >
              <span>Add to Custom Playlist</span>
              <ChevronRightIcon
                className={`context-menu-chevron${playlistSubmenuOpen ? ' open' : ''}`}
              />
            </button>

            {playlistSubmenuOpen && (
              <div className="context-playlist-submenu">
                {!showNewPlaylistInput ? (
                  <button
                    className="database-context-menu-item context-playlist-submenu-create"
                    onClick={() => {
                      setShowNewPlaylistInput(true);
                      setTimeout(() => newPlaylistInputRef.current?.focus(), 0);
                    }}
                  >
                    <span>+ Create New Playlist</span>
                  </button>
                ) : (
                  <input
                    ref={newPlaylistInputRef}
                    className="context-playlist-name-input"
                    type="text"
                    placeholder="Playlist name…"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        handleCreateAndAddPlaylist(
                          contextMenu.video,
                          newPlaylistName,
                        );
                      if (e.key === 'Escape') {
                        setShowNewPlaylistInput(false);
                        setNewPlaylistName('');
                      }
                      e.stopPropagation();
                    }}
                  />
                )}
                {customPlaylists.length === 0 && !showNewPlaylistInput && (
                  <span className="context-playlist-submenu-empty">
                    No playlists yet
                  </span>
                )}
                {customPlaylists.map((pl) => (
                  <button
                    key={pl.id}
                    className="database-context-menu-item context-playlist-submenu-item"
                    onClick={() =>
                      handleAddToCustomPlaylist(contextMenu.video, pl.id)
                    }
                  >
                    <span>{pl.name}</span>
                    <span className="context-playlist-submenu-count">
                      {pl.videos.length}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="context-menu-divider" />
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
              contextMenu.sourceListId !== 'peer' &&
              (contextMenu.sourceListId !== 'community-playlist' ||
                contextMenu.isOwner) && (
                <>
                  <div className="context-menu-divider" />
                  <button
                    className="database-context-menu-item danger"
                    onClick={() => {
                      if (contextMenu.onRemove) {
                        contextMenu.onRemove(contextMenu.video);
                      } else {
                        handleRemoveTrack(
                          contextMenu.sourceListId,
                          contextMenu.video.videoId,
                        );
                      }
                      closeContextMenu();
                    }}
                  >
                    <TrashIcon />
                    <span>Remove from list</span>
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

      {renameDialog &&
        createPortal(
          <div
            className="modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setRenameDialog(null);
            }}
          >
            <div className="modal-card" style={{ maxWidth: 400 }}>
              <div className="modal-header">
                <h2>Rename Playlist</h2>
                <button
                  className="btn-close"
                  onClick={() => setRenameDialog(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div
                className="auth-dialog-form"
                style={{ padding: '0 24px 24px' }}
              >
                <div className="auth-dialog-field">
                  <label htmlFor="rename-playlist-input">Playlist name</label>
                  <input
                    id="rename-playlist-input"
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') setRenameDialog(null);
                    }}
                    autoFocus
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'flex-end',
                    marginTop: 16,
                  }}
                >
                  <button className="btn" onClick={() => setRenameDialog(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={confirmRename}
                    disabled={
                      !renameValue.trim() ||
                      renameValue.trim() === renameDialog.name
                    }
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.getElementById('modal-root'),
        )}

      {deleteDialog &&
        createPortal(
          <div
            className="modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDeleteDialog(null);
            }}
          >
            <div
              className="modal-card delete-account-dialog"
              style={{ maxWidth: 400 }}
            >
              <div className="modal-header">
                <h2>Delete Playlist</h2>
                <button
                  className="btn-close"
                  onClick={() => setDeleteDialog(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div
                className="delete-dialog-body"
                style={{ padding: '0 24px 24px' }}
              >
                <p>
                  Are you sure you want to delete{' '}
                  <strong>&ldquo;{deleteDialog.name}&rdquo;</strong>? This
                  cannot be undone.
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'flex-end',
                    marginTop: 20,
                  }}
                >
                  <button className="btn" onClick={() => setDeleteDialog(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-danger" onClick={confirmDelete}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.getElementById('modal-root'),
        )}
    </div>
  );
}
