/**
 * ToolQueue — v1.1.2 hotfix (Codex Q8 blind spot) webContentsId-based session
 * grant binding contract.
 *
 * Codex Q8 strict 발견:
 *   v1.1.1 의 'session' grant 는 SessionId 를 키로 in-memory Map 에 저장.
 *   IPC payload 의 session_id 를 renderer 가 spoof 하면 다른 세션의 grant 를
 *   빌릴 수 있음 ("session in-memory 전환이 보안 경계가 아니라 캐시").
 *
 * Fix:
 *   sessionGrants 키를 SessionId → number(webContentsId) 로 변경. enqueue
 *   second arg 의 web_contents_id 가 격리 키 — Electron 이 신뢰 가능한
 *   event.sender.id 출처. cleanup 은 BrowserWindow 'closed' 시점에
 *   clearGrantsForWebContents().
 *
 * 검증:
 *   1. 한 webContents 의 'session' grant 가 다른 webContents 호출에서 활성 X.
 *   2. 같은 webContents 의 다음 호출에서는 confirm 생략 (grant 활성).
 *   3. clearGrantsForWebContents 가 해당 버킷만 제거 — 다른 버킷 유지.
 *   4. clearSessionGrants 는 모든 버킷 제거 (shutdown).
 *   5. origin 미전달 (default NO_ORIGIN) 호출은 NO_ORIGIN 버킷으로 격리.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { ToolRegistry } from '../../src/tools/Registry';
import { ToolQueue } from '../../src/tools/Queue';
import type {
  PermissionConfirmer,
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
  const id = `019d0015-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

function makeCall(overrides: Partial<ToolCall> = {}): ToolCall {
  const session = loadSession();
  return {
    id: nextCallId(),
    tool_id: 'mock.wcb',
    session_id: session.id,
    turn_id: 'turn-wcb' as TurnId,
    input: {},
    origin: 'ai',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeTool(caps: Capability[]): Tool<object, { ok: number }> {
  return {
    id: 'mock.wcb',
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({}),
    output_schema: z.object({ ok: z.number() }),
    required_capabilities: () => caps,
    execute: async () => ({ ok: 1 }),
    display: { name: 'WCB Mock', summary: () => 'm', summary_result: () => 'd' },
  };
}

describe('v1.1.2 hotfix — webContentsId 기반 grant 격리', () => {
  it("webContents A 의 'session' grant 가 webContents B 호출에서는 활성 X", async () => {
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

    // webContents A (id=10) 첫 호출 — confirm 호출됨.
    await q.enqueue(makeCall(), { web_contents_id: 10 });
    expect(confirmCount).toBe(1);
    expect(q.getSessionGrants(10).length).toBe(1);

    // webContents B (id=20) 같은 세션/capability/target 호출 — A 의 grant 가
    // 활성되면 안 됨. 즉 confirm 다시 호출되어야 함.
    await q.enqueue(makeCall(), { web_contents_id: 20 });
    expect(confirmCount).toBe(2);
    expect(q.getSessionGrants(20).length).toBe(1);
    // A 의 grant 도 그대로 남아있음.
    expect(q.getSessionGrants(10).length).toBe(1);
  });

  it("같은 webContents 의 다음 호출은 'session' grant 로 confirm 생략", async () => {
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

    await q.enqueue(makeCall(), { web_contents_id: 7 });
    expect(confirmCount).toBe(1);
    // 같은 webContents 7 의 두 번째 호출 — confirm 호출 X (grant 활성).
    await q.enqueue(makeCall(), { web_contents_id: 7 });
    expect(confirmCount).toBe(1);
  });

  it('clearGrantsForWebContents — 해당 버킷만 제거, 다른 버킷 유지', async () => {
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

    await q.enqueue(makeCall(), { web_contents_id: 100 });
    await q.enqueue(makeCall(), { web_contents_id: 200 });
    expect(q.getSessionGrants(100).length).toBe(1);
    expect(q.getSessionGrants(200).length).toBe(1);

    q.clearGrantsForWebContents(100);
    expect(q.getSessionGrants(100).length).toBe(0);
    // 200 버킷은 그대로.
    expect(q.getSessionGrants(200).length).toBe(1);

    // 100 버킷은 비워졌으니 같은 capability/target 다시 호출하면 confirm 재호출.
    const before = confirmCount;
    await q.enqueue(makeCall(), { web_contents_id: 100 });
    expect(confirmCount).toBe(before + 1);
  });

  it('clearSessionGrants — 모든 버킷 제거 (shutdown)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeTool(['SYSTEM_AUTOMATION']));
    const confirmer: PermissionConfirmer = {
      confirm: async (req) => ({ request_id: req.request_id, decision: 'session' }),
    };
    const q = new ToolQueue(reg, () => session, { permission_confirmer: confirmer });

    await q.enqueue(makeCall(), { web_contents_id: 1 });
    await q.enqueue(makeCall(), { web_contents_id: 2 });
    await q.enqueue(makeCall(), { web_contents_id: 3 });
    expect(q.getSessionGrants(1).length).toBe(1);
    expect(q.getSessionGrants(2).length).toBe(1);
    expect(q.getSessionGrants(3).length).toBe(1);

    q.clearSessionGrants();
    expect(q.getSessionGrants(1).length).toBe(0);
    expect(q.getSessionGrants(2).length).toBe(0);
    expect(q.getSessionGrants(3).length).toBe(0);
  });

  it('origin 미전달 호출은 NO_ORIGIN 버킷으로 격리 (테스트/프로그램적 호출)', async () => {
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

    // origin 미전달.
    await q.enqueue(makeCall());
    expect(confirmCount).toBe(1);
    // NO_ORIGIN(0) 버킷에 grant 저장.
    expect(q.getSessionGrants(ToolQueue.NO_ORIGIN).length).toBe(1);
    // default arg = NO_ORIGIN.
    expect(q.getSessionGrants().length).toBe(1);

    // 같은 default 호출은 grant 활성.
    await q.enqueue(makeCall());
    expect(confirmCount).toBe(1);

    // 다른 webContentsId 로 호출하면 격리 — confirm 다시.
    await q.enqueue(makeCall(), { web_contents_id: 999 });
    expect(confirmCount).toBe(2);
  });

  it('NO_ORIGIN 상수는 0', () => {
    expect(ToolQueue.NO_ORIGIN).toBe(0);
  });
});

describe('v1.1.3 hotfix — 같은 webContentsId 내 cross-session grant 격리 (Codex Q9)', () => {
  it("sessionA 의 'session' grant 가 sessionB 호출에 활성되지 X", async () => {
    const sessionA = loadSession();
    // sessionB 는 같은 fixture base 에 id 만 다른 변형.
    const sessionB = { ...sessionA, id: ('019d-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as typeof sessionA.id) };
    const reg = new ToolRegistry();
    reg.register(makeTool(['SYSTEM_AUTOMATION']));
    let confirmCount = 0;
    const confirmer: PermissionConfirmer = {
      confirm: async (req) => {
        confirmCount += 1;
        return { request_id: req.request_id, decision: 'session' };
      },
    };
    // getSession 이 호출 session_id 에 따라 분기.
    const q = new ToolQueue(
      reg,
      (id) => (id === sessionA.id ? sessionA : id === sessionB.id ? sessionB : undefined),
      { permission_confirmer: confirmer }
    );

    // sessionA 첫 호출 (webContents 5) — confirm + grant 저장.
    await q.enqueue(makeCall({ session_id: sessionA.id }), { web_contents_id: 5 });
    expect(confirmCount).toBe(1);

    // 같은 webContents 5 의 sessionB 호출 — sessionA grant 가 활성되면 안 됨.
    // session_id 필터로 거르므로 confirm 다시 호출.
    await q.enqueue(makeCall({ session_id: sessionB.id }), { web_contents_id: 5 });
    expect(confirmCount).toBe(2);

    // sessionA 의 같은 webContents 두 번째 호출 — grant 활성 (confirm 생략).
    await q.enqueue(makeCall({ session_id: sessionA.id }), { web_contents_id: 5 });
    expect(confirmCount).toBe(2);
  });
});
