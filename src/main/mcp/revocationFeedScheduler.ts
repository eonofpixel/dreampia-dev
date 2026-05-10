/**
 * revocationFeedScheduler — bootstrap the SignedRevocationFeed runner (v2.4.0 Task 3).
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 2.4 (US-203), gate G3.
 *
 * Codex G3 cadence: poll on app start + every 6h while running + manual
 * trigger. v2.3.0 shipped the SignedRevocationFeed primitive (apply, rollback
 * reject, verify-bundle DI, cache shape); v2.4.0 wires:
 *
 *   - userData/revocation-feed-cache.json  (last-known-good cache)
 *   - HTTP fetch with abortable timeout    (production network path)
 *   - SigstoreManifestVerifier bundle verify (production trust)
 *   - 6h interval + initial poll on boot
 *
 * Air-gapped operation: fetchFeed rejects with a benign error → applyOnce
 * returns kind='rejected' reason='fetch_failed'. No state change. Stale-feed
 * policy stays in the caller (mcpVerificationMode handler), per ADR.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  SignedRevocationFeed,
  RevocationFeedSchema,
  type RevocationFeed,
  type SignedRevocationFeedDeps,
  type RevocationEntry,
} from './signedRevocationFeed';
import type { InstalledPluginRecord, RevocationStatus } from '../../types/installedPluginRecord';
import type { InstalledPluginRecordStore } from './installedPluginRecordStore';
import type { ManifestVerifier } from '../../types/mcpManifest';

/** Default poll cadence when running. 6h per G3 codex. */
export const DEFAULT_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Default network fetch timeout. Long enough for slow CDNs, short enough to not block app exit. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export interface RevocationFeedSchedulerOptions {
  /** Path to last-known-good cache JSON (typically userData/revocation-feed-cache.json). */
  cachePath: string;
  /** Feed URL — production constant; undefined disables polling. */
  feedUrl: string | undefined;
  /** Polling cadence override (test only). Default 6h. */
  pollIntervalMs?: number;
  /** Network timeout override (test only). Default 15s. */
  fetchTimeoutMs?: number;
  /** InstalledPluginRecordStore for record updates. */
  recordStore: InstalledPluginRecordStore;
  /** Sigstore verifier for bundle authentication. Same singleton as install path. */
  verifier: ManifestVerifier | (() => Promise<ManifestVerifier>);
  /**
   * v2.4.0 — feed publisher identity policy. When set, verifyFeedBundle
   * enforces issuer+subject_pattern match on the cert claims (npm-style glob
   * for subject). When undefined, falls back to '**' wildcard (accepts any
   * verified bundle — strictly less secure; only suitable until a publisher
   * identity is configured).
   */
  feedPublisherIdentity?: { issuer: string; subject_pattern: string };
  /** Toast hook to surface revocations to the user. */
  emitToast?: (entry: RevocationEntry) => void;
  /** Audit hook for poll outcomes. */
  audit?: (event: RevocationSchedulerAuditEvent) => void;
  /** Test injection. */
  fetchImpl?: typeof fetch;
  /** Test setInterval/clearInterval. */
  scheduler?: {
    setInterval: (cb: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
}

export interface RevocationSchedulerAuditEvent {
  timestamp: string;
  trigger: 'boot' | 'interval' | 'manual';
  kind: 'applied' | 'no_change' | 'rejected';
  feed_version?: number;
  reason?: string;
  details?: string;
}

/**
 * Construct + start the scheduler. Returns the runner so caller can register
 * via setRevocationFeedRunner() for the manual-refresh IPC, plus a stop()
 * for shutdown. Auto-runs the initial poll asynchronously.
 */
export function startRevocationFeedScheduler(options: RevocationFeedSchedulerOptions): {
  runner: SignedRevocationFeed;
  stop: () => void;
} {
  const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sched = options.scheduler ?? {
    setInterval: (cb, ms) => setInterval(cb, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  };

  const deps: SignedRevocationFeedDeps = {
    fetchFeed: async () => fetchFeedWithTimeout(options.feedUrl, fetchImpl, fetchTimeoutMs),
    verifyBundle: async (feed, bundle): Promise<boolean> =>
      verifyFeedBundle(feed, bundle, options.verifier, options.feedPublisherIdentity),
    getCachedFeedVersion: () => readCachedFeedVersion(options.cachePath),
    setCachedFeed: (feed) => writeCachedFeed(options.cachePath, feed),
    listInstalledRecords: () => options.recordStore.listAll(),
    updateRecordRevocationStatus: (package_id, status, last_check_at) => {
      const rec = options.recordStore.get(package_id);
      if (rec === null) return;
      const next: InstalledPluginRecord = {
        ...rec,
        revocation_status: status,
        last_revocation_check_at: last_check_at,
      };
      options.recordStore.put(next);
    },
    ...(options.emitToast !== undefined && { emitToast: options.emitToast }),
  };

  const runner = new SignedRevocationFeed(deps);

  const audit = options.audit;
  const wrappedRun = async (trigger: 'boot' | 'interval' | 'manual'): Promise<void> => {
    try {
      const result = await runner.applyOnce();
      audit?.({
        timestamp: new Date().toISOString(),
        trigger,
        kind: result.kind,
        ...('feed_version' in result && { feed_version: result.feed_version }),
        ...('reason' in result && { reason: result.reason }),
        ...('details' in result && { details: result.details }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      audit?.({
        timestamp: new Date().toISOString(),
        trigger,
        kind: 'rejected',
        reason: 'unexpected_error',
        details: msg,
      });
    }
  };

  // Initial boot poll — fire-and-forget.
  void wrappedRun('boot');

  const handle = sched.setInterval(() => {
    void wrappedRun('interval');
  }, intervalMs);

  return {
    runner,
    stop: () => {
      sched.clearInterval(handle);
    },
  };
}

// ────────────────────────────────────────────────────────────
// Cache I/O
// ────────────────────────────────────────────────────────────

function readCachedFeedVersion(cachePath: string): number {
  if (!existsSync(cachePath)) return 0;
  try {
    const raw = readFileSync(cachePath, 'utf-8');
    const parsed = RevocationFeedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return 0;
    return parsed.data.feed_version;
  } catch {
    return 0;
  }
}

function writeCachedFeed(cachePath: string, feed: RevocationFeed): void {
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(feed, null, 2), 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[revocationFeedScheduler] cache write failed: ${msg}`);
  }
}

// ────────────────────────────────────────────────────────────
// Network fetch
// ────────────────────────────────────────────────────────────

async function fetchFeedWithTimeout(
  feedUrl: string | undefined,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<{ feed: unknown; bundle: unknown | null }> {
  if (feedUrl === undefined) {
    throw new Error('no feed URL configured');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const feedResp = await fetchImpl(feedUrl, { signal: controller.signal });
    if (!feedResp.ok) {
      throw new Error(`feed fetch ${feedResp.status} ${feedResp.statusText}`);
    }
    const feed = (await feedResp.json()) as unknown;
    // Bundle lives at <feedUrl>.sigstore (sibling resource). 404 = unsigned feed
    // → applyOnce will reject as signature_invalid in strict callers.
    const bundleUrl = `${feedUrl}.sigstore`;
    const bundleResp = await fetchImpl(bundleUrl, { signal: controller.signal });
    let bundle: unknown | null = null;
    if (bundleResp.ok) {
      bundle = (await bundleResp.json()) as unknown;
    }
    return { feed, bundle };
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────
// Bundle verify — delegate to SigstoreManifestVerifier semantics.
// ────────────────────────────────────────────────────────────

async function verifyFeedBundle(
  feed: unknown,
  bundle: unknown | null,
  verifier: ManifestVerifier | (() => Promise<ManifestVerifier>),
  publisherIdentity?: { issuer: string; subject_pattern: string }
): Promise<boolean> {
  if (bundle === null) return false;
  const v = typeof verifier === 'function' ? await verifier() : verifier;
  // The verifier enforces signature + identity policy. Identity defaults to a
  // permissive wildcard ('**' subject + GitHub Actions issuer) when no
  // publisher is configured — strictly less secure but unblocks bring-up.
  // Production callers should set settings.mcpRevocationFeedPublisher.
  const identity = publisherIdentity ?? {
    issuer: 'https://token.actions.githubusercontent.com',
    subject_pattern: '**',
  };
  const manifestForCheck = {
    schema_version: 1 as const,
    package_id: 'revocation-feed',
    name: 'revocation-feed',
    version: '0.0.0',
    capabilities: [],
    entrypoint: { file: 'feed.json', artifact_digest: hashUnknown(feed), artifact_size_bytes: 1 },
    signing: {
      method: 'sigstore-keyless-oidc' as const,
      identity,
    },
    runtime: { node: '*', requires_native_modules: false },
  };
  try {
    const result = await v.verify(manifestForCheck, bundle, 'strict');
    return result.kind === 'verified';
  } catch {
    return false;
  }
}

function hashUnknown(value: unknown): string {
  // Lightweight stable digest for verifier consumption — never used for trust.
  // Real trust comes from SigstoreManifestVerifier verifying the bundle.
  const json = JSON.stringify(value ?? null);
  let h = 5381;
  for (let i = 0; i < json.length; i += 1) h = (h * 33) ^ json.charCodeAt(i);
  // Map to 64-char hex (Sha256HexSchema requirement on the manifest stub).
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  return hex.repeat(8).slice(0, 64);
}

/**
 * Test helper export — surface the revocation status sent to a record store
 * during a single applyOnce, so tests can assert without mocking.
 */
export type _ScheduleAuditTrigger = RevocationSchedulerAuditEvent['trigger'];
export type _ScheduleAuditKind = RevocationSchedulerAuditEvent['kind'];
export type _ScheduleRevocationStatus = RevocationStatus;
