/**
 * McpCapabilityGate tests (v2.3.0 US-102).
 *
 * Verifies:
 *   - grant→isGranted true; revoke→isGranted false (AC mirror PluginCapabilityGate API)
 *   - grant_epoch monotonic on revoke (G5 sync invalidation precursor)
 *   - File persistence + reload on new instance (production-like flow)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpCapabilityGate } from '../../../src/main/mcp/McpCapabilityGate';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mcp-cap-gate-'));
});

afterEach(() => {
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

describe('v2.3.0 US-102 — McpCapabilityGate basic API', () => {
  it('grantOne → isGranted returns true', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    expect(gate.isGranted('server-a', 'host.fs.read')).toBe(true);
  });

  it('revokeOne(cap) → isGranted returns false', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    gate.revokeOne('server-a', 'host.fs.read');
    expect(gate.isGranted('server-a', 'host.fs.read')).toBe(false);
  });

  it('listGranted returns sorted capabilities', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.write');
    gate.grantOne('server-a', 'host.audit.write');
    gate.grantOne('server-a', 'host.fs.read');
    expect(gate.listGranted('server-a')).toEqual([
      'host.audit.write',
      'host.fs.read',
      'host.fs.write',
    ]);
  });

  it('listGranted returns [] for unknown server', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    expect(gate.listGranted('never-touched')).toEqual([]);
  });

  it('revokeOne(undefined) clears all capabilities', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    gate.grantOne('server-a', 'host.audit.write');
    gate.revokeOne('server-a');
    expect(gate.listGranted('server-a')).toEqual([]);
  });

  it('grantOne is idempotent (no audit duplicates)', () => {
    const events: string[] = [];
    const gate = new McpCapabilityGate({
      storageDir: tmpRoot,
      auditSink: (e) => events.push(e.event),
    });
    gate.grantOne('server-a', 'host.fs.read');
    gate.grantOne('server-a', 'host.fs.read');
    expect(events.filter((e) => e === 'mcp.cap_granted').length).toBe(1);
  });
});

describe('v2.3.0 US-102 — grant_epoch monotonicity (G5)', () => {
  it('initial epoch is 0', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    expect(gate.getGrantEpoch('server-a')).toBe(0);
  });

  it('grantOne does NOT bump epoch (only revoke does)', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    expect(gate.getGrantEpoch('server-a')).toBe(0);
    gate.grantOne('server-a', 'host.audit.write');
    expect(gate.getGrantEpoch('server-a')).toBe(0);
  });

  it('revokeOne(cap) increments epoch by 1', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    gate.revokeOne('server-a', 'host.fs.read');
    expect(gate.getGrantEpoch('server-a')).toBe(1);
  });

  it('revokeOne(undefined) increments epoch by 1', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    gate.revokeOne('server-a');
    expect(gate.getGrantEpoch('server-a')).toBe(1);
  });

  it('multiple revokes are strictly monotonic (no gaps)', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    expect(gate.revokeOne('server-a', 'host.fs.read')).toBe(1);
    expect(gate.revokeOne('server-a', 'host.audit.write')).toBe(2);
    expect(gate.revokeOne('server-a')).toBe(3);
  });

  it('revoking ungranted capability still bumps epoch (defensive monotonic)', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    expect(gate.revokeOne('server-a', 'host.fs.read')).toBe(1);
  });
});

describe('v2.3.0 US-102 — persistence', () => {
  it('grant persists to disk and reloads on new instance', () => {
    const gate1 = new McpCapabilityGate({ storageDir: tmpRoot });
    gate1.grantOne('server-a', 'host.fs.read');
    gate1.grantOne('server-a', 'host.audit.write');

    const gate2 = new McpCapabilityGate({ storageDir: tmpRoot });
    expect(gate2.isGranted('server-a', 'host.fs.read')).toBe(true);
    expect(gate2.isGranted('server-a', 'host.audit.write')).toBe(true);
    expect(gate2.listGranted('server-a')).toEqual(['host.audit.write', 'host.fs.read']);
  });

  it('grant_epoch persists across instances', () => {
    const gate1 = new McpCapabilityGate({ storageDir: tmpRoot });
    gate1.grantOne('server-a', 'host.fs.read');
    gate1.revokeOne('server-a', 'host.fs.read');
    gate1.grantOne('server-a', 'host.audit.write');
    expect(gate1.getGrantEpoch('server-a')).toBe(1);

    const gate2 = new McpCapabilityGate({ storageDir: tmpRoot });
    expect(gate2.getGrantEpoch('server-a')).toBe(1);
  });

  it('revokeOne(undefined) deletes the persistence file', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    expect(existsSync(join(tmpRoot, 'server-a', 'granted.json'))).toBe(true);
    gate.revokeOne('server-a');
    expect(existsSync(join(tmpRoot, 'server-a', 'granted.json'))).toBe(false);
  });

  it('persisted file shape: { capabilities: sorted[], grant_epoch: number }', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.write');
    gate.grantOne('server-a', 'host.audit.write');
    gate.grantOne('server-a', 'host.fs.read');
    const raw = readFileSync(join(tmpRoot, 'server-a', 'granted.json'), 'utf-8');
    const data = JSON.parse(raw);
    expect(data.capabilities).toEqual(['host.audit.write', 'host.fs.read', 'host.fs.write']);
    expect(typeof data.grant_epoch).toBe('number');
  });

  it('corrupt JSON file is silently skipped on load (graceful degrade)', () => {
    const serverDir = join(tmpRoot, 'broken-server');
    mkdirSyncSafe(serverDir);
    const fs = require('node:fs') as typeof import('node:fs');
    fs.writeFileSync(join(serverDir, 'granted.json'), '{ not: valid json', 'utf-8');
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    expect(gate.isGranted('broken-server', 'anything')).toBe(false);
    expect(gate.getGrantEpoch('broken-server')).toBe(0);
  });
});

function mkdirSyncSafe(p: string): void {
  const fs = require('node:fs') as typeof import('node:fs');
  fs.mkdirSync(p, { recursive: true });
}

describe('v2.3.0 US-102 — multi-server isolation', () => {
  it('grant on server-a does not leak to server-b', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    expect(gate.isGranted('server-b', 'host.fs.read')).toBe(false);
  });

  it('revoke on server-a does not bump epoch on server-b', () => {
    const gate = new McpCapabilityGate({ storageDir: tmpRoot });
    gate.grantOne('server-a', 'host.fs.read');
    gate.grantOne('server-b', 'host.fs.read');
    gate.revokeOne('server-a', 'host.fs.read');
    expect(gate.getGrantEpoch('server-a')).toBe(1);
    expect(gate.getGrantEpoch('server-b')).toBe(0);
  });
});

describe('v2.3.0 US-102 — in-memory mode (no storageDir)', () => {
  it('works without storageDir (no persistence)', () => {
    const gate = new McpCapabilityGate();
    gate.grantOne('server-a', 'host.fs.read');
    expect(gate.isGranted('server-a', 'host.fs.read')).toBe(true);
    expect(gate.revokeOne('server-a', 'host.fs.read')).toBe(1);
    expect(gate.isGranted('server-a', 'host.fs.read')).toBe(false);
  });
});
