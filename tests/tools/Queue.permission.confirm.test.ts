/**
 * ToolQueue — v1.1.0 SEC-2 full async pause-resume contract.
 *
 * 검증 (Codex Q6 (3a)+(4b)+(6)):
 *  1. requires_user_confirmation → confirmer.confirm() await.
 *  2. 'once' 응답 → 통과 (이번 call 만, grant 영속 X).
 *  3. 'session' / 'always' 응답 → grantPersister 호출 + 통과.
 *  4. 'deny' 응답 → permission_denied error.
 *  5. confirmer 미설정 (v1.0.x 호환) → 즉시 deny (기존 동작).
 *  6. confirmer.confirm throw → fail-closed deny + audit.
 *  7. dangerous_pattern 'require_modal' + confirmer → confirm 호출 + audit.
 *  8. audit event 종류 (granted_once/session/always + denied_by_user).
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { ToolRegistry } from '../../src/tools/Registry';
import { ToolQueue, type ToolAuditEvent } from '../../src/tools/Queue';
import type {
  PermissionConfirmer,
  PermissionRequest,
  PermissionResponse,
  Tool,
  ToolCall,
} from '../../src/tools/types';
import type { Capability } from '../../src/permission';
import type { PermissionGrant } from '../../src/types/permission';
import type { Session, ToolCallId, TurnId } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadSession(): Session {
  const raw = readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8');
  return JSON.parse(raw) as Session;
}

let counter = 1;
function nextCallId(): ToolCallId {
  const id = `019d0013-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

function makeCall(overrides: Partial<ToolCall> = {}): ToolCall {
  const session = loadSession();
  return {
    id: nextCallId(),
    tool_id: 'mock.confirm',
    session_id: session.id,
    turn_id: 'turn-confirm' as TurnId,
    input: {},
    origin: 'ai',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Mock tool 이 SYSTEM_AUTOMATION 요구 (workspace_write level 미포함 →
 * requires_user_confirmation 발화).
 */
function makeConfirmTool(
  caps: Capability[] = ['SYSTEM_AUTOMATION']
): Tool<{ x?: number }, { result: number }> {
  return {
    id: 'mock.confirm',
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({ x: z.number().optional() }),
    output_schema: z.object({ result: z.number() }),
    required_capabilities: () => caps,
    execute: async () => ({ result: 1 }),
    display: { name: 'Confirm Mock', summary: () => 'm', summary_result: () => 'd' },
  };
}

/** Programmable confirmer — auto-respond with given decision. */
function makeConfirmer(
  decision: PermissionResponse['decision'],
  opts: { reason?: string; throwError?: string } = {}
): { confirmer: PermissionConfirmer; received: PermissionRequest[] } {
  const received: PermissionRequest[] = [];
  const confirmer: PermissionConfirmer = {
    confirm: async (request) => {
      received.push(request);
      if (opts.throwError !== undefined) throw new Error(opts.throwError);
      const response: PermissionResponse = {
        request_id: request.request_id,
        decision,
      };
      if (opts.reason !== undefined) response.reason = opts.reason;
      return response;
    },
  };
  return { confirmer, received };
}

describe('ToolQueue — SEC-2 full async pause-resume', () => {
  it("'once' 응답 → 통과 + grantPersister 호출 X", async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeConfirmTool());
    const { confirmer } = makeConfirmer('once');
    const persister = vi.fn();
    const events: ToolAuditEvent[] = [];
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: persister,
      audit_sink: (e) => events.push(e),
    });

    const result = await q.enqueue(makeCall({ input: { x: 1 } }));
    expect(result.status).toBe('success');
    expect(persister).not.toHaveBeenCalled();
    // audit: permission.granted_once + tool_use.success.
    const granted = events.find((e) => e.event === 'permission.granted_once');
    expect(granted).toBeDefined();
    expect(granted?.outcome).toBe('allowed');
  });

  it("'session' 응답 → 통과 + in-memory grant only (v1.1.1: DB 영속 X)", async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeConfirmTool());
    const { confirmer } = makeConfirmer('session');
    const persister = vi.fn();
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: persister,
    });
    const result = await q.enqueue(makeCall({ input: {} }));
    expect(result.status).toBe('success');
    // v1.1.1: 'session' 은 grantPersister 호출 X.
    expect(persister).not.toHaveBeenCalled();
    // 그러나 in-memory sessionGrants 에는 추가됨 — 같은 세션의 다음 호출이
    // 같은 capability + target 으로 confirm 거치지 않고 통과.
    const inMemory = q.getSessionGrants(session.id);
    expect(inMemory.length).toBe(1);
    expect(inMemory[0]?.scope).toBe('session');
  });

  it("'always' 응답 → 통과 + grantPersister 호출 (duration='always')", async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeConfirmTool());
    const { confirmer } = makeConfirmer('always', { reason: 'trust' });
    const persistedGrants: { duration: 'session' | 'always'; grant: PermissionGrant }[] = [];
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: (_sid, grant, d) => {
        persistedGrants.push({ duration: d, grant });
      },
    });
    const result = await q.enqueue(makeCall({ input: {} }));
    expect(result.status).toBe('success');
    expect(persistedGrants.length).toBe(1);
    expect(persistedGrants[0]?.duration).toBe('always');
    expect(persistedGrants[0]?.grant.scope).toBe('persistent');
    expect(persistedGrants[0]?.grant.reason).toBe('trust');
  });

  it("'deny' 응답 → permission_denied error", async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeConfirmTool());
    const { confirmer, received } = makeConfirmer('deny', { reason: 'no thanks' });
    const persister = vi.fn();
    const events: ToolAuditEvent[] = [];
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: persister,
      audit_sink: (e) => events.push(e),
    });

    const result = await q.enqueue(makeCall());
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
    expect(received.length).toBe(1);
    expect(persister).not.toHaveBeenCalled();
    // audit: permission.denied_by_user + tool_use.failed.
    const denied = events.find((e) => e.event === 'permission.denied_by_user');
    expect(denied).toBeDefined();
    expect(denied?.outcome).toBe('denied');
    expect(denied?.error).toContain('no thanks');
  });

  it('confirmer 미설정 (v1.0.x 호환) → 즉시 deny', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeConfirmTool());
    const q = new ToolQueue(reg, () => session, {
      // permission_confirmer 미지정.
    });
    const result = await q.enqueue(makeCall());
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('confirmer.confirm throw → fail-closed deny + audit', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeConfirmTool());
    const { confirmer } = makeConfirmer('once', { throwError: 'IPC down' });
    const events: ToolAuditEvent[] = [];
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      audit_sink: (e) => events.push(e),
    });
    const result = await q.enqueue(makeCall());
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
    const errEvent = events.find((e) => e.event === 'permission.confirm_error');
    expect(errEvent).toBeDefined();
  });

  it('grant_persister throw → 이번 call 은 통과 (once 처럼)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeConfirmTool());
    const { confirmer } = makeConfirmer('always');
    const q = new ToolQueue(reg, () => session, {
      permission_confirmer: confirmer,
      grant_persister: () => {
        throw new Error('DB down');
      },
    });
    const result = await q.enqueue(makeCall());
    // grant 영속 실패해도 이번 call 자체는 성공.
    expect(result.status).toBe('success');
  });
});
