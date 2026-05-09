/**
 * manifestVerify — Sigstore-keyless-OIDC verification for MCP manifests.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 2.2 (US-201), gate G2.
 *
 * **Main process only.** Renderer must NEVER import this module — exposing
 * the trust root + Fulcio CA roots to renderer context erodes the trust
 * boundary. Enforced by AC-6.4: this file imports node:fs and node:crypto
 * which is not safe to ship through the preload bundle.
 *
 * Identity policy enforcement (G2 codex tightening — "signature without
 * identity policy is theater"):
 *   - manifest.signing.identity.issuer must equal cert iss claim (URL-equal)
 *   - manifest.signing.identity.subject_pattern (glob) must match cert sub
 *     claim. Glob translation: `*` → `[^/]*`, `**` → `.*`. (npm-style globs.)
 *
 * Mode behavior (G2 resolution):
 *   - strict: identity_mismatch / signature_invalid / unsigned-no-bundle = reject install
 *   - warn:   same conditions = audit-warn-allow
 *   - off:    skip verify entirely (returns kind='unsigned' evidence='mode_off')
 *
 * Offline policy (G2 codex air-gap):
 *   - TUF root + Fulcio cert chain bundled at build (US-202).
 *   - Sigstore bundle (`*.sigstore`) carries inclusion proof inline → no
 *     network call to Rekor required.
 *   - tuf.sigstore.dev is NEVER contacted at runtime.
 */

import {
  Verifier,
  toSignedEntity,
  toTrustMaterial,
  PolicyError,
  VerificationError,
} from '@sigstore/verify';
import type { TrustedRoot } from '@sigstore/protobuf-specs';
import type {
  ManifestVerifier,
  ManifestVerificationResult,
  McpManifest,
  McpVerificationMode,
} from '../../types/mcpManifest';

// Runtime guard: throw if loaded in renderer (defense-in-depth; tsc-level
// import restriction is the primary enforcement).
if (typeof process === 'undefined' || process.type === 'renderer') {
  throw new Error('manifestVerify must only be loaded in the Electron main process');
}

// ────────────────────────────────────────────────────────────
// Glob → RegExp translation for subject_pattern
// ────────────────────────────────────────────────────────────

/**
 * Translate a glob pattern (npm-style) into a RegExp source string suitable
 * for `verifySubjectAlternativeName` which calls `.match(pattern)` internally.
 *
 * - `*` → `[^/]*` (single segment)
 * - `**` → `.*` (multi-segment)
 * - All other regex metacharacters escaped.
 *
 * Anchored ^...$ to avoid prefix-match false positives.
 */
export function globToRegex(glob: string): string {
  let out = '^';
  let i = 0;
  while (i < glob.length) {
    const ch = glob.charAt(i);
    if (ch === '*') {
      if (glob.charAt(i + 1) === '*') {
        out += '.*';
        i += 2;
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (/[.+?^${}()|[\]\\]/.test(ch)) {
      out += '\\' + ch;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  out += '$';
  return out;
}

// ────────────────────────────────────────────────────────────
// Verifier implementation
// ────────────────────────────────────────────────────────────

export interface SigstoreManifestVerifierOptions {
  /** TUF root (parsed) — built from src/main/mcp/sigstoreRoot.json (US-202). */
  trustedRoot: TrustedRoot;
  /** Optional verifier thresholds. Defaults match Sigstore production. */
  tlogThreshold?: number;
  /** Override clock for tests. */
  now?: () => Date;
}

/**
 * SigstoreManifestVerifier — production implementation of `ManifestVerifier`
 * using `@sigstore/verify`. Exported for DI in tests + main process bootstrap.
 */
export class SigstoreManifestVerifier implements ManifestVerifier {
  private readonly verifier: Verifier;
  private readonly now: () => Date;

  constructor(options: SigstoreManifestVerifierOptions) {
    const trustMaterial = toTrustMaterial(options.trustedRoot);
    this.verifier = new Verifier(trustMaterial, {
      tlogThreshold: options.tlogThreshold ?? 1,
    });
    this.now = options.now ?? ((): Date => new Date());
  }

  async verify(
    manifest: McpManifest,
    sigstoreBundle: unknown | null,
    mode: McpVerificationMode
  ): Promise<ManifestVerificationResult> {
    if (mode === 'off') {
      return { kind: 'unsigned', evidence: { reason: 'mode_off' } };
    }
    if (sigstoreBundle === null) {
      return { kind: 'unsigned', evidence: { reason: 'no_bundle' } };
    }

    let signedEntity;
    try {
      // toSignedEntity expects a parsed Bundle protobuf. Caller is responsible
      // for parsing the *.sigstore JSON into the Bundle shape before calling.
      signedEntity = toSignedEntity(sigstoreBundle as Parameters<typeof toSignedEntity>[0]);
    } catch (err) {
      return {
        kind: 'signature_invalid',
        evidence: { reason: `bundle parse failed: ${errMsg(err)}` },
      };
    }

    const policy = {
      subjectAlternativeName: globToRegex(manifest.signing.identity.subject_pattern),
      extensions: { issuer: manifest.signing.identity.issuer },
    };

    let signer;
    try {
      signer = this.verifier.verify(signedEntity, policy);
    } catch (err) {
      if (err instanceof PolicyError) {
        return {
          kind: 'identity_mismatch',
          evidence: {
            expected_issuer: manifest.signing.identity.issuer,
            actual_issuer: extractCertIssuer(err) ?? '<unknown>',
            expected_subject_pattern: manifest.signing.identity.subject_pattern,
            actual_subject: extractCertSubject(err) ?? '<unknown>',
          },
        };
      }
      if (err instanceof VerificationError) {
        return {
          kind: 'signature_invalid',
          evidence: { reason: `${err.code}: ${err.message}` },
        };
      }
      // Unexpected error type — re-throw so caller logs it. Treating it as
      // signature_invalid would silently mask environmental bugs.
      throw err;
    }

    return {
      kind: 'verified',
      evidence: {
        cert_issuer: signer.identity?.extensions?.issuer ?? manifest.signing.identity.issuer,
        cert_subject: signer.identity?.subjectAlternativeName ?? '<unknown>',
        verified_at: this.now().toISOString(),
      },
    };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * PolicyError messages are formatted as
 *   `certificate identity error - expected <pattern>, got <subject>`
 * by `@sigstore/verify`. We parse to surface the actual subject in evidence.
 * Robust: returns null if the format doesn't match (lib upgrade).
 */
function extractCertSubject(err: PolicyError): string | null {
  const m = /got\s+(\S.*)$/.exec(err.message);
  if (m === null) return null;
  const captured = m[1];
  return captured === undefined ? null : captured.trim();
}

function extractCertIssuer(_err: PolicyError): string | null {
  // The issuer-extension PolicyError formats as
  //   `invalid certificate extension - expected issuer=<X>, got issuer=<Y>`
  // We match that branch separately if needed; otherwise the SAN error
  // implies issuer was a match (extensions check happens after SAN).
  return null;
}
