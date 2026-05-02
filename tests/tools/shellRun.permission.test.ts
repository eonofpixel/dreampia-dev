/**
 * shell.run × Queue 권한 통합 — 실제 ShellRunTool 을 다양한 session 으로.
 *
 * Spec: docs/permission/danger-patterns.md, docs/tools/_index.md
 *
 * 시나리오:
 *  - workspace_write + 안전 cmd → 성공
 *  - read_only + 어떤 cmd든 → PERMISSION_DENIED
 *  - workspace_write + dangerous (rm -rf /) → DANGEROUS_PATTERN
 *  - full_access + sudo → DANGEROUS_PATTERN (require_modal, P0 deny)
 *  - workspace_write + npm install (no danger match) → 성공
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ToolRegistry } from '../../src/tools/Registry';
import { ToolQueue } from '../../src/tools/Queue';
import { ShellRunTool } from '../../src/tools/builtin/shellRun';
import type { Session, ToolCallId, TurnId } from '../../src/types';
import type { ToolCall } from '../../src/tools/types';
import type { PermissionLevel } from '../../src/types/permission';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadSessionWithLevel(level: PermissionLevel): Session {
  const raw = readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8');
  const s = JSON.parse(raw) as Session;
  return {
    ...s,
    workspace: { ...s.workspace, root: process.cwd() },
    permission: { ...s.permission, default_level: level },
  };
}

let counter = 1;
function nextCallId(): ToolCallId {
  const id = `019d0001-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

function makeQueue(session: Session): ToolQueue {
  const reg = new ToolRegistry();
  reg.register(ShellRunTool);
  return new ToolQueue(reg, () => session);
}

function makeCall(session: Session, cmd: string): ToolCall {
  return {
    id: nextCallId(),
    tool_id: 'shell.run',
    session_id: session.id,
    turn_id: 'turn-1' as TurnId,
    input: { cmd },
    origin: 'ai',
    created_at: new Date().toISOString(),
  };
}

function makeCallWithInput(session: Session, input: unknown): ToolCall {
  return {
    ...makeCall(session, 'echo placeholder'),
    input,
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('shell.run × permission — workspace_write level', () => {
  it('echo hello → success', async () => {
    const session = loadSessionWithLevel('workspace_write');
    const q = makeQueue(session);

    const result = await q.enqueue(makeCall(session, 'echo hello'));
    expect(result.status).toBe('success');
  });

  it('npm install (no danger match) → success', async () => {
    const session = loadSessionWithLevel('workspace_write');
    const q = makeQueue(session);

    // 실제 npm install 안 돌리고, 빠른 echo 명령으로 대체 — 권한 통과만 확인
    // 'npm install' 자체는 danger pattern 아님. 권한 흐름만 검증.
    const result = await q.enqueue(
      makeCall(session, 'echo "would npm install"')
    );
    expect(result.status).toBe('success');
  });

  it('cwd outside workspace is blocked before subprocess execution', async () => {
    const session = loadSessionWithLevel('workspace_write');
    const q = makeQueue(session);

    const result = await q.enqueue(
      makeCallWithInput(session, {
        cmd: 'echo should-not-run',
        cwd: 'C:\\outside-dreampia-workspace',
      })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
    expect(result.error?.details?.['reason']).toBe('level_does_not_allow');
  });
});

describe('shell.run × permission — read_only level', () => {
  it('echo hello blocked (LOCAL_EXECUTE not in read_only)', async () => {
    const session = loadSessionWithLevel('read_only');
    const q = makeQueue(session);

    const result = await q.enqueue(makeCall(session, 'echo hello'));
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });
});

describe('shell.run × permission — dangerous patterns', () => {
  it('workspace_write + rm -rf / → DANGEROUS_PATTERN (deny_silent)', async () => {
    const session = loadSessionWithLevel('workspace_write');
    const q = makeQueue(session);

    const result = await q.enqueue(makeCall(session, 'rm -rf /'));
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('DANGEROUS_PATTERN');
    expect(result.error?.details?.['action']).toBe('deny_silent');
    // 실제 subprocess 절대 안 돌아야 — duration 매우 짧음
    expect(result.duration_ms).toBeLessThan(200);
  });

  it('full_access + sudo cmd → DANGEROUS_PATTERN (require_modal, P0 deny)', async () => {
    const session = loadSessionWithLevel('full_access');
    const q = makeQueue(session);

    const result = await q.enqueue(makeCall(session, 'sudo echo hi'));
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('DANGEROUS_PATTERN');
    expect(result.error?.details?.['action']).toBe('require_modal');
  });
});
