/**
 * Contract tests - PermissionGrantSchema: capability field validation.
 *
 * Spec: docs/permission/grants.md, src/types/permission.ts (GrantCapabilitySchema)
 *
 * GrantCapabilitySchema rules:
 *  - valid Capability -> pass
 *  - '__deny__:' + valid Capability -> pass
 *  - '__deny__:' + unknown capability -> fail
 *  - '__deny__:' (empty suffix) -> fail
 *  - unknown string -> fail
 */

import { describe, it, expect } from 'vitest';
import { PermissionGrantSchema } from '../../src/types/permission';

function baseGrant(capability: string) {
  return {
    id: 'test-grant-1',
    session_id: '019d0000-0000-7000-8000-000000000002',
    capability,
    target: { kind: 'global' as const },
    scope: 'session' as const,
    granted_at: '2026-05-02T00:00:00.000Z',
    granted_by: 'user' as const,
  };
}

describe('PermissionGrantSchema - capability field', () => {
  it('accepts a valid plain Capability', () => {
    expect(() => PermissionGrantSchema.parse(baseGrant('LOCAL_WRITE'))).not.toThrow();
    expect(() => PermissionGrantSchema.parse(baseGrant('BROWSER_INTERACT'))).not.toThrow();
    expect(() => PermissionGrantSchema.parse(baseGrant('LOCAL_WRITE.modify'))).not.toThrow();
  });

  it('accepts __deny__:Capability (valid deny grant)', () => {
    expect(() =>
      PermissionGrantSchema.parse(baseGrant('__deny__:LOCAL_WRITE'))
    ).not.toThrow();
    expect(() =>
      PermissionGrantSchema.parse(baseGrant('__deny__:LOCAL_EXECUTE'))
    ).not.toThrow();
    expect(() =>
      PermissionGrantSchema.parse(baseGrant('__deny__:BROWSER_INTERACT'))
    ).not.toThrow();
    expect(() =>
      PermissionGrantSchema.parse(baseGrant('__deny__:LOCAL_WRITE.delete'))
    ).not.toThrow();
  });

  it('rejects __deny__:GARBAGE_NOT_A_CAP (invalid capability after prefix)', () => {
    expect(() =>
      PermissionGrantSchema.parse(baseGrant('__deny__:GARBAGE_NOT_A_CAP'))
    ).toThrow();
    expect(() =>
      PermissionGrantSchema.parse(baseGrant('__deny__:local_write'))
    ).toThrow();
  });

  it('rejects __deny__: with empty suffix', () => {
    expect(() => PermissionGrantSchema.parse(baseGrant('__deny__:'))).toThrow();
  });

  it('rejects unknown plain capability strings', () => {
    expect(() => PermissionGrantSchema.parse(baseGrant('GARBAGE_NOT_A_CAP'))).toThrow();
    expect(() => PermissionGrantSchema.parse(baseGrant(''))).toThrow();
    expect(() => PermissionGrantSchema.parse(baseGrant('local_write'))).toThrow();
  });
});