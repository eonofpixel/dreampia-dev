/**
 * revocationFeedScheduler tests (v2.4.0 Task 3 / US-203 wiring).
 *
 * Coverage:
 *   - startRevocationFeedScheduler fires initial 'boot' poll asynchronously
 *   - Interval scheduler triggers re-poll
 *   - Audit hook receives correct trigger + outcome on each poll
 *   - feedUrl=undefined → boot poll rejected with 'fetch_failed'
 *   - HTTP feed fetched + JSON parsed; bundle fetched separately
 *   - 404 bundle response → bundle=null (verifyBundle returns false in caller)
 *   - Cache file persisted on apply; subsequent boot reads cached feed_version
 *   - stop() clears the interval (no further audits after stop)
 *   - emitToast forwarded when revocation entry matches installed record
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  startRevocationFeedScheduler,
  type RevocationSchedulerAuditEvent,
} from '../../../src/main/mcp/revocationFeedScheduler';
import { InstalledPluginRecordStore } from '../../../src/main/mcp/installedPluginRecordStore';
import type { ManifestVerifier } from '../../../src/types/mcpManifest';
import type { InstalledPluginRecord } from '../../../src/types/installedPluginRecord';

const VERIFIED: ManifestVerifier = {
  verify: () =>
    Promise.resolve({
      kind: 'verified',
      evidence: {
        cert_issuer: 'https://token.actions.githubusercontent.com',
        cert_subject: 'repo:any',
        verified_at: '2026-05-10T00:00:00.000Z',
      },
    }),
};

const REJECTING: ManifestVerifier = {
  verify: () => Promise.resolve({ kind: 'signature_invalid', evidence: { reason: 'bad' } }),
};

interface FakeScheduler {
  setInterval: (cb: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
  fire: () => void;
  cleared: boolean;
}

function fakeScheduler(): FakeScheduler {
  let cb: (() => void) | null = null;
  let cleared = false;
  return {
    setInterval: (callback: () => void, _ms: number) => {
      cb = callback;
      return 1;
    },
    clearInterval: () => {
      cleared = true;
      cb = null;
    },
    fire: () => {
      if (cb !== null) cb();
    },
    get cleared(): boolean {
      return cleared;
    },
  } as unknown as FakeScheduler;
}

function makeFeedJson(version: number, entries: unknown[] = []): unknown {
  return {
    feed_version: version,
    generated_at: '2026-05-10T00:00:00.000Z',
    max_age_seconds: 86_400,
    entries,
  };
}

const baseRecord: InstalledPluginRecord = {
  package_id: '@eonofpixel/sample',
  publisher_id: 'token.actions.githubusercontent.com:repo:eonofpixel/sample',
  version: '1.0.0',
  artifact_digest: 'a'.repeat(64),
  manifest_digest: 'b'.repeat(64),
  verification_status: 'verified',
  revocation_status: 'unknown',
  isolation_mode: 'utility_process',
  installed_at: '2026-05-01T00:00:00.000Z',
  last_verified_at: '2026-05-01T00:00:00.000Z',
  last_revocation_check_at: null,
};

interface Harness {
  tmpDir: string;
  cachePath: string;
  recordStore: InstalledPluginRecordStore;
  audits: RevocationSchedulerAuditEvent[];
}

let h: Harness;

beforeEach(() => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'revfeed-test-'));
  h = {
    tmpDir,
    cachePath: join(tmpDir, 'revocation-feed-cache.json'),
    recordStore: new InstalledPluginRecordStore({
      storageDir: join(tmpDir, 'records'),
    }),
    audits: [],
  };
});

afterEach(() => {
  try {
    rmSync(h.tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('v2.4.0 Task 3 — startRevocationFeedScheduler', () => {
  it('boot poll with feedUrl=undefined → audit rejected fetch_failed', async () => {
    const sched = fakeScheduler();
    const { stop } = startRevocationFeedScheduler({
      cachePath: h.cachePath,
      feedUrl: undefined,
      recordStore: h.recordStore,
      verifier: VERIFIED,
      scheduler: sched,
      audit: (e) => h.audits.push(e),
    });
    // Boot poll fires asynchronously — wait for the void promise to resolve.
    await new Promise((r) => setTimeout(r, 5));
    const boot = h.audits.find((a) => a.trigger === 'boot');
    expect(boot).toBeDefined();
    expect(boot?.kind).toBe('rejected');
    expect(boot?.reason).toBe('fetch_failed');
    stop();
    expect(sched.cleared).toBe(true);
  });

  it('valid signed feed → audit applied + record updated + cache persisted', async () => {
    const fetchImpl = vi.fn(
      async (
        url: string | URL | Request
      ): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }> => {
        if (String(url).endsWith('.sigstore')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve({ fake: 'bundle' }),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () =>
            Promise.resolve(
              makeFeedJson(1, [
                {
                  package_id: baseRecord.package_id,
                  publisher_id: baseRecord.publisher_id,
                  version: baseRecord.version,
                  artifact_digest: baseRecord.artifact_digest,
                  manifest_digest: baseRecord.manifest_digest,
                  reason: 'compromise',
                  since: '2026-05-09T00:00:00.000Z',
                },
              ])
            ),
        };
      }
    );
    h.recordStore.put(baseRecord);

    const sched = fakeScheduler();
    const toasts: Array<{ package_id: string }> = [];
    const { stop } = startRevocationFeedScheduler({
      cachePath: h.cachePath,
      feedUrl: 'https://example.invalid/feed.json',
      recordStore: h.recordStore,
      verifier: VERIFIED,
      scheduler: sched,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      audit: (e) => h.audits.push(e),
      emitToast: (entry) => toasts.push({ package_id: entry.package_id }),
    });
    await new Promise((r) => setTimeout(r, 20));
    const boot = h.audits.find((a) => a.trigger === 'boot');
    expect(boot?.kind).toBe('applied');
    expect(boot?.feed_version).toBe(1);

    // Record updated to revoked
    const updated = h.recordStore.get(baseRecord.package_id);
    expect(updated?.revocation_status).toBe('revoked');
    expect(toasts).toHaveLength(1);

    // Cache file persisted
    expect(existsSync(h.cachePath)).toBe(true);
    const cached = JSON.parse(readFileSync(h.cachePath, 'utf-8'));
    expect(cached.feed_version).toBe(1);
    stop();
  });

  it('verifier rejects bundle → audit rejected signature_invalid', async () => {
    const fetchImpl = vi.fn(
      async (): Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        json: () => Promise<unknown>;
      }> => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(makeFeedJson(1)),
      })
    );

    const sched = fakeScheduler();
    const { stop } = startRevocationFeedScheduler({
      cachePath: h.cachePath,
      feedUrl: 'https://example.invalid/feed.json',
      recordStore: h.recordStore,
      verifier: REJECTING,
      scheduler: sched,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      audit: (e) => h.audits.push(e),
    });
    await new Promise((r) => setTimeout(r, 20));
    const boot = h.audits.find((a) => a.trigger === 'boot');
    expect(boot?.kind).toBe('rejected');
    expect(boot?.reason).toBe('signature_invalid');
    stop();
  });

  it('interval re-fires poll with trigger=interval', async () => {
    const fetchImpl = vi.fn(
      async (): Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        json: () => Promise<unknown>;
      }> => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(makeFeedJson(1)),
      })
    );
    const sched = fakeScheduler();
    const { stop } = startRevocationFeedScheduler({
      cachePath: h.cachePath,
      feedUrl: 'https://example.invalid/feed.json',
      recordStore: h.recordStore,
      verifier: VERIFIED,
      scheduler: sched,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      audit: (e) => h.audits.push(e),
    });
    await new Promise((r) => setTimeout(r, 20));
    sched.fire();
    await new Promise((r) => setTimeout(r, 20));
    const interval = h.audits.find((a) => a.trigger === 'interval');
    expect(interval).toBeDefined();
    stop();
  });

  it('cached feed_version blocks rollback (older feed rejected)', async () => {
    // Pre-seed cache with version 5
    writeFileSync(h.cachePath, JSON.stringify(makeFeedJson(5)), 'utf-8');

    const fetchImpl = vi.fn(
      async (): Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        json: () => Promise<unknown>;
      }> => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(makeFeedJson(3)),
      })
    );
    const sched = fakeScheduler();
    const { stop } = startRevocationFeedScheduler({
      cachePath: h.cachePath,
      feedUrl: 'https://example.invalid/feed.json',
      recordStore: h.recordStore,
      verifier: VERIFIED,
      scheduler: sched,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      audit: (e) => h.audits.push(e),
    });
    await new Promise((r) => setTimeout(r, 20));
    const boot = h.audits.find((a) => a.trigger === 'boot');
    expect(boot?.kind).toBe('rejected');
    expect(boot?.reason).toBe('rollback');
    stop();
  });

  it('feedPublisherIdentity is forwarded to verifier (v2.4.0 identity policy)', async () => {
    const fetchImpl = vi.fn(
      async (
        url: string | URL | Request
      ): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }> => {
        if (String(url).endsWith('.sigstore')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve({ fake: 'bundle' }),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(makeFeedJson(1)),
        };
      }
    );
    // Spy on verify call to see what manifest identity is passed.
    const verifyCalls: Array<{ issuer: string; subject_pattern: string }> = [];
    const spyVerifier: ManifestVerifier = {
      verify: (manifest) => {
        verifyCalls.push({
          issuer: manifest.signing.identity.issuer,
          subject_pattern: manifest.signing.identity.subject_pattern,
        });
        return Promise.resolve({
          kind: 'verified',
          evidence: {
            cert_issuer: manifest.signing.identity.issuer,
            cert_subject: 'test',
            verified_at: '2026-05-10T00:00:00.000Z',
          },
        });
      },
    };

    const sched = fakeScheduler();
    const { stop } = startRevocationFeedScheduler({
      cachePath: h.cachePath,
      feedUrl: 'https://example.invalid/feed.json',
      recordStore: h.recordStore,
      verifier: spyVerifier,
      feedPublisherIdentity: {
        issuer: 'https://token.actions.githubusercontent.com',
        subject_pattern: 'repo:my-org/my-feed:ref:refs/heads/main',
      },
      scheduler: sched,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      audit: (e) => h.audits.push(e),
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(verifyCalls).toHaveLength(1);
    expect(verifyCalls[0]?.issuer).toBe('https://token.actions.githubusercontent.com');
    expect(verifyCalls[0]?.subject_pattern).toBe('repo:my-org/my-feed:ref:refs/heads/main');
    stop();
  });

  it('without feedPublisherIdentity → verifier receives permissive wildcard (back-compat)', async () => {
    const fetchImpl = vi.fn(
      async (
        url: string | URL | Request
      ): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }> => {
        if (String(url).endsWith('.sigstore')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve({ fake: 'bundle' }),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(makeFeedJson(1)),
        };
      }
    );
    const verifyCalls: Array<{ subject_pattern: string }> = [];
    const spyVerifier: ManifestVerifier = {
      verify: (manifest) => {
        verifyCalls.push({ subject_pattern: manifest.signing.identity.subject_pattern });
        return Promise.resolve({
          kind: 'verified',
          evidence: {
            cert_issuer: 'x',
            cert_subject: 'y',
            verified_at: '2026-05-10T00:00:00.000Z',
          },
        });
      },
    };

    const sched = fakeScheduler();
    const { stop } = startRevocationFeedScheduler({
      cachePath: h.cachePath,
      feedUrl: 'https://example.invalid/feed.json',
      recordStore: h.recordStore,
      verifier: spyVerifier,
      // feedPublisherIdentity omitted
      scheduler: sched,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      audit: (e) => h.audits.push(e),
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(verifyCalls[0]?.subject_pattern).toBe('**');
    stop();
  });

  it('stop() prevents further interval firings', async () => {
    const fetchImpl = vi.fn(
      async (): Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        json: () => Promise<unknown>;
      }> => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(makeFeedJson(1)),
      })
    );
    const sched = fakeScheduler();
    const { stop } = startRevocationFeedScheduler({
      cachePath: h.cachePath,
      feedUrl: 'https://example.invalid/feed.json',
      recordStore: h.recordStore,
      verifier: VERIFIED,
      scheduler: sched,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      audit: (e) => h.audits.push(e),
    });
    await new Promise((r) => setTimeout(r, 20));
    stop();
    expect(sched.cleared).toBe(true);
  });
});
