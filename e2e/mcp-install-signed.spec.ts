/**
 * mcp-install-signed e2e (v2.3.0 US-204).
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 2.5, gates G2/G3.
 *
 * Verifies the marketplace install path against Sigstore-signed fixtures:
 *   - install signed plugin via fixture GH Release artifact succeeds in `strict`
 *   - install fails for unsigned in `strict`
 *   - install succeeds (audit-warn) for unsigned in `warn`
 *   - offline-with-bundle install succeeds in `strict` (bundled inclusion proof)
 *
 * **Fixture dependency**: This test needs real `*.sigstore` bundles produced
 * via `gh attestation`. Those don't ship with the repo (require GitHub
 * Actions OIDC token). When the fixture artifact is present at
 * `e2e/fixtures/mcp/sample-fs-mcp/`, the tests run live; otherwise they
 * skip with a TODO marker.
 *
 * To regenerate manifest digest/size: `node scripts/gen-mcp-fixtures.cjs`.
 * To regenerate bundle.sigstore: see e2e/fixtures/mcp/sample-fs-mcp/README.md.
 */

import { test, expect } from './fixtures';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'mcp', 'sample-fs-mcp');
const FIXTURE_MANIFEST = resolve(FIXTURE_DIR, 'manifest.json');
const FIXTURE_BUNDLE = resolve(FIXTURE_DIR, 'bundle.sigstore');
const FIXTURE_AVAILABLE = existsSync(FIXTURE_MANIFEST);
const BUNDLE_AVAILABLE = FIXTURE_AVAILABLE && existsSync(FIXTURE_BUNDLE);

/**
 * Browser-side install IPC invoker. Runs inside `window.evaluate` so the
 * playwright Page evaluates the call against the renderer's window.dreampia
 * bridge (typed in src/main/preload.ts). The cast is local to keep the e2e
 * spec free of preload type imports (which pull in a large transitive graph).
 */
async function callInstall(
  page: import('@playwright/test').Page,
  args: { manifest: unknown; bundle: unknown | null; mode: 'strict' | 'warn' | 'off' }
): Promise<
  | { ok: true; value: { kind: string; verification_status?: string; package_id?: string } }
  | { ok: false; error: string }
> {
  return page.evaluate(async (a) => {
    const w = window as unknown as {
      dreampia?: {
        mcp?: {
          install?: (input: unknown) => Promise<
            | { ok: true; value: { kind: string; verification_status?: string; package_id?: string } }
            | { ok: false; error: string }
          >;
        };
      };
    };
    const fn = w.dreampia?.mcp?.install;
    if (fn === undefined) {
      return { ok: false as const, error: 'install IPC unavailable' };
    }
    return fn(a);
  }, args);
}

test.describe('v2.3.0 US-204 — MCP signed install', () => {
  test.skip(
    !FIXTURE_AVAILABLE,
    'Sigstore manifest fixture not present (run scripts/gen-mcp-fixtures.cjs)'
  );

  test('signed plugin installs in strict mode', async ({ window }) => {
    test.skip(
      !BUNDLE_AVAILABLE,
      'bundle.sigstore not present — see e2e/fixtures/mcp/sample-fs-mcp/README.md'
    );
    const manifest = JSON.parse(readFileSync(FIXTURE_MANIFEST, 'utf-8'));
    const bundle = JSON.parse(readFileSync(FIXTURE_BUNDLE, 'utf-8'));
    const result = await callInstall(window, { manifest, bundle, mode: 'strict' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('installed');
      expect(result.value.verification_status).toBe('verified');
      expect(result.value.package_id).toBe('@eonofpixel/sample-fs-mcp');
    }
  });

  test('unsigned plugin fails in strict', async ({ window }) => {
    const manifest = JSON.parse(readFileSync(FIXTURE_MANIFEST, 'utf-8'));
    const result = await callInstall(window, { manifest, bundle: null, mode: 'strict' });
    // strict + no bundle → install rejects (returns ok=true with kind='rejected').
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('rejected');
    }
  });

  test('unsigned plugin allowed with warning in warn mode', async ({ window }) => {
    const manifest = JSON.parse(readFileSync(FIXTURE_MANIFEST, 'utf-8'));
    const result = await callInstall(window, { manifest, bundle: null, mode: 'warn' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('installed');
      // unverified status because no bundle, but install allowed.
      expect(result.value.verification_status).toBe('unverified');
    }
  });

  test('offline-with-bundle install succeeds in strict', async ({ window }) => {
    test.skip(
      !BUNDLE_AVAILABLE,
      'bundle.sigstore not present — see e2e/fixtures/mcp/sample-fs-mcp/README.md'
    );
    // Block tuf.sigstore.dev / Rekor — bundle's inclusion proof must satisfy verify.
    await window.context().route('**/tuf-repo-cdn.sigstore.dev/**', (route) => route.abort());
    await window.context().route('**/rekor.sigstore.dev/**', (route) => route.abort());

    const manifest = JSON.parse(readFileSync(FIXTURE_MANIFEST, 'utf-8'));
    const bundle = JSON.parse(readFileSync(FIXTURE_BUNDLE, 'utf-8'));
    const result = await callInstall(window, { manifest, bundle, mode: 'strict' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('installed');
      expect(result.value.verification_status).toBe('verified');
    }
  });
});
