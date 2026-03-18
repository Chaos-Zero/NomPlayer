import { useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  getTrackCatalogTournamentSummary,
  mapTrackCatalogEntryToVideo,
  searchTrackCatalog,
} from '../lib/trackCatalog.js';

const SEARCH_RESULTS_LIMIT = 10;
const CONTEXT_MENU_WIDTH = 180;
const CONTEXT_MENU_HEIGHT = 96;

function getSearchResultLabel(result) {
  if (result.gameTitle && result.trackTitle) {
    return `${result.gameTitle} - ${result.trackTitle}`;
  }

  return result.displayTitle || result.sourceTitle || result.videoId;
}

function normalizeSearchResult(entry) {
  const video = mapTrackCatalogEntryToVideo(entry);
  if (!video) {
    return null;
  }

  return {
    ...entry,
    video,
    label: getSearchResultLabel(entry),
    tournamentSummary: getTrackCatalogTournamentSummary(entry),
  };
}

export default function TrackCatalogSearch({
  supabase,
  onPlayNow,
  onAddToPlaylist,
  className = '',
  inputId = 'track-catalog-search',
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [settledQuery, setSettledQuery] = useState('');
  const wrapperRef = useRef(null);
  const contextMenuRef = useRef(null);
  const requestIdRef = useRef(0);
  const deferredQuery = useDeferredValue(query.trim());
  const canSearch = Boolean(supabase) && deferredQuery.length >= 2;
  const loading = canSearch && deferredQuery !== settledQuery;
  const visibleError = canSearch && deferredQuery === settledQuery ? error : '';
  const visibleResults =
    canSearch && deferredQuery === settledQuery ? results : [];
  const visibleContextMenu = isFocused ? contextMenu : null;
  const shouldShowResults =
    isFocused && canSearch && (loading || deferredQuery === settledQuery);

  useEffect(() => {
    if (!shouldShowResults && !visibleContextMenu) return undefined;

    function handlePointerDown(event) {
      if (contextMenuRef.current?.contains(event.target)) return;
      if (wrapperRef.current?.contains(event.target)) return;
      setIsFocused(false);
      setContextMenu(null);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsFocused(false);
        setContextMenu(null);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handlePointerDown, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handlePointerDown, true);
    };
  }, [shouldShowResults, visibleContextMenu]);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!canSearch) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      searchTrackCatalog(supabase, deferredQuery, SEARCH_RESULTS_LIMIT)
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          setResults(data.map(normalizeSearchResult).filter(Boolean));
          setError('');
          setSettledQuery(deferredQuery);
        })
        .catch((searchError) => {
          if (requestId !== requestIdRef.current) return;
          setResults([]);
          setError(
            searchError.message || 'Could not search the track catalog.',
          );
          setSettledQuery(deferredQuery);
        });
    }, 140);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canSearch, deferredQuery, supabase]);

  function resetSearch() {
    setQuery('');
    setResults([]);
    setError('');
    setSettledQuery('');
    setContextMenu(null);
  }

  async function handlePlayNow(result) {
    await onPlayNow?.(result.video);
    resetSearch();
  }

  async function handleAddToPlaylist(result) {
    await onAddToPlaylist?.([result.video]);
    resetSearch();
  }

  function handleOpenContextMenu(event, result) {
    event.preventDefault();

    const left = Math.min(
      event.clientX,
      window.innerWidth - CONTEXT_MENU_WIDTH - 8,
    );
    const top = Math.min(
      event.clientY,
      window.innerHeight - CONTEXT_MENU_HEIGHT - 8,
    );

    setContextMenu({
      left: Math.max(8, left),
      top: Math.max(8, top),
      result,
    });
  }

  return (
    <div
      className={`playlist-search${className ? ` ${className}` : ''}`}
      ref={wrapperRef}
    >
      <label className="sr-only" htmlFor={inputId}>
        Search track catalog
      </label>
      <div
        className={`playlist-search-shell${isFocused ? ' active' : ''}${error ? ' error' : ''}`}
      >
        <input
          id={inputId}
          className="playlist-search-input"
          type="search"
          placeholder={
            supabase
              ? 'Search VGMC nominations…'
              : 'Nomination search unavailable'
          }
          value={query}
          onFocus={() => setIsFocused(true)}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setError('');
            setContextMenu(null);
            if (nextQuery.trim().length < 2) {
              setResults([]);
              setSettledQuery('');
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && visibleResults[0]) {
              event.preventDefault();
              handlePlayNow(visibleResults[0]);
            }
          }}
          disabled={!supabase}
          autoComplete="off"
          spellCheck="false"
        />
        <div className="playlist-search-indicator" aria-hidden="true">
          {loading ? '…' : '⌕'}
        </div>
      </div>

      {shouldShowResults && (
        <div className="playlist-search-results" role="listbox">
          {visibleError ? (
            <div className="playlist-search-status">{visibleError}</div>
          ) : visibleResults.length === 0 && !loading ? (
            <div className="playlist-search-status">
              No catalog matches yet.
            </div>
          ) : (
            visibleResults.map((result) => (
              <button
                key={result.videoId}
                className={`playlist-search-result${result.isRetired ? ' retired' : ''}`}
                type="button"
                role="option"
                onClick={() => handlePlayNow(result)}
                onContextMenu={(event) => handleOpenContextMenu(event, result)}
              >
                <span className="playlist-search-result-label">
                  {result.label}
                </span>
                <span className="playlist-search-result-meta">
                  {result.tournamentSummary || 'Unplaced'}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {visibleContextMenu && (
        <div
          ref={contextMenuRef}
          className="playlist-context-menu"
          role="menu"
          style={{
            top: visibleContextMenu.top,
            left: visibleContextMenu.left,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="playlist-context-menu-item"
            type="button"
            role="menuitem"
            onClick={() => handlePlayNow(visibleContextMenu.result)}
          >
            Play now
          </button>
          <button
            className="playlist-context-menu-item"
            type="button"
            role="menuitem"
            onClick={() => handleAddToPlaylist(visibleContextMenu.result)}
          >
            Add to playlist
          </button>
        </div>
      )}
    </div>
  );
}
