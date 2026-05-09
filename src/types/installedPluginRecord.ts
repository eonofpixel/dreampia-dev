/**
 * InstalledPluginRecord — single source of truth for an installed plugin/MCP server's
 * identity, verification state, revocation state, and isolation mode.
 *
 * Cross-phase invariant for v2.3.0 Plugin GA. Read by:
 *   - Renderer marketplace UI (verification badge, runs-in-main-process badge)
 *   - manifestVerify (writes verification_status + last_verified_at)
 *   - signedRevocationFeed (writes revocation_status + last_revocation_check_at)
 *   - hostBridge dispatcher (reads isolation_mode + grant_epoch from McpCapabilityGate)
 *   - AuditLogStore (records identity transitions)
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 1.0 (US-100), gates G1/G2/G3/G4/G6.
 *
 * Invariants:
 *   - artifact_digest / manifest_digest are sha256 hex (64 chars).
 *   - version is semver (major.minor.patch[-prerelease][+build]).
 *   - last_verified_at must be ≥ installed_at when verification_status != 'unverified'.
 *   - last_revocation_check_at advances monotonically per record (rollback rejection
 *     enforced by signedRevocationFeed using monotonic feed_version, not this field).
 */

import { z } from 'zod';
import { ISO8601Schema } from './common';

// ────────────────────────────────────────────────────────────
// Sub-schemas
// ────────────────────────────────────────────────────────────

/** Hex sha256 digest. Lowercase, exactly 64 chars. */
const Sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Must be lowercase 64-char sha256 hex');

/**
 * Semver version string. Permissive (matches semver.org BNF) but rejects empty
 * and obviously invalid forms (e.g. "v1", "1.2", "latest"). zod's regex is
 * sufficient — we do not pull semver lib here to keep this module dep-free.
 */
const SemverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    'Must be semver (e.g. 1.2.3 or 1.2.3-beta.1)',
  );

/**
 * Package id — globally unique across registry. Allows scoped form (`@org/pkg`)
 * and plain form (`pkg-name`). [a-zA-Z0-9_-] plus `/` and leading `@` only.
 */
const PackageIdSchema = z
  .string()
  .min(1)
  .max(214)
  .regex(/^(@[a-zA-Z0-9][a-zA-Z0-9_-]*\/)?[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Invalid package id');

/**
 * Publisher id — derived from Sigstore signing identity (issuer + sub claim).
 * Format: `<issuer-host>:<sub-claim>` (e.g. `token.actions.githubusercontent.com:repo:org/pkg:ref:refs/tags/v1.0.0`).
 * Stored verbatim from cert claims; not validated structurally beyond non-empty +
 * length cap to prevent accidental record bloat.
 */
const PublisherIdSchema = z.string().min(1).max(512);

// ────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────

/**
 * verification_status — outcome of last manifestVerify run for this record.
 *
 * - `unverified`: never verified (just installed, or verification disabled).
 * - `verified`: signature + identity policy passed.
 * - `identity_mismatch`: signature valid, but cert claims do not match
 *   manifest.signing.identity (issuer/sub_pattern). G2 codex tightening — this
 *   is the "signature without identity policy is theater" failure mode.
 * - `signature_invalid`: Sigstore verify rejected the bundle.
 * - `revoked`: superseded by revocation_status='revoked' from signedRevocationFeed;
 *   kept here as a UI hint (show red badge regardless of which path produced it).
 */
export const VerificationStatusSchema = z.enum([
  'unverified',
  'verified',
  'identity_mismatch',
  'signature_invalid',
  'revoked',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * revocation_status — outcome of last signedRevocationFeed poll for this record.
 *
 * - `clear`: feed checked, package not in revocation list.
 * - `revoked`: feed contains entry matching this record's package_id +
 *   publisher_id + version + artifact_digest.
 * - `unknown`: feed never successfully fetched OR feed is stale (max_age exceeded).
 *   In `strict` mcpVerificationMode this should be treated as fail-closed.
 */
export const RevocationStatusSchema = z.enum(['clear', 'revoked', 'unknown']);
export type RevocationStatus = z.infer<typeof RevocationStatusSchema>;

/**
 * isolation_mode — per-plugin override for v2.3.0 PR #33 default flip (G6).
 *
 * - `utility_process`: runs in `utilityProcess.fork()` child (default for v2.3.0+).
 * - `in_process`: runs in main process (legacy; downgrade requires explicit user
 *   consent + audit + marketplace badge per G6 codex tightening).
 * - `auto`: utility_process preferred; on first failed fork(), prompt user once
 *   for consent before falling back to in_process. Recorded as
 *   `isolationDowngradeConsent` in settings on confirm.
 */
export const IsolationModeSchema = z.enum(['utility_process', 'in_process', 'auto']);
export type IsolationMode = z.infer<typeof IsolationModeSchema>;

// ────────────────────────────────────────────────────────────
// Main schema
// ────────────────────────────────────────────────────────────

export const InstalledPluginRecordSchema = z
  .object({
    package_id: PackageIdSchema,
    publisher_id: PublisherIdSchema,
    version: SemverSchema,
    artifact_digest: Sha256HexSchema,
    manifest_digest: Sha256HexSchema,
    verification_status: VerificationStatusSchema,
    revocation_status: RevocationStatusSchema,
    isolation_mode: IsolationModeSchema,
    installed_at: ISO8601Schema,
    last_verified_at: ISO8601Schema.nullable(),
    last_revocation_check_at: ISO8601Schema.nullable(),
  })
  .strict();

export type InstalledPluginRecord = z.infer<typeof InstalledPluginRecordSchema>;
