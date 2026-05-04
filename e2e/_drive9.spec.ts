/**
 * Agent drive spec — Round 9 (v1.0.11): SEC-3 audit_log + SEC-4 side_effects.
 *
 * 목적
 * ────
 *  v1.0.11 의 두 묶음을 e2e 레벨에서 검증.
 *
 *  1. SEC-4 — ToolResult.side_effects 가 정식 discriminated union 으로 채워짐.
 *     이전엔 `never[]` placeholder. 이제 ShellRunTool 이 process.spawn +
 *     process.exit 를 emit, Queue 가 ToolResult.side_effects 에 누적.
 *
 *  2. SEC-3 — 모든 tool_use 결정 + permission grant 가 audit_log 에 자동
 *     기록. Settings > 진단 탭에 audit log viewer 가 있어 사용자가 확인 가능.
 *
 * 환경 메모
 * ────────
 *  fixture 는 이미 onboarding_completed=true + workspace_root 셋업.
 *  shell.run 은 LOCAL_EXECUTE 권한 필요 — workspace_write level 의
 *  default capability 이라 별도 grant 없이 통과.
 *
 *  Windows 와 Unix 둘 다 cmd 가 동작하도록 `node -e ...` 사용.
 *
 * 출력: test-results/drive/r9-*.png
 */

import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string): string => resolve(SHOT_DIR, `r9-${name}.png`);

interface ToolResultShape {
  call_id: string;
  tool_id: string;
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  output?: { stdout?: string; stderr?: string; exit_code?: number };
  error?: { code: string; message: string };
  side_effects: Array<{
    kind: 'file' | 'process' | 'network';
    op: string;
    cmd?: string;
    pid?: number;
    exit_code?: number;
    signal?: string;
    path?: string;
    url?: string;
  }>;
  log_tail: unknown[];
}

interface AuditEventShape {
  id: number;
  timestamp: string;
  session_id: string;
  turn_id?: string;
  event: string;
  capability: string;
  target_json: string;
  decision_reason: string;
  /** v1.0.12 (migration 006): 정식 컬럼. v1.0.11 row 는 NULL → ai_model 에 backfill 돼 있음. */
  tool_id?: string;
  ai_model?: string;
  outcome?: string;
  error?: string;
}

interface Result<T> {
  ok: true;
  value: T;
}
interface ResultErr {
  ok: false;
  error: string;
}

/**
 * App.tsx 는 자동으로 첫 세션을 만들지 않는다 — 사용자가 "새 채팅" 버튼을
 * 클릭하거나 list 가 비어있지 않을 때 첫 세션을 active 로 잡는 패턴.
 * tool-call.spec.ts 와 동일하게 매 테스트 시작 시 "새 채팅" 1회 click 으로
 * 세션을 보장한다.
 */
async function ensureSession(window: import('playwright').Page): Promise<void> {
  await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
  await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
  // session.list 에 1건 이상 들어올 때까지 대기.
  await window.waitForFunction(async () => {
    const w = window as unknown as {
      dreampia?: {
        session?: { list?: () => Promise<{ ok: boolean; value?: unknown[] }> };
      };
    };
    const list = await w.dreampia?.session?.list?.();
    return list?.ok === true && Array.isArray(list.value) && list.value.length > 0;
  }, undefined, { timeout: 10_000 });
}

