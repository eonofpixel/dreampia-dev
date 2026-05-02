/**
 * Contract tests - isAllowed() 5-step priority resolver.
 *
 * Spec: docs/permission/resolver.md
 *
 * Scenarios: 1-12 original, 13-18 new guard tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowed } from '../../src/permission/Resolver';
import { isExpired } from '../../src/permission/Targets';
import type { ResolvedTarget } from '../../src/permission/Targets';
import type { Session } from '../../src/types/session';
import type {
  PermissionGrant,
  PermissionLevel,
  GrantTarget,
  GrantScope,
} from '../../src/types/permission';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadBaseSession(): Session {
  const raw = readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8');
  return JSON.parse(raw) as Session;
}

function withPermission(
  base: Session,
  patch: {
    grants?: PermissionGrant[];
    default_level?: PermissionLevel;
    temporarily_blocked_capabilities?: string[];
  }
): Session {
  return {
    ...base,
    permission: {
      ...base.permission,
      ...patch,
      grants: patch.grants ?? base.permission.grants,
      default_level: patch.default_level ?? base.permission.default_level,
      temporarily_blocked_capabilities:
        patch.temporarily_blocked_capabilities ??
        base.permission.temporarily_blocked_capabilities,
    },
  };
}

function withPlan(base: Session, active: boolean, blocked: string[] = []): Session {
  return {
    ...base,
    plan: { ...base.plan, active },
    permission: {
      ...base.permission,
      temporarily_blocked_capabilities: active
        ? blocked.length > 0
          ? blocked
          : ['LOCAL_WRITE', 'LOCAL_EXECUTE']
        : base.permission.temporarily_blocked_capabilities,
    },
  };
}

function makeGrant(opts: {
  capability: string;
  target: GrantTarget;
  scope?: GrantScope;
  expires_at?: string;
  revoked_at?: string;
  id?: string;
}): PermissionGrant {
  return {
    id: opts.id ?? 'grant-test',
    session_id: '019d0000-0000-7000-8000-000000000002' as Session['id'],
    capability: opts.capability,
    target: opts.target,
    scope: opts.scope ?? 'session',
    granted_at: '2026-05-02T00:00:00.000Z',
    granted_by: 'user',
    ...(opts.expires_at && { expires_at: opts.expires_at }),
    ...(opts.revoked_at && { revoked_at: opts.revoked_at }),
  };
}

const PATH_TARGET: ResolvedTarget = { kind: 'path', value: 'C:\\Dev\\foo\\src\\index.ts' };
const SAFE_EXEC_TARGET: ResolvedTarget = { kind: 'path', value: 'npm test' };

// ─── 1. Explicit deny wins ─────────────────────────────────────────────────

describe('isAllowed - explicit deny wins', () => {
  it('returns explicitly_denied even when level allows', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'full_access',
      grants: [
        makeGrant({
          capability: '__deny__:LOCAL_EXECUTE',
          target: { kind: 'path', path: 'C:\\Dev\\foo', recursive: true },
        }),
      ],
    });
    const decision = isAllowed('LOCAL_EXECUTE', PATH_TARGET, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('explicitly_denied');
    expect(decision.deny_grant).toBeDefined();
  });

  it('deny ignored when expired', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'workspace_write',
      grants: [
        makeGrant({
          capability: '__deny__:LOCAL_EXECUTE',
          target: { kind: 'global' },
          revoked_at: '2026-05-01T00:00:00.000Z',
        }),
      ],
    });
    const decision = isAllowed('LOCAL_EXECUTE', SAFE_EXEC_TARGET, session);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_default_level');
  });
});

// ─── 2. Danger pattern beats grant ────────────────────────────────────────

describe('isAllowed - danger pattern beats grant', () => {
  it('rm -rf / blocked even with full_access + matching grant', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'full_access',
      grants: [makeGrant({ capability: 'LOCAL_EXECUTE', target: { kind: 'global' } })],
    });
    const target: ResolvedTarget = { kind: 'path', value: 'rm -rf /' };
    const decision = isAllowed('LOCAL_EXECUTE', target, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('dangerous_pattern');
    expect(decision.action).toBe('deny_silent');
  });

  it('System32 write blocked silently', () => {
    const base = loadBaseSession();
    const session = withPermission(base, { default_level: 'full_access' });
    const target: ResolvedTarget = {
      kind: 'path',
      value: 'C:\\Windows\\System32\\drivers\\hosts',
    };
    const decision = isAllowed('LOCAL_WRITE', target, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('dangerous_pattern');
    expect(decision.action).toBe('deny_silent');
  });
});

// ─── 3-4. Plan mode ───────────────────────────────────────────────────────

describe('isAllowed - Plan mode', () => {
  it('plan.active blocks LOCAL_WRITE.modify', () => {
    const base = loadBaseSession();
    let session = withPlan(base, true, ['LOCAL_WRITE.modify']);
    session = withPermission(session, {
      default_level: 'workspace_write',
      temporarily_blocked_capabilities: ['LOCAL_WRITE.modify'],
    });
    const decision = isAllowed('LOCAL_WRITE.modify', PATH_TARGET, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('plan_mode_active');
  });

  it('plan.active allows LOCAL_READ', () => {
    const base = loadBaseSession();
    let session = withPlan(base, true, ['LOCAL_WRITE']);
    session = withPermission(session, {
      default_level: 'workspace_write',
      temporarily_blocked_capabilities: ['LOCAL_WRITE'],
    });
    const decision = isAllowed('LOCAL_READ', PATH_TARGET, session);
    expect(decision.allowed).toBe(true);
  });

  it('plan.active allows NETWORK_AI', () => {
    const base = loadBaseSession();
    let session = withPlan(base, true, ['LOCAL_WRITE']);
    session = withPermission(session, {
      default_level: 'workspace_write',
      temporarily_blocked_capabilities: ['LOCAL_WRITE'],
    });
    const target: ResolvedTarget = { kind: 'url', value: 'https://api.anthropic.com' };
    const decision = isAllowed('NETWORK_AI', target, session);
    expect(decision.allowed).toBe(true);
  });
});

// ─── 5. Active grant overrides default ────────────────────────────────────

describe('isAllowed - active grant overrides default', () => {
  it('read_only + grant for LOCAL_WRITE allows', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [
        makeGrant({
          capability: 'LOCAL_WRITE',
          target: { kind: 'path', path: 'C:\\Dev\\foo', recursive: true },
        }),
      ],
    });
    const decision = isAllowed('LOCAL_WRITE', PATH_TARGET, session);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_grant');
    expect(decision.grant).toBeDefined();
  });
});

// ─── 6. Parent grant covers child ─────────────────────────────────────────

describe('isAllowed - parent grant covers child', () => {
  it('LOCAL_WRITE grant allows LOCAL_WRITE.modify', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [
        makeGrant({
          capability: 'LOCAL_WRITE',
          target: { kind: 'path', path: 'C:\\Dev\\foo', recursive: true },
        }),
      ],
    });
    const decision = isAllowed('LOCAL_WRITE.modify', PATH_TARGET, session);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_grant');
  });

  it('LOCAL_OUTSIDE_CWD grant allows LOCAL_OUTSIDE_CWD.read', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [makeGrant({ capability: 'LOCAL_OUTSIDE_CWD', target: { kind: 'global' } })],
    });
    const decision = isAllowed(
      'LOCAL_OUTSIDE_CWD.read',
      { kind: 'path', value: 'C:\\Other\\place' },
      session
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_grant');
  });
});

// ─── 7-8. Expired / revoked grants ────────────────────────────────────────

describe('isAllowed - expired / revoked grants', () => {
  it('expired grant falls through to level check', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [
        makeGrant({
          capability: 'LOCAL_WRITE',
          target: { kind: 'global' },
          expires_at: '2020-01-01T00:00:00.000Z',
        }),
      ],
    });
    const decision = isAllowed('LOCAL_WRITE.modify', PATH_TARGET, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('requires_user_confirmation');
  });

  it('revoked grant falls through to level check', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [
        makeGrant({
          capability: 'LOCAL_WRITE',
          target: { kind: 'global' },
          revoked_at: '2026-05-01T00:00:00.000Z',
        }),
      ],
    });
    const decision = isAllowed('LOCAL_WRITE.modify', PATH_TARGET, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('requires_user_confirmation');
  });
});

// ─── 9-10. Default level decides ──────────────────────────────────────────

describe('isAllowed - default level decides', () => {
  it('workspace_write + LOCAL_EXECUTE inside cwd -> allowed_by_default_level', () => {
    const base = loadBaseSession();
    const session = withPermission(base, { default_level: 'workspace_write', grants: [] });
    const decision = isAllowed(
      'LOCAL_EXECUTE',
      { kind: 'path', value: 'C:\\Dev\\foo\\script.sh' },
      session,
      'C:\\Dev\\foo'
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_default_level');
  });

  it('workspace_write + LOCAL_OUTSIDE_CWD.write -> requires_user_confirmation', () => {
    const base = loadBaseSession();
    const session = withPermission(base, { default_level: 'workspace_write', grants: [] });
    const decision = isAllowed(
      'LOCAL_OUTSIDE_CWD.write',
      { kind: 'path', value: 'C:\\Other\\place' },
      session,
      'C:\\Dev\\foo'
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('requires_user_confirmation');
  });

  it('workspace_write + LOCAL_WRITE outside cwd -> level_does_not_allow', () => {
    const base = loadBaseSession();
    const session = withPermission(base, { default_level: 'workspace_write', grants: [] });
    const decision = isAllowed(
      'LOCAL_WRITE',
      { kind: 'path', value: 'C:\\Other\\place\\foo.txt' },
      session,
      'C:\\Dev\\foo'
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('level_does_not_allow');
  });
});

// ─── 11. read_only level rejects writes ───────────────────────────────────

describe('isAllowed - read_only level rejects writes', () => {
  it('read_only + LOCAL_WRITE.create with no grant -> requires_user_confirmation', () => {
    const base = loadBaseSession();
    const session = withPermission(base, { default_level: 'read_only', grants: [] });
    const decision = isAllowed('LOCAL_WRITE.create', PATH_TARGET, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('requires_user_confirmation');
  });

  it('read_only + LOCAL_READ -> allowed_by_default_level', () => {
    const base = loadBaseSession();
    const session = withPermission(base, { default_level: 'read_only', grants: [] });
    const decision = isAllowed('LOCAL_READ', PATH_TARGET, session);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_default_level');
  });
});

// ─── 12. Most-specific grant chosen ──────────────────────────────────────

describe('isAllowed - most-specific grant chosen', () => {
  it('URL grant beats path grant when both match', () => {
    const base = loadBaseSession();
    const urlGrant = makeGrant({
      id: 'url-grant',
      capability: 'NETWORK_REMOTE',
      target: { kind: 'url', url: 'https://api.acme.com/v1' },
    });
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [
        makeGrant({
          id: 'global-grant',
          capability: 'NETWORK_REMOTE',
          target: { kind: 'global' },
        }),
        urlGrant,
      ],
    });
    const decision = isAllowed(
      'NETWORK_REMOTE',
      { kind: 'url', value: 'https://api.acme.com/v1' },
      session
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_grant');
    expect(decision.grant?.id).toBe('url-grant');
  });

  it('non-recursive path beats recursive path when both match the same target', () => {
    const base = loadBaseSession();
    const exact = makeGrant({
      id: 'exact',
      capability: 'LOCAL_WRITE',
      target: { kind: 'path', path: 'C:\\Dev\\foo', recursive: false },
    });
    const recursive = makeGrant({
      id: 'recursive',
      capability: 'LOCAL_WRITE',
      target: { kind: 'path', path: 'C:\\Dev\\foo', recursive: true },
    });
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [recursive, exact],
    });
    const decision = isAllowed(
      'LOCAL_WRITE',
      { kind: 'path', value: 'C:\\Dev\\foo' },
      session
    );
    expect(decision.allowed).toBe(true);
    expect(decision.grant?.id).toBe('exact');
  });
});

// ─── 13. BROWSER_INTERACT blocked in plan mode [new] ─────────────────────

describe('isAllowed - plan mode blocks BROWSER_INTERACT', () => {
  it('BROWSER_INTERACT is not read-only, so plan.active blocks it', () => {
    const base = loadBaseSession();
    const session = withPlan(withPermission(base, { default_level: 'full_access' }), true);
    const target: ResolvedTarget = { kind: 'url', value: 'https://example.com' };
    const decision = isAllowed('BROWSER_INTERACT', target, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('plan_mode_active');
  });
});

// ─── 14. Cross-capability deny isolation [new] ────────────────────────────

describe('isAllowed - cross-capability deny isolation', () => {
  it('deny for LOCAL_WRITE does NOT affect LOCAL_READ', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [makeGrant({ capability: '__deny__:LOCAL_WRITE', target: { kind: 'global' } })],
    });
    const decision = isAllowed('LOCAL_READ', PATH_TARGET, session);
    expect(decision.reason).not.toBe('explicitly_denied');
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_default_level');
  });
});

// ─── 15. Sub-capability sibling isolation [new] ───────────────────────────

describe('isAllowed - sub-capability sibling isolation', () => {
  it('LOCAL_WRITE.create grant does NOT cover LOCAL_WRITE.delete (sibling)', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [
        makeGrant({
          capability: 'LOCAL_WRITE.create',
          target: { kind: 'path', path: 'C:\\Dev\\foo', recursive: true },
        }),
      ],
    });
    const decision = isAllowed('LOCAL_WRITE.delete', PATH_TARGET, session);
    expect(decision.reason).not.toBe('allowed_by_grant');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('requires_user_confirmation');
  });
});

// ─── 16. Revoked beats not-yet-expired [new] ──────────────────────────────

describe('isAllowed - revoked_at beats future expires_at', () => {
  it('grant with revoked_at=now and expires_at=future is treated as inactive', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'read_only',
      grants: [
        makeGrant({
          capability: 'LOCAL_WRITE',
          target: { kind: 'global' },
          revoked_at: new Date().toISOString(),
          expires_at: '2099-01-01T00:00:00.000Z',
        }),
      ],
    });
    const decision = isAllowed('LOCAL_WRITE', PATH_TARGET, session);
    expect(decision.reason).not.toBe('allowed_by_grant');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('requires_user_confirmation');
  });
});

// ─── 17. Exact expiry boundary sentinel [new] ────────────────────────────
//
// isExpired uses '<' not '<=' so expires_at === now is NOT expired.
// This test is a sentinel: fails immediately if comparison is changed to '<='.

describe('isExpired - exact boundary: expires_at === now is NOT expired', () => {
  it('expires_at exactly equal to now returns false (impl uses < not <=)', () => {
    const now = new Date('2026-05-02T12:00:00.000Z');
    const grant = makeGrant({
      capability: 'LOCAL_READ',
      target: { kind: 'global' },
      expires_at: now.toISOString(),
    });
    // isExpired: grant.expires_at < now.toISOString()
    // '2026-05-02T12:00:00.000Z' < '2026-05-02T12:00:00.000Z' -> false
    expect(isExpired(grant, now)).toBe(false);
  });
});

// ─── 18. Custom level falls through [new] ────────────────────────────────

describe('isAllowed - custom level with no grants requires confirmation', () => {
  it('custom level + no grants + LOCAL_READ -> requires_user_confirmation', () => {
    const base = loadBaseSession();
    const session = withPermission(base, {
      default_level: 'custom',
      grants: [],
    });
    // LEVEL_CAPABILITIES.custom is an empty Set -> requires_user_confirmation
    const decision = isAllowed('LOCAL_READ', PATH_TARGET, session);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('requires_user_confirmation');
  });
});
