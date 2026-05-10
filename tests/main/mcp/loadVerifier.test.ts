/**
 * loadVerifier tests (v2.4.0 Task 2).
 *
 * Coverage:
 *   - Singleton caching: subsequent calls return same instance
 *   - Resolves trusted root from `<here>/sigstoreRoot.json`
 *   - __resetVerifierCache forces reload on next call
 *
 * Note: this test imports loadVerifier from src/, so `here` resolves to
 * `src/main/mcp/` and the JSON it reads is the source-tree sigstoreRoot.json
 * refreshed via scripts/refresh-sigstore-root.cjs. Production runs use the
 * dist copy made by scripts/copy-build-assets.cjs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSigstoreVerifier,
  __resetVerifierCache,
} from '../../../src/main/mcp/loadVerifier';

beforeEach(() => {
  __resetVerifierCache();
});

describe('v2.4.0 Task 2 — loadSigstoreVerifier', () => {
  it('returns a verifier with verify() method', async () => {
    const v = await loadSigstoreVerifier();
    expect(v).toBeDefined();
    expect(typeof v.verify).toBe('function');
  });

  it('caches the verifier across calls (singleton)', async () => {
    const a = await loadSigstoreVerifier();
    const b = await loadSigstoreVerifier();
    expect(a).toBe(b);
  });

  it('__resetVerifierCache forces reload', async () => {
    const a = await loadSigstoreVerifier();
    __resetVerifierCache();
    const b = await loadSigstoreVerifier();
    expect(a).not.toBe(b);
  });

  it('verify(unsigned, null bundle, off mode) returns kind=unsigned with mode_off evidence', async () => {
    const v = await loadSigstoreVerifier();
    const result = await v.verify(
      {
        schema_version: 1,
        package_id: 'a',
        name: 'a',
        version: '1.0.0',
        capabilities: [],
        entrypoint: { file: 'a.js', artifact_digest: 'a'.repeat(64), artifact_size_bytes: 1 },
        signing: {
          method: 'sigstore-keyless-oidc',
          identity: { issuer: 'https://x.example.com', subject_pattern: '*' },
        },
        runtime: { node: '*', requires_native_modules: false },
      },
      null,
      'off'
    );
    expect(result.kind).toBe('unsigned');
    if (result.kind === 'unsigned') {
      expect(result.evidence.reason).toBe('mode_off');
    }
  });

  it('verify(any, null bundle, strict mode) returns kind=unsigned with no_bundle evidence', async () => {
    const v = await loadSigstoreVerifier();
    const result = await v.verify(
      {
        schema_version: 1,
        package_id: 'a',
        name: 'a',
        version: '1.0.0',
        capabilities: [],
        entrypoint: { file: 'a.js', artifact_digest: 'a'.repeat(64), artifact_size_bytes: 1 },
        signing: {
          method: 'sigstore-keyless-oidc',
          identity: { issuer: 'https://x.example.com', subject_pattern: '*' },
        },
        runtime: { node: '*', requires_native_modules: false },
      },
      null,
      'strict'
    );
    expect(result.kind).toBe('unsigned');
    if (result.kind === 'unsigned') {
      expect(result.evidence.reason).toBe('no_bundle');
    }
  });
});
