/**
 * installPath — Sigstore install pipeline for MCP plugins (v2.4.0 Task 2).
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 2.5 (US-204), gates G2/G3.
 *
 * v2.3.0 shipped manifestVerify (US-201) + signedRevocationFeed (US-203) +
 * installedPluginRecordStore (US-104) as independent units. v2.4.0 wires them
 * together at the `mcp/install` IPC boundary:
 *
 *   manifest + bundle + mode  →  SigstoreManifestVerifier.verify
 *                              →  policy gate (strict/warn/off)
 *                              →  manifestToRecordPartial → InstalledPluginRecord
 *                              →  store.put
 *
 * Pure DI module — no electron / IPC. The IPC handler in ipc.ts wires:
 *   - verifierFactory: returns the bundled SigstoreManifestVerifier (lazy)
 *   - recordStore: getRecordStore() from ipc.ts
 *   - now: () => new Date()
 *   - audit: AuditLogStore.recordEvent
 */

import { createHash } from 'node:crypto';
import {
  McpManifestSchema,
  manifestToRecordPartial,
  type McpManifest,
  type ManifestVerificationResult,
  type ManifestVerifier,
  type McpVerificationMode,
} from '../../types/mcpManifest';
import type { InstalledPluginRecord, IsolationMode } from '../../types/installedPluginRecord';
import type { InstalledPluginRecordStore } from './installedPluginRecordStore';

export interface InstallPathDeps {
  /** Lazy verifier — constructed once on first install (loads bundled TUF root). */
  verifierFactory: () => Promise<ManifestVerifier>;
  recordStore: InstalledPluginRecordStore;
  /** Default isolation mode for new installs. Honors manifest.runtime.preferred_isolation. */
  defaultIsolationMode?: IsolationMode;
  /** Test clock injection. */
  now?: () => Date;
  /** Audit hook — one event per install attempt (success or reject). */
  audit?: (event: InstallAuditEvent) => void;
}

export interface InstallAuditEvent {
  timestamp: string;
  package_id: string;
  mode: McpVerificationMode;
  outcome: 'installed' | 'rejected';
  verification_status: InstalledPluginRecord['verification_status'];
  reason?: string;
}

export type InstallResult =
  | {
      kind: 'installed';
      record: InstalledPluginRecord;
      verification_status: InstalledPluginRecord['verification_status'];
    }
  | {
      kind: 'rejected';
      reason: 'manifest_schema' | 'identity_mismatch' | 'signature_invalid' | 'unsigned_strict';
      details: string;
    };

export interface InstallArgs {
  manifest: unknown;
  bundle: unknown | null;
  mode: McpVerificationMode;
}

/**
 * Run the full install pipeline. Returns either the persisted record or a
 * rejection with structured reason. Idempotent in the sense that re-installing
 * the same package_id overwrites the prior record (callers wanting upgrade
 * semantics can compare versions before invoking).
 */
