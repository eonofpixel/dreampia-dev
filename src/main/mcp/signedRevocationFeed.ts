/**
 * signedRevocationFeed — poll, verify, and apply the revocation feed.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 2.4 (US-203), gate G3.
 *
 * Codex G3 tightening:
 *   - Polls on app start + every 6h while running + manual trigger (NOT 24h).
 *   - Feed is itself signed (Sigstore bundle alongside).
 *   - Monotonic `feed_version` integer; rollback (older version) is REJECTED.
 *   - Local `last-known-good` cache persists across restarts.
 *   - Entry schema: { package_id, publisher_id, version, artifact_digest,
 *                     manifest_digest, reason, since }.
 *
 * Air-gap policy (G2 codex):
 *   - Network unreachable + cached feed older than max_age → revocation_status='unknown'.
 *   - In `mcpVerificationMode='strict'` mode, 'unknown' is treated as fail-closed
 *     by callers (e.g. install denied for a record whose status is 'unknown').
 *
 * This module is **main process only**. Renderer triggers refresh via
 * `mcpBridge.requestRefreshRevocations` IPC (US-104), which the main process
 * handler routes to `applyOnce({ manual: true })`.
 */

import { z } from 'zod';
import type { InstalledPluginRecord, RevocationStatus } from '../../types/installedPluginRecord';

// ────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────

const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
const SemverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
  );

export const RevocationReasonSchema = z.enum(['compromise', 'malicious', 'superseded', 'other']);
export type RevocationReason = z.infer<typeof RevocationReasonSchema>;

export const RevocationEntrySchema = z
  .object({
    package_id: z.string().min(1).max(214),
    publisher_id: z.string().min(1).max(512),
    version: SemverSchema,
    artifact_digest: Sha256HexSchema,
    manifest_digest: Sha256HexSchema,
    reason: RevocationReasonSchema,
    since: z.string().datetime({ offset: true }),
  })
  .strict();

export type RevocationEntry = z.infer<typeof RevocationEntrySchema>;

export const RevocationFeedSchema = z
  .object({
    /** Monotonic version. Newer feeds MUST have greater feed_version. */
    feed_version: z.number().int().nonnegative(),
    /** ISO 8601 timestamp the feed was published. Audit only. */
    generated_at: z.string().datetime({ offset: true }),
    /** Seconds. If `now > generated_at + max_age`, feed is stale. */
    max_age_seconds: z
      .number()
      .int()
      .positive()
      .max(7 * 24 * 60 * 60),
    /** All revoked entries known at feed_version. */
    entries: z.array(RevocationEntrySchema),
  })
  .strict();

export type RevocationFeed = z.infer<typeof RevocationFeedSchema>;

// ────────────────────────────────────────────────────────────
// Apply outcomes
// ────────────────────────────────────────────────────────────

export type ApplyResult =
  | { kind: 'applied'; feed_version: number; new_revocations: number }
  | { kind: 'no_change'; feed_version: number; reason: 'already_at_version' }
  | { kind: 'rejected'; reason: 'rollback'; current: number; offered: number }
  | { kind: 'rejected'; reason: 'schema'; details: string }
  | { kind: 'rejected'; reason: 'signature_invalid'; details: string }
  | { kind: 'rejected'; reason: 'fetch_failed'; details: string };

// ────────────────────────────────────────────────────────────
// Dependencies (DI for tests)
// ────────────────────────────────────────────────────────────

export interface SignedRevocationFeedDeps {
  /**
   * Fetch the raw feed JSON + the attached Sigstore bundle (or null in `off`
   * mode). Implementation is HTTP for production; tests inject in-memory.
   */
  fetchFeed: () => Promise<{ feed: unknown; bundle: unknown | null }>;
  /**
   * Verify the bundle against the feed payload. Returns true on success.
   * Production wires SigstoreManifestVerifier; tests can stub to true/false.
   */
  verifyBundle: (feed: unknown, bundle: unknown | null) => Promise<boolean>;
  /** Get last-known-good feed_version from disk. 0 if none cached. */
  getCachedFeedVersion: () => number;
  /** Persist new feed_version + payload to disk after successful apply. */
  setCachedFeed: (feed: RevocationFeed) => void;
  /** Read all installed plugin records — used to flip revocation_status. */
  listInstalledRecords: () => InstalledPluginRecord[];
  /** Update one record's revocation status. Persists to disk. */
  updateRecordRevocationStatus: (
    package_id: string,
    status: RevocationStatus,
    last_check_at: string
  ) => void;
  /** Surface revocation as user-visible toast. Optional. */
  emitToast?: (entry: RevocationEntry) => void;
  /** Override clock for tests. */
  now?: () => Date;
}

