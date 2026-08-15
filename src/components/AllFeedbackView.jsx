import { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { fetchAllCommunityFeedback } from '../lib/feedback.js';
import { getDisplayProfileName } from '../lib/playerState.js';

const SORT_OPTIONS = [
  { id: 'date', label: 'Latest Activity' },
  { id: 'game', label: 'Game Title' },
  { id: 'song', label: 'Song Title' },
  { id: 'vgmc', label: 'VGMC #' },
  { id: 'rating', label: 'Avg Rating' },
  { id: 'comments', label: 'Most Comments' },
];

function SortChevron({ asc }) {
  return (
    <svg
      className="afv-sort-chevron"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      {asc ? <path d="M8 4l5 6H3z" /> : <path d="M8 12l-5-6h10z" />}
    </svg>
  );
}

function RatingBadge({ rating }) {
  const r = Math.round(rating * 10) / 10;
  const hue = Math.round((r / 10) * 120);
  return (
    <span
      className="afv-rating-badge"
      style={{
        background: `hsl(${hue}, 60%, 28%)`,
        color: `hsl(${hue}, 80%, 75%)`,
      }}
    >
      ★ {r.toFixed(1)}
    </span>
  );
}

export default function AllFeedbackView({
  supabase,
  onPlayNow,
  onSelectTrack,
  nominationVideoIds = null,
  supportVideoIds = null,
}) {
  const [entries, setEntries] = useState([]);
  const [vgmcByTrackId, setVgmcByTrackId] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [vgmcFilter, setVgmcFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [filterNominations, setFilterNominations] = useState(false);
  const [filterSupports, setFilterSupports] = useState(false);

  const parentRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    setIsLoading(true);
    fetchAllCommunityFeedback(supabase)
      .then(({ entries: e, vgmcByTrackId: v }) => {
        setEntries(e);
        setVgmcByTrackId(v);
      })
      .finally(() => setIsLoading(false));
  }, [supabase]);

  const groupedTracks = useMemo(() => {
    const groups = {};
    for (const entry of entries) {
      const { track_id, tracks } = entry;
      if (!track_id) continue;
      if (!groups[track_id]) {
        groups[track_id] = {
          trackId: track_id,
          track: tracks,
          entries: [],
          latestDate: new Date(0),
          vgmcNumbers: vgmcByTrackId[track_id] || [],
          videoId: tracks?.track_sources?.[0]?.external_id || null,
        };
      }
      groups[track_id].entries.push(entry);
      const d = new Date(entry.updated_at);
      if (d > groups[track_id].latestDate) {
        groups[track_id].latestDate = d;
      }
    }

    return Object.values(groups).map((g) => {
      const ratings = g.entries.map((e) => e.rating).filter((r) => r != null);
      const avgRating = ratings.length
        ? ratings.reduce((s, r) => s + r, 0) / ratings.length
        : null;
      const commentCount = g.entries.filter((e) => e.note).length;
      return { ...g, avgRating, commentCount, ratingCount: ratings.length };
    });
  }, [entries, vgmcByTrackId]);

  const availableVgmcNums = useMemo(() => {
    const nums = new Set();
    groupedTracks.forEach((g) => g.vgmcNumbers.forEach((n) => nums.add(n)));
    return [...nums].sort((a, b) => b - a);
  }, [groupedTracks]);

  const filtered = useMemo(() => {
    let list = groupedTracks;
    if (filterNominations || filterSupports) {
      list = list.filter((g) => {
        if (!g.videoId) return false;
        if (filterNominations && nominationVideoIds?.has(g.videoId))
          return true;
        if (filterSupports && supportVideoIds?.has(g.videoId)) return true;
        return false;
      });
    }
    if (vgmcFilter) {
      const num = parseInt(vgmcFilter, 10);
      list = list.filter((g) => g.vgmcNumbers.includes(num));
    }
    if (userFilter.trim()) {
      const lower = userFilter.toLowerCase().trim();
      list = list.filter((g) =>
        g.entries.some((e) =>
          e.profiles?.username?.toLowerCase().includes(lower),
        ),
      );
    }
    return list;
  }, [
    groupedTracks,
    vgmcFilter,
    userFilter,
    filterNominations,
    filterSupports,
    nominationVideoIds,
    supportVideoIds,
  ]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortAsc ? 1 : -1;
    list.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return dir * (a.latestDate - b.latestDate);
        case 'game':
          return (
            dir *
            (a.track?.canonical_game_title || '').localeCompare(
              b.track?.canonical_game_title || '',
            )
          );
        case 'song':
          return (
            dir *
            (a.track?.canonical_track_title || '').localeCompare(
              b.track?.canonical_track_title || '',
            )
          );
        case 'vgmc': {
          const aV = a.vgmcNumbers.length
            ? Math.max(...a.vgmcNumbers)
            : Infinity;
          const bV = b.vgmcNumbers.length
            ? Math.max(...b.vgmcNumbers)
            : Infinity;
          if (aV === bV) return 0;
          return dir * (aV - bV);
        }
        case 'rating': {
          const aR = a.avgRating ?? -1;
          const bR = b.avgRating ?? -1;
          return dir * (aR - bR);
        }
        case 'comments':
          return dir * (a.commentCount - b.commentCount);
        default:
          return 0;
      }
    });
    return list;
  }, [filtered, sortBy, sortAsc]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  function handleSortClick(id) {
    if (sortBy === id) {
      setSortAsc((prev) => !prev);
    } else {
      setSortBy(id);
      setSortAsc(id === 'game' || id === 'song');
    }
  }

  if (isLoading) {
    return (
      <div className="afv-loading">
        <div className="lottie-player-container">
          <DotLottieReact
            src="/loading.lottie"
            autoplay
            loop
            style={{ width: 'min(180px, 70vw)', height: 'min(180px, 70vw)' }}
          />
        </div>
        <div className="database-loading-text">
          Loading all ratings &amp; comments...
        </div>
      </div>
    );
  }

  return (
    <div className="afv-container">
      <div className="afv-toolbar">
        <div className="afv-sort-group">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`afv-sort-btn${sortBy === opt.id ? ' active' : ''}`}
              onClick={() => handleSortClick(opt.id)}
            >
              {opt.label}
              {sortBy === opt.id && <SortChevron asc={sortAsc} />}
            </button>
          ))}
        </div>
        <div className="afv-filters">
          {nominationVideoIds?.size > 0 && (
            <button
              className={`afv-sort-btn${filterNominations ? ' active' : ''}`}
              onClick={() => setFilterNominations((v) => !v)}
            >
              My Nominations
            </button>
          )}
          {supportVideoIds?.size > 0 && (
            <button
              className={`afv-sort-btn${filterSupports ? ' active' : ''}`}
              onClick={() => setFilterSupports((v) => !v)}
            >
              My Supports
            </button>
          )}
          <select
            className="afv-filter-select"
            value={vgmcFilter}
            onChange={(e) => setVgmcFilter(e.target.value)}
          >
            <option value="">All VGMCs</option>
            {availableVgmcNums.map((n) => (
              <option key={n} value={n}>
                VGMC {n}
              </option>
            ))}
          </select>
          <input
            className="afv-filter-input"
            type="text"
            placeholder="Filter by user…"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          />
        </div>
        <div className="afv-count">
          {sorted.length} track{sorted.length !== 1 ? 's' : ''} &middot;{' '}
          {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
        </div>
      </div>

      <div ref={parentRef} className="afv-scroll">
        {sorted.length === 0 ? (
          <div className="afv-empty">
            No ratings or comments match your filters.
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualItems.map((vRow) => {
              const group = sorted[vRow.index];
              const thumb = group.videoId
                ? `https://i.ytimg.com/vi/${group.videoId}/mqdefault.jpg`
                : null;
              const vgmcLabel =
                group.vgmcNumbers.length > 0
                  ? group.vgmcNumbers
                      .slice(0, 3)
                      .map((n) => `VGMC ${n}`)
                      .join(', ')
                  : null;

              return (
                <div
                  key={group.trackId}
                  data-index={vRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className="afv-row"
                  onClick={() => {
                    if (group.videoId) {
                      onSelectTrack?.({
                        videoId: group.videoId,
                        trackId: group.trackId,
                      });
                    }
                  }}
                  onDoubleClick={() => {
                    if (group.videoId) {
                      onPlayNow?.({
                        videoId: group.videoId,
                        canonical_track_title:
                          group.track?.canonical_track_title,
                        canonical_game_title: group.track?.canonical_game_title,
                      });
                    }
                  }}
                >
                  <div className="afv-row-main">
                    <div className="afv-row-left">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="afv-thumb"
                          loading="lazy"
                        />
                      ) : (
                        <div className="afv-thumb afv-thumb-placeholder" />
                      )}
                      <div className="afv-track-info">
                        <div className="afv-song-title">
                          {group.track?.canonical_track_title ||
                            'Unknown Track'}
                        </div>
                        <div className="afv-game-title">
                          {group.track?.canonical_game_title || '-'}
                        </div>
                        {vgmcLabel && (
                          <div className="afv-vgmc-row">
                            {group.vgmcNumbers.slice(0, 3).map((n) => (
                              <span key={n} className="afv-vgmc-badge">
                                VGMC {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="afv-row-right">
                      <span className="afv-entry-counts">
                        {group.ratingCount > 0 && (
                          <span>
                            {group.ratingCount} rating
                            {group.ratingCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {group.ratingCount > 0 && group.commentCount > 0 && (
                          <span className="afv-dot">&middot;</span>
                        )}
                        {group.commentCount > 0 && (
                          <span>
                            {group.commentCount} comment
                            {group.commentCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                      <div className="afv-date">
                        {group.latestDate.toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                    {group.avgRating != null && (
                      <RatingBadge rating={group.avgRating} />
                    )}
                  </div>

                  {group.entries.length > 0 && (
                    <div className="afv-previews">
                      {group.entries.slice(0, 3).map((e, i) => {
                        const hue =
                          e.rating != null
                            ? Math.round((e.rating / 10) * 120)
                            : null;
                        return (
                          <div key={i} className="afv-preview-entry">
                            <span
                              className="afv-preview-rating"
                              style={
                                hue != null
                                  ? {
                                      background: `hsl(${hue},60%,28%)`,
                                      color: `hsl(${hue},80%,75%)`,
                                    }
                                  : {
                                      background: 'rgba(255,255,255,0.06)',
                                      color: 'var(--text-muted)',
                                    }
                              }
                            >
                              {e.rating != null ? `★ ${e.rating}` : '-'}
                            </span>
                            <span className="afv-preview-user">
                              {getDisplayProfileName(
                                e.profiles?.username,
                                'Anonymous',
                              )}
                            </span>
                            <span className="afv-preview-note">
                              {e.note || ''}
                            </span>
                          </div>
                        );
                      })}
                      {group.entries.length > 3 && (
                        <span className="afv-more">
                          +{group.entries.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
