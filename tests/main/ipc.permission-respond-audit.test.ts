/**
 * IPC permission/respond — audit_log 영속 (v2.0 Phase A1, L1).
 *
 * 검증:
 *  - decision='once' 등 → audit event 'permission.granted' 기록
 *  - decision='deny' → audit event 'permission.denied' 기록 + outcome='denied'
 *  - audit 미주입 (legacy/test) → recordEvent 호출 X
 *  - confirmer.respond 가 false (matched X) → audit emit X
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1-test' },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string): void => {
      handlers.delete(channel);
    },
  },
}));

import { registerIpcHandlers } from '../../src/main/ipc';
import type { AuditLogStore, AuditEventInput } from '../../src/storage/AuditLogStore';
import type { Result } from '../../src/main/types';
import type { IpcPermissionConfirmer } from '../../src/main/IpcPermissionConfirmer';
import type { PermissionRequest } from '../../src/tools';
import type { ToolId } from '../../src/tools/types';
import type { SessionId, ToolCallId, TurnId } from '../../src/types';

const PENDING_REQUEST: PermissionRequest = {
  request_id: 'pcr-test-001',
  session_id: 'sess-A' as SessionId,
  turn_id: 'turn-A' as TurnId,
  call_id: 'call-A' as ToolCallId,
  tool_id: 'shell.run' as ToolId,
  capability: 'LOCAL_EXECUTE',
  target: { kind: 'global', value: '' },
  is_dangerous: false,
  tool_display_name: 'shell.run',
  requested_at: '2026-05-08T00:00:00.000Z',
};

function makeFakeConfirmer(matched: boolean): IpcPermissionConfirmer {
  return {
    confirm: vi.fn(),
    respond: vi.fn().mockReturnValue(matched),
    getPendingRequests: vi.fn().mockReturnValue([PENDING_REQUEST]),
  } as unknown as IpcPermissionConfirmer;
}

function makeFakeAudit(): { store: AuditLogStore; recorded: AuditEventInput[] } {
  const recorded: AuditEventInput[] = [];
  const store = {
    recordEvent: vi.fn((input: AuditEventInput) => {
      recorded.push(input);
      return 1;
    }),
  } as unknown as AuditLogStore;
  return { store, recorded };
}

const stubApp = {
  getVersion: () => '0.0.1-test',
} as unknown as Parameters<typeof registerIpcHandlers>[0];

describe('v2.0 Phase A1 — permission/respond audit emit', () => {
  beforeEach(() => {
    handlers.clear();
  });

  it("decision='once' → audit 'permission.granted'", async () => {
    const confirmer = makeFakeConfirmer(true);
    const { store: audit, recorded } = makeFakeAudit();
    registerIpcHandlers(
      stubApp,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { confirmer, audit }
    );
    const handler = handlers.get('permission/respond');
    expect(handler).toBeDefined();
    const result = (await handler!({ sender: { id: 1 } }, {
      request_id: 'pcr-test-001',
      decision: 'once',
    })) as Result<{ matched: boolean }>;
    expect(result.ok).toBe(true);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.event).toBe('permission.granted');
    expect(recorded[0]?.session_id).toBe('sess-A');
    expect(recorded[0]?.capability).toBe('LOCAL_EXECUTE');
    expect(recorded[0]?.tool_id).toBe('shell.run');
    expect(recorded[0]?.outcome).toBeUndefined();
  });

  it("decision='deny' → audit 'permission.denied' + outcome='denied'", async () => {
    const confirmer = makeFakeConfirmer(true);
    const { store: audit, recorded } = makeFakeAudit();
    registerIpcHandlers(
      stubApp,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { confirmer, audit }
    );
    const handler = handlers.get('permission/respond')!;
    await handler({ sender: { id: 1 } }, { request_id: 'pcr-test-001', decision: 'deny' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.event).toBe('permission.denied');
    expect(recorded[0]?.outcome).toBe('denied');
  });

  it('audit 미주입 → recordEvent 호출 0 + handler 정상 작동', async () => {
    const confirmer = makeFakeConfirmer(true);
    registerIpcHandlers(
      stubApp,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { confirmer }
    );
    const handler = handlers.get('permission/respond')!;
    const result = (await handler({ sender: { id: 1 } }, {
      request_id: 'pcr-test-001',
      decision: 'once',
    })) as Result<{ matched: boolean }>;
    expect(result.ok).toBe(true);
    expect(confirmer.respond).toHaveBeenCalled();
    // confirmer.getPendingRequests 도 audit 미주입이면 호출 X (snapshot 생략).
    expect(confirmer.getPendingRequests).not.toHaveBeenCalled();
  });

  it('confirmer.respond=false (matched X) → audit emit X', async () => {
    const confirmer = makeFakeConfirmer(false);
    const { store: audit, recorded } = makeFakeAudit();
    registerIpcHandlers(
      stubApp,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { confirmer, audit }
    );
    const handler = handlers.get('permission/respond')!;
    await handler({ sender: { id: 1 } }, { request_id: 'pcr-test-001', decision: 'once' });
    expect(recorded).toHaveLength(0);
  });
});
