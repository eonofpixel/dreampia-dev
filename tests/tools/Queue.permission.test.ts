/**
 * Queue × Permission integration — isAllowed 결과가 ToolResult 로 어떻게 매핑되는지.
 *
 * Spec: docs/permission/resolver.md, docs/tools/queue.md
 *
 * 시나리오:
 *  - read_only / workspace_write / full_access level + 다양한 capability
 *  - explicit deny grant
 *  - dangerous pattern (rm -rf /, sudo, System32)
 *  - plan mode active
 *  - sub-capability (LOCAL_EXECUTE.elevated)
 *
 * 사용 패턴: 실제 ShellRunTool 또는 mock 으로 LOCAL_EXECUTE 권한 흐름 검증.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { ToolRegistry } from '../../src/tools/Registry';
import { ToolQueue } from '../../src/tools/Queue';
import type { Tool, ToolCall } from '../../src/tools/types';
import type { Capability } from '../../src/permission';
import type {
  Session,
  ToolCallId,
  TurnId,
} from '../../src/types';
import type {
  PermissionGrant,
  PermissionLevel,
  GrantTarget,
} from '../../src/types/permission';

// ────────────────────────────────────────────────────────────
// Fixtures + builders
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadSession(): Session {
  const raw = readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8');
  return JSON.parse(raw) as Session;
}

function withLevel(s: Session, level: PermissionLevel): Session {
  return {
    ...s,
    permission: { ...s.permission, default_level: level },
  };
}

function withGrants(s: Session, grants: PermissionGrant[]): Session {
  return {
    ...s,
    permission: { ...s.permission, grants },
  };
}

function withPlan(s: Session, active: boolean): Session {
  return {
    ...s,
    plan: { ...s.plan, active },
    permission: {
      ...s.permission,
      temporarily_blocked_capabilities: active
        ? ['LOCAL_WRITE', 'LOCAL_EXECUTE']
        : s.permission.temporarily_blocked_capabilities,
    },
  };
}

function makeGrant(opts: {
  capability: string;
  target: GrantTarget;
  id?: string;
}): PermissionGrant {
  return {
    id: opts.id ?? 'grant-test',
    session_id: '019d0000-0000-7000-8000-000000000002' as Session['id'],
    capability: opts.capability,
    target: opts.target,
    scope: 'session',
    granted_at: '2026-05-02T00:00:00.000Z',
    granted_by: 'user',
  };
}

let counter = 1;
function nextCallId(): ToolCallId {
  const id = `019d0001-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

function makeCall(
  session: Session,
  toolId: string,
  input: unknown
): ToolCall {
  return {
    id: nextCallId(),
    tool_id: toolId,
    session_id: session.id,
    turn_id: 'turn-1' as TurnId,
    input,
    origin: 'ai',
    created_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// Mock shell-like tool (no real subprocess)
// ────────────────────────────────────────────────────────────

interface ShellMockInput {
  cmd: string;
}

function makeShellMockTool(): Tool<ShellMockInput, { stdout: string }> {
  return {
    id: 'mock.shell',
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({ cmd: z.string().min(1) }),
    output_schema: z.object({ stdout: z.string() }),
    required_capabilities: (input): Capability[] => {
      const caps: Capability[] = ['LOCAL_EXECUTE'];
      if (/\b(sudo|runas)\b/i.test(input.cmd)) {
        caps.push('LOCAL_EXECUTE.elevated');
      }
      return caps;
    },
    permission_target: (input) => ({ kind: 'global', value: input.cmd }),
    execute: async (input) => ({ stdout: `ran: ${input.cmd}` }),
    display: {
      name: 'Mock Shell',
      summary: (i) => i.cmd,
      summary_result: (o) => o.stdout,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('Queue × Permission — level-based denial', () => {
  it('read_only level denies LOCAL_EXECUTE', async () => {
    const session = withLevel(loadSession(), 'read_only');
    const reg = new ToolRegistry();
    reg.register(makeShellMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall(session, 'mock.shell', { cmd: 'echo hello' })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('workspace_write level allows safe LOCAL_EXECUTE', async () => {
    const session = withLevel(loadSession(), 'workspace_write');
    const reg = new ToolRegistry();
    reg.register(makeShellMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall(session, 'mock.shell', { cmd: 'npm test' })
    );
    expect(result.status).toBe('success');
    expect(result.output).toEqual({ stdout: 'ran: npm test' });
  });
});

describe('Queue × Permission — explicit deny', () => {
  it('explicit deny grant blocks LOCAL_EXECUTE even with workspace_write', async () => {
    let session = withLevel(loadSession(), 'workspace_write');
    session = withGrants(session, [
      makeGrant({
        capability: '__deny__:LOCAL_EXECUTE',
        target: { kind: 'global' },
      }),
    ]);
    const reg = new ToolRegistry();
    reg.register(makeShellMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall(session, 'mock.shell', { cmd: 'echo hi' })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
    expect(result.error?.details?.['reason']).toBe('explicitly_denied');
  });
});

describe('Queue × Permission — dangerous patterns', () => {
  it('rm -rf / blocked as DANGEROUS_PATTERN even with full_access grant', async () => {
    let session = withLevel(loadSession(), 'full_access');
    session = withGrants(session, [
      makeGrant({ capability: 'LOCAL_EXECUTE', target: { kind: 'global' } }),
    ]);
    const reg = new ToolRegistry();
    reg.register(makeShellMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall(session, 'mock.shell', { cmd: 'rm -rf /' })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('DANGEROUS_PATTERN');
    expect(result.error?.details?.['action']).toBe('deny_silent');
  });
});

describe('Queue × Permission — plan mode', () => {
  it('plan mode active blocks LOCAL_EXECUTE', async () => {
    const session = withPlan(
      withLevel(loadSession(), 'full_access'),
      true
    );
    const reg = new ToolRegistry();
    reg.register(makeShellMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall(session, 'mock.shell', { cmd: 'echo plan' })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
    expect(result.error?.details?.['reason']).toBe('plan_mode_active');
  });
});

describe('Queue × Permission — multi-capability tool', () => {
  it('all required capabilities must pass — sudo cmd in workspace_write fails (elevated)', async () => {
    const session = withLevel(loadSession(), 'workspace_write');
    const reg = new ToolRegistry();
    reg.register(makeShellMockTool());
    const q = new ToolQueue(reg, () => session);

    // sudo triggers DANGEROUS_PATTERN (require_modal action) before level check;
    // resolver returns dangerous_pattern with action 'require_modal' → Queue treats as denied (no UI in P0).
    const result = await q.enqueue(
      makeCall(session, 'mock.shell', { cmd: 'sudo echo hi' })
    );
    expect(result.status).toBe('failed');
    // sudo는 dangerous_pattern (require_modal) 이 먼저 trigger.
    // P0 에선 UI 없으므로 DANGEROUS_PATTERN code 로 차단.
    expect(['PERMISSION_DENIED', 'DANGEROUS_PATTERN']).toContain(
      result.error?.code
    );
  });

  it('full_access + sudo → DANGEROUS_PATTERN (require_modal, no UI in P0)', async () => {
    const session = withLevel(loadSession(), 'full_access');
    const reg = new ToolRegistry();
    reg.register(makeShellMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall(session, 'mock.shell', { cmd: 'sudo echo hi' })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('DANGEROUS_PATTERN');
    expect(result.error?.details?.['action']).toBe('require_modal');
  });
});

describe('Queue × Permission — warn-action override (Queue-level)', () => {
  it('warn-action danger pattern is logged but allowed (P0 design choice)', async () => {
    const session = withLevel(loadSession(), 'workspace_write');
    const reg = new ToolRegistry();

    // Tool that requires LOCAL_READ on a .env file (warn pattern in DangerCheck)
    const envReader: Tool<{ path: string }, { contents: string }> = {
      id: 'mock.envread',
      version: '1.0.0',
      source: 'builtin',
      input_schema: z.object({ path: z.string() }),
      output_schema: z.object({ contents: z.string() }),
      required_capabilities: () => ['LOCAL_READ'],
      permission_target: (input) => ({ kind: 'path', value: input.path }),
      execute: async (input) => ({ contents: `read: ${input.path}` }),
      display: {
        name: 'Env Reader',
        summary: (i) => i.path,
        summary_result: (o) => o.contents,
      },
    };
    reg.register(envReader);
    const q = new ToolQueue(reg, () => session);

    // .env path triggers 'warn' action in DANGEROUS_PATTERNS — Queue overrides to allow.
    const result = await q.enqueue(
      makeCall(session, 'mock.envread', { path: 'C:\\Dev\\foo\\.env' })
    );
    expect(result.status).toBe('success');
    expect(result.output).toEqual({ contents: 'read: C:\\Dev\\foo\\.env' });
  });
});
