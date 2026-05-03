/**
 * Settings module tests — v0.3.0 default_provider + default_permission_level.
 *
 * v0.2.0 까지는 ipc.workspace.test.ts 가 settings 동작을 indirect 로 cover 했지만
 * v0.3.0 에서 새로 추가된 두 필드는 직접적인 read/write/validation 검증이 필요.
 *
 * Mocks:
 *   - electron: app.getPath('userData') 만 stub. 실제 디스크 읽기/쓰기.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
  testTmpDir = mkdtempSync(join(tmpdir(), 'dreampia-settings-test-'));
  userDataRef.current = testTmpDir;
  __resetSettingsCache();
});

afterEach(() => {
  if (testTmpDir.length > 0 && existsSync(testTmpDir)) {
    rmSync(testTmpDir, { recursive: true, force: true });
  }
});

describe('Settings — default_provider', () => {
  it('returns undefined when settings.json missing default_provider', () => {
    const settings = readSettings();
    expect(settings.default_provider).toBeUndefined();
  });

  it("preserves valid 'auto' / 'claude' / 'codex' / 'mock'", () => {
    for (const choice of ['auto', 'claude', 'codex', 'mock'] as const) {
      writeFileSync(
        join(testTmpDir, 'settings.json'),
        JSON.stringify({ default_provider: choice })
      );
      __resetSettingsCache();
      const settings = readSettings();
      expect(settings.default_provider).toBe(choice);
    }
  });

  it('drops invalid string values (silent fallback to undefined)', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({ default_provider: 'gemini' })
    );
    __resetSettingsCache();
    const settings = readSettings();
    expect(settings.default_provider).toBeUndefined();
  });

  it('drops non-string types (silent fallback)', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({ default_provider: 42 })
    );
    __resetSettingsCache();
    const settings = readSettings();
    expect(settings.default_provider).toBeUndefined();
  });

  it('writeSettings persists default_provider to disk', () => {
    writeSettings({ default_provider: 'claude' });
    const raw = readFileSync(join(testTmpDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['default_provider']).toBe('claude');
  });

  it('writeSettings preserves other fields when patching default_provider', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({ workspace_root: '/x', workspace_name: 'x' })
    );
    __resetSettingsCache();
    writeSettings({ default_provider: 'codex' });
    const parsed = JSON.parse(
      readFileSync(join(testTmpDir, 'settings.json'), 'utf-8')
    ) as Record<string, unknown>;
    expect(parsed['workspace_root']).toBe('/x');
    expect(parsed['workspace_name']).toBe('x');
    expect(parsed['default_provider']).toBe('codex');
  });
});

describe('Settings — default_permission_level', () => {
  it('returns undefined when settings.json missing default_permission_level', () => {
    const settings = readSettings();
    expect(settings.default_permission_level).toBeUndefined();
  });

  it('preserves all four valid PermissionLevel enum values', () => {
    for (const level of [
      'read_only',
      'workspace_write',
      'full_access',
      'custom',
    ] as const) {
      writeFileSync(
        join(testTmpDir, 'settings.json'),
        JSON.stringify({ default_permission_level: level })
      );
      __resetSettingsCache();
      const settings = readSettings();
      expect(settings.default_permission_level).toBe(level);
    }
  });

  it('drops invalid string values (silent fallback)', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({ default_permission_level: 'admin' })
    );
    __resetSettingsCache();
    const settings = readSettings();
    expect(settings.default_permission_level).toBeUndefined();
  });

  it('writeSettings persists default_permission_level', () => {
    writeSettings({ default_permission_level: 'read_only' });
    const parsed = JSON.parse(
      readFileSync(join(testTmpDir, 'settings.json'), 'utf-8')
    ) as Record<string, unknown>;
    expect(parsed['default_permission_level']).toBe('read_only');
  });

  it('writes both default_provider and default_permission_level together', () => {
    writeSettings({
      default_provider: 'claude',
      default_permission_level: 'full_access',
    });
    const parsed = JSON.parse(
      readFileSync(join(testTmpDir, 'settings.json'), 'utf-8')
    ) as Record<string, unknown>;
    expect(parsed['default_provider']).toBe('claude');
    expect(parsed['default_permission_level']).toBe('full_access');
  });
});

describe('Settings — graceful degradation', () => {
  it('corrupt JSON returns empty object (no crash)', () => {
    writeFileSync(join(testTmpDir, 'settings.json'), '{ invalid json');
    __resetSettingsCache();
    const settings = readSettings();
    expect(settings.default_provider).toBeUndefined();
    expect(settings.default_permission_level).toBeUndefined();
  });

  it('next write after corrupt JSON normalizes the file', () => {
    writeFileSync(join(testTmpDir, 'settings.json'), '{ invalid');
    __resetSettingsCache();
    writeSettings({ default_provider: 'auto' });
    const parsed = JSON.parse(
      readFileSync(join(testTmpDir, 'settings.json'), 'utf-8')
    ) as Record<string, unknown>;
    expect(parsed['default_provider']).toBe('auto');
  });
});
