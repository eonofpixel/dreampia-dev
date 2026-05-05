/**
 * PluginManager unit tests (v1.1.14 / Plugin Loader MVP).
 *
 * 검증:
 *  - rootDir 미존재 → 빈 결과 (사용자가 plugin 미설치).
 *  - manifest.json 누락 → issue + audit 'plugin.missing_manifest'.
 *  - 잘못된 JSON → issue + audit 'plugin.invalid_manifest'.
 *  - 잘못된 schema (name 누락) → issue.
 *  - valid manifest → loaded + audit 'plugin.loaded'.
 *  - hooks / capabilities optional 영속.
 *  - 디렉토리 아닌 entry 는 skip.
 *  - 캐시: scan 후 list 가 같은 결과 반환.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginManager, type PluginAuditEvent } from '../../../src/main/plugins/PluginManager';

let scratchDir: string;
let auditEvents: PluginAuditEvent[];

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'plugin-test-'));
  auditEvents = [];
});

afterEach(() => {
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function makeManager(rootDir = scratchDir): PluginManager {
  return new PluginManager({
    rootDir,
    auditSink: (e): void => {
      auditEvents.push(e);
    },
  });
}

function writePlugin(name: string, manifest: unknown): string {
  const dir = join(scratchDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2),
    'utf8'
  );
  return dir;
}

describe('v1.1.14 — PluginManager.scan', () => {
  it('rootDir 미존재 → 빈 결과', async () => {
    const noDir = join(scratchDir, 'no-such');
    const mgr = makeManager(noDir);
    const result = await mgr.scan();
    expect(result.loaded).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('manifest.json 누락 → issue + audit', async () => {
    mkdirSync(join(scratchDir, 'broken'));
    const mgr = makeManager();
    const result = await mgr.scan();
    expect(result.loaded.length).toBe(0);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.reason).toMatch(/missing/i);
    expect(auditEvents.some((e) => e.event === 'plugin.missing_manifest')).toBe(true);
  });

  it('JSON 파싱 실패 → invalid_manifest issue', async () => {
    writePlugin('badjson', '{ not valid');
    const mgr = makeManager();
    const result = await mgr.scan();
    expect(result.loaded.length).toBe(0);
    expect(result.issues[0]?.reason).toMatch(/JSON parse/);
    expect(auditEvents.some((e) => e.event === 'plugin.invalid_manifest')).toBe(true);
  });

  it('name 누락 schema → invalid_manifest issue', async () => {
    writePlugin('no-name', { version: '0.1.0' });
    const mgr = makeManager();
    const result = await mgr.scan();
    expect(result.loaded.length).toBe(0);
    expect(result.issues[0]?.reason).toMatch(/name/);
  });

  it('version 누락 → invalid', async () => {
    writePlugin('no-ver', { name: 'pluginA' });
    const mgr = makeManager();
    const result = await mgr.scan();
    expect(result.loaded.length).toBe(0);
    expect(result.issues[0]?.reason).toMatch(/version/);
  });

  it('hooks 가 string 아니면 invalid', async () => {
    writePlugin('bad-hooks', {
      name: 'pluginA',
      version: '0.1.0',
      hooks: { pre_turn: 42 },
    });
    const mgr = makeManager();
    const result = await mgr.scan();
    expect(result.loaded.length).toBe(0);
    expect(result.issues[0]?.reason).toMatch(/hooks\.pre_turn/);
  });

  it('valid manifest → loaded + audit plugin.loaded', async () => {
    writePlugin('cost-limit', {
      name: 'cost-limit',
      version: '0.1.0',
      description: 'Cost limit hook example',
      hooks: { post_turn: 'index.cjs' },
      capabilities: ['NETWORK_REMOTE.read'],
    });
    const mgr = makeManager();
    const result = await mgr.scan();
    expect(result.loaded.length).toBe(1);
    const p = result.loaded[0];
    expect(p?.manifest.name).toBe('cost-limit');
    expect(p?.manifest.version).toBe('0.1.0');
    expect(p?.manifest.description).toBe('Cost limit hook example');
    expect(p?.manifest.hooks?.post_turn).toBe('index.cjs');
    expect(p?.manifest.capabilities).toEqual(['NETWORK_REMOTE.read']);
    expect(auditEvents.some((e) => e.event === 'plugin.loaded')).toBe(true);
  });

  it('디렉토리 아닌 entry (파일) 은 skip', async () => {
    writeFileSync(join(scratchDir, 'random.txt'), 'not a plugin', 'utf8');
    const mgr = makeManager();
    const result = await mgr.scan();
    expect(result.loaded.length).toBe(0);
    expect(result.issues.length).toBe(0);
  });

  it('valid + invalid 혼합 — valid 만 loaded, 둘 다 issue/audit', async () => {
    writePlugin('ok', { name: 'ok', version: '1.0.0' });
    writePlugin('broken', { name: 'broken' }); // version 누락
    const mgr = makeManager();
    const result = await mgr.scan();
    expect(result.loaded.length).toBe(1);
    expect(result.loaded[0]?.manifest.name).toBe('ok');
    expect(result.issues.length).toBe(1);
  });

  it('list() 는 scan 후 캐시된 결과 반환', async () => {
    writePlugin('cached', { name: 'cached', version: '1.0.0' });
    const mgr = makeManager();
    const scanned = await mgr.scan();
    const listed = mgr.list();
    expect(listed).toEqual(scanned);
  });

  it('scan 안 했을 때 list() → 빈 결과', () => {
    const mgr = makeManager();
    expect(mgr.list()).toEqual({ loaded: [], issues: [] });
  });

  it('getRootDir() — 생성자 옵션 그대로', () => {
    const mgr = makeManager('/custom/path');
    expect(mgr.getRootDir()).toBe('/custom/path');
  });
});
