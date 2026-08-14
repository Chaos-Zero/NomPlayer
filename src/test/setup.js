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

afterEach(() => {
  cleanup();
});
