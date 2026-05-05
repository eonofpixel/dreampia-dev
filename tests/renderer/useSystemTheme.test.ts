/**
 * useSystemTheme + resolveEffectiveTheme unit tests (v1.3.5).
 */

import { describe, it, expect } from 'vitest';
import { resolveEffectiveTheme } from '../../src/renderer/hooks/useSystemTheme';

describe('v1.3.5 — resolveEffectiveTheme', () => {
  it("settings 'light' override → light", () => {
    expect(resolveEffectiveTheme('light', 'dark')).toBe('light');
  });
  it("settings 'dark' override → dark", () => {
    expect(resolveEffectiveTheme('dark', 'light')).toBe('dark');
  });
  it("settings 'system' → system theme", () => {
    expect(resolveEffectiveTheme('system', 'dark')).toBe('dark');
    expect(resolveEffectiveTheme('system', 'light')).toBe('light');
  });
  it('settings undefined → system', () => {
    expect(resolveEffectiveTheme(undefined, 'dark')).toBe('dark');
  });
  it('settings 알 수 없는 값 → system fallback', () => {
    expect(resolveEffectiveTheme('xyz', 'light')).toBe('light');
  });
});
