/**
 * shell.run — REAL subprocess 실행 검증.
 *
 * Spec: docs/tools/_index.md (TO-5)
 *
 * 사용 명령어는 cross-platform safe:
 *  - `echo X` — Win cmd.exe + Unix sh 모두 동작
 *  - `node -e "process.exit(N)"` — exit code 검증용
 *
 * Note: child_process.spawn 의 'signal' 옵션은 Node 16+ — engines>=22 보장.
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

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFullAccessSession(): Session {
  const raw = readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8');
  const s = JSON.parse(raw) as Session;
  return {
    ...s,
    workspace: {
      ...s.workspace,
      root: process.cwd(), // 실제 존재하는 dir 로 — fixture 의 C:\Dev\foo 는 없음
    },
    permission: { ...s.permission, default_level: 'workspace_write' },
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
  input: unknown,
  overrides: Partial<ToolCall> = {}
): ToolCall {
  return {
    id: nextCallId(),
    tool_id: 'shell.run',
    session_id: session.id,
    turn_id: 'turn-1' as TurnId,
    input,
    origin: 'ai',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeQueue(session: Session): ToolQueue {
  const reg = new ToolRegistry();
  reg.register(ShellRunTool);
  return new ToolQueue(reg, () => session);
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('shell.run — basic execution', () => {
  it('echo hello → stdout contains hello, exit 0', async () => {
    const session = loadFullAccessSession();
    const q = makeQueue(session);

    const result = await q.enqueue(
      makeCall(session, { cmd: 'echo hello' })
    );
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      const out = result.output as {
        stdout: string;
        exit_code: number;
        duration_ms: number;
      };
      expect(out.stdout).toContain('hello');
      expect(out.exit_code).toBe(0);
      expect(out.duration_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it('node -e "process.exit(7)" returns exit_code 7', async () => {
    const session = loadFullAccessSession();
    const q = makeQueue(session);

    const result = await q.enqueue(
      makeCall(session, { cmd: 'node -e "process.exit(7)"' })
    );
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      const out = result.output as { exit_code: number };
      expect(out.exit_code).toBe(7);
    }
  });
});

describe('shell.run — input validation', () => {
  it('empty cmd → INVALID_INPUT (Zod min(1))', async () => {
    const session = loadFullAccessSession();
    const q = makeQueue(session);

    const result = await q.enqueue(makeCall(session, { cmd: '' }));
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('INVALID_INPUT');
  });
});

describe('shell.run — cancellation + timeout', () => {
  it('abort signal kills subprocess → CANCELLED status', async () => {
    const session = loadFullAccessSession();
    const q = makeQueue(session);

    // Long-running node script so we have time to cancel
    const call = makeCall(session, {
      cmd: 'node -e "setTimeout(()=>{}, 30000)"',
    });
    const promise = q.enqueue(call);
    await new Promise((r) => setTimeout(r, 100));
    const cancelled = q.cancelCall(call.id, 'user_cancelled');
    expect(cancelled).toBe(true);

    const result = await promise;
    expect(result.status).toBe('cancelled');
    expect(result.error?.code).toBe('ABORTED');
  });

  it('timeout shorter than command → TIMEOUT status', async () => {
    const session = loadFullAccessSession();
    const q = makeQueue(session);

    const result = await q.enqueue(
      makeCall(
        session,
        { cmd: 'node -e "setTimeout(()=>{}, 30000)"' },
        { timeout_ms: 100 }
      )
    );
    expect(result.status).toBe('timeout');
    expect(result.error?.code).toBe('TIMEOUT');
  });
});

describe('shell.run — display formatters', () => {
  it('summary truncates long cmd to 80 chars', () => {
    const long = 'x'.repeat(200);
    const summary = ShellRunTool.display.summary({ cmd: long });
    expect(summary.length).toBeLessThanOrEqual(80);
  });

  it('summary_result formats as exit code + duration', () => {
    const result = ShellRunTool.display.summary_result({
      stdout: '',
      stderr: '',
      exit_code: 0,
      duration_ms: 123,
    });
    expect(result).toContain('exit 0');
    expect(result).toContain('123');
  });
});