export async function installMcpPlugin(
  args: InstallArgs,
  deps: InstallPathDeps
): Promise<InstallResult> {
  const now = deps.now ?? ((): Date => new Date());
  const audit = deps.audit;

  // 1. Schema validation
  const parsed = McpManifestSchema.safeParse(args.manifest);
  if (!parsed.success) {
    const details = parsed.error.message;
    audit?.({
      timestamp: now().toISOString(),
      package_id: '<unknown>',
      mode: args.mode,
      outcome: 'rejected',
      verification_status: 'unverified',
      reason: `manifest_schema: ${details}`,
    });
    return { kind: 'rejected', reason: 'manifest_schema', details };
  }
  const manifest: McpManifest = parsed.data;

  // 2. Verify. No-bundle and mode=off outcomes are deterministic, so avoid
  // loading Sigstore trust material on paths that cannot use it.
  const result: ManifestVerificationResult =
    args.mode === 'off'
      ? { kind: 'unsigned', evidence: { reason: 'mode_off' } }
      : args.bundle === null
        ? { kind: 'unsigned', evidence: { reason: 'no_bundle' } }
        : await (await deps.verifierFactory()).verify(manifest, args.bundle, args.mode);

  // 3. Mode policy (G2 codex: signature without identity policy is theater).
  const policy = applyVerificationPolicy(result, args.mode);
  if (policy.kind === 'rejected') {
    audit?.({
      timestamp: now().toISOString(),
      package_id: manifest.package_id,
      mode: args.mode,
      outcome: 'rejected',
      verification_status: policy.verification_status,
      reason: policy.reason,
    });
    return policy;
  }

  // 4. Build record
  const manifest_digest = sha256Hex(canonicalManifestBytes(manifest));
  const partial = manifestToRecordPartial(manifest, manifest_digest, result);
  const isolation_mode: IsolationMode =
    manifest.runtime.preferred_isolation === 'in_process'
      ? 'in_process'
      : (deps.defaultIsolationMode ?? 'utility_process');

  const record: InstalledPluginRecord = {
    ...partial,
    isolation_mode,
    revocation_status: 'unknown',
    installed_at: now().toISOString(),
    last_revocation_check_at: null,
  };

  // 5. Persist
  deps.recordStore.put(record);
  audit?.({
    timestamp: now().toISOString(),
    package_id: manifest.package_id,
    mode: args.mode,
    outcome: 'installed',
    verification_status: record.verification_status,
  });
  return { kind: 'installed', record, verification_status: record.verification_status };
}

/**
 * Apply the strict/warn/off mode policy to a verification result.
 * Returns either an InstallResult (rejected) for callers to short-circuit,
 * or { kind: 'allow' } when the install should proceed.
 *
 * Exported for unit tests — production callers go through `installMcpPlugin`.
 */
export function applyVerificationPolicy(
  result: ManifestVerificationResult,
  mode: McpVerificationMode
):
  | {
      kind: 'allow';
      verification_status: InstalledPluginRecord['verification_status'];
    }
  | (Extract<InstallResult, { kind: 'rejected' }> & {
      verification_status: InstalledPluginRecord['verification_status'];
    }) {
  if (mode === 'off') {
    return { kind: 'allow', verification_status: 'unverified' };
  }

  if (result.kind === 'verified') {
    return { kind: 'allow', verification_status: 'verified' };
  }

  if (mode === 'warn') {
    // warn allows install regardless of verify outcome — verification_status
    // from result lets the UI render a danger badge.
    const verification_status: InstalledPluginRecord['verification_status'] =
      result.kind === 'identity_mismatch'
        ? 'identity_mismatch'
        : result.kind === 'signature_invalid'
          ? 'signature_invalid'
          : 'unverified';
    return { kind: 'allow', verification_status };
  }

  // strict: reject any non-verified outcome.
  if (result.kind === 'identity_mismatch') {
    return {
      kind: 'rejected',
      reason: 'identity_mismatch',
      details: `expected ${result.evidence.expected_issuer} / ${result.evidence.expected_subject_pattern}; got ${result.evidence.actual_issuer} / ${result.evidence.actual_subject}`,
      verification_status: 'identity_mismatch',
    };
  }
  if (result.kind === 'signature_invalid') {
    return {
      kind: 'rejected',
      reason: 'signature_invalid',
      details: result.evidence.reason,
      verification_status: 'signature_invalid',
    };
  }
  // result.kind === 'unsigned'
  return {
    kind: 'rejected',
    reason: 'unsigned_strict',
    details: result.evidence.reason,
    verification_status: 'unverified',
  };
}

function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Canonical manifest bytes for digest computation. We sort the top-level keys
 * so two semantically-equivalent manifests produce the same digest regardless
 * of source ordering. Nested objects are NOT recursively sorted because the
 * Zod schema is strict — every field has a fixed shape.
 */
function canonicalManifestBytes(manifest: McpManifest): Buffer {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(manifest).sort()) {
    sorted[k] = (manifest as unknown as Record<string, unknown>)[k];
  }
  return Buffer.from(JSON.stringify(sorted), 'utf-8');
}
