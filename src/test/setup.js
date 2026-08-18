import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Mock ResizeObserver which is not available in JSDOM
globalThis.ResizeObserver = class {
  constructor() {}
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// Mock IntersectionObserver which is not available in JSDOM, needed by
// @lottiefiles/dotlottie-react (used for loading-state animations).
globalThis.IntersectionObserver = class {
  constructor() {}
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// Element.prototype.scrollIntoView isn't implemented in JSDOM either, used by
// ListExplorer to bring a newly-added or newly-selected column into view.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Nor is Element.prototype.scrollTo, which @tanstack/react-virtual's
// scrollToIndex() calls on the scroll container (PlaylistSidebar uses this
// to bring the active row into view - see focusActiveRow - now that the
// list is windowed and the row it wants to scroll to often isn't mounted,
// so it can't just querySelector() + scrollIntoView() it like before).
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = vi.fn();
}

// JSDOM doesn't run real layout, so every element's offsetWidth/offsetHeight
// is 0. @tanstack/react-virtual (PlaylistSidebar, TrackDatabase,
// ListExplorer) reads these to size its scroll viewport and, given a 0px
// viewport, correctly renders zero rows - which starves any test that
// expects a virtualized list's rows to actually be in the DOM. A generous
// constant stand-in fixes that; the exact value doesn't matter since JSDOM
// never scrolls for real either way.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  value: 800,
});
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 800,
});

afterEach(() => {
  cleanup();
});
