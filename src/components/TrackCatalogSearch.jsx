import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { ContextMenuPortal } from './ContextMenuPortal';
import {
  getTrackCatalogTournamentSummary,
  mapTrackCatalogEntryToVideo,
  fetchFilteredTracks,
} from '../lib/trackCatalog.js';
import {
  lastSearchError,
  lastSearchQuery,
  lastSearchResults,
  setLastSearchError,
  setLastSearchQuery,
  setLastSearchResults,
} from '../utils/searchPersistence.js';

const SEARCH_RESULTS_LIMIT = 10;

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
  value,
  onValueChange,
  results: externalResults,
  onResultsChange,
  error: externalError,
  onErrorChange,
  autoFocus,
}) {
  const [localQuery, setLocalQuery] = useState(lastSearchQuery);
  const query = value !== undefined ? value : localQuery;
  const setQuery = onValueChange || setLocalQuery;

  const [localResults, setLocalResults] = useState(lastSearchResults);
  const results =
    externalResults !== undefined ? externalResults : localResults;
  const setResults = onResultsChange || setLocalResults;

  const [localError, setLocalError] = useState(lastSearchError);
  const error = externalError !== undefined ? externalError : localError;
  const setError = onErrorChange || setLocalError;

  const [isFocused, setIsFocused] = useState(autoFocus || false);
  const [contextMenu, setContextMenu] = useState(null);
  const [settledQuery, setSettledQuery] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setLastSearchQuery(query);
    setLastSearchResults(results);
    setLastSearchError(error);
  }, [query, results, error]);

  const deferredQuery = useDeferredValue(query.trim());
  const canSearch = Boolean(supabase) && deferredQuery.length >= 2;
  const loading = canSearch && deferredQuery !== settledQuery;
  const visibleError = canSearch && deferredQuery === settledQuery ? error : '';
  const visibleResults =
    canSearch && deferredQuery === settledQuery ? results : [];
  const shouldShowResults =
    isFocused && canSearch && (loading || deferredQuery === settledQuery);

  useEffect(() => {
    if (!shouldShowResults && !contextMenu) return undefined;

    function handlePointerDown(event) {
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
  }, [shouldShowResults, contextMenu]);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!canSearch) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      fetchFilteredTracks(supabase, {
        searchTerm: deferredQuery,
        limit: SEARCH_RESULTS_LIMIT,
      })
        .then(({ data }) => {
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
  }, [canSearch, deferredQuery, setError, setResults, supabase]);

  async function handlePlayNow(result) {
    await onPlayNow?.(result.video);
  }

  async function handleAddToPlaylist(result) {
    await onAddToPlaylist?.([result.video]);
  }

  function handleOpenContextMenu(event, result) {
    event.preventDefault();

    setContextMenu({
      left: event.clientX,
      top: event.clientY,
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
          ref={inputRef}
          className="playlist-search-input"
          type="text"
          role="searchbox"
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
        <button
          className="playlist-search-indicator"
          type="button"
          onClick={() => {
            if (query) {
              setQuery('');
              setResults([]);
              setSettledQuery('');
              setError('');
              inputRef.current?.focus();
            }
          }}
          aria-label={query ? 'Clear search' : 'Search'}
          title={query ? 'Clear search' : undefined}
          tabIndex={query ? 0 : -1}
        >
          {loading ? '…' : query ? '✕' : '⌕'}
        </button>
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
                  {result.tournamentSummary || 'New'}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {contextMenu && isFocused && (
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
              handlePlayNow(contextMenu.result);
              setContextMenu(null);
            }}
          >
            Play now
          </button>
          <button
            className="playlist-context-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              handleAddToPlaylist(contextMenu.result);
              setContextMenu(null);
            }}
          >
            Add to playlist
          </button>
        </ContextMenuPortal>
      )}
    </div>
  );
}
