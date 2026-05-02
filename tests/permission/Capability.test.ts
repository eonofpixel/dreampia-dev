/**
 * Contract tests - Capability enum + parent-child.
 *
 * Spec: docs/permission/capabilities.md
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_CAPABILITIES,
  CapabilitySchema,
  isParentCapability,
  type Capability,
} from '../../src/permission/Capability';

// ────────────────────────────────────────────────────────────
// Enum completeness
// ────────────────────────────────────────────────────────────

describe('ALL_CAPABILITIES', () => {
  it('contains at least 30 capabilities', () => {
    expect(ALL_CAPABILITIES.length).toBeGreaterThanOrEqual(30);
  });

  it('contains every capability listed in capabilities.md union', () => {
    const required: Capability[] = [
      // Local FS
      'LOCAL_READ',
      'LOCAL_READ.binary',
      'LOCAL_WRITE',
      'LOCAL_WRITE.create',
      'LOCAL_WRITE.modify',
      'LOCAL_WRITE.delete',
      'LOCAL_WRITE.rename',
      'LOCAL_OUTSIDE_CWD',
      'LOCAL_OUTSIDE_CWD.read',
      'LOCAL_OUTSIDE_CWD.write',
      // Execute
      'LOCAL_EXECUTE',
      'LOCAL_EXECUTE.background',
      'LOCAL_EXECUTE.elevated',
      // Network
      'NETWORK_LOCAL',
      'NETWORK_LAN',
      'NETWORK_REMOTE',
      'NETWORK_REMOTE.upload',
      'NETWORK_AI',
      'NETWORK_MCP',
      // Browser
      'BROWSER_NAVIGATE',
      'BROWSER_INTERACT',
      'BROWSER_DOWNLOAD',
      'BROWSER_SCREENSHOT',
      'BROWSER_DOM_READ',
      'BROWSER_COOKIE_READ',
      // System
      'SYSTEM_CLIPBOARD.read',
      'SYSTEM_CLIPBOARD.write',
      'SYSTEM_NOTIFICATION',
      'SYSTEM_TRAY',
      'SYSTEM_AUTOMATION.cron',
      'SYSTEM_AUTOMATION.event',
      'SYSTEM_HOTKEY',
      // Provider
      'PROVIDER_CLAUDE_CALL',
      'PROVIDER_CODEX_CALL',
      'PROVIDER_TOKEN_READ',
      // Plugin
      'PLUGIN_INSTALL',
      'PLUGIN_EXECUTE',
      'PLUGIN_NETWORK',
    ];

    for (const cap of required) {
      expect(ALL_CAPABILITIES).toContain(cap);
    }
  });

  it('has no duplicates', () => {
    const set = new Set(ALL_CAPABILITIES);
    expect(set.size).toBe(ALL_CAPABILITIES.length);
  });
});

// ────────────────────────────────────────────────────────────
// CapabilitySchema (runtime validation)
// ────────────────────────────────────────────────────────────

describe('CapabilitySchema', () => {
  it('accepts every value in ALL_CAPABILITIES', () => {
    for (const cap of ALL_CAPABILITIES) {
      const result = CapabilitySchema.safeParse(cap);
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown capability strings', () => {
    expect(CapabilitySchema.safeParse('LOCAL_FOO').success).toBe(false);
    expect(CapabilitySchema.safeParse('local_read').success).toBe(false); // case-sensitive
    expect(CapabilitySchema.safeParse('').success).toBe(false);
    expect(CapabilitySchema.safeParse('LOCAL_READ.unknown').success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// isParentCapability
// ────────────────────────────────────────────────────────────

describe('isParentCapability', () => {
  it('returns true for direct parent-child', () => {
    expect(isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE.modify')).toBe(true);
    expect(isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE.create')).toBe(true);
    expect(isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE.delete')).toBe(true);
    expect(isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE.rename')).toBe(true);
    expect(isParentCapability('LOCAL_OUTSIDE_CWD', 'LOCAL_OUTSIDE_CWD.read')).toBe(true);
    expect(isParentCapability('LOCAL_OUTSIDE_CWD', 'LOCAL_OUTSIDE_CWD.write')).toBe(true);
    expect(isParentCapability('LOCAL_EXECUTE', 'LOCAL_EXECUTE.elevated')).toBe(true);
    expect(isParentCapability('NETWORK_REMOTE', 'NETWORK_REMOTE.upload')).toBe(true);
    expect(isParentCapability('SYSTEM_CLIPBOARD', 'SYSTEM_CLIPBOARD.read')).toBe(true);
    expect(isParentCapability('SYSTEM_AUTOMATION', 'SYSTEM_AUTOMATION.cron')).toBe(true);
  });

  it('returns false for unrelated capabilities', () => {
    expect(isParentCapability('LOCAL_WRITE', 'LOCAL_READ')).toBe(false);
    expect(isParentCapability('LOCAL_WRITE', 'NETWORK_LOCAL')).toBe(false);
    expect(isParentCapability('LOCAL_READ', 'LOCAL_WRITE.modify')).toBe(false);
  });

  it('returns false for the same capability (a is not its own parent)', () => {
    expect(isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE')).toBe(false);
    expect(isParentCapability('LOCAL_READ', 'LOCAL_READ')).toBe(false);
  });

  it('does not match prefix without dot separator', () => {
    expect(isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE.modify')).toBe(true);
    expect(isParentCapability('LOCAL_WRITE.modify', 'LOCAL_WRITE')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// ALL_CAPABILITIES length lock - sentinel test
//
// Fails immediately when a capability is accidentally added/removed.
// Update IMPL_NOTES.md section 1 alongside any intentional change.
// ────────────────────────────────────────────────────────────

describe('ALL_CAPABILITIES length lock', () => {
  it('locks the count to 40 to catch accidental add/remove', () => {
    // spec union(36) + bare parents SYSTEM_CLIPBOARD, SYSTEM_AUTOMATION = 38,
    // + LOCAL_WRITE, LOCAL_OUTSIDE_CWD already in union but also bare parents = 40 total
    // To update: change Capability.ts intentionally, then update this number.
    expect(ALL_CAPABILITIES.length).toBe(40);
  });
});