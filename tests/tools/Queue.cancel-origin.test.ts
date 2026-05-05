/**
 * ToolQueue — v1.1.4 hotfix (Codex Q10) cancel origin binding contract.
 *
 * 검증:
 *   다른 webContents 가 임의로 active call 또는 turn 을 abort 시키는 attack
 *   차단. cancelCall / cancelTurn 의 requesterWebContentsId 가 owner 와 다르면
 *   거절. NO_ORIGIN(0) 또는 미지정 = 호환 (테스트/프로그램적 호출).
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
  const id = `019d0016-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

/**
 * Long-running tool — abort 신호 전까지 끝나지 않음. cancel 검증용.
 */
function makeBlockingTool(caps: Capability[] = ['LOCAL_READ']): Tool<object, { ok: number }> {
  return {
    id: 'mock.block',
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({}),
    output_schema: z.object({ ok: z.number() }),
    required_capabilities: () => caps,
    execute: async (_input, ctx) => {
      // signal 이 abort 될 때까지 대기.
      await new Promise<void>((_resolve, reject) => {
        if (ctx.signal.aborted) {
          reject(new DOMException(String(ctx.signal.reason), 'AbortError'));
          return;
        }
        ctx.signal.addEventListener(
          'abort',
          () => {
            reject(new DOMException(String(ctx.signal.reason), 'AbortError'));
          },
          { once: true }
        );
      });
      return { ok: 1 };
    },
    display: { name: 'Block Mock', summary: () => 'm', summary_result: () => 'd' },
  };
}

function makeCall(turnId = 'turn-cancel'): ToolCall {
  const session = loadSession();
  return {
    id: nextCallId(),
    tool_id: 'mock.block',
    session_id: session.id,
    turn_id: turnId as TurnId,
    input: {},
    origin: 'ai',
    created_at: new Date().toISOString(),
  };
}

describe('v1.1.4 hotfix — cancelCall origin 검증 (Codex Q10)', () => {
  it('같은 webContents 의 cancelCall — 수락', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeBlockingTool());
    const q = new ToolQueue(reg, () => session);
    const call = makeCall();
    const promise = q.enqueue(call, { web_contents_id: 11 });
    // 비동기 — runTool 진입 후 abort.
    await new Promise((r) => setTimeout(r, 10));
    const cancelled = q.cancelCall(call.id, 'user_cancelled', 11);
    expect(cancelled).toBe(true);
    const result = await promise;
    expect(result.status).toBe('cancelled');
  });

  it('다른 webContents 의 cancelCall — 거절', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeBlockingTool());
    const q = new ToolQueue(reg, () => session);
    const call = makeCall();
    const promise = q.enqueue(call, { web_contents_id: 11 });
    await new Promise((r) => setTimeout(r, 10));
    // 다른 webContents 22 의 cancel — 거절.
    const cancelled = q.cancelCall(call.id, 'attack', 22);
    expect(cancelled).toBe(false);
    // 정상 owner 가 마무리.
    q.cancelCall(call.id, 'user_cancelled', 11);
    await promise;
  });

  it('requesterWebContentsId 미지정 — 호환 (모든 cancel 수락)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeBlockingTool());
    const q = new ToolQueue(reg, () => session);
    const call = makeCall();
    const promise = q.enqueue(call, { web_contents_id: 33 });
    await new Promise((r) => setTimeout(r, 10));
    // 미지정 — legacy 호환.
    const cancelled = q.cancelCall(call.id, 'user_cancelled');
    expect(cancelled).toBe(true);
    const result = await promise;
    expect(result.status).toBe('cancelled');
  });

  it('owner 가 NO_ORIGIN — 모든 sender 수락 (테스트 호환)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeBlockingTool());
    const q = new ToolQueue(reg, () => session);
    const call = makeCall();
    // origin 미전달 = NO_ORIGIN 버킷.
    const promise = q.enqueue(call);
    await new Promise((r) => setTimeout(r, 10));
    // 임의 sender 수락 (owner 가 NO_ORIGIN).
    const cancelled = q.cancelCall(call.id, 'user_cancelled', 999);
    expect(cancelled).toBe(true);
    await promise;
  });
});

describe('v1.1.4 hotfix — cancelTurn origin 검증 (Codex Q10)', () => {
  it('같은 webContents 의 turn 만 취소', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeBlockingTool());
    const q = new ToolQueue(reg, () => session, { max_concurrent_per_session: 5 });
    const callA = makeCall('turn-shared');
    const callB = makeCall('turn-shared');
    const pA = q.enqueue(callA, { web_contents_id: 11 });
    const pB = q.enqueue(callB, { web_contents_id: 22 });
    await new Promise((r) => setTimeout(r, 10));

    // wcid 11 sender 가 turn 취소 — 자기 call 만 cancel, callB 는 그대로.
    const count = q.cancelTurn('turn-shared' as TurnId, 'user', 11);
    expect(count).toBe(1);
    const rA = await pA;
    expect(rA.status).toBe('cancelled');
    // callB 는 still active — 정상 owner 가 마무리.
    q.cancelCall(callB.id, 'cleanup', 22);
    await pB;
  });

  it('requesterWebContentsId 미지정 — 모든 turn calls 취소 (legacy)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeBlockingTool());
    const q = new ToolQueue(reg, () => session, { max_concurrent_per_session: 5 });
    const callA = makeCall('turn-all');
    const callB = makeCall('turn-all');
    const pA = q.enqueue(callA, { web_contents_id: 11 });
    const pB = q.enqueue(callB, { web_contents_id: 22 });
    await new Promise((r) => setTimeout(r, 10));

    // 미지정 — 모두 취소 (legacy).
    const count = q.cancelTurn('turn-all' as TurnId, 'user');
    expect(count).toBe(2);
    const [rA, rB] = await Promise.all([pA, pB]);
    expect(rA.status).toBe('cancelled');
    expect(rB.status).toBe('cancelled');
  });
});
