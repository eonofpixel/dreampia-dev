/**
 * loadVerifier — lazy SigstoreManifestVerifier construction (v2.4.0 Task 2).
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 2.5 (US-204), gates G2.
 *
 * Loads the bundled TUF root from `dist/main/mcp/sigstoreRoot.json` (copied
 * via scripts/copy-build-assets.cjs at build time) and constructs a
 * `SigstoreManifestVerifier` once per process. Subsequent calls return the
 * cached instance.
 *
 * The runtime app NEVER contacts tuf.sigstore.dev — the bundled root is the
 * trust anchor (refreshed at release time via scripts/refresh-sigstore-root.cjs).
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrustedRoot } from '@sigstore/protobuf-specs';
import type { ManifestVerifier } from '../../types/mcpManifest';

let cached: ManifestVerifier | null = null;

/**
 * Returns the singleton verifier. First call reads + parses the bundled
 * sigstoreRoot.json. Subsequent calls reuse the cached instance.
 *
 * Thrown errors propagate — caller (IPC handler) maps to Result<T> failure.
 */
export async function loadSigstoreVerifier(): Promise<ManifestVerifier> {
  if (cached !== null) return cached;
  const { SigstoreManifestVerifier } = await import('./manifestVerify');
  const trustedRoot = loadTrustedRoot();
  cached = new SigstoreManifestVerifier({ trustedRoot });
  return cached;
}

function loadTrustedRoot(): TrustedRoot {
  // Build layout (copy-build-assets.cjs): sigstoreRoot.json sits beside this
  // module at dist/main/mcp/sigstoreRoot.json. Dev/test runs find the source
  // at src/main/mcp/sigstoreRoot.json. Same relative resolution either way.
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'sigstoreRoot.json');
  const raw = readFileSync(path, 'utf-8');
  // The serialized JSON encodes protobuf bytes fields (e.g. publicKey.rawBytes)
  // as base64 strings. JSON.parse leaves them as strings, but @sigstore/verify's
  // toTrustMaterial expects Uint8Array. Use the protobuf-specs TrustedRoot.fromJSON
  // helper which performs the base64 → Uint8Array conversion + nested type rehydration.
  return TrustedRoot.fromJSON(JSON.parse(raw));
}

/**
 * Test helper — reset the cached verifier so a subsequent call reloads the
 * trusted root. Production code must NEVER call this.
 */
export function __resetVerifierCache(): void {
  cached = null;
}
