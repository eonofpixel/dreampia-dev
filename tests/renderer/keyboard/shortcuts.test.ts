/**
 * shortcuts.ts unit tests — v0.10.0 (G F-025).
 *
 * 검증:
 *  - parseShortcut: Mod / Ctrl / Meta / Shift / Alt / key 추출
 *  - matchesShortcut: macOS 에서 Mod=Meta, 그 외엔 Mod=Ctrl
 *  - formatShortcut: macOS ⌘⇧ vs "Ctrl+Shift+K"
 *  - canonicalizeKeyEvent: KeyboardEvent → canonical combo
 *  - shortcutsEqual: 충돌 검출
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SHORTCUT_DEFS,
  parseShortcut,
  matchesShortcut,
  formatShortcut,
  canonicalizeKeyEvent,
  shortcutsEqual,
  isMacOS,
  getShortcutDef,
} from '../../../src/renderer/keyboard/shortcuts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPlatform(platform: string): void {
  // jsdom 의 navigator 를 override — 'MacIntel' / 'Win32' / 'Linux x86_64'.
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    configurable: true,
  });
  // userAgentData stub 도 — 우선순위가 높음.
  Object.defineProperty(navigator, 'userAgentData', {
    value: { platform: platform.includes('Mac') ? 'macOS' : 'Windows' },
    configurable: true,
  });
}

describe('SHORTCUT_DEFS', () => {
  it('contains all expected actions', () => {
    const actions = SHORTCUT_DEFS.map((d) => d.action).sort();
    expect(actions).toEqual(
      [
        'chat.cancel',
        'chat.new',
        'help.open',
        'layout.fullscreen',
        'modal.close',
        'preview.toggle',
        'search.focus',
        'settings.open',
        'sidebar.toggle',
        'usage.open',
      ].sort()
    );
  });

  it('layout.fullscreen has Mod+Shift+F default (v1.6.4)', () => {
    const def = getShortcutDef('layout.fullscreen');
    expect(def?.default).toBe('Mod+Shift+F');
    expect(def?.category).toBe('navigation');
  });

  it('all definitions have non-empty default / label / description', () => {
    for (const def of SHORTCUT_DEFS) {
      expect(def.default.length).toBeGreaterThan(0);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('getShortcutDef returns def by action', () => {
    const def = getShortcutDef('search.focus');
    expect(def?.default).toBe('Mod+K');
  });
});

describe('parseShortcut', () => {
  it('parses Mod+K', () => {
    const p = parseShortcut('Mod+K');
    expect(p.mod).toBe(true);
    expect(p.ctrl).toBe(false);
    expect(p.meta).toBe(false);
    expect(p.key).toBe('k');
  });

  it('parses Mod+Shift+/', () => {
    const p = parseShortcut('Mod+Shift+/');
    expect(p.mod).toBe(true);
    expect(p.shift).toBe(true);
    expect(p.key).toBe('/');
  });

  it('parses Escape', () => {
    const p = parseShortcut('Escape');
    expect(p.mod).toBe(false);
    expect(p.key).toBe('escape');
  });

  it('parses Ctrl+Alt+Shift+P', () => {
    const p = parseShortcut('Ctrl+Alt+Shift+P');
    expect(p.ctrl).toBe(true);
    expect(p.alt).toBe(true);
    expect(p.shift).toBe(true);
    expect(p.key).toBe('p');
  });

  it('handles empty / invalid', () => {
    expect(parseShortcut('').key).toBe('');
    expect(parseShortcut('Mod+').key).toBe('');
  });

  it('treats Cmd / Command as Meta', () => {
    expect(parseShortcut('Cmd+K').meta).toBe(true);
    expect(parseShortcut('Command+K').meta).toBe(true);
  });
});

describe('matchesShortcut on macOS', () => {
  it('Mod+K matches metaKey on macOS', () => {
    stubPlatform('MacIntel');
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    expect(matchesShortcut(e, 'Mod+K')).toBe(true);
  });

  it('Mod+K does NOT match ctrlKey on macOS', () => {
    stubPlatform('MacIntel');
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(matchesShortcut(e, 'Mod+K')).toBe(false);
  });

  it('Escape matches plain Escape key', () => {
    stubPlatform('MacIntel');
    const e = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(matchesShortcut(e, 'Escape')).toBe(true);
  });
});

describe('matchesShortcut on Windows', () => {
  it('Mod+K matches ctrlKey on Windows', () => {
    stubPlatform('Win32');
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(matchesShortcut(e, 'Mod+K')).toBe(true);
  });

  it('Mod+K does NOT match metaKey on Windows', () => {
    stubPlatform('Win32');
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    expect(matchesShortcut(e, 'Mod+K')).toBe(false);
  });

  it('Mod+Shift+K requires both modifiers', () => {
    stubPlatform('Win32');
    const e1 = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(matchesShortcut(e1, 'Mod+Shift+K')).toBe(false);
    const e2 = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(matchesShortcut(e2, 'Mod+Shift+K')).toBe(true);
  });

  it('rejects when extra unwanted modifier active', () => {
    stubPlatform('Win32');
    const e = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      shiftKey: true,
    });
    // Mod+K (no Shift) should NOT match when Shift is held.
    expect(matchesShortcut(e, 'Mod+K')).toBe(false);
  });
});

describe('formatShortcut', () => {
  it('formats Mod+K as ⌘K on macOS', () => {
    stubPlatform('MacIntel');
    expect(formatShortcut('Mod+K')).toBe('⌘K');
  });

  it('formats Mod+Shift+/ as ⇧⌘/ on macOS', () => {
    stubPlatform('MacIntel');
    expect(formatShortcut('Mod+Shift+/')).toBe('⇧⌘/');
  });

  it('formats Mod+K as Ctrl+K on Windows', () => {
    stubPlatform('Win32');
    expect(formatShortcut('Mod+K')).toBe('Ctrl+K');
  });

  it('formats Escape as Esc', () => {
    stubPlatform('Win32');
    expect(formatShortcut('Escape')).toBe('Esc');
  });

  it('formats Mod+,', () => {
    stubPlatform('MacIntel');
    expect(formatShortcut('Mod+,')).toBe('⌘,');
    stubPlatform('Win32');
    expect(formatShortcut('Mod+,')).toBe('Ctrl+,');
  });
});

describe('canonicalizeKeyEvent', () => {
  it('returns Mod+K for ctrlKey on Windows', () => {
    stubPlatform('Win32');
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(canonicalizeKeyEvent(e)).toBe('Mod+K');
  });

  it('returns Mod+K for metaKey on macOS', () => {
    stubPlatform('MacIntel');
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    expect(canonicalizeKeyEvent(e)).toBe('Mod+K');
  });

  it('returns Escape for plain Escape', () => {
    stubPlatform('Win32');
    const e = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(canonicalizeKeyEvent(e)).toBe('Escape');
  });

  it('returns null for bare modifier (no trigger key)', () => {
    stubPlatform('Win32');
    const e = new KeyboardEvent('keydown', { key: 'Control' });
    expect(canonicalizeKeyEvent(e)).toBeNull();
  });

  it('returns null for plain alpha key (would conflict with text input)', () => {
    stubPlatform('Win32');
    const e = new KeyboardEvent('keydown', { key: 'a' });
    expect(canonicalizeKeyEvent(e)).toBeNull();
  });
});

describe('shortcutsEqual', () => {
  it('treats Mod+K === Mod+K on same platform', () => {
    stubPlatform('Win32');
    expect(shortcutsEqual('Mod+K', 'Mod+K')).toBe(true);
  });

  it('treats Mod+K !== Mod+Shift+K', () => {
    stubPlatform('Win32');
    expect(shortcutsEqual('Mod+K', 'Mod+Shift+K')).toBe(false);
  });

  it('treats Escape === Escape (modal.close vs chat.cancel default)', () => {
    stubPlatform('Win32');
    expect(shortcutsEqual('Escape', 'Escape')).toBe(true);
  });
});

describe('isMacOS', () => {
  it('detects macOS via navigator.platform', () => {
    stubPlatform('MacIntel');
    expect(isMacOS()).toBe(true);
  });

  it('returns false on Windows', () => {
    stubPlatform('Win32');
    expect(isMacOS()).toBe(false);
  });
});
