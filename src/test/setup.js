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
// PlaylistSidebar to bring the active row into view when landing on a view.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
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
