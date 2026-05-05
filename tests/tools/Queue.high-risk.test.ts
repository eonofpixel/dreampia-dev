/**
 * ToolQueue — v1.1.1 hotfix (Codex Q7 blind spot) high-risk capability + session
 * grant in-memory only contract.
 *
 * 검증:
 *  1. high-risk capability + 'session' 응답 → 'once' 로 silently downgrade.
 *     in-memory grant 추가 X.
 *  2. high-risk capability + 'always' 응답 → 'once' 로 downgrade.
 *     grantPersister 호출 X (DB 영속 X).
 *  3. high-risk capability 요청 시 confirmer 가 받는 request 의 is_dangerous=true
 *     강제 (caller 가 false 로 줘도).
 *  4. non-high-risk capability + 'session' → in-memory grant 추가, persister X.
 *  5. non-high-risk + 'always' → persister 호출, in-memory 추가 X (DB 만).
 *  6. 'session' grant 가 같은 capability + target 의 다음 호출에서 confirm
 *     생략 (Resolver augmented session 으로 활성).
 *  7. clearSessionGrants — test/shutdown helper 동작.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { ToolRegistry } from '../../src/tools/Registry';
import { ToolQueue } from '../../src/tools/Queue';
import type {
  PermissionConfirmer,
  PermissionRequest,
  PermissionResponse,
  Tool,
  ToolCall,
} from '../../src/tools/types';
import type { Capability } from '../../src/permission';
import type { Session, ToolCallId, TurnId } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadSession(): Session {
  return JSON.parse(
    readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8')
  ) as Session;
}

let counter = 1;
function nextCallId(): ToolCallId {
  const id = `019d0014-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

function makeCall(overrides: Partial<ToolCall> = {}): ToolCall {
  const session = loadSession();
  return {
    id: nextCallId(),
    tool_id: 'mock.high-risk',
    session_id: session.id,
    turn_id: 'turn-hr' as TurnId,
    input: {},
    origin: 'ai',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeTool(caps: Capability[]): Tool<{}, { ok: number }> {
  return {
    id: 'mock.high-risk',
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({}),
    output_schema: z.object({ ok: z.number() }),
    required_capabilities: () => caps,
    execute: async () => ({ ok: 1 }),
    display: { name: 'HR Mock', summary: () => 'm', summary_result: () => 'd' },
  };
}

function makeConfirmer(decision: PermissionResponse['decision']): {
  confirmer: PermissionConfirmer;
  received: PermissionRequest[];
} {
  const received: PermissionRequest[] = [];
  return {
    received,
    confirmer: {
      confirm: async (req) => {
        received.push(req);
        return { request_id: req.request_id, decision };
      },
    },
  };
}

describe('v1.1.1 hotfix — high-risk capability 강제 escalation', () => {
  it('high-risk + session 응답 → once 로 downgrade + in-memory grant X', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    // LOCAL_EXECUTE.elevated 는 high-risk set + workspace_write level 미포함.
    reg.register(makeTool(['LOCAL_EXECUTE.elevated']));
    const { confirmer, received } = makeConfirmer('session');
    const persister = vi.fn();
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: persister,
    });

    const result = await q.enqueue(makeCall());
    expect(result.status).toBe('success');
    // confirmer 가 받은 request 의 is_dangerous 가 true (강제 escalation).
    expect(received.length).toBe(1);
    expect(received[0]?.is_dangerous).toBe(true);
    // session 으로 응답했지만 high-risk 라 downgrade — in-memory 추가 X.
    expect(q.getSessionGrants().length).toBe(0);
    // persister 호출 X.
    expect(persister).not.toHaveBeenCalled();
  });

  it('high-risk + always 응답 → once 로 downgrade + DB 영속 X', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeTool(['LOCAL_OUTSIDE_CWD.write']));
    const { confirmer } = makeConfirmer('always');
    const persister = vi.fn();
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: persister,
    });

    const result = await q.enqueue(makeCall());
    expect(result.status).toBe('success');
    expect(persister).not.toHaveBeenCalled();
    expect(q.getSessionGrants().length).toBe(0);
  });

  it('high-risk + deny 응답 → permission_denied (downgrade 무관)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeTool(['LOCAL_WRITE.delete']));
    const { confirmer } = makeConfirmer('deny');
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
    });

    const result = await q.enqueue(makeCall());
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('non-high-risk capability 는 confirm request 의 is_dangerous=false (caller default 그대로)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    // SYSTEM_AUTOMATION 은 high-risk set X.
    reg.register(makeTool(['SYSTEM_AUTOMATION']));
    const { confirmer, received } = makeConfirmer('once');
    const q = new ToolQueue(reg, () => session, { permission_confirmer: confirmer });
    await q.enqueue(makeCall());
    expect(received[0]?.is_dangerous).toBe(false);
  });
});

describe('v1.1.1 hotfix — session grant in-memory only', () => {
  it("non-high-risk + 'session' → in-memory 추가, persister 호출 X", async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeTool(['SYSTEM_AUTOMATION']));
    const { confirmer } = makeConfirmer('session');
    const persister = vi.fn();
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: persister,
    });

    await q.enqueue(makeCall());
    expect(persister).not.toHaveBeenCalled();
    const inMem = q.getSessionGrants();
    expect(inMem.length).toBe(1);
    expect(inMem[0]?.scope).toBe('session');
  });

  it("non-high-risk + 'always' → persister 호출, in-memory 추가 X", async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeTool(['SYSTEM_AUTOMATION']));
    const { confirmer } = makeConfirmer('always');
    const persister = vi.fn();
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: persister,
    });

    await q.enqueue(makeCall());
    expect(persister).toHaveBeenCalledTimes(1);
    const args = persister.mock.calls[0];
    expect(args?.[2]).toBe('always');
    // in-memory 추가 X — DB 가 source of truth.
    expect(q.getSessionGrants().length).toBe(0);
  });

  it("'session' grant 가 다음 호출에서 confirm 생략 (Resolver 활성)", async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeTool(['SYSTEM_AUTOMATION']));
    let confirmCount = 0;
    const confirmer: PermissionConfirmer = {
      confirm: async (req) => {
        confirmCount += 1;
        return { request_id: req.request_id, decision: 'session' };
      },
    };
    const q = new ToolQueue(reg, () => session, { permission_confirmer: confirmer });

    // 1차 호출 — confirm 한 번 호출.
    await q.enqueue(makeCall());
    expect(confirmCount).toBe(1);
    // 2차 호출 (같은 세션 + capability + target=global) — Resolver 가
    // augmented session 의 grant 인식 → confirm 생략.
    await q.enqueue(makeCall());
    expect(confirmCount).toBe(1);
  });

  it('clearSessionGrants — 모든 in-memory grant 제거', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeTool(['SYSTEM_AUTOMATION']));
    const { confirmer } = makeConfirmer('session');
    const q = new ToolQueue(reg, () => session, { permission_confirmer: confirmer });
    await q.enqueue(makeCall());
    expect(q.getSessionGrants().length).toBe(1);
    q.clearSessionGrants();
    expect(q.getSessionGrants().length).toBe(0);
  });
});