// ────────────────────────────────────────────────────────────
// Apply (single fetch + verify + persist + record-update cycle)
// ────────────────────────────────────────────────────────────

export class SignedRevocationFeed {
  private readonly deps: SignedRevocationFeedDeps;
  private readonly now: () => Date;

  constructor(deps: SignedRevocationFeedDeps) {
    this.deps = deps;
    this.now = deps.now ?? ((): Date => new Date());
  }

  /**
   * Fetch + verify + apply one feed cycle. Idempotent — running multiple
   * times against the same feed returns `no_change`.
   */
  async applyOnce(): Promise<ApplyResult> {
    let raw;
    try {
      raw = await this.deps.fetchFeed();
    } catch (err) {
      return {
        kind: 'rejected',
        reason: 'fetch_failed',
        details: err instanceof Error ? err.message : String(err),
      };
    }

    const verified = await this.deps.verifyBundle(raw.feed, raw.bundle);
    if (!verified) {
      return {
        kind: 'rejected',
        reason: 'signature_invalid',
        details: 'feed Sigstore bundle did not verify',
      };
    }

    const parsed = RevocationFeedSchema.safeParse(raw.feed);
    if (!parsed.success) {
      return {
        kind: 'rejected',
        reason: 'schema',
        details: parsed.error.message,
      };
    }
    const feed = parsed.data;

    const cached = this.deps.getCachedFeedVersion();
    if (feed.feed_version < cached) {
      // Rollback attack — refuse.
      return {
        kind: 'rejected',
        reason: 'rollback',
        current: cached,
        offered: feed.feed_version,
      };
    }
    if (feed.feed_version === cached) {
      return {
        kind: 'no_change',
        feed_version: feed.feed_version,
        reason: 'already_at_version',
      };
    }

    // Newer feed_version — apply.
    this.deps.setCachedFeed(feed);

    const records = this.deps.listInstalledRecords();
    const revokedKeys = new Set(
      feed.entries.map((e) => keyFor(e.package_id, e.version, e.artifact_digest))
    );
    const lastCheckAt = this.now().toISOString();
    let newRevocations = 0;

    for (const rec of records) {
      const key = keyFor(rec.package_id, rec.version, rec.artifact_digest);
      const isRevoked = revokedKeys.has(key);
      const desiredStatus: RevocationStatus = isRevoked ? 'revoked' : 'clear';
      // The `desiredStatus` is 'revoked' or 'clear'. Any prior 'unknown' state
      // differs from both, so this branch covers the 'unknown' → 'clear' transition
      // automatically when the feed is reachable and has no matching entry.
      if (rec.revocation_status !== desiredStatus) {
        this.deps.updateRecordRevocationStatus(rec.package_id, desiredStatus, lastCheckAt);
        if (isRevoked) {
          newRevocations += 1;
          const entry = feed.entries.find(
            (e) => keyFor(e.package_id, e.version, e.artifact_digest) === key
          );
          if (entry !== undefined && this.deps.emitToast !== undefined) {
            this.deps.emitToast(entry);
          }
        }
      }
    }

    return {
      kind: 'applied',
      feed_version: feed.feed_version,
      new_revocations: newRevocations,
    };
  }

  /**
   * Check whether the cached feed is stale (`now > generated_at + max_age`).
   * Caller decides what to do (e.g. flip records to `revocation_status='unknown'`
   * in strict mode). This module does NOT auto-flip — the policy lives in the
   * caller's mcpVerificationMode handler.
   */
  static isFeedStale(feed: RevocationFeed, now: Date): boolean {
    const generated = Date.parse(feed.generated_at);
    if (!Number.isFinite(generated)) return true;
    const expiry = generated + feed.max_age_seconds * 1000;
    return now.getTime() > expiry;
  }
}

function keyFor(package_id: string, version: string, artifact_digest: string): string {
  return `${package_id}@${version}#${artifact_digest}`;
}
