import { useEffect, useRef, useState } from 'react';

// Same flip-card open/close animation as CollectionAdder (see its CSS in
// index.css, shared `.collection-adder*` classes), but the back face is a
// live filter box instead of a URL-add form: a magnifying-glass button that
// flips over to a text input plus a close button, live-filtering whatever
// list it's paired with as you type - no submit/loading/success state
// needed. Originally built as PlaylistSidebar's playlist search; pulled out
// so any other list (e.g. VgmcStandingsView's standings search) can reuse
// the exact same look and behavior instead of growing its own copy.
export default function FilterSearchControl({
  tone,
  query,
  onQueryChange,
  onOpenChange,
  hidden = false,
  extraClassName = '',
  ariaLabel = 'Search',
  placeholder = 'Search…',
  closeAriaLabel = 'Close search',
  style,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        onQueryChange('');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onQueryChange]);

  // Lets the parent hide a peer control (e.g. an add-to-queue button
  // sharing the same footer) while search is open, same contract as
  // CollectionAdder.
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  function closeSearch() {
    setIsOpen(false);
    onQueryChange('');
  }

  return (
    <div
      className={`collection-adder tone-${tone} compact${extraClassName ? ` ${extraClassName}` : ''}${isOpen ? ' open' : ''}${hidden ? ' peer-hidden' : ''}`}
      style={style}
    >
      <div className="collection-adder-shell">
        <div className="collection-adder-stage">
          <button
            className="collection-adder-face collection-adder-front"
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={ariaLabel}
            title={ariaLabel}
            tabIndex={isOpen ? -1 : 0}
          >
            ⌕
          </button>

          <form
            className="collection-adder-face collection-adder-back filter-search-control-back"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              ref={inputRef}
              className="collection-adder-input"
              type="text"
              role="searchbox"
              placeholder={placeholder}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              tabIndex={isOpen ? 0 : -1}
            />
            <button
              className="collection-adder-close"
              type="button"
              aria-label={closeAriaLabel}
              onClick={closeSearch}
              tabIndex={isOpen ? 0 : -1}
            >
              ✕
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
