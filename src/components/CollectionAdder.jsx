import { useEffect, useRef, useState } from 'react';
import {
  parseYouTubeInput,
  fetchPlaylistItems,
  singleVideoEntry,
} from '../utils/youtube.js';

const SUCCESS_FLASH_MS = 1000;
const API_KEY = import.meta.env.VITE_YT_API_KEY || '';

const DEFAULT_EMPTY_ADD_MESSAGES = {
  support: 'Nothing new could be added to the support list.',
  nomination: 'Nothing new could be added to nominations.',
  playlist: 'Nothing new could be added to the current playlist.',
};

function getDefaultCloseAriaLabel(addButtonLabel) {
  if (typeof addButtonLabel !== 'string' || !addButtonLabel.trim()) {
    return 'Close add form';
  }

  return `Close ${addButtonLabel.toLowerCase()}`;
}

export default function CollectionAdder({
  tone = 'support',
  addButtonLabel = 'Add',
  addButtonAriaLabel,
  addButtonTitle,
  closeButtonAriaLabel,
  onAddDirectItems = () => 0,
  emptyAddMessage,
  inputPlaceholder = 'Paste a YouTube video or playlist URL…',
  compact = false,
  highlight = false,
  onOpenChange,
  hidden = false,
}) {
  const [urlValue, setUrlValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const inputRef = useRef(null);
  const activeRequestRef = useRef(0);
  const successTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const resolvedEmptyAddMessage =
    emptyAddMessage ||
    DEFAULT_EMPTY_ADD_MESSAGES[tone] ||
    'Nothing new could be added.';
  const resolvedCloseButtonAriaLabel =
    closeButtonAriaLabel || getDefaultCloseAriaLabel(addButtonLabel);

  useEffect(() => {
    if (!isOpen) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isOpen]);

  // Lets a parent that places this next to another expandable control (e.g.
  // a search box sharing the same footer) know when to hide that sibling,
  // so the two never end up open at once.
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(
    () => () => {
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    },
    [],
  );

  function clearSuccessFlash() {
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setShowSuccess(false);
  }

  function flashSuccess() {
    clearSuccessFlash();
    setShowSuccess(true);
    successTimeoutRef.current = window.setTimeout(() => {
      successTimeoutRef.current = null;
      setShowSuccess(false);
    }, SUCCESS_FLASH_MS);
  }

  function showToast(message) {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    setToastMessage(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      toastTimeoutRef.current = null;
      setToastMessage('');
    }, 2600);
  }

  function openAdder() {
    clearSuccessFlash();
    setError('');
    setIsOpen(true);
  }

  function closeAdder() {
    activeRequestRef.current += 1;
    clearSuccessFlash();
    setLoading(false);
    setError('');
    setUrlValue('');
    setIsOpen(false);
  }

  async function handleSubmit(event) {
    event?.preventDefault();

    if (!isOpen) {
      openAdder();
      return;
    }

    const trimmedUrl = urlValue.trim();
    if (!trimmedUrl) return;

    const parsed = parseYouTubeInput(trimmedUrl);
    if (!parsed) {
      setError('Could not recognise that URL or ID');
      return;
    }

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    clearSuccessFlash();
    setError('');
    setLoading(true);

    try {
      let items = [];

      if (parsed.type === 'video') {
        const item = await singleVideoEntry(parsed.videoId);
        if (requestId !== activeRequestRef.current) return;
        items = [item];
      } else {
        items = await fetchPlaylistItems(parsed.playlistId, API_KEY);
        if (requestId !== activeRequestRef.current) return;

        if (items.length === 0) {
          setError('Playlist is empty or private.');
          return;
        }
      }

      const addResult = await onAddDirectItems(items);
      if (requestId !== activeRequestRef.current) return;

      const normalizedResult =
        typeof addResult === 'number'
          ? {
              addedCount: addResult,
              blockedNominationCount: 0,
              blockedRetiredCount: 0,
            }
          : {
              addedCount: addResult?.addedCount ?? 0,
              blockedNominationCount: addResult?.blockedNominationCount ?? 0,
              blockedRetiredCount: addResult?.blockedRetiredCount ?? 0,
            };

      if (normalizedResult.blockedNominationCount > 0 && tone === 'support') {
        showToast(
          parsed.type === 'playlist'
            ? 'Some songs in this playlist have already been added as Nominations'
            : 'You have already added this link as a Nomination',
        );
      }

      if (normalizedResult.blockedRetiredCount > 0) {
        showToast(
          normalizedResult.blockedRetiredCount > 1
            ? 'Some songs in this list are retired'
            : 'This song is retired',
        );
      }

      if (!normalizedResult.addedCount) {
        if (
          normalizedResult.blockedNominationCount > 0 ||
          normalizedResult.blockedRetiredCount > 0
        ) {
          setUrlValue('');
          return;
        }

        setError(resolvedEmptyAddMessage);
        return;
      }

      setUrlValue('');
      flashSuccess();
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;

      if (err.message === 'NO_API_KEY') {
        setError('Add VITE_YT_API_KEY to .env to load playlists.');
      } else {
        setError(err.message || 'Failed to load videos.');
      }
    } finally {
      if (requestId === activeRequestRef.current) {
        setLoading(false);
      }
    }
  }

  return (
    <div
      className={`collection-adder tone-${tone}${compact ? ' compact' : ''}${isOpen ? ' open' : ''}${showSuccess ? ' success' : ''}${highlight ? ' highlight-pulse' : ''}${hidden ? ' peer-hidden' : ''}`}
    >
      {toastMessage && (
        <div
          className="collection-adder-toast"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}
      <div className="collection-adder-shell">
        <div className="collection-adder-stage">
          <button
            className="collection-adder-face collection-adder-front"
            type="button"
            onClick={openAdder}
            aria-label={addButtonAriaLabel}
            title={addButtonTitle || addButtonAriaLabel || undefined}
            tabIndex={isOpen ? -1 : 0}
          >
            {addButtonLabel}
          </button>

          <form
            className={`collection-adder-face collection-adder-back${showSuccess ? ' success' : ''}`}
            onSubmit={handleSubmit}
          >
            <input
              ref={inputRef}
              className="collection-adder-input"
              type="text"
              placeholder={inputPlaceholder}
              value={urlValue}
              onChange={(event) => {
                setUrlValue(event.target.value);
                setError('');
                if (showSuccess) {
                  clearSuccessFlash();
                }
              }}
              tabIndex={isOpen ? 0 : -1}
            />
            <button
              className={`collection-adder-submit${showSuccess ? ' success' : ''}`}
              type="submit"
              disabled={!showSuccess && !urlValue.trim()}
              aria-label={showSuccess ? 'Load successful' : undefined}
              tabIndex={isOpen ? 0 : -1}
            >
              {showSuccess ? '✓' : loading ? 'Loading…' : 'Load'}
            </button>
            <button
              className="collection-adder-close"
              type="button"
              aria-label={resolvedCloseButtonAriaLabel}
              onClick={closeAdder}
              tabIndex={isOpen ? 0 : -1}
            >
              ✕
            </button>
          </form>
        </div>
      </div>

      {error && <div className="collection-adder-error">⚠ {error}</div>}
    </div>
  );
}
