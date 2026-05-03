/**
 * Settings keyboard_shortcut_overrides tests — v0.10.0.
 *
 * 검증:
 *  - 기본값: undefined (미설정)
 *  - read: plain object 만 보존, 잘못된 키/값은 silent drop
 *  - write: 정상 저장 + cache 갱신
 *  - 빈 object: 미설정 처럼 처리 (drop or empty record)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => {
  return {
    app: {
      getPath: (_name: string): string => userDataRef.current,
    },
  };
});

import { readSettings, writeSettings, __resetSettingsCache } from '../../src/main/settings';

let testTmpDir = '';

beforeEach(() => {
  testTmpDir = mkdtempSync(join(tmpdir(), 'dreampia-keyboard-settings-'));
  userDataRef.current = testTmpDir;
  __resetSettingsCache();
});

afterEach(() => {
  if (testTmpDir.length > 0 && existsSync(testTmpDir)) {
    rmSync(testTmpDir, { recursive: true, force: true });
  }
});

describe('Settings — keyboard_shortcut_overrides', () => {
  it('returns undefined when settings.json missing keyboard_shortcut_overrides', () => {
    const settings = readSettings();
    expect(settings.keyboard_shortcut_overrides).toBeUndefined();
  });

  it('preserves valid Record<string, string>', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({
        keyboard_shortcut_overrides: {
          'search.focus': 'Mod+J',
          'usage.open': 'Mod+Y',
        },
      })
    );
    __resetSettingsCache();
    const settings = readSettings();
    expect(settings.keyboard_shortcut_overrides).toEqual({
      'search.focus': 'Mod+J',
      'usage.open': 'Mod+Y',
    });
  });

  it('drops non-string values (silent)', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({
        keyboard_shortcut_overrides: {
          'search.focus': 'Mod+J',
          'usage.open': 42, // invalid
          'chat.new': null, // invalid
        },
      })
    );
    __resetSettingsCache();
    const settings = readSettings();
    expect(settings.keyboard_shortcut_overrides).toEqual({
      'search.focus': 'Mod+J',
    });
  });

  it('drops empty string values', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({
        keyboard_shortcut_overrides: {
          'search.focus': '',
        },
      })
    );
    __resetSettingsCache();
    const settings = readSettings();
    expect(settings.keyboard_shortcut_overrides).toBeUndefined();
  });

  it('drops if not a plain object (array / null / number)', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({
        keyboard_shortcut_overrides: ['not', 'an', 'object'],
      })
    );
    __resetSettingsCache();
    expect(readSettings().keyboard_shortcut_overrides).toBeUndefined();

    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({ keyboard_shortcut_overrides: null })
    );
    __resetSettingsCache();
    expect(readSettings().keyboard_shortcut_overrides).toBeUndefined();
  });

  it('writeSettings persists keyboard_shortcut_overrides', () => {
    writeSettings({
      keyboard_shortcut_overrides: { 'search.focus': 'Mod+J' },
    });
    __resetSettingsCache();
    const reloaded = readSettings();
    expect(reloaded.keyboard_shortcut_overrides).toEqual({
      'search.focus': 'Mod+J',
    });
  });

  it('coexists with other settings', () => {
    writeSettings({
      workspace_root: '/some/path',
      workspace_name: 'path',
      keyboard_shortcut_overrides: { 'search.focus': 'Mod+J' },
      theme: 'dark',
    });
    __resetSettingsCache();
    const reloaded = readSettings();
    expect(reloaded.workspace_root).toBe('/some/path');
    expect(reloaded.theme).toBe('dark');
    expect(reloaded.keyboard_shortcut_overrides).toEqual({
      'search.focus': 'Mod+J',
    });
  });
});
