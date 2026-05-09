/**
 * InstalledPluginRecordStore tests (v2.4.0).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InstalledPluginRecordStore,
  __testing,
} from '../../../src/main/mcp/installedPluginRecordStore';
import type { InstalledPluginRecord } from '../../../src/types/installedPluginRecord';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mcp-records-'));
});

afterEach(() => {
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

const sample: InstalledPluginRecord = {
  package_id: '@eonofpixel/sample-mcp',
  publisher_id: 'token.actions.githubusercontent.com:repo:eonofpixel/sample:ref:refs/tags/v1.0.0',
  version: '1.0.0',
  artifact_digest: 'a'.repeat(64),
  manifest_digest: 'b'.repeat(64),
  verification_status: 'verified',
  revocation_status: 'clear',
  isolation_mode: 'utility_process',
  installed_at: '2026-05-09T00:00:00.000Z',
  last_verified_at: '2026-05-09T00:00:00.000Z',
  last_revocation_check_at: null,
};

describe('v2.4.0 — InstalledPluginRecordStore', () => {
  it('put + get round-trip preserves all fields', () => {
    const store = new InstalledPluginRecordStore({ storageDir: tmpRoot });
    store.put(sample);
    const got = store.get(sample.package_id);
    expect(got).toEqual(sample);
  });

  it('get returns null for unknown package_id', () => {
    const store = new InstalledPluginRecordStore({ storageDir: tmpRoot });
    expect(store.get('@nope/none')).toBeNull();
  });

  it('listAll returns every persisted record', () => {
    const store = new InstalledPluginRecordStore({ storageDir: tmpRoot });
    store.put(sample);
    store.put({ ...sample, package_id: '@other/pkg' });
    const list = store.listAll();
    expect(list.length).toBe(2);
    const ids = list.map((r) => r.package_id).sort();
    expect(ids).toEqual(['@eonofpixel/sample-mcp', '@other/pkg']);
  });

  it('remove deletes the file; get returns null after', () => {
    const store = new InstalledPluginRecordStore({ storageDir: tmpRoot });
    store.put(sample);
    expect(store.count()).toBe(1);
    store.remove(sample.package_id);
    expect(store.count()).toBe(0);
    expect(store.get(sample.package_id)).toBeNull();
  });

  it('put rejects records that fail schema validation', () => {
    const store = new InstalledPluginRecordStore({ storageDir: tmpRoot });
    expect(() => store.put({ ...sample, version: 'not-semver' } as InstalledPluginRecord)).toThrow(
      /invalid record/
    );
  });

  it('listAll silently skips corrupt JSON files', () => {
    const store = new InstalledPluginRecordStore({ storageDir: tmpRoot });
    store.put(sample);
    writeFileSync(join(tmpRoot, 'broken.json'), '{ not: valid', 'utf-8');
    const list = store.listAll();
    expect(list.length).toBe(1);
    expect(list[0]?.package_id).toBe('@eonofpixel/sample-mcp');
  });

  it('listAll silently skips schema-invalid records', () => {
    const store = new InstalledPluginRecordStore({ storageDir: tmpRoot });
    store.put(sample);
    writeFileSync(
      join(tmpRoot, 'invalid.json'),
      JSON.stringify({ package_id: 'x', version: 'bogus' }),
      'utf-8'
    );
    const list = store.listAll();
    expect(list.length).toBe(1);
  });

  it('package_id encoding round-trips for npm-scoped names', () => {
    const enc = __testing.encodePackageId('@eonofpixel/sample-mcp');
    expect(enc).not.toContain('/');
    expect(enc).not.toContain('+');
    expect(__testing.decodePackageId(enc + '.json')).toBe('@eonofpixel/sample-mcp');
  });

  it('handles empty storage dir gracefully (count=0)', () => {
    const store = new InstalledPluginRecordStore({ storageDir: tmpRoot });
    expect(store.count()).toBe(0);
    expect(store.listAll()).toEqual([]);
  });
});
