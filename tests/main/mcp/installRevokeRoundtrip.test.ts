/**
 * install → revoke → listInstalled roundtrip integration test (v2.4.0).
 *
 * Exercises the v2.4.0 wiring at the module-composition layer (without IPC
 * boundaries) to verify the contract that:
 *   1. installMcpPlugin persists a record with revocation_status='unknown'
 *   2. recordStore.listAll surfaces it
 *   3. McpCapabilityGate.revokeOne bumps grant_epoch synchronously
 *   4. Sync of revocation_status='revoked' on the record (the responsibility
 *      of the mcp/request-revoke IPC handler) makes it visible to listAll
 *
 * This closes the gap between unit tests (one module each) and e2e tests
 * (require real Electron + display). When the IPC layer is exercised, the
 * same underlying composition runs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installMcpPlugin } from '../../../src/main/mcp/installPath';
import { InstalledPluginRecordStore } from '../../../src/main/mcp/installedPluginRecordStore';
import { McpCapabilityGate } from '../../../src/main/mcp/McpCapabilityGate';
import type { McpManifest, ManifestVerifier } from '../../../src/types/mcpManifest';

const validManifest: McpManifest = {
  schema_version: 1,
  package_id: '@eonofpixel/sample-fs-mcp',
  name: 'sample-fs-mcp',
  version: '1.0.0',
  capabilities: ['host.fs.read', 'host.audit.write'],
  entrypoint: {
    file: 'dist/index.js',
    artifact_digest: 'a'.repeat(64),
    artifact_size_bytes: 890,
  },
  signing: {
    method: 'sigstore-keyless-oidc',
    identity: {
      issuer: 'https://token.actions.githubusercontent.com',
      subject_pattern: 'repo:eonofpixel/sample-fs-mcp:ref:refs/tags/v*',
    },
  },
  runtime: { node: '^20', requires_native_modules: false },
};

const verifierVerified: ManifestVerifier = {
  verify: () =>
    Promise.resolve({
      kind: 'verified',
      evidence: {
        cert_issuer: 'https://token.actions.githubusercontent.com',
        cert_subject: 'repo:eonofpixel/sample-fs-mcp:ref:refs/tags/v1.0.0',
        verified_at: '2026-05-10T00:00:00.000Z',
      },
    }),
};

let tmpRoot: string;
let recordStore: InstalledPluginRecordStore;
let gate: McpCapabilityGate;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'roundtrip-'));
  recordStore = new InstalledPluginRecordStore({ storageDir: join(tmpRoot, 'records') });
  gate = new McpCapabilityGate({ storageDir: join(tmpRoot, 'grants') });
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe('v2.4.0 — install → revoke roundtrip', () => {
  it('install persists record with revocation_status=unknown; listAll returns it', async () => {
    const result = await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      { verifierFactory: () => Promise.resolve(verifierVerified), recordStore }
    );
    expect(result.kind).toBe('installed');

    const list = recordStore.listAll();
    expect(list).toHaveLength(1);
    expect(list[0]?.package_id).toBe('@eonofpixel/sample-fs-mcp');
    expect(list[0]?.revocation_status).toBe('unknown');
    expect(list[0]?.verification_status).toBe('verified');
    expect(list[0]?.isolation_mode).toBe('utility_process');
  });

  it('grant capability → gate.isGranted=true; revoke bumps epoch + isGranted=false', async () => {
    await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      { verifierFactory: () => Promise.resolve(verifierVerified), recordStore }
    );
    const server_id = validManifest.package_id;

    gate.grantOne(server_id, 'host.fs.read');
    expect(gate.isGranted(server_id, 'host.fs.read')).toBe(true);
    expect(gate.getGrantEpoch(server_id)).toBe(0); // grant doesn't bump epoch

    const newEpoch = gate.revokeOne(server_id);
    expect(newEpoch).toBe(1);
    expect(gate.isGranted(server_id, 'host.fs.read')).toBe(false);
    expect(gate.getGrantEpoch(server_id)).toBe(1);
  });

  it('revoke + record patch (mcp/request-revoke handler contract) → listAll reflects revoked', async () => {
    await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      { verifierFactory: () => Promise.resolve(verifierVerified), recordStore }
    );
    const server_id = validManifest.package_id;

    // Pre-revoke: status=unknown
    expect(recordStore.get(server_id)?.revocation_status).toBe('unknown');

    // Mimic mcp/request-revoke handler: bump epoch + patch record.
    const newEpoch = gate.revokeOne(server_id);
    expect(newEpoch).toBeGreaterThan(0);
    const rec = recordStore.get(server_id);
    if (rec === null) throw new Error('record disappeared');
    recordStore.put({
      ...rec,
      revocation_status: 'revoked',
      verification_status: 'revoked',
      last_revocation_check_at: '2026-05-10T01:00:00.000Z',
    });

    // Post-revoke: listAll reflects.
    const after = recordStore.listAll();
    expect(after).toHaveLength(1);
    expect(after[0]?.revocation_status).toBe('revoked');
    expect(after[0]?.verification_status).toBe('revoked');
    expect(after[0]?.last_revocation_check_at).toBe('2026-05-10T01:00:00.000Z');
  });

  it('grant_epoch persists across new gate instance (file-backed)', async () => {
    const server_id = validManifest.package_id;
    gate.grantOne(server_id, 'host.fs.read');
    gate.revokeOne(server_id, 'host.fs.read'); // bump to 1

    const reopened = new McpCapabilityGate({ storageDir: join(tmpRoot, 'grants') });
    expect(reopened.getGrantEpoch(server_id)).toBe(1);
    expect(reopened.isGranted(server_id, 'host.fs.read')).toBe(false);
  });

  it('isolation_mode=in_process when record patched (downgrade flow contract)', async () => {
    await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      { verifierFactory: () => Promise.resolve(verifierVerified), recordStore }
    );
    const server_id = validManifest.package_id;
    expect(recordStore.get(server_id)?.isolation_mode).toBe('utility_process');

    // Mimic plugin/request-downgrade handler: patch isolation_mode.
    const rec = recordStore.get(server_id);
    if (rec === null) throw new Error('record disappeared');
    recordStore.put({ ...rec, isolation_mode: 'in_process' });

    expect(recordStore.get(server_id)?.isolation_mode).toBe('in_process');
  });

  it('multiple installs + selective revoke leaves untouched records intact', async () => {
    await installMcpPlugin(
      { manifest: validManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      { verifierFactory: () => Promise.resolve(verifierVerified), recordStore }
    );
    const otherManifest: McpManifest = {
      ...validManifest,
      package_id: '@other/plugin',
      name: 'other-plugin',
    };
    await installMcpPlugin(
      { manifest: otherManifest, bundle: { fake: 'bundle' }, mode: 'strict' },
      { verifierFactory: () => Promise.resolve(verifierVerified), recordStore }
    );

    expect(recordStore.listAll()).toHaveLength(2);

    // Revoke only @eonofpixel/sample-fs-mcp.
    gate.revokeOne(validManifest.package_id);
    const rec = recordStore.get(validManifest.package_id);
    if (rec === null) throw new Error('record disappeared');
    recordStore.put({ ...rec, revocation_status: 'revoked', verification_status: 'revoked' });

    const all = recordStore.listAll();
    const revoked = all.find((r) => r.package_id === validManifest.package_id);
    const untouched = all.find((r) => r.package_id === '@other/plugin');
    expect(revoked?.revocation_status).toBe('revoked');
    expect(untouched?.revocation_status).toBe('unknown');
    expect(untouched?.verification_status).toBe('verified');
  });
});
