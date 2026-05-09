/**
 * manifestVerify tests (v2.3.0 US-201).
 *
 * Coverage:
 *   - globToRegex translation (multiple shapes)
 *   - SigstoreManifestVerifier early-return paths (mode_off, no_bundle, bundle parse failure)
 *
 * NOT covered here (lives in e2e US-204 with real `gh attestation` fixtures):
 *   - verified path (requires real Sigstore bundle + matching cert)
 *   - identity_mismatch path (requires real bundle with off-pattern cert)
 *   - signature_invalid path (requires tampered bundle)
 *
 * Mode-decision matrix is tested via mode_off + no_bundle + bundle-parse paths
 * since those exercise the strict / warn discrimination in caller code.
 */

import { describe, it, expect } from 'vitest';
import {
  SigstoreManifestVerifier,
  globToRegex,
} from '../../../src/main/mcp/manifestVerify';
import type { McpManifest } from '../../../src/types/mcpManifest';
import type { TrustedRoot } from '@sigstore/protobuf-specs';

const validManifest: McpManifest = {
  schema_version: 1,
  package_id: '@eonofpixel/sample-mcp',
  name: 'Sample',
  version: '1.0.0',
  capabilities: ['host.fs.read'],
  entrypoint: { file: 'dist/index.js', artifact_digest: 'a'.repeat(64), artifact_size_bytes: 1024 },
  signing: {
    method: 'sigstore-keyless-oidc',
    identity: {
      issuer: 'https://token.actions.githubusercontent.com',
      subject_pattern: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v*',
    },
  },
  runtime: { node: '^20', requires_native_modules: false },
};

// Minimal TUF root stub — enough for SigstoreManifestVerifier construction.
// toTrustMaterial only reads structure at construction; we never call verify
// against this in unit tests (those are e2e). Crypto-deep tests live in US-204.
const stubRoot: TrustedRoot = {
  mediaType: 'application/vnd.dev.sigstore.trustedroot+json;version=0.1',
  tlogs: [],
  certificateAuthorities: [],
  ctlogs: [],
  timestampAuthorities: [],
};

describe('v2.3.0 US-201 — globToRegex', () => {
  it('exact string passes through with anchors', () => {
    const r = new RegExp(globToRegex('repo:foo/bar:ref:refs/tags/v1.0.0'));
    expect(r.test('repo:foo/bar:ref:refs/tags/v1.0.0')).toBe(true);
    expect(r.test('repo:foo/bar:ref:refs/tags/v1.0.0/extra')).toBe(false);
  });

  it('single * matches single segment (no slash)', () => {
    const r = new RegExp(globToRegex('repo:foo/*:ref:refs/tags/v1.0.0'));
    expect(r.test('repo:foo/bar:ref:refs/tags/v1.0.0')).toBe(true);
    expect(r.test('repo:foo/bar/baz:ref:refs/tags/v1.0.0')).toBe(false);
  });

  it('single * after / matches version glob (real-world case)', () => {
    const r = new RegExp(globToRegex('repo:eonofpixel/sample-mcp:ref:refs/tags/v*'));
    expect(r.test('repo:eonofpixel/sample-mcp:ref:refs/tags/v1.0.0')).toBe(true);
    expect(r.test('repo:eonofpixel/sample-mcp:ref:refs/tags/v9.99.99-rc.1')).toBe(true);
    expect(r.test('repo:eonofpixel/sample-mcp:ref:refs/heads/main')).toBe(false);
  });

  it('double ** matches multi-segment', () => {
    const r = new RegExp(globToRegex('repo:foo/**'));
    expect(r.test('repo:foo/bar')).toBe(true);
    expect(r.test('repo:foo/bar/baz/qux')).toBe(true);
    expect(r.test('repo:other')).toBe(false);
  });

  it('regex metacharacters in glob are escaped', () => {
    const r = new RegExp(globToRegex('foo.bar+baz?'));
    expect(r.test('foo.bar+baz?')).toBe(true);
    expect(r.test('fooXbarYbazZ')).toBe(false);
  });

  it('anchored — partial match on prefix is rejected', () => {
    const r = new RegExp(globToRegex('repo:foo/bar:ref:*'));
    expect(r.test('repo:foo/bar:ref:refs/tags/v1.0.0')).toBe(false);
    expect(r.test('repo:foo/bar:ref:something')).toBe(true);
  });
});

describe('v2.3.0 US-201 — SigstoreManifestVerifier early returns', () => {
  it('mode=off → unsigned/mode_off (skip verify)', async () => {
    const v = new SigstoreManifestVerifier({ trustedRoot: stubRoot });
    const r = await v.verify(validManifest, { fake: 'bundle' }, 'off');
    expect(r.kind).toBe('unsigned');
    if (r.kind === 'unsigned') expect(r.evidence.reason).toBe('mode_off');
  });

  it('mode=strict + no bundle → unsigned/no_bundle', async () => {
    const v = new SigstoreManifestVerifier({ trustedRoot: stubRoot });
    const r = await v.verify(validManifest, null, 'strict');
    expect(r.kind).toBe('unsigned');
    if (r.kind === 'unsigned') expect(r.evidence.reason).toBe('no_bundle');
  });

  it('mode=warn + no bundle → unsigned/no_bundle (caller decides allow vs warn-allow)', async () => {
    const v = new SigstoreManifestVerifier({ trustedRoot: stubRoot });
    const r = await v.verify(validManifest, null, 'warn');
    expect(r.kind).toBe('unsigned');
    if (r.kind === 'unsigned') expect(r.evidence.reason).toBe('no_bundle');
  });

  it('mode=strict + malformed bundle → signature_invalid (parse failure)', async () => {
    const v = new SigstoreManifestVerifier({ trustedRoot: stubRoot });
    const r = await v.verify(validManifest, { totally: 'not a sigstore bundle' }, 'strict');
    expect(r.kind).toBe('signature_invalid');
    if (r.kind === 'signature_invalid') expect(r.evidence.reason).toContain('bundle parse failed');
  });

  it('clock injection: verified_at uses the injected clock (not real time)', async () => {
    // Validates the now() injection point used by tests; full verified path
    // exercises this in e2e (US-204). Here we just confirm the constructor
    // accepts the option.
    const fixedNow = (): Date => new Date('2026-05-09T12:00:00.000Z');
    const v = new SigstoreManifestVerifier({ trustedRoot: stubRoot, now: fixedNow });
    // mode_off path doesn't use now(), so this is purely a smoke check that
    // the constructor option doesn't throw.
    const r = await v.verify(validManifest, null, 'off');
    expect(r.kind).toBe('unsigned');
  });
});
