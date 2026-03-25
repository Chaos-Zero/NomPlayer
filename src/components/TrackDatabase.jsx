import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  memo,
} from 'react';
import { getDisplayProfileName } from '../lib/playerState.js';
import { ContextMenuPortal } from './ContextMenuPortal';
import {
  fetchPagedTracks,
  fetchMaxVgmcNumber,
  bulkUpdateTracks,
} from '../lib/trackCatalog.js';
import {
  fetchCommunityFeedback,
  fetchUserFeedback,
  upsertUserFeedback,
} from '../lib/feedback.js';
import DuplicateReviewModal from './DuplicateReviewModal.jsx';
import { DotLottiePlayer } from '@dotlottie/react-player';
import useMediaQuery from '../hooks/useMediaQuery.js';

const PAGE_SIZE = 150;
const VIEW_MODES = [
  { id: 'all', label: 'All Tracks' },
  { id: 'rated', label: 'Rated Only' },
  { id: 'unrated', label: 'Unrated Only' },
  { id: 'retired', label: 'Retired Only' },
];

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

function SaveIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M17 20.41L18.41 19 15 15.59V13.5c0-1.21-.49-2.31-1.28-3.11l-1.42 1.42C12.72 12.24 13 12.83 13 13.5v2.09l4 3.82zm-6-10.41l1.42-1.42C11.64 7.76 11.35 7.17 11.35 6.5V4.41L7.35.59 5.94 2l3.41 3.41v2.09c0 1.21.49 2.31 1.28 3.11zM11 13.5c0-.67.29-1.26.77-1.68l-1.42-1.42C9.49 11.19 9 12.29 9 13.5v2.09l-3.41 3.41L7 20.41l4-4V13.5z" />
    </svg>
  );
}

function DiscardIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M14 1.41L12.59 0 7 5.59 1.41 0 0 1.41 5.59 7 0 12.59 1.41 14 7 8.41 12.59 14 14 12.59 8.41 7z" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

