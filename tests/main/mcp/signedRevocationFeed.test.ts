/**
 * signedRevocationFeed tests (v2.3.0 US-203).
 *
 * Coverage (5+ cases per AC):
 *   - rollback rejection
 *   - schema validation
 *   - signed feed verify (bundle null and bundle ok)
 *   - already-at-version no_change
 *   - applied → record status flip + toast emission
 *   - 'unknown' → 'clear' transition when feed reachable
 *   - isFeedStale helper
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SignedRevocationFeed,
  type SignedRevocationFeedDeps,
  type RevocationFeed,
  type ApplyResult,
} from '../../../src/main/mcp/signedRevocationFeed';
import type { InstalledPluginRecord, RevocationStatus } from '../../../src/types/installedPluginRecord';

const baseRecord: InstalledPluginRecord = {
  package_id: '@eonofpixel/sample',
  publisher_id: 'token.actions.githubusercontent.com:repo:eonofpixel/sample:ref:refs/tags/v1.0.0',
  version: '1.0.0',
  artifact_digest: 'a'.repeat(64),
  manifest_digest: 'b'.repeat(64),
  verification_status: 'verified',
  revocation_status: 'clear',
  isolation_mode: 'utility_process',
  installed_at: '2026-05-01T00:00:00.000Z',
  last_verified_at: '2026-05-01T00:00:00.000Z',
  last_revocation_check_at: null,
};

function makeFeed(overrides: Partial<RevocationFeed> = {}): RevocationFeed {
  return {
    feed_version: 1,
    generated_at: '2026-05-09T00:00:00.000Z',
    max_age_seconds: 24 * 60 * 60,
    entries: [],
    ...overrides,
  };
}

interface TestHarness {
  deps: SignedRevocationFeedDeps;
  records: InstalledPluginRecord[];
  cachedFeed: RevocationFeed | null;
  toasts: Array<{ package_id: string }>;
  fetchFeed: () => Promise<{ feed: unknown; bundle: unknown | null }>;
  feedToServe: { feed: unknown; bundle: unknown | null };
  verifyOk: boolean;
}

function harness(records: InstalledPluginRecord[] = [{ ...baseRecord }]): TestHarness {
  const state: TestHarness = {
    deps: {} as SignedRevocationFeedDeps,
    records,
    cachedFeed: null,
    toasts: [],
    fetchFeed: () => Promise.resolve({ feed: makeFeed(), bundle: { fake: 'bundle' } }),
    feedToServe: { feed: makeFeed(), bundle: { fake: 'bundle' } },
    verifyOk: true,
  };

  state.deps = {
    fetchFeed: () => Promise.resolve(state.feedToServe),
    verifyBundle: () => Promise.resolve(state.verifyOk),
    getCachedFeedVersion: () => state.cachedFeed?.feed_version ?? 0,
    setCachedFeed: (f) => {
      state.cachedFeed = f;
    },
    listInstalledRecords: () => state.records,
    updateRecordRevocationStatus: (pkg, status, last_check_at) => {
      const rec = state.records.find((r) => r.package_id === pkg);
      if (rec !== undefined) {
        rec.revocation_status = status;
        rec.last_revocation_check_at = last_check_at;
      }
    },
    emitToast: (entry) => {
      state.toasts.push({ package_id: entry.package_id });
    },
    now: () => new Date('2026-05-09T12:00:00.000Z'),
  };
  return state;
}

let h: TestHarness;
beforeEach(() => {
  h = harness();
});

describe('v2.3.0 US-203 — SignedRevocationFeed.applyOnce', () => {
  it('rollback rejected: cached version > offered version', async () => {
    h.cachedFeed = makeFeed({ feed_version: 5 });
    h.feedToServe = { feed: makeFeed({ feed_version: 3 }), bundle: { fake: 'bundle' } };
    const feed = new SignedRevocationFeed(h.deps);
    const r = await feed.applyOnce();
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected' && r.reason === 'rollback') {
      expect(r.current).toBe(5);
      expect(r.offered).toBe(3);
    } else {
      throw new Error(`expected rollback, got ${JSON.stringify(r)}`);
    }
  });

  it('schema rejection: malformed feed', async () => {
    h.feedToServe = { feed: { not: 'a valid feed' }, bundle: { fake: 'bundle' } };
    const feed = new SignedRevocationFeed(h.deps);
    const r = await feed.applyOnce();
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.reason).toBe('schema');
  });

  it('signature invalid: verify returns false', async () => {
    h.verifyOk = false;
    const feed = new SignedRevocationFeed(h.deps);
    const r = await feed.applyOnce();
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.reason).toBe('signature_invalid');
  });

  it('fetch_failed when fetch throws', async () => {
    h.deps.fetchFeed = (): Promise<never> => Promise.reject(new Error('network down'));
    const feed = new SignedRevocationFeed(h.deps);
    const r = await feed.applyOnce();
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') {
      expect(r.reason).toBe('fetch_failed');
      if (r.reason === 'fetch_failed') expect(r.details).toContain('network down');
    }
  });

  it('no_change: feed_version equals cached', async () => {
    h.cachedFeed = makeFeed({ feed_version: 1 });
    h.feedToServe = { feed: makeFeed({ feed_version: 1 }), bundle: { fake: 'bundle' } };
    const feed = new SignedRevocationFeed(h.deps);
    const r = await feed.applyOnce();
    expect(r.kind).toBe('no_change');
    if (r.kind === 'no_change') expect(r.feed_version).toBe(1);
  });

  it('applied: revocation entry flips matching record + emits toast', async () => {
    const revokedEntry = {
      package_id: baseRecord.package_id,
      publisher_id: baseRecord.publisher_id,
      version: baseRecord.version,
      artifact_digest: baseRecord.artifact_digest,
      manifest_digest: baseRecord.manifest_digest,
      reason: 'malicious' as const,
      since: '2026-05-08T00:00:00.000Z',
    };
    h.feedToServe = {
      feed: makeFeed({ feed_version: 2, entries: [revokedEntry] }),
      bundle: { fake: 'bundle' },
    };
    const feed = new SignedRevocationFeed(h.deps);
    const r: ApplyResult = await feed.applyOnce();
    expect(r.kind).toBe('applied');
    if (r.kind === 'applied') {
      expect(r.feed_version).toBe(2);
      expect(r.new_revocations).toBe(1);
    }
    expect(h.records[0]?.revocation_status).toBe('revoked');
    expect(h.records[0]?.last_revocation_check_at).toBe('2026-05-09T12:00:00.000Z');
    expect(h.toasts).toEqual([{ package_id: baseRecord.package_id }]);
  });

  it('applied: unknown record transitions to clear when feed has no matching entry', async () => {
    h.records[0]!.revocation_status = 'unknown' as RevocationStatus;
    h.feedToServe = { feed: makeFeed({ feed_version: 1, entries: [] }), bundle: { fake: 'bundle' } };
    const feed = new SignedRevocationFeed(h.deps);
    const r = await feed.applyOnce();
    expect(r.kind).toBe('applied');
    expect(h.records[0]?.revocation_status).toBe('clear');
  });

  it('applied: revoked record clears when no longer in newer feed', async () => {
    h.records[0]!.revocation_status = 'revoked' as RevocationStatus;
    h.cachedFeed = makeFeed({ feed_version: 1 });
    h.feedToServe = { feed: makeFeed({ feed_version: 2, entries: [] }), bundle: { fake: 'bundle' } };
    const feed = new SignedRevocationFeed(h.deps);
    const r = await feed.applyOnce();
    expect(r.kind).toBe('applied');
    expect(h.records[0]?.revocation_status).toBe('clear');
  });
});

describe('v2.3.0 US-203 — isFeedStale helper', () => {
  it('returns false when within max_age', () => {
    const feed = makeFeed({
      generated_at: '2026-05-09T00:00:00.000Z',
      max_age_seconds: 24 * 60 * 60,
    });
    expect(SignedRevocationFeed.isFeedStale(feed, new Date('2026-05-09T12:00:00.000Z'))).toBe(false);
  });

  it('returns true when past max_age', () => {
    const feed = makeFeed({
      generated_at: '2026-05-09T00:00:00.000Z',
      max_age_seconds: 60 * 60,
    });
    expect(SignedRevocationFeed.isFeedStale(feed, new Date('2026-05-09T02:00:00.000Z'))).toBe(true);
  });
});