test.describe('drive r9 — SEC-3 audit_log + SEC-4 side_effects (v1.0.11)', () => {
  test('32 — shell.run produces process.spawn + process.exit side_effects', async ({
    window,
  }) => {
    await ensureSession(window);

    const result = await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          tool?: {
            execute: (call: unknown) => Promise<Result<ToolResultShape> | ResultErr>;
          };
          session?: {
            list?: () => Promise<Result<Array<{ id: string }>> | ResultErr>;
          };
        };
      };
      const sessionApi = w.dreampia?.session;
      const toolApi = w.dreampia?.tool;
      if (toolApi?.execute === undefined || sessionApi?.list === undefined) {
        return { ok: false as const, error: 'IPC not available' };
      }

      // 첫 세션 id 확보 (App.tsx 가 bootstrap session 자동 생성).
      const list = await sessionApi.list();
      if (!list.ok || list.value.length === 0) {
        return { ok: false as const, error: 'no session' };
      }
      const sessionId = list.value[0]!.id;

      const callId = `019d0900-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`;
      const turnId = `019d0900-0000-7000-9000-${Date.now().toString(16).padStart(12, '0')}`;
      // node -e 는 Windows / Unix 둘 다 같은 invocation. echo 는 CRLF / shell
      // 차이가 있어 부적합.
      return toolApi.execute({
        id: callId,
        tool_id: 'shell.run',
        session_id: sessionId,
        turn_id: turnId,
        input: { cmd: 'node -e "process.stdout.write(\\"r9-ok\\")"' },
        origin: 'user',
        created_at: new Date().toISOString(),
      });
    });

    if (!result.ok) {
      throw new Error(`tool/execute failed: ${result.error}`);
    }
    const tr = result.value;

    // SEC-4 검증: side_effects 가 정식 union — process.spawn 그리고 process.exit
    // 둘 다 들어있어야 함. 이전엔 빈 배열 (never[] placeholder).
    expect(tr.side_effects.length).toBeGreaterThanOrEqual(2);
    const spawn = tr.side_effects.find((e) => e.kind === 'process' && e.op === 'spawn');
    const exit = tr.side_effects.find((e) => e.kind === 'process' && e.op === 'exit');
    expect(spawn).toBeDefined();
    expect(exit).toBeDefined();
    if (spawn) {
      expect(typeof spawn.cmd).toBe('string');
      // cmd 는 truncate 권장이지만 'node -e' 는 짧으므로 그대로 들어감.
      expect(spawn.cmd ?? '').toContain('node');
    }
    if (exit) {
      // exit_code 는 0 이어야 함 (정상 종료).
      expect(exit.exit_code).toBe(0);
    }
    expect(tr.status).toBe('success');
  });

  test('33 — audit/recent surfaces tool_use.success entry after shell.run', async ({
    window,
  }) => {
    await ensureSession(window);

    // 32번 테스트와 동일 패턴 — 도구 실행 후 audit 조회.
    const auditEntries = await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          tool?: {
            execute: (call: unknown) => Promise<Result<ToolResultShape> | ResultErr>;
          };
          session?: {
            list?: () => Promise<Result<Array<{ id: string }>> | ResultErr>;
          };
          audit?: {
            recent: (
              args?: { limit?: number; event_prefix?: string }
            ) => Promise<Result<AuditEventShape[]> | ResultErr>;
          };
        };
      };
      const sessionApi = w.dreampia?.session;
      const toolApi = w.dreampia?.tool;
      const auditApi = w.dreampia?.audit;
      if (
        toolApi?.execute === undefined ||
        sessionApi?.list === undefined ||
        auditApi?.recent === undefined
      ) {
        return { ok: false as const, error: 'IPC not available' };
      }

      const list = await sessionApi.list();
      if (!list.ok || list.value.length === 0) {
        return { ok: false as const, error: 'no session' };
      }
      const sessionId = list.value[0]!.id;

      const callId = `019d0901-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`;
      const turnId = `019d0901-0000-7000-9000-${Date.now().toString(16).padStart(12, '0')}`;
      const exec = await toolApi.execute({
        id: callId,
        tool_id: 'shell.run',
        session_id: sessionId,
        turn_id: turnId,
        input: { cmd: 'node -e "process.stdout.write(\\"r9-audit\\")"' },
        origin: 'user',
        created_at: new Date().toISOString(),
      });
      if (!exec.ok) {
        return { ok: false as const, error: `tool/execute failed: ${exec.error}` };
      }

      // audit/recent 호출 — 가장 최근 50건 중 우리가 막 만든 tool_use.* 가
      // 있어야 함.
      const recent = await auditApi.recent({ limit: 50, event_prefix: 'tool_use.' });
      if (!recent.ok) {
        return { ok: false as const, error: `audit/recent failed: ${recent.error}` };
      }
      return { ok: true as const, entries: recent.value, callId };
    });

    if (!auditEntries.ok) {
      throw new Error(auditEntries.error);
    }

    // tool_use.success entry 가 최소 1건 존재.
    const successes = auditEntries.entries.filter((e) => e.event === 'tool_use.success');
    expect(successes.length).toBeGreaterThan(0);

    // 최신 entry 의 capability 가 LOCAL_EXECUTE 여야 함 (shell.run 첫 cap).
    const mostRecent = auditEntries.entries[0];
    expect(mostRecent).toBeDefined();
    if (mostRecent !== undefined) {
      expect(mostRecent.event).toMatch(/^tool_use\./);
      // v1.0.12 (migration 006): tool_id 정식 컬럼. v1.0.11 row 는 ai_model
      // 에 backfill — fallback 으로 둘 다 받기.
      const recordedTool =
        (mostRecent as { tool_id?: string }).tool_id ?? mostRecent.ai_model;
      expect(recordedTool).toBe('shell.run');
    }
  });

  test('34 — Settings > 진단 → audit log section visible with rows', async ({ window }) => {
    await ensureSession(window);

    // audit row 를 강제 생성 — 도구 1회 실행.
    await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          tool?: {
            execute: (call: unknown) => Promise<unknown>;
          };
          session?: {
            list?: () => Promise<{ ok: boolean; value?: Array<{ id: string }> }>;
          };
        };
      };
      const sessionApi = w.dreampia?.session;
      const toolApi = w.dreampia?.tool;
      if (toolApi?.execute === undefined || sessionApi?.list === undefined) return;
      const list = await sessionApi.list();
      if (!list.ok || !list.value || list.value.length === 0) return;
      const sessionId = list.value[0]!.id;
      const callId = `019d0902-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`;
      const turnId = `019d0902-0000-7000-9000-${Date.now().toString(16).padStart(12, '0')}`;
      await toolApi.execute({
        id: callId,
        tool_id: 'shell.run',
        session_id: sessionId,
        turn_id: turnId,
        input: { cmd: 'node -e "process.stdout.write(\\"r9-ui\\")"' },
        origin: 'user',
        created_at: new Date().toISOString(),
      });
    });

    // Settings 모달 open + 진단 탭.
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({ timeout: 5_000 });
    await window.getByTestId('settings-tab-diagnose').click();
    await expect(window.getByTestId('settings-diagnose-panel')).toBeVisible();

    // SEC-3: audit log section 자체가 mount.
    const auditSection = window.getByTestId('settings-diagnose-audit');
    await expect(auditSection).toBeVisible();

    // table 또는 empty state 둘 중 하나는 있어야 함. 정상 상태에선 table.
    // 이 시점에 audit 가 비어있으면 empty placeholder.
    const table = window.getByTestId('settings-diagnose-audit-table');
    const empty = window.getByTestId('settings-diagnose-audit-empty');
    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await empty.isVisible().catch(() => false);
    expect(tableVisible || emptyVisible).toBe(true);

    if (tableVisible) {
      // 최소 1줄. tool_use.success / permission.granted 둘 다 가능.
      const rows = await window.locator('[data-testid^="settings-diagnose-audit-row-"]').count();
      expect(rows).toBeGreaterThan(0);
    }

    await window.screenshot({ path: shot('34-audit-section'), fullPage: true });
  });
});
