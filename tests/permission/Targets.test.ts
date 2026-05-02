/**
 * Contract tests — Target matching, specificity, expiration, outside-workspace.
 *
 * Spec: docs/permission/grants.md
 */

import { describe, it, expect } from 'vitest';
import {
  isExpired,
  isOutsideWorkspace,
  matchesTarget,
  mostSpecific,
  specificity,
} from '../../src/permission/Targets';
import type {
  GrantTarget,
  PermissionGrant,
  GrantScope,
} from '../../src/types/permission';
import type { SessionId } from '../../src/types/common';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const SESSION_ID = '019d0000-0000-7000-8000-000000000001' as SessionId;

function makeGrant(
  capability: string,
  target: GrantTarget,
  overrides: Partial<PermissionGrant> = {}
): PermissionGrant {
  return {
    id: 'g1',
    session_id: SESSION_ID,
    capability,
    target,
    scope: 'session' as GrantScope,
    granted_at: '2026-05-01T00:00:00.000Z',
    granted_by: 'user',
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// matchesTarget — kind 별 매칭
// ────────────────────────────────────────────────────────────

describe('matchesTarget — global', () => {
  it('global grant matches any resolved target', () => {
    const grant: GrantTarget = { kind: 'global' };
    expect(matchesTarget(grant, { kind: 'path', value: 'C:/Dev/foo' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'url', value: 'https://example.com' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'domain', value: 'example.com' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'global', value: '' })).toBe(true);
  });
});

describe('matchesTarget — path', () => {
  it('exact path match (non-recursive)', () => {
    const grant: GrantTarget = { kind: 'path', path: 'C:\\Dev\\foo', recursive: false };
    expect(matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\foo' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\foo\\bar' })).toBe(false);
  });

  it('recursive path matches the root and all descendants', () => {
    const grant: GrantTarget = { kind: 'path', path: 'C:\\Dev\\foo', recursive: true };
    expect(matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\foo' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\foo\\bar' })).toBe(true);
    expect(
      matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\foo\\src\\index.ts' })
    ).toBe(true);
    expect(matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\fool' })).toBe(false);
  });

  it('Windows drive letter is case-insensitive', () => {
    const grant: GrantTarget = { kind: 'path', path: 'C:\\Dev\\foo', recursive: true };
    expect(matchesTarget(grant, { kind: 'path', value: 'c:\\dev\\foo' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'path', value: 'c:\\Dev\\FOO\\bar' })).toBe(true);
  });

  it('한글 경로 매칭', () => {
    const grant: GrantTarget = { kind: 'path', path: 'C:\\Dev\\분석\\foo', recursive: true };
    expect(
      matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\분석\\foo' })
    ).toBe(true);
    expect(
      matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\분석\\foo\\src' })
    ).toBe(true);
    expect(matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\분석\\bar' })).toBe(false);
  });

  it('forward-slash and backslash are normalized equivalently', () => {
    const grant: GrantTarget = { kind: 'path', path: 'C:/Dev/foo', recursive: true };
    expect(matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\foo' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'path', value: 'C:\\Dev\\foo\\bar' })).toBe(true);
  });
});

describe('matchesTarget — url (exact)', () => {
  it('exact URL match', () => {
    const grant: GrantTarget = { kind: 'url', url: 'https://api.acme.com/v1/sync' };
    expect(
      matchesTarget(grant, { kind: 'url', value: 'https://api.acme.com/v1/sync' })
    ).toBe(true);
    expect(
      matchesTarget(grant, { kind: 'url', value: 'https://api.acme.com/v1/sync/' })
    ).toBe(false);
    expect(
      matchesTarget(grant, { kind: 'url', value: 'https://api.acme.com/v2/sync' })
    ).toBe(false);
  });
});

describe('matchesTarget — domain wildcard', () => {
  it('wildcard *.example.com matches example.com and subdomains', () => {
    const grant: GrantTarget = { kind: 'domain', domain: '*.github.com' };
    expect(matchesTarget(grant, { kind: 'domain', value: 'github.com' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'domain', value: 'www.github.com' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'domain', value: 'api.github.com' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'domain', value: 'evilgithub.com' })).toBe(false);
    expect(matchesTarget(grant, { kind: 'domain', value: 'github.com.evil.com' })).toBe(
      false
    );
  });

  it('exact domain match (no wildcard)', () => {
    const grant: GrantTarget = { kind: 'domain', domain: 'github.com' };
    expect(matchesTarget(grant, { kind: 'domain', value: 'github.com' })).toBe(true);
    expect(matchesTarget(grant, { kind: 'domain', value: 'www.github.com' })).toBe(false);
  });
});

describe('matchesTarget — kind mismatch', () => {
  it('returns false when grant.kind != resolved.kind (and grant != global)', () => {
    const grant: GrantTarget = { kind: 'path', path: 'C:\\Dev\\foo' };
    expect(matchesTarget(grant, { kind: 'url', value: 'C:\\Dev\\foo' })).toBe(false);
    expect(matchesTarget(grant, { kind: 'domain', value: 'foo' })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// isExpired
// ────────────────────────────────────────────────────────────

describe('isExpired', () => {
  it('returns true when revoked_at is set', () => {
    const grant = makeGrant('LOCAL_READ', { kind: 'global' }, {
      revoked_at: '2026-05-01T00:00:00.000Z',
    });
    expect(isExpired(grant)).toBe(true);
  });

  it('returns true when expires_at is in the past', () => {
    const grant = makeGrant('LOCAL_READ', { kind: 'global' }, {
      expires_at: '2020-01-01T00:00:00.000Z',
    });
    expect(isExpired(grant, new Date('2026-05-02T00:00:00.000Z'))).toBe(true);
  });

  it('returns false when expires_at is in the future', () => {
    const grant = makeGrant('LOCAL_READ', { kind: 'global' }, {
      expires_at: '2099-01-01T00:00:00.000Z',
    });
    expect(isExpired(grant, new Date('2026-05-02T00:00:00.000Z'))).toBe(false);
  });

  it('returns false for valid grant with no expires_at and no revoked_at', () => {
    const grant = makeGrant('LOCAL_READ', { kind: 'global' });
    expect(isExpired(grant)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// specificity & mostSpecific
// ────────────────────────────────────────────────────────────

describe('specificity', () => {
  it('url > path-non-recursive > domain-exact > path-recursive > domain-wildcard > global', () => {
    const url = makeGrant('LOCAL_READ', { kind: 'url', url: 'https://x.com/a' });
    const pathExact = makeGrant('LOCAL_READ', {
      kind: 'path',
      path: 'C:\\Dev\\foo',
      recursive: false,
    });
    const domainExact = makeGrant('LOCAL_READ', { kind: 'domain', domain: 'github.com' });
    const pathRec = makeGrant('LOCAL_READ', {
      kind: 'path',
      path: 'C:\\Dev\\foo',
      recursive: true,
    });
    const domainWild = makeGrant('LOCAL_READ', {
      kind: 'domain',
      domain: '*.github.com',
    });
    const global = makeGrant('LOCAL_READ', { kind: 'global' });

    // Same scope ('session') for fair comparison
    expect(specificity(url)).toBeGreaterThan(specificity(pathExact));
    expect(specificity(pathExact)).toBeGreaterThan(specificity(domainExact));
    expect(specificity(domainExact)).toBeGreaterThan(specificity(pathRec));
    expect(specificity(pathRec)).toBeGreaterThan(specificity(domainWild));
    expect(specificity(domainWild)).toBeGreaterThan(specificity(global));
  });

  it('sub-capability adds +5 to score', () => {
    const parent = makeGrant('LOCAL_WRITE', { kind: 'global' });
    const child = makeGrant('LOCAL_WRITE.modify', { kind: 'global' });
    expect(specificity(child) - specificity(parent)).toBe(5);
  });

  it('scope ordering: one_time > turn > session > persistent', () => {
    const oneTime = makeGrant('LOCAL_READ', { kind: 'global' }, { scope: 'one_time' });
    const turn = makeGrant('LOCAL_READ', { kind: 'global' }, { scope: 'turn' });
    const session = makeGrant('LOCAL_READ', { kind: 'global' }, { scope: 'session' });
    const persistent = makeGrant('LOCAL_READ', { kind: 'global' }, {
      scope: 'persistent',
    });

    expect(specificity(oneTime)).toBeGreaterThan(specificity(turn));
    expect(specificity(turn)).toBeGreaterThan(specificity(session));
    expect(specificity(session)).toBeGreaterThan(specificity(persistent));
  });
});

describe('mostSpecific', () => {
  it('picks URL over domain over path-non-recursive over path-recursive over global', () => {
    const url = makeGrant(
      'LOCAL_READ',
      { kind: 'url', url: 'https://x.com/a' },
      { id: 'url' }
    );
    const pathExact = makeGrant(
      'LOCAL_READ',
      { kind: 'path', path: 'C:\\Dev\\foo' },
      { id: 'pathExact' }
    );
    const pathRec = makeGrant(
      'LOCAL_READ',
      { kind: 'path', path: 'C:\\Dev\\foo', recursive: true },
      { id: 'pathRec' }
    );
    const global = makeGrant('LOCAL_READ', { kind: 'global' }, { id: 'global' });

    expect(mostSpecific([url, pathExact, pathRec, global]).id).toBe('url');
    expect(mostSpecific([pathExact, pathRec, global]).id).toBe('pathExact');
    expect(mostSpecific([pathRec, global]).id).toBe('pathRec');
    expect(mostSpecific([global]).id).toBe('global');
  });

  it('throws when given empty array', () => {
    expect(() => mostSpecific([])).toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// isOutsideWorkspace
// ────────────────────────────────────────────────────────────

describe('isOutsideWorkspace', () => {
  it('inside workspace returns false', () => {
    expect(isOutsideWorkspace('C:\\Dev\\foo\\src', 'C:\\Dev\\foo')).toBe(false);
    expect(isOutsideWorkspace('C:\\Dev\\foo', 'C:\\Dev\\foo')).toBe(false);
  });

  it('outside workspace returns true', () => {
    expect(isOutsideWorkspace('C:\\Other\\place', 'C:\\Dev\\foo')).toBe(true);
    expect(isOutsideWorkspace('C:\\Dev\\bar', 'C:\\Dev\\foo')).toBe(true);
  });

  it('handles case differences (Windows)', () => {
    expect(isOutsideWorkspace('c:\\dev\\foo\\src', 'C:\\Dev\\foo')).toBe(false);
  });

  it('handles slash differences', () => {
    expect(isOutsideWorkspace('C:/Dev/foo/src', 'C:\\Dev\\foo')).toBe(false);
  });

  it('does not match a sibling that shares prefix without separator', () => {
    // 'C:\\Dev\\fool' should NOT be considered inside 'C:\\Dev\\foo'.
    expect(isOutsideWorkspace('C:\\Dev\\fool', 'C:\\Dev\\foo')).toBe(true);
  });
});
