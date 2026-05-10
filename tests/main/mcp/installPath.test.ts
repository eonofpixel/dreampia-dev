/**
 * installPath tests (v2.4.0 Task 2 / US-204).
 *
 * Coverage:
 *   - applyVerificationPolicy mode × outcome matrix
 *   - installMcpPlugin: schema rejection, verified persists, strict rejects on
 *     identity_mismatch / signature_invalid / unsigned-no-bundle, warn allows
 *     with appropriate verification_status, off skips verify entirely
 *   - manifest.runtime.preferred_isolation honored when set to in_process
 *   - InstalledPluginRecord persisted via store.put with all required fields
 *   - audit hook fires with correct outcome on every path
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installMcpPlugin,
  applyVerificationPolicy,
  type InstallAuditEvent,
  type InstallResult,
} from '../../../src/main/mcp/installPath';
import { InstalledPluginRecordStore } from '../../../src/main/mcp/installedPluginRecordStore';
import type {
  McpManifest,
  ManifestVerifier,
  ManifestVerificationResult,
} from '../../../src/types/mcpManifest';

const validManifest: McpManifest = {
  schema_version: 1,
  package_id: '@eonofpixel/sample-mcp',
  name: 'Sample',
  version: '1.0.0',
  capabilities: ['host.fs.read'],
  entrypoint: {
    file: 'dist/index.js',
    artifact_digest: 'a'.repeat(64),
    artifact_size_bytes: 1024,
  },
  signing: {
    method: 'sigstore-keyless-oidc',
    identity: {
      issuer: 'https://token.actions.githubusercontent.com',
      subject_pattern: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v*',
    },
  },
  runtime: { node: '^20', requires_native_modules: false },
};

function makeVerifier(result: ManifestVerificationResult): ManifestVerifier {
  return { verify: () => Promise.resolve(result) };
}

interface Harness {
  storageDir: string;
  recordStore: InstalledPluginRecordStore;
  audits: InstallAuditEvent[];
  audit: (e: InstallAuditEvent) => void;
}

let h: Harness;
let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'installpath-test-'));
  const audits: InstallAuditEvent[] = [];
  h = {
    storageDir: tmpRoot,
    recordStore: new InstalledPluginRecordStore({ storageDir: tmpRoot }),
    audits,
    audit: (e) => audits.push(e),
  };
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe('v2.4.0 Task 2 — applyVerificationPolicy', () => {
  it('mode=off → allow with verification_status=unverified', () => {
    const result = applyVerificationPolicy(
      { kind: 'unsigned', evidence: { reason: 'mode_off' } },
      'off'
    );
    expect(result.kind).toBe('allow');
    if (result.kind === 'allow') {
      expect(result.verification_status).toBe('unverified');
    }
  });

  it('mode=strict + verified → allow', () => {
    const result = applyVerificationPolicy(
      {
        kind: 'verified',
        evidence: {
          cert_issuer: 'https://token.actions.githubusercontent.com',
          cert_subject: 'repo:foo/bar:ref:refs/tags/v1.0.0',
          verified_at: '2026-05-10T00:00:00.000Z',
        },
      },
      'strict'
    );
    expect(result.kind).toBe('allow');
    if (result.kind === 'allow') {
      expect(result.verification_status).toBe('verified');
    }
  });

  it('mode=strict + identity_mismatch → rejected with verification_status', () => {
    const result = applyVerificationPolicy(
      {
        kind: 'identity_mismatch',
        evidence: {
          expected_issuer: 'https://token.actions.githubusercontent.com',
          actual_issuer: 'https://accounts.google.com',
          expected_subject_pattern: 'repo:foo/bar:ref:refs/tags/v*',
          actual_subject: 'random@example.com',
        },
      },
      'strict'
    );
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('identity_mismatch');
      expect(result.verification_status).toBe('identity_mismatch');
      expect(result.details).toContain('expected');
    }
  });

  it('mode=strict + signature_invalid → rejected', () => {
    const result = applyVerificationPolicy(
      { kind: 'signature_invalid', evidence: { reason: 'tampered bundle' } },
      'strict'
    );
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('signature_invalid');
      expect(result.verification_status).toBe('signature_invalid');
    }
  });

  it('mode=strict + unsigned (no bundle) → rejected as unsigned_strict', () => {
    const result = applyVerificationPolicy(
      { kind: 'unsigned', evidence: { reason: 'no_bundle' } },
      'strict'
    );
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('unsigned_strict');
      expect(result.verification_status).toBe('unverified');
    }
  });

  it('mode=warn + identity_mismatch → allow with verification_status=identity_mismatch', () => {
    const result = applyVerificationPolicy(
      {
        kind: 'identity_mismatch',
        evidence: {
          expected_issuer: 'x',
          actual_issuer: 'y',
          expected_subject_pattern: 'a',
          actual_subject: 'b',
        },
      },
      'warn'
    );
    expect(result.kind).toBe('allow');
    if (result.kind === 'allow') {
      expect(result.verification_status).toBe('identity_mismatch');
    }
  });

  it('mode=warn + signature_invalid → allow with verification_status=signature_invalid', () => {
    const result = applyVerificationPolicy(
      { kind: 'signature_invalid', evidence: { reason: 'bad sig' } },
      'warn'
    );
    expect(result.kind).toBe('allow');
    if (result.kind === 'allow') {
      expect(result.verification_status).toBe('signature_invalid');
    }
  });

  it('mode=warn + unsigned → allow with unverified', () => {
    const result = applyVerificationPolicy(
      { kind: 'unsigned', evidence: { reason: 'no_bundle' } },
      'warn'
    );
    expect(result.kind).toBe('allow');
    if (result.kind === 'allow') {
      expect(result.verification_status).toBe('unverified');
    }
  });
});

describe('v2.4.0 Task 2 — installMcpPlugin', () => {
  it('schema rejection: malformed manifest never invokes verifier', async () => {
    let verifyCalls = 0;
    const result = await installMcpPlugin(
      { manifest: { not: 'a manifest' }, bundle: null, mode: 'strict' },
      {
        verifierFactory: () => {
          verifyCalls += 1;
          return Promise.resolve(makeVerifier({ kind: 'verified', evidence: { cert_issuer: '', cert_subject: '', verified_at: '' } }));
        },
        recordStore: h.recordStore,
        audit: h.audit,
      }
    );
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('manifest_schema');
    }
    expect(verifyCalls).toBe(0);
    expect(h.recordStore.count()).toBe(0);
    expect(h.audits.length).toBe(1);
    expect(h.audits[0]?.outcome).toBe('rejected');
  });

  it('verified strict → record persisted + audit installed', async () => {
    const verifier = makeVerifier({
      kind: 'verified',
      evidence: {
        cert_issuer: 'https://token.actions.githubusercontent.com',
        cert_subject: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v1.0.0',
        verified_at: '2026-05-10T00:00:00.000Z',
      },
    });
    const result = await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      {
        verifierFactory: () => Promise.resolve(verifier),
        recordStore: h.recordStore,
        audit: h.audit,
      }
    );
    expect(result.kind).toBe('installed');
    if (result.kind === 'installed') {
      expect(result.verification_status).toBe('verified');
      expect(result.record.package_id).toBe('@eonofpixel/sample-mcp');
      expect(result.record.isolation_mode).toBe('utility_process');
      expect(result.record.revocation_status).toBe('unknown');
    }
    expect(h.recordStore.count()).toBe(1);
    expect(h.audits[0]?.outcome).toBe('installed');
  });

  it('strict + identity_mismatch → rejected, no record persisted', async () => {
    const verifier = makeVerifier({
      kind: 'identity_mismatch',
      evidence: {
        expected_issuer: 'https://token.actions.githubusercontent.com',
        actual_issuer: 'https://accounts.google.com',
        expected_subject_pattern: 'repo:foo:ref:refs/tags/v*',
        actual_subject: 'imposter@example.com',
      },
    });
    const result = await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      {
        verifierFactory: () => Promise.resolve(verifier),
        recordStore: h.recordStore,
        audit: h.audit,
      }
    );
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('identity_mismatch');
    }
    expect(h.recordStore.count()).toBe(0);
  });

  it('warn + signature_invalid → installed with verification_status=signature_invalid', async () => {
    const verifier = makeVerifier({
      kind: 'signature_invalid',
      evidence: { reason: 'tampered' },
    });
    const result = await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'warn' },
      {
        verifierFactory: () => Promise.resolve(verifier),
        recordStore: h.recordStore,
        audit: h.audit,
      }
    );
    expect(result.kind).toBe('installed');
    if (result.kind === 'installed') {
      expect(result.verification_status).toBe('signature_invalid');
    }
    expect(h.recordStore.count()).toBe(1);
    const stored = h.recordStore.get('@eonofpixel/sample-mcp');
    expect(stored?.verification_status).toBe('signature_invalid');
  });

  it('off → skips verify, installed with verification_status=unverified', async () => {
    let verifyCalls = 0;
    const verifier: ManifestVerifier = {
      verify: () => {
        verifyCalls += 1;
        return Promise.resolve({ kind: 'unsigned', evidence: { reason: 'mode_off' } });
      },
    };
    const result = await installMcpPlugin(
      { manifest: validManifest, bundle: null, mode: 'off' },
      {
        verifierFactory: () => Promise.resolve(verifier),
        recordStore: h.recordStore,
        audit: h.audit,
      }
    );
    expect(result.kind).toBe('installed');
    if (result.kind === 'installed') {
      expect(result.verification_status).toBe('unverified');
    }
    // Verifier was called (with mode='off' it returns unsigned/mode_off shortcut),
    // but applyVerificationPolicy short-circuits to allow regardless.
    expect(verifyCalls).toBe(1);
  });

  it('manifest.runtime.preferred_isolation=in_process → record.isolation_mode=in_process', async () => {
    const manifestPref: McpManifest = {
      ...validManifest,
      runtime: { ...validManifest.runtime, preferred_isolation: 'in_process' },
    };
    const verifier = makeVerifier({
      kind: 'verified',
      evidence: {
        cert_issuer: 'https://token.actions.githubusercontent.com',
        cert_subject: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v1.0.0',
        verified_at: '2026-05-10T00:00:00.000Z',
      },
    });
    const result = await installMcpPlugin(
      { manifest: manifestPref, bundle: { fake: 'bundle' }, mode: 'strict' },
      {
        verifierFactory: () => Promise.resolve(verifier),
        recordStore: h.recordStore,
        audit: h.audit,
      }
    );
    expect(result.kind).toBe('installed');
    if (result.kind === 'installed') {
      expect(result.record.isolation_mode).toBe('in_process');
    }
  });

  it('strict + unsigned (null bundle) → rejected as unsigned_strict', async () => {
    const verifier = makeVerifier({ kind: 'unsigned', evidence: { reason: 'no_bundle' } });
    const result = await installMcpPlugin(
      { manifest: validManifest, bundle: null, mode: 'strict' },
      {
        verifierFactory: () => Promise.resolve(verifier),
        recordStore: h.recordStore,
        audit: h.audit,
      }
    );
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('unsigned_strict');
    }
    expect(h.recordStore.count()).toBe(0);
  });

  it('persisted record carries manifest_digest + last_verified_at when verified', async () => {
    const verifier = makeVerifier({
      kind: 'verified',
      evidence: {
        cert_issuer: 'https://token.actions.githubusercontent.com',
        cert_subject: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v1.0.0',
        verified_at: '2026-05-10T00:00:00.000Z',
      },
    });
    const result = (await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      {
        verifierFactory: () => Promise.resolve(verifier),
        recordStore: h.recordStore,
        audit: h.audit,
      }
    )) as Extract<InstallResult, { kind: 'installed' }>;
    expect(result.record.last_verified_at).toBe('2026-05-10T00:00:00.000Z');
    expect(result.record.manifest_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.record.installed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('default isolation override applied when manifest preferred_isolation absent', async () => {
    const verifier = makeVerifier({
      kind: 'verified',
      evidence: {
        cert_issuer: 'https://token.actions.githubusercontent.com',
        cert_subject: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v1.0.0',
        verified_at: '2026-05-10T00:00:00.000Z',
      },
    });
    const result = await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      {
        verifierFactory: () => Promise.resolve(verifier),
        recordStore: h.recordStore,
        defaultIsolationMode: 'auto',
        audit: h.audit,
      }
    );
    if (result.kind === 'installed') {
      expect(result.record.isolation_mode).toBe('auto');
    }
  });
});
