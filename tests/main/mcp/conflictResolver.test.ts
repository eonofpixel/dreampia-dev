/**
 * conflictResolver tests (v2.3.0 US-103).
 *
 * 9-case matrix: 3 input shapes × 3 outcome categories.
 */

import { describe, it, expect } from 'vitest';
import { resolveCapabilityConflict } from '../../../src/main/mcp/conflictResolver';

describe('v2.3.0 US-103 — resolveCapabilityConflict', () => {
  // ── allow row (superset already granted) ────────────────────────────
  describe('allow', () => {
    it('empty request + empty granted → allow', () => {
      const r = resolveCapabilityConflict([], []);
      expect(r.kind).toBe('allow');
    });

    it('exact match request ⊆ granted → allow', () => {
      const r = resolveCapabilityConflict(['host.fs.read'], ['host.fs.read', 'host.audit.write']);
      expect(r.kind).toBe('allow');
    });

    it('subset request ⊆ granted → allow', () => {
      const r = resolveCapabilityConflict(
        ['host.fs.read', 'host.audit.write'],
        ['host.fs.read', 'host.fs.write', 'host.audit.write']
      );
      expect(r.kind).toBe('allow');
    });
  });

  // ── deny row (deny list policy violation) ───────────────────────────
  describe('deny', () => {
    const denied = new Set(['host.shell.exec']);

    it('single denied capability requested → deny with offender list', () => {
      const r = resolveCapabilityConflict(['host.shell.exec'], [], {
        deniedCapabilities: denied,
      });
      expect(r.kind).toBe('deny');
      if (r.kind === 'deny') {
        expect(r.offending).toEqual(['host.shell.exec']);
      }
    });

    it('mix of allowed + denied → deny (deny precedence)', () => {
      const r = resolveCapabilityConflict(['host.fs.read', 'host.shell.exec'], ['host.fs.read'], {
        deniedCapabilities: denied,
      });
      expect(r.kind).toBe('deny');
      if (r.kind === 'deny') {
        expect(r.offending).toEqual(['host.shell.exec']);
      }
    });

    it('multiple denied capabilities → all reported in offending', () => {
      const r = resolveCapabilityConflict(['host.shell.exec', 'host.network.bind'], [], {
        deniedCapabilities: new Set(['host.shell.exec', 'host.network.bind']),
      });
      expect(r.kind).toBe('deny');
      if (r.kind === 'deny') {
        expect(r.offending).toEqual(['host.shell.exec', 'host.network.bind']);
      }
    });
  });

  // ── consent row (new capabilities, not denied) ──────────────────────
  describe('requires_user_consent', () => {
    it('new capability with empty grant → consent for new', () => {
      const r = resolveCapabilityConflict(['host.fs.read'], []);
      expect(r.kind).toBe('requires_user_consent');
      if (r.kind === 'requires_user_consent') {
        expect(r.new_capabilities).toEqual(['host.fs.read']);
      }
    });

    it('partial overlap → consent for the new ones only', () => {
      const r = resolveCapabilityConflict(['host.fs.read', 'host.audit.write'], ['host.fs.read']);
      expect(r.kind).toBe('requires_user_consent');
      if (r.kind === 'requires_user_consent') {
        expect(r.new_capabilities).toEqual(['host.audit.write']);
      }
    });

    it('all new (disjoint) → consent for all requested', () => {
      const r = resolveCapabilityConflict(
        ['host.audit.write', 'host.session.subscribe'],
        ['host.fs.read']
      );
      expect(r.kind).toBe('requires_user_consent');
      if (r.kind === 'requires_user_consent') {
        expect(r.new_capabilities).toEqual(['host.audit.write', 'host.session.subscribe']);
      }
    });
  });
});
