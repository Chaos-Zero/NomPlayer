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
  fetchFilteredTracks,
  fetchMaxVgmcNumber,
  clearCatalogCache,
} from '../lib/trackCatalog.js';
import {
  fetchCommunityFeedback,
  fetchUserFeedback,
  upsertUserFeedback,
  deleteUserFeedback,
} from '../lib/feedback.js';
import DuplicateReviewModal from './DuplicateReviewModal.jsx';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import useMediaQuery from '../hooks/useMediaQuery.js';
import { useVirtualizer } from '@tanstack/react-virtual';

const VIEW_MODES = [
  { id: 'all', label: 'All Tracks' },
  { id: 'most_submitted', label: 'Most Submitted' },
  { id: 'history_recovery', label: 'History Recovery' },
  { id: 'rated', label: 'Rated Only' },
  { id: 'unrated', label: 'Unrated Only' },
  { id: 'unplaced', label: 'Unplaced' },
  { id: 'placed', label: 'Appeared Previously' },
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

function MetadataIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  );
}

function NominateIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
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
    columnWidths,
    expandedCellCol,
    onRowClick,
    onToggleCell,
    onUpdateRating,
    onUpdateNote,
    onUpdateFeedback,
    onSetExpandedCell,
    onOpenContextMenu,
    onPlayNow,
    measureElement,
    supabase,
    authUser,
    setUserFeedback,
    onRefreshFeedback,
    onShowToast,
  }) => {
    const vgmcElements = track.tournaments.map((t, i) => {
      const hasResult = t.placement || t.highestRound;
      let displayValue = t.sequenceNumber;

      return (
        <span key={i}>
          <span
            className={`vgmc-number ${hasResult ? 'has-result' : 'no-result'}`}
          >
            {displayValue}
          </span>
          {i < track.tournaments.length - 1 ? (
            <span className="vgmc-comma">, </span>
          ) : (
            ''
          )}
        </span>
      );
    });

    const placements = track.tournaments
      .map((t) => {
        if (t.highestRound) {
          return `${t.sequenceNumber}-R${t.highestRound}`;
        }
        if (t.placement) {
          return `${t.sequenceNumber}-#${t.placement}`;
        }
        return null;
      })
      .filter(Boolean)
      .map((text, i, arr) => (
        <span key={i}>
          {text}
          {i < arr.length - 1 ? ', ' : ''}
        </span>
      ));

    const [localNote, setLocalNote] = useState(null);
    const [localRating, setLocalRating] = useState(null);

    const isFeedbackDirty =
      (localNote !== null && localNote !== (feedback.note || '')) ||
      (localRating !== null && localRating !== (feedback.rating || ''));

    const handleDiscardFeedback = (e) => {
      if (e) e.stopPropagation();
      setLocalRating(null);
      setLocalNote(null);
    };

    const handleClearFeedback = useCallback(
      async (e) => {
        if (e) e.stopPropagation();
        if (!authUser) return;
        if (window.confirm('Clear your rating and note for this track?')) {
          try {
            await deleteUserFeedback(supabase, authUser.id, track.trackId);
            setUserFeedback((prev) => {
              const next = { ...prev };
              delete next[track.trackId];
              return next;
            });
            onRefreshFeedback?.();
            setLocalRating(null);
            setLocalNote(null);
          } catch (err) {
            console.error('Failed to clear feedback:', err);
            onShowToast?.('Failed to clear feedback.');
          }
        }
      },
      [
        supabase,
        authUser,
        track.trackId,
        onShowToast,
        onRefreshFeedback,
        setUserFeedback,
      ],
    );

    const handleSaveFeedback = (e) => {
      if (e) e.stopPropagation();
      const finalRating = localRating !== null ? localRating : feedback.rating;
      const finalNote = localNote !== null ? localNote : feedback.note;

      if (onUpdateFeedback) {
        onUpdateFeedback(track.trackId, {
          rating: finalRating,
          note: finalNote,
        });
      } else {
        if (finalRating !== feedback.rating && onUpdateRating) {
          onUpdateRating(track.trackId, String(finalRating));
        }
        if (finalNote !== feedback.note && onUpdateNote) {
          onUpdateNote(track.trackId, finalNote);
        }
      }
      setLocalRating(null);
      setLocalNote(null);
    };

    return (
      <tr
        className={`${isSelected ? 'selected' : ''} ${track.isRetired ? 'retired' : ''}`}
        onClick={() => onRowClick(track)}
        onDoubleClick={(e) => {
          e.preventDefault();
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
          if (onPlayNow) onPlayNow(track);
        }}
        onMouseDown={(e) => {
          if (e.detail > 1) {
            e.preventDefault();
          }
        }}
        onContextMenu={(e) => onOpenContextMenu(e, track)}
        ref={measureElement}
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
          {track.tournaments.length > 0 ? vgmcElements : '-'}
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
          {track.gameTitle}
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
          {track.trackTitle}
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
            value={localRating !== null ? localRating : feedback.rating || ''}
            onChange={(e) => setLocalRating(e.target.value)}
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
          <a
            href={track.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="youtube-link"
          >
            {track.sourceUrl}
          </a>
        </td>
        <td
          className="col-comment"
          style={{
            width: columnWidths.comment,
            minWidth: columnWidths.comment,
            maxWidth: columnWidths.comment,
          }}
        >
          <div
            className="comment-cell-content"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <input
              type="text"
              placeholder="Add note..."
              value={localNote !== null ? localNote : feedback.note || ''}
              onChange={(e) => setLocalNote(e.target.value)}
              onFocus={() =>
                onSetExpandedCell({ id: track.trackId, col: 'comment' })
              }
              style={{ flex: 1 }}
            />
            {isFeedbackDirty ? (
              <div className="feedback-row-actions">
                <button
                  className="btn-feedback-save"
                  onClick={handleSaveFeedback}
                  title="Save feedback (rating and note)"
                >
                  <SaveIcon />
                </button>
                <button
                  className="btn-feedback-discard"
                  onClick={handleDiscardFeedback}
                  title="Discard pending changes"
                >
                  <DiscardIcon />
                </button>
              </div>
            ) : (
              (feedback.rating || feedback.note) && (
                <button
                  className="btn-feedback-clear"
                  onClick={handleClearFeedback}
                  title="Clear saved rating and note"
                >
                  <DiscardIcon />
                </button>
              )
            )}
          </div>
        </td>
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
  onRefreshFeedback,
  listenedStatusById = {},
  hasPlayer = false,
  onUpdateMetadata,
  onToggleNomination,
  onOpenSupportDropdown,
  initialTracks = [],
  initialScrollOffset = 0,
  onUnmount,
}) {
  const [tracks, setTracks] = useState(initialTracks);
  const [userFeedback, setUserFeedback] = useState({});
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

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
  const preserveScrollRef = useRef(false);
  const isFirstLoadRef = useRef(initialTracks.length > 0);
  const tracksRef = useRef(initialTracks);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [maxVgmc, setMaxVgmc] = useState(24);
  const [expandedCell, setExpandedCell] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [controlsOffset, setControlsOffset] = useState(0);

  const isMobileLayout = useMediaQuery('(max-width: 960px)');

  const toolbarRef = useRef(null);
  const leftZoneRef = useRef(null);
  const centerZoneRef = useRef(null);
  const rightZoneRef = useRef(null);

  const loadingIdRef = useRef(0);

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

  // Keep tracksRef current so the unmount callback captures fresh data
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  // Save tracks + scroll offset to parent cache on unmount
  useEffect(() => {
    return () => {
      onUnmount?.(tracksRef.current, tableWrapperRef.current?.scrollTop ?? 0);
      clearCatalogCache();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore scroll position when remounting with cached data
  useLayoutEffect(() => {
    if (initialScrollOffset > 0 && tableWrapperRef.current) {
      tableWrapperRef.current.scrollTop = initialScrollOffset;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Initial load and feedback fetch
  useEffect(() => {
    const loadInitialData = async () => {
      if (!supabase) return;
      const currentLoadingId = ++loadingIdRef.current;

      setLoading(true);

      if (isFirstLoadRef.current) {
        // Remounting with cached data — keep tracks visible while refreshing
        isFirstLoadRef.current = false;
      } else {
        setTracks([]);
        if (tableWrapperRef.current) {
          if (preserveScrollRef.current) {
            scrollPositionRef.current = tableWrapperRef.current.scrollTop;
            preserveScrollRef.current = false;
          }
          tableWrapperRef.current.scrollTop = 0;
        }
      }

      try {
        let feedback = userFeedback;
        if (Object.keys(feedback).length === 0 && authUser) {
          feedback = await fetchUserFeedback(supabase, authUser.id);
          setUserFeedback(feedback);
        }

        const { data, totalCount: count } = await fetchFilteredTracks(
          supabase,
          {
            searchTerm: debouncedSearchTerm,
            vgmcFilter,
            viewMode,
            authUserId: authUser?.id,
            userFeedback: feedback,
            listenedStatusById,
            sortColumn,
            sortAsc,
            maxVgmc,
          },
        );

        if (currentLoadingId !== loadingIdRef.current) return;

        setTracks(data);
        setTotalCount(count);
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
    sortColumn,
    sortAsc,
  ]);

  const rowVirtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => tableWrapperRef.current,
    estimateSize: () => 53,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() -
        virtualItems[virtualItems.length - 1].end
      : 0;

  const handleUpdateFeedback = useCallback(
    async (trackId, updates) => {
      if (!authUser) {
        onShowToast?.('Please log in to save feedback.');
        return;
      }
      try {
        const current = userFeedback[trackId] || { rating: null, note: '' };
        const newRating =
          updates.rating !== undefined
            ? updates.rating === ''
              ? null
              : updates.rating
            : current.rating;
        const newNote =
          updates.note !== undefined
            ? updates.note?.trim() || ''
            : current.note;

        if (newRating === null && newNote === '') {
          await deleteUserFeedback(supabase, authUser.id, trackId);
          setUserFeedback((prev) => {
            const next = { ...prev };
            delete next[trackId];
            return next;
          });
        } else {
          await upsertUserFeedback(supabase, authUser.id, trackId, {
            rating: newRating,
            note: newNote,
          });
          setUserFeedback((prev) => ({
            ...prev,
            [trackId]: { rating: newRating, note: newNote },
          }));
        }
        onRefreshFeedback?.();
      } catch (err) {
        console.error('Failed to save feedback:', err);
        onShowToast?.('Failed to save feedback.');
      }
    },
    [supabase, authUser, userFeedback, onShowToast, onRefreshFeedback],
  );

  const handleUpdateRating = useCallback(
    async (trackId, rating) => {
      handleUpdateFeedback(trackId, { rating });
    },
    [handleUpdateFeedback],
  );

  const handleUpdateNote = useCallback(
    async (trackId, note) => {
      handleUpdateFeedback(trackId, { note });
    },
    [handleUpdateFeedback],
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
                onChange={(e) => {
                  const val = e.target.value;
                  setViewMode(val);
                  if (val === 'most_submitted') {
                    setSortColumn('submissions');
                    setSortAsc(false);
                  } else if (sortColumn === 'submissions') {
                    // Reset to default sort if we were in most submitted
                    setSortColumn('vgmc');
                    setSortAsc(true);
                  }
                }}
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
          <button
            className="btn btn-playback btn-merge"
            disabled={!selectedTrack}
            onClick={() => setShowDuplicateModal(true)}
            title="Review Duplicates"
          >
            <MergeIcon />{' '}
            <span className="responsive-label">Review Duplicates</span>
          </button>
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
        <main
          className="table-wrapper"
          ref={tableWrapperRef}
          style={{ overflowAnchor: 'none' }}
        >
          {loading && (
            <div
              className={`database-loading-overlay ${tracks.length === 0 ? 'initial' : ''}`}
            >
              <div className="lottie-player-container">
                <DotLottieReact
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
                  onClick={() => handleSort('vgmc')}
                  className="col-vgmc"
                  style={{
                    width: columnWidths.vgmc,
                    minWidth: columnWidths.vgmc,
                    maxWidth: columnWidths.vgmc,
                  }}
                >
                  VGMC {sortColumn === 'vgmc' && (sortAsc ? '↑' : '↓')}
                  <div
                    className="resizer"
                    onMouseDown={(e) => handleResizeStart(e, 'vgmc')}
                    onClick={(e) => e.stopPropagation()}
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
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr className="virtual-padding-top">
                  <td
                    style={{
                      height: `${paddingTop}px`,
                      padding: 0,
                      border: 0,
                      transition: 'none',
                    }}
                    colSpan={8}
                  />
                </tr>
              )}
              {virtualItems.map((virtualRow) => {
                const track = tracks[virtualRow.index];
                if (!track) return null;
                return (
                  <TrackRow
                    key={track.trackId}
                    track={track}
                    index={virtualRow.index}
                    isSelected={selectedTrack?.trackId === track.trackId}
                    feedback={userFeedback[track.trackId] || {}}
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
                    onUpdateFeedback={handleUpdateFeedback}
                    onSetExpandedCell={setExpandedCell}
                    onOpenContextMenu={handleOpenContextMenu}
                    onPlayNow={onPlayNow}
                    measureElement={virtualRow.measureElement}
                    supabase={supabase}
                    authUser={authUser}
                    setUserFeedback={setUserFeedback}
                    onRefreshFeedback={onRefreshFeedback}
                    onShowToast={onShowToast}
                  />
                );
              })}
              {paddingBottom > 0 && (
                <tr className="virtual-padding-bottom">
                  <td
                    style={{
                      height: `${paddingBottom}px`,
                      padding: 0,
                      border: 0,
                      transition: 'none',
                    }}
                    colSpan={8}
                  />
                </tr>
              )}
            </tbody>
          </table>
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
            preserveScrollRef.current = true;
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
              <div className="context-menu-divider" />
              <button
                className="database-context-menu-item"
                onClick={() => {
                  onToggleNomination?.(contextMenu.track);
                  setContextMenu(null);
                }}
              >
                <NominateIcon /> Add to Nominations
              </button>
              <button
                className="database-context-menu-item"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onOpenSupportDropdown?.(contextMenu.track, {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                  });
                  setContextMenu(null);
                }}
              >
                <SupportIcon /> Set Support Level
              </button>
              <div className="context-menu-divider" />
              <button
                className="database-context-menu-item"
                onClick={() => {
                  onUpdateMetadata?.(contextMenu.track);
                  setContextMenu(null);
                }}
              >
                <MetadataIcon /> Update Metadata
              </button>
            </>
          )}
        </ContextMenuPortal>
      )}
    </div>
  );
}
