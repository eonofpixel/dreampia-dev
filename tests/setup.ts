/**
 * Vitest setup — runs before every test file.
 *
 * Provides:
 *   - @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 *   - Cleanup after each test
 *   - Mock window.dreampia (IPC bridge)
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Mock IPC bridge in renderer tests
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'dreampia', {
    writable: true,
    value: {
      invoke: vi.fn(),
      on: vi.fn(),
    },
  });
}

// Mock scrollIntoView for jsdom (not implemented in jsdom by default)
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {};
}
