/**
 * McpManifest — declarative metadata for an installable MCP server.
 *
 * v2.3.0 introduces this manifest as the artifact a publisher signs (via Sigstore
 * keyless OIDC) and a static registry references. Manifest is the *only* thing
 * required to install + verify; the entrypoint is a separate artifact whose digest
 * the manifest binds.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 1.1 (US-101), gate G2.
 *
 * Design constraints:
 *   - This module defines the *verifier interface* (`ManifestVerifier`) but NOT
 *     the implementation. ADR-0006 Sigstore verify lands in src/main/mcp/manifestVerify.ts
 *     during Phase 2.2 (US-201). Phase 1 must remain Sigstore-import-free so that
 *     the @sigstore/verify spike (US-200) can independently fail without blocking
 *     Phase 1 work. (codex consolidation: "Phase 1 verifier interface is decoupled".)
 *   - signing.identity is the *publisher claim* — what the publisher promises the
 *     Sigstore cert will say. Verification matches actual cert claims against this
 *     promise. Mismatch in `strict` mode = reject (G2 codex tightening: "signature
 *     without identity policy is theater").
 */

import { z } from 'zod';
import type { InstalledPluginRecord } from './installedPluginRecord';

// ────────────────────────────────────────────────────────────
// Sub-schemas
// ────────────────────────────────────────────────────────────

const Sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Must be lowercase 64-char sha256 hex');

const SemverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    'Must be semver',
  );