function CommunityFeedbackPanel({ track, supabase, onClose }) {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!track) return;
    let active = true;

    fetchCommunityFeedback(supabase, track.trackId)
      .then((data) => {
        if (active) setFeedback(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [track, supabase]);

  if (!track) {
    return (
      <div className="community-panel-empty">
        <p>Select a track to see community ratings and comments.</p>
      </div>
    );
  }

  return (
    <div className="community-panel">
      <div className="community-panel-header">
        <h3>Community Feedback</h3>
        <button className="btn-close" onClick={onClose} title="Close sidebar">
          ✕
        </button>
      </div>
      <div className="community-panel-track-info">
        <h4>{track.trackTitle}</h4>
        <p>{track.gameTitle}</p>
      </div>
      <div className="community-panel-body">
        {loading ? (
          <div className="loading-state">Loading feedback...</div>
        ) : feedback.length === 0 ? (
          <div className="empty-state">No ratings yet for this track.</div>
        ) : (
          feedback.map((item, index) => (
            <div key={index} className="community-feedback-item">
              <div className="feedback-user">
                <span className="username">
                  {getDisplayProfileName(item.profiles?.username, 'Anonymous')}
                </span>
                {item.rating && (
                  <span className="rating-badge">{item.rating}/10</span>
                )}
              </div>
              {item.note && <p className="feedback-note">{item.note}</p>}
              <div className="feedback-date">
                {new Date(item.updated_at).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const TrackRow = memo(
  ({
    track,
    index,
    isSelected,
    feedback,
    isEditMode,
    pendingChanges,
    columnWidths,
    expandedCellCol,
    onRowClick,
    onToggleCell,
    onUpdateRating,
    onUpdateNote,
    onFieldChange,
    onSaveRow,
    onDiscardRow,
    onSetExpandedCell,
    onOpenContextMenu,
    lastElementRef,
  }) => {
    const isDirty = !!pendingChanges;
    const vgmcNums =
      track.tournaments.length > 0
        ? track.tournaments.map((t) => t.sequenceNumber).join(', ')
        : '-';
    const placements = track.tournaments
      .map((t) => (t.placement ? `#${t.placement}` : ''))
      .filter(Boolean)
      .join(', ');

    return (
      <tr
        className={`${isSelected ? 'selected' : ''} ${track.isRetired ? 'retired' : ''}`}
        onClick={() => onRowClick(track)}
        onContextMenu={(e) => onOpenContextMenu(e, track)}
        ref={lastElementRef}
      >
        <td
          className={`col-index ${expandedCellCol === 'index' ? 'expanded-cell' : ''}`}
          onClick={(e) => onToggleCell(track, 'index', e)}
          style={{
            width: columnWidths.index,
            minWidth: columnWidths.index,
            maxWidth: columnWidths.index,
          }}
        >
          {index + 1}
        </td>
        <td
          className={`col-vgmc ${expandedCellCol === 'vgmc' ? 'expanded-cell' : ''}`}
          onClick={(e) => onToggleCell(track, 'vgmc', e)}
          style={{
            width: columnWidths.vgmc,
            minWidth: columnWidths.vgmc,
            maxWidth: columnWidths.vgmc,
          }}
        >
          {vgmcNums}
        </td>
        <td
          className={`col-game ${expandedCellCol === 'game' ? 'expanded-cell' : ''}`}
          onClick={(e) => onToggleCell(track, 'game', e)}
          style={{
            width: columnWidths.game,
            minWidth: columnWidths.game,
            maxWidth: columnWidths.game,
          }}
        >
          {isEditMode ? (
            <input
              className="edit-input"
              value={pendingChanges?.gameTitle ?? track.gameTitle}
              onChange={(e) =>
                onFieldChange(track.trackId, 'gameTitle', e.target.value)
              }
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            track.gameTitle
          )}
        </td>
        <td
          className={`col-track ${expandedCellCol === 'track' ? 'expanded-cell' : ''}`}
          onClick={(e) => onToggleCell(track, 'track', e)}
          style={{
            width: columnWidths.track,
            minWidth: columnWidths.track,
            maxWidth: columnWidths.track,
          }}
        >
          {isEditMode ? (
            <input
              className="edit-input"
              value={pendingChanges?.trackTitle ?? track.trackTitle}
              onChange={(e) =>
                onFieldChange(track.trackId, 'trackTitle', e.target.value)
              }
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            track.trackTitle
          )}
        </td>
        <td
          className="col-rating"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: columnWidths.rating,
            minWidth: columnWidths.rating,
            maxWidth: columnWidths.rating,
          }}
        >
          <select
            value={feedback.rating || ''}
            onChange={(e) => onUpdateRating(track.trackId, e.target.value)}
          >
            <option value="">-</option>
            {[...Array(10)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </td>
        <td
          className={`col-placement ${expandedCellCol === 'placement' ? 'expanded-cell' : ''}`}
          onClick={(e) => onToggleCell(track, 'placement', e)}
          style={{
            width: columnWidths.placement,
            minWidth: columnWidths.placement,
            maxWidth: columnWidths.placement,
          }}
        >
          {placements}
        </td>
        <td
          className="col-link"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: columnWidths.link,
            minWidth: columnWidths.link,
            maxWidth: columnWidths.link,
          }}
        >
          {isEditMode ? (
            <input
              className="edit-input"
              value={pendingChanges?.sourceUrl ?? track.sourceUrl}
              onChange={(e) =>
                onFieldChange(track.trackId, 'sourceUrl', e.target.value)
              }
            />
          ) : (
            <a
              href={track.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="youtube-link"
            >
              {track.sourceUrl}
            </a>
          )}
        </td>
        <td
          className="col-comment"
          style={{
            width: columnWidths.comment,
            minWidth: columnWidths.comment,
            maxWidth: columnWidths.comment,
          }}
        >
          <input
            type="text"
            placeholder="Add note..."
            value={feedback.note || ''}
            onChange={(e) => onUpdateNote(track.trackId, e.target.value)}
            onFocus={() =>
              onSetExpandedCell({ id: track.trackId, col: 'comment' })
            }
          />
        </td>
        {isEditMode && (
          <td className="col-actions">
            {isDirty && (
              <div className="row-actions">
                <button
                  className="btn-row-action save"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSaveRow(track.trackId);
                  }}
                  title="Save this row"
                >
                  <SaveIcon />
                </button>
                <button
                  className="btn-row-action discard"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscardRow(track.trackId);
                  }}
                  title="Discard changes"
                >
                  <DiscardIcon />
                </button>
              </div>
            )}
          </td>
        )}
      </tr>
    );
  },
);

export default function TrackDatabase({
  supabase,
  authUser,
  onAddToPlaylist,
  onPlayNow,
  onShowToast,
  hasPlayer,
}) {
  const [tracks, setTracks] = useState([]);
  const [userFeedback, setUserFeedback] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [vgmcFilter, setVgmcFilter] = useState('');
  const [viewMode, setViewMode] = useState('all');
  const [sortColumn, setSortColumn] = useState('vgmc');
  const [sortAsc, setSortAsc] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [columnWidths, setColumnWidths] = useState(() => {
    const saved = localStorage.getItem('nomplayer_db_col_widths');
    return saved
      ? JSON.parse(saved)
      : {
          index: 60,
          vgmc: 80,
          game: 250,
          track: 250,
          rating: 100,
          placement: 100,
          link: 250,
          comment: 400,
        };
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const resizingRef = useRef(null);
  const tableWrapperRef = useRef(null);
  const scrollPositionRef = useRef(0);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [maxVgmc, setMaxVgmc] = useState(24);
  const [expandedCell, setExpandedCell] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [controlsOffset, setControlsOffset] = useState(0);

  const isMobileLayout = useMediaQuery('(max-width: 960px)');

  const toolbarRef = useRef(null);
  const leftZoneRef = useRef(null);
  const centerZoneRef = useRef(null);
  const rightZoneRef = useRef(null);

  // ESC key listener to exit Edit Mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isEditMode) {
        setIsEditMode(false);
        setPendingChanges({});
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode]);

  const loadingIdRef = useRef(0);
  const observer = useRef();

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch Max VGMC on mount
  useEffect(() => {
    const init = async () => {
      if (!supabase) return;
      const max = await fetchMaxVgmcNumber(supabase);
      setMaxVgmc(max);
    };
    init();
  }, [supabase]);

  // Context Menu Lifecycle

  // Centering logic for the toolbar action buttons
  useLayoutEffect(() => {
    if (isMobileLayout) {
      setControlsOffset(0);
      return undefined;
    }

    const toolbarNode = toolbarRef.current;
    const leftNode = leftZoneRef.current;
    const centerNode = centerZoneRef.current;
    const rightNode = rightZoneRef.current;
    if (!toolbarNode || !leftNode || !centerNode || !rightNode)
      return undefined;

    const collisionPadding = 18;
    let frameId = 0;

    function measure() {
      const toolbarRect = toolbarNode.getBoundingClientRect();
      const leftRect = leftNode.getBoundingClientRect();
      const centerRect = centerNode.getBoundingClientRect();
      const rightRect = rightNode.getBoundingClientRect();

      // We want to center relative to the app-shell (which spans TopBar width)
      const shellNode = toolbarNode.closest('.app-shell');
      if (!shellNode) return;
      const shellRect = shellNode.getBoundingClientRect();

      const shellCenter = shellRect.left + shellRect.width / 2;
      const toolbarCenter = toolbarRect.left + toolbarRect.width / 2;
      const baseAlignOffset = shellCenter - toolbarCenter;

      const occupiedLeft = leftRect.right + collisionPadding;
      const occupiedRight = rightRect.left - collisionPadding;

      const targetCenter = toolbarCenter + baseAlignOffset;
      const minPossibleCenter = occupiedLeft + centerRect.width / 2;
      const maxPossibleCenter = occupiedRight - centerRect.width / 2;

      let nextOffset = 0;
      if (minPossibleCenter <= maxPossibleCenter) {
        const finalCenter = Math.min(
          maxPossibleCenter,
          Math.max(minPossibleCenter, targetCenter),
        );
        nextOffset = finalCenter - toolbarCenter;
      } else {
        const overlapLeft = minPossibleCenter - targetCenter;
        const overlapRight = targetCenter - maxPossibleCenter;
        nextOffset = overlapLeft >= overlapRight ? overlapLeft : -overlapRight;
      }

      setControlsOffset((prev) =>
        Math.abs(prev - nextOffset) < 0.5 ? prev : nextOffset,
      );
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    }

    scheduleMeasure();

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(toolbarNode);
    resizeObserver.observe(leftNode);
    resizeObserver.observe(centerNode);
    resizeObserver.observe(rightNode);

    const shellNode = toolbarNode.closest('.app-shell');
    if (shellNode) {
      resizeObserver.observe(shellNode);
    }

    window.addEventListener('resize', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [isMobileLayout]);

  // Scroll Restoration
  useLayoutEffect(() => {
    if (!loading && scrollPositionRef.current > 0 && tableWrapperRef.current) {
      tableWrapperRef.current.scrollTop = scrollPositionRef.current;
      scrollPositionRef.current = 0;
    }
  }, [loading, tracks]);

  function handleOpenContextMenu(e, track) {
    e.preventDefault();
    e.stopPropagation();

    const x = e.clientX;
    const y = e.clientY;

    setContextMenu({ x, y, track });
  }

  function handleCheckDuplicates(track) {
    if (tableWrapperRef.current) {
      scrollPositionRef.current = tableWrapperRef.current.scrollTop;
    }
    setSelectedTrack(track);
    setShowDuplicateModal(true);
    setContextMenu(null);
  }

  function handleContextEdit(track) {
    setSelectedTrack(track);
    setIsEditMode(true);
    setContextMenu(null);
  }

  // Initial load and feedback fetch
  useEffect(() => {
    const loadInitialData = async () => {
      if (!supabase) return;
      const currentLoadingId = ++loadingIdRef.current;

      setLoading(true);
      // Removed setTracks([]) to keep existing tracks visible during filter/search update
      setOffset(0);
      setHasMore(true);

      if (tableWrapperRef.current) {
        tableWrapperRef.current.scrollTop = 0;
      }

      try {
        let feedback = userFeedback;
        if (Object.keys(feedback).length === 0 && authUser) {
          feedback = await fetchUserFeedback(supabase, authUser.id);
          setUserFeedback(feedback);
        }

        const { data, totalCount: count } = await fetchPagedTracks(supabase, {
          offset: 0,
          limit: PAGE_SIZE,
          searchTerm: debouncedSearchTerm,
          vgmcFilter,
          viewMode,
          authUserId: authUser?.id,
          userFeedback: feedback,
          sortColumn,
          sortAsc,
          maxVgmc,
        });

        if (currentLoadingId !== loadingIdRef.current) return;

        setTracks(data);
        setTotalCount(count);
        setOffset(PAGE_SIZE);
        setHasMore(data.length < count);
      } catch (err) {
        if (currentLoadingId !== loadingIdRef.current) return;
        console.error('Error loading initial data:', err);
        onShowToast?.('Failed to load database.');
      } finally {
        if (currentLoadingId === loadingIdRef.current) {
          setLoading(false);
        }
      }
    };

    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    supabase,
    authUser,
    maxVgmc,
    refreshKey,
    debouncedSearchTerm,
    vgmcFilter,
    viewMode,
    onShowToast,
    sortColumn,
    sortAsc,
  ]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || !supabase) return;
    const currentLoadingId = loadingIdRef.current;

    setLoadingMore(true);
    try {
      const { data, totalCount: count } = await fetchPagedTracks(supabase, {
        offset: offset,
        limit: PAGE_SIZE,
        searchTerm: debouncedSearchTerm,
        vgmcFilter,
        viewMode,
        authUserId: authUser?.id,
        userFeedback: userFeedback,
        sortColumn,
        sortAsc,
        maxVgmc,
      });

      if (currentLoadingId !== loadingIdRef.current) return;

      setTracks((prev) => [...prev, ...data]);
      setOffset((prev) => prev + PAGE_SIZE);
      setHasMore(offset + data.length < count);
    } catch (err) {
      if (currentLoadingId !== loadingIdRef.current) return;
      console.error('Error loading more tracks:', err);
    } finally {
      if (currentLoadingId === loadingIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [
    supabase,
    authUser,
    offset,
    loading,
    loadingMore,
    hasMore,
    debouncedSearchTerm,
    vgmcFilter,
    viewMode,
    userFeedback,
    sortColumn,
    sortAsc,
    maxVgmc,
  ]);

  const lastElementRef = useCallback(
    (node) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, hasMore, loadMore],
  );

  const handleUpdateRating = useCallback(
    async (trackId, rating) => {
      if (!authUser) {
        onShowToast?.('Please log in to rate tracks.');
        return;
      }
      try {
        const current = userFeedback[trackId] || { note: '' };
        await upsertUserFeedback(supabase, authUser.id, trackId, {
          rating,
          note: current.note,
        });
        setUserFeedback((prev) => ({
          ...prev,
          [trackId]: { ...current, rating },
        }));
      } catch {
        onShowToast?.('Failed to save rating.');
      }
    },
    [supabase, authUser, userFeedback, onShowToast],
  );

  const handleUpdateNote = useCallback(
    async (trackId, note) => {
      if (!authUser) {
        onShowToast?.('Please log in to leave comments.');
        return;
      }
      try {
        const current = userFeedback[trackId] || { rating: null };
        await upsertUserFeedback(supabase, authUser.id, trackId, {
          rating: current.rating,
          note,
        });
        setUserFeedback((prev) => ({
          ...prev,
          [trackId]: { ...current, note },
        }));
      } catch {
        onShowToast?.('Failed to save comment.');
      }
    },
    [supabase, authUser, userFeedback, onShowToast],
  );

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(column);
      setSortAsc(true);
    }
  };

  const handleRowClick = useCallback((track) => {
    setSelectedTrack(track);
  }, []);

  const toggleCell = useCallback(
    (track, col, e) => {
      e.stopPropagation();
      setSelectedTrack(track);
      setExpandedCell((prev) => {
        if (prev?.id === track.trackId && prev?.col === col) {
          return null;
        }
        return { id: track.trackId, col };
      });
    },
    [setExpandedCell, setSelectedTrack],
  );

  const handleResizeStart = (e, col) => {
    e.stopPropagation();
    resizingRef.current = {
      col,
      startX: e.clientX,
      startWidth: columnWidths[col],
    };
    document.body.classList.add('is-resizing');
  };

  useLayoutEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizingRef.current) return;
      const { col, startX, startWidth } = resizingRef.current;
      const delta = e.clientX - startX;
      const newWidth = Math.max(40, startWidth + delta);
      setColumnWidths((prev) => ({
        ...prev,
        [col]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        localStorage.setItem(
          'nomplayer_db_col_widths',
          JSON.stringify(columnWidths),
        );
        resizingRef.current = null;
        document.body.classList.remove('is-resizing');
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [columnWidths]); // Removed columnWidths dependency to avoid recreation

  useEffect(() => {
    localStorage.setItem(
      'nomplayer_db_col_widths',
      JSON.stringify(columnWidths),
    );
  }, [columnWidths]);

  const handleFieldChange = useCallback((trackId, field, value) => {
    setPendingChanges((prev) => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        [field]: value,
      },
    }));
  }, []);

  const handleSaveRow = async (trackId) => {
    const rowChanges = pendingChanges[trackId];
    if (!supabase || !rowChanges) return;

    setIsSaving(true);
    try {
      await bulkUpdateTracks(supabase, { [trackId]: rowChanges });
      onShowToast?.('Track updated successfully!');
      setPendingChanges((prev) => {
        const next = { ...prev };
        delete next[trackId];
        return next;
      });
      // Update local state without full refresh if possible, but refresh is safer for view consistency
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Error saving track:', err);
      onShowToast?.('Failed to save change.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardRow = (trackId) => {
    setPendingChanges((prev) => {
      const next = { ...prev };
      delete next[trackId];
      return next;
    });
  };

  return (
    <div
      className={`database-container ${showSidebar ? 'sidebar-open' : ''} ${hasPlayer ? 'has-footer-player' : ''}`}
    >
      <header
        className="database-toolbar"
        ref={toolbarRef}
        style={{ '--toolbar-controls-offset': `${controlsOffset}px` }}
      >
        <div className="toolbar-left" ref={leftZoneRef}>
          <div className="track-count">Total Tracks: {totalCount}</div>
          <div className="toolbar-filters">
            <div className="view-selector">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                aria-label="Filter by view"
              >
                {VIEW_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-box">
              <select
                value={vgmcFilter}
                onChange={(e) => setVgmcFilter(e.target.value)}
              >
                <option value="">All VGMCs</option>
                {Array.from({ length: maxVgmc }, (_, i) => i + 1).map((num) => (
                  <option key={num} value={num}>
                    VGMC {num}
                  </option>
                ))}
                <option value={maxVgmc + 1}>VGMC {maxVgmc + 1}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="toolbar-center" ref={centerZoneRef}>
          {isEditMode ? (
            <button
              className="btn btn-playback review-duplicates"
              disabled={!selectedTrack}
              onClick={() => setShowDuplicateModal(true)}
              title="Review Duplicates"
            >
              <MergeIcon />{' '}
              <span className="responsive-label">Review Duplicates</span>
            </button>
          ) : (
            <>
              <button
                className="btn btn-playback play-now"
                disabled={!selectedTrack}
                onClick={() => onPlayNow?.(selectedTrack)}
                title="Play Now"
              >
                <PlayIcon /> <span className="responsive-label">Play Now</span>
              </button>
              <button
                className="btn btn-playback add-queue"
                disabled={!selectedTrack}
                onClick={() => onAddToPlaylist?.([selectedTrack])}
                title="Add to Playlist"
              >
                <PlaylistPlusIcon />{' '}
                <span className="responsive-label">Add to Playlist</span>
              </button>
            </>
          )}
        </div>

        <div className="toolbar-right" ref={rightZoneRef}>
          <div className="search-box">
            <input
              type="text"
              placeholder="Search games and tracks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              className="search-indicator"
              type="button"
              onClick={() => {
                if (searchTerm) {
                  setSearchTerm('');
                }
              }}
              aria-label={searchTerm ? 'Clear search' : 'Search'}
              title={searchTerm ? 'Clear search' : undefined}
            >
              {searchTerm ? '✕' : '⌕'}
            </button>
          </div>
          {/* Temporarily enabled for guests for verification */}
          <button
            className={`btn btn-playback ${isEditMode ? 'btn-cancel' : 'btn-edit'}`}
            onClick={
              isEditMode
                ? () => {
                    setIsEditMode(false);
                    setPendingChanges({});
                  }
                : () => setIsEditMode(true)
            }
            disabled={isSaving}
            title={isEditMode ? 'Cancel Editing (ESC)' : 'Edit Mode'}
            style={{ marginLeft: '8px' }}
          >
            {isEditMode ? <CancelIcon /> : <EditIcon />}
          </button>
          <button
            className={`sidebar-toggle ${showSidebar ? 'active' : ''}`}
            onClick={() => setShowSidebar(!showSidebar)}
            title="Toggle Community Feedback"
          >
            💬 Community
          </button>
        </div>
      </header>

      <div className="database-main-content">
        <main className="table-wrapper" ref={tableWrapperRef}>
          {loading && (
            <div
              className={`database-loading-overlay ${tracks.length === 0 ? 'initial' : ''}`}
            >
              <div className="lottie-player-container">
                <DotLottiePlayer
                  src="/loading.lottie"
                  autoplay
                  loop
                  style={{ width: '144px', height: '144px' }}
                />
              </div>
              <div className="database-loading-text">
                {tracks.length === 0
                  ? 'Loading track database...'
                  : 'Updating results...'}
              </div>
            </div>
          )}
          <table
            className={`database-table ${loading ? 'is-loading' : ''}`}
            style={{
              tableLayout: 'fixed',
              width: 'max-content',
              minWidth: '100%',
            }}
          >
            <thead>
              <tr>
                <th
                  className="col-index"
                  style={{
                    width: columnWidths.index,
                    minWidth: columnWidths.index,
                    maxWidth: columnWidths.index,
                  }}
                >
                  <div className="th-content">#</div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, 'index')}
                  />
                </th>
                <th
                  className="col-vgmc"
                  onClick={() => handleSort('vgmc')}
                  style={{
                    width: columnWidths.vgmc,
                    minWidth: columnWidths.vgmc,
                    maxWidth: columnWidths.vgmc,
                  }}
                >
                  <div className="header-label">
                    VGMC # {sortColumn === 'vgmc' && (sortAsc ? '↑' : '↓')}
                  </div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, 'vgmc')}
                  />
                </th>
                <th
                  className="col-game"
                  onClick={() => handleSort('game')}
                  style={{
                    width: columnWidths.game,
                    minWidth: columnWidths.game,
                    maxWidth: columnWidths.game,
                  }}
                >
                  <div className="header-label">
                    Game Title {sortColumn === 'game' && (sortAsc ? '↑' : '↓')}
                  </div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, 'game')}
                  />
                </th>
                <th
                  className="col-track"
                  onClick={() => handleSort('track')}
                  style={{
                    width: columnWidths.track,
                    minWidth: columnWidths.track,
                    maxWidth: columnWidths.track,
                  }}
                >
                  <div className="header-label">
                    Track Title{' '}
                    {sortColumn === 'track' && (sortAsc ? '↑' : '↓')}
                  </div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, 'track')}
                  />
                </th>
                <th
                  className="col-rating"
                  onClick={() => handleSort('rating')}
                  style={{
                    width: columnWidths.rating,
                    minWidth: columnWidths.rating,
                    maxWidth: columnWidths.rating,
                  }}
                >
                  <div className="header-label">
                    Rating {sortColumn === 'rating' && (sortAsc ? '↑' : '↓')}
                  </div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, 'rating')}
                  />
                </th>
                <th
                  className="col-placement"
                  style={{
                    width: columnWidths.placement,
                    minWidth: columnWidths.placement,
                    maxWidth: columnWidths.placement,
                  }}
                >
                  <div className="header-label">Placement</div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, 'placement')}
                  />
                </th>
                <th
                  className="col-link"
                  style={{
                    width: columnWidths.link,
                    minWidth: columnWidths.link,
                    maxWidth: columnWidths.link,
                  }}
                >
                  <div className="header-label">YouTube</div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, 'link')}
                  />
                </th>
                <th
                  className="col-comment"
                  style={{
                    width: columnWidths.comment,
                    minWidth: columnWidths.comment,
                    maxWidth: columnWidths.comment,
                  }}
                >
                  <div className="header-label">Comment</div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, 'comment')}
                  />
                </th>
                {isEditMode && (
                  <th
                    className="col-actions"
                    style={{ width: '80px', minWidth: '80px' }}
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {tracks.map((track, index) => {
                const isTrigger = index > 0 && index % 100 === 49;
                return (
                  <TrackRow
                    key={track.trackId}
                    track={track}
                    index={index}
                    isSelected={selectedTrack?.trackId === track.trackId}
                    feedback={userFeedback[track.trackId] || {}}
                    isEditMode={isEditMode}
                    pendingChanges={pendingChanges[track.trackId]}
                    columnWidths={columnWidths}
                    expandedCellCol={
                      expandedCell?.id === track.trackId
                        ? expandedCell.col
                        : null
                    }
                    onRowClick={handleRowClick}
                    onToggleCell={toggleCell}
                    onUpdateRating={handleUpdateRating}
                    onUpdateNote={handleUpdateNote}
                    onFieldChange={handleFieldChange}
                    onSaveRow={handleSaveRow}
                    onDiscardRow={handleDiscardRow}
                    onSetExpandedCell={setExpandedCell}
                    onOpenContextMenu={handleOpenContextMenu}
                    lastElementRef={isTrigger ? lastElementRef : null}
                  />
                );
              })}
            </tbody>
          </table>
          {loadingMore && <div className="load-more-indicator">Loading...</div>}
        </main>

        {showSidebar && (
          <aside className="community-sidebar">
            <CommunityFeedbackPanel
              track={selectedTrack}
              supabase={supabase}
              onClose={() => setShowSidebar(false)}
            />
          </aside>
        )}
      </div>

      {showDuplicateModal && selectedTrack && (
        <DuplicateReviewModal
          supabase={supabase}
          selectedTrack={selectedTrack}
          hasPlayer={hasPlayer}
          onPlayNow={onPlayNow}
          maxVgmc={maxVgmc}
          onClose={() => setShowDuplicateModal(false)}
          onMerged={() => {
            setRefreshKey((prev) => prev + 1);
            setSelectedTrack(null);
          }}
        />
      )}

      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          className="database-context-menu"
        >
          <button
            className="database-context-menu-item"
            onClick={() => {
              onPlayNow?.(contextMenu.track);
              setContextMenu(null);
            }}
          >
            <PlayIcon /> Play Now
          </button>
          <button
            className="database-context-menu-item"
            onClick={() => {
              onAddToPlaylist?.([contextMenu.track]);
              setContextMenu(null);
            }}
          >
            <PlaylistPlusIcon /> Add to Playlist
          </button>

          {authUser && (
            <>
              <div
                style={{
                  height: '1px',
                  background: 'rgba(255,255,255,0.08)',
                  margin: '4px 8px',
                }}
              />
              <button
                className="database-context-menu-item"
                onClick={() => handleContextEdit(contextMenu.track)}
              >
                <EditIcon /> Edit Track
              </button>
              <button
                className="database-context-menu-item"
                onClick={() => handleCheckDuplicates(contextMenu.track)}
              >
                <MergeIcon /> Check for Duplicates
              </button>
            </>
          )}
        </ContextMenuPortal>
      )}
    </div>
  );
}