const PackageIdSchema = z
  .string()
  .min(1)
  .max(214)
  .regex(/^(@[a-zA-Z0-9][a-zA-Z0-9_-]*\/)?[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Invalid package id');

/**
 * Capability string. Free-form for now (e.g. `host.fs.read`, `host.audit.write`,
 * `host.session.subscribe`). McpCapabilityGate validates against host-side
 * registry of known capabilities at grant time.
 */
const CapabilitySchema = z.string().min(1).max(128).regex(/^[a-z]+(\.[a-z_]+)+$/);

/**
 * Signing method. Only `sigstore-keyless-oidc` for v2.3.0. Future methods (e.g.
 * `pgp`, `ed25519-static`) require ADR + manifest schema migration.
 */
const SigningMethodSchema = z.enum(['sigstore-keyless-oidc']);

/**
 * Identity policy claim — what the publisher promises about the Sigstore cert.
 * verifier compares actual cert.iss vs promised issuer (URL-equal) and
 * actual cert.sub vs promised subject_pattern (glob match).
 *
 * Examples:
 *   - issuer: "https://token.actions.githubusercontent.com"
 *   - subject_pattern: "repo:eonofpixel/sample-plugin:ref:refs/tags/v*"
 */
const SigningIdentitySchema = z
  .object({
    issuer: z.string().url(),
    subject_pattern: z.string().min(1).max(512),
  })
  .strict();

const SigningSchema = z
  .object({
    method: SigningMethodSchema,
    identity: SigningIdentitySchema,
  })
  .strict();

/**
 * Runtime metadata. Used by host to decide isolation_mode default and to surface
 * incompatibility warnings (e.g. "this plugin requires native modules; consider
 * setting isolation_mode = in_process").
 */
const RuntimeSchema = z
  .object({
    /** Node major version range plugin supports (e.g. "^18.0.0 || ^20.0.0"). */
    node: z.string().min(1).max(128),
    /** True if plugin uses native (.node) modules — affects utility_process compat. */
    requires_native_modules: z.boolean().default(false),
    /** Plugin-declared default isolation. Host honors as suggestion only. */
    preferred_isolation: z.enum(['utility_process', 'in_process']).optional(),
  })
  .strict();

/**
 * Entrypoint metadata — describes the runnable artifact the manifest binds.
 */
const EntrypointSchema = z
  .object({
    /** Filename within the artifact tarball (e.g. "dist/index.js"). */
    file: z.string().min(1).max(256),
    /** sha256 of the artifact tarball. Verifier confirms before extraction. */
    artifact_digest: Sha256HexSchema,
    /** Bytes of the artifact tarball. Sanity check; does not replace digest. */
    artifact_size_bytes: z.number().int().positive().max(50 * 1024 * 1024),
  })
  .strict();

// ────────────────────────────────────────────────────────────
// Main schema
// ────────────────────────────────────────────────────────────

export const McpManifestSchema = z
  .object({
    /** Manifest schema version. Bump on breaking changes. v2.3.0 ships v1. */
    schema_version: z.literal(1),
    package_id: PackageIdSchema,
    name: z.string().min(1).max(128),
    version: SemverSchema,
    description: z.string().max(2048).optional(),
    capabilities: z.array(CapabilitySchema).min(0).max(64),
    entrypoint: EntrypointSchema,
    signing: SigningSchema,
    runtime: RuntimeSchema,
  })
  .strict();

export type McpManifest = z.infer<typeof McpManifestSchema>;

// ────────────────────────────────────────────────────────────
// Verifier interface (implementation lands in Phase 2.2 / US-201)
// ────────────────────────────────────────────────────────────

/**
 * Outcome of a manifest verification attempt. The `evidence` field carries
 * provenance (cert subject, issuer, log index) for audit log + UI surface.
 */
export type ManifestVerificationResult =
  | {
      kind: 'verified';
      evidence: {
        cert_issuer: string;
        cert_subject: string;
        rekor_log_index?: number;
        verified_at: string;
      };
    }
  | {
      kind: 'identity_mismatch';
      evidence: {
        expected_issuer: string;
        actual_issuer: string;
        expected_subject_pattern: string;
        actual_subject: string;
      };
    }
  | {
      kind: 'signature_invalid';
      evidence: {
        reason: string;
      };
    }
  | {
      kind: 'unsigned';
      evidence: {
        reason: 'no_bundle' | 'mode_off';
      };
    };

/**
 * mcpVerificationMode — set by user in settings (G2 resolution).
 * Default `strict`. Verifier behavior:
 *   - strict: identity_mismatch / signature_invalid / unsigned-no-bundle = reject install
 *   - warn: same conditions = audit-warn-allow
 *   - off: skip verify entirely (returns kind='unsigned' evidence='mode_off')
 */
export type McpVerificationMode = 'strict' | 'warn' | 'off';

/**
 * ManifestVerifier — implementation injected by Phase 2.2.
 *
 * Phase 1 code that needs to *invoke* verification depends on this interface,
 * not on the Sigstore implementation. This keeps Phase 1 (US-101..US-105)
 * parallel-safe with the @sigstore/verify spike (US-200).
 */
export interface ManifestVerifier {
  /**
   * Verify a manifest against an attached Sigstore bundle (or absence thereof).
   *
   * @param manifest parsed McpManifest (must have passed schema validation prior)
   * @param sigstoreBundle raw Sigstore bundle JSON, or null if unsigned
   * @param mode user-selected verification mode
   * @returns verification result; caller decides install/reject based on mode
   */
  verify(
    manifest: McpManifest,
    sigstoreBundle: unknown | null,
    mode: McpVerificationMode,
  ): Promise<ManifestVerificationResult>;
}

/**
 * Project a verified manifest + verification result into the partial fields of
 * an InstalledPluginRecord that this layer is responsible for. The caller fills
 * in install-time-only fields (installed_at, isolation_mode, revocation_status).
 */
export function manifestToRecordPartial(
  manifest: McpManifest,
  manifestDigest: string,
  result: ManifestVerificationResult,
): Pick<
  InstalledPluginRecord,
  'package_id' | 'publisher_id' | 'version' | 'artifact_digest' | 'manifest_digest' | 'verification_status' | 'last_verified_at'
> {
  const publisher_id =
    result.kind === 'verified'
      ? `${new URL(result.evidence.cert_issuer).host}:${result.evidence.cert_subject}`
      : `${new URL(manifest.signing.identity.issuer).host}:${manifest.signing.identity.subject_pattern}`;

  const verification_status: InstalledPluginRecord['verification_status'] =
    result.kind === 'verified'
      ? 'verified'
      : result.kind === 'identity_mismatch'
        ? 'identity_mismatch'
        : result.kind === 'signature_invalid'
          ? 'signature_invalid'
          : 'unverified';

  const last_verified_at = result.kind === 'verified' ? result.evidence.verified_at : null;

  return {
    package_id: manifest.package_id,
    publisher_id,
    version: manifest.version,
    artifact_digest: manifest.entrypoint.artifact_digest,
    manifest_digest: manifestDigest,
    verification_status,
    last_verified_at,
  };
}
