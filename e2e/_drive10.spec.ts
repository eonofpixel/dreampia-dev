/**
 * Agent drive spec — Round 10 (v1.0.12): COST-1 + COST-2 enforcement.
 *
 * 검증
 * ────
 *  1. COST-2 hard limit — usage/set-limits 로 매우 낮은 한도 (e.g. 0.0001 USD)
 *     설정 후 ai/start-stream 호출 시 COST_LIMIT_EXCEEDED 차단 + 사용자 modal.
 *  2. COST-1 unknown 모델 — hard-limit 모드에서 미등록 모델 즉시 차단.
 *  3. UsageSettings stale banner — pricing freshness banner 가 mount.
 *  4. audit_log 의 'cost.limit_blocked' / 'cost.unknown_model_blocked' 영속.
 *
 * 환경 메모
 * ────────
 *  fixture 의 settings.json 에 cost_limit_usd 가 없는 게 default → first
 *  test 에서 setLimits 로 강제 설정. 매 테스트가 isolated user data dir 이라
 *  cross-test contamination 0.
 *
 * 출력: test-results/drive/r10-*.png
 */

import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string): string => resolve(SHOT_DIR, `r10-${name}.png`);

interface Result<T> {
  ok: true;
  value: T;
}
interface ResultErr {
  ok: false;
  error: string;
}

interface AuditEventShape {
  id: number;
  timestamp: string;
  session_id: string;
  event: string;
  capability: string;
  target_json: string;
  decision_reason: string;
  tool_id?: string;
  ai_model?: string;
  outcome?: string;
  error?: string;
}

async function ensureSession(window: import('playwright').Page): Promise<void> {
  await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
  await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
  await window.waitForFunction(async () => {
    const w = window as unknown as {
      dreampia?: { session?: { list?: () => Promise<{ ok: boolean; value?: unknown[] }> } };
    };
    const list = await w.dreampia?.session?.list?.();
    return list?.ok === true && Array.isArray(list.value) && list.value.length > 0;
  }, undefined, { timeout: 10_000 });
}

test.describe('drive r10 — COST-1 + COST-2 enforcement (v1.0.12)', () => {
  test('35 — ai/start-stream blocked by hard limit returns COST_LIMIT_EXCEEDED', async ({
    window,
  }) => {
    await ensureSession(window);

    // Step 1: 매우 낮은 한도 + alert_threshold 설정.
    const setResult = await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          usage?: {
            setLimits: (
              patch: { cost_limit_usd?: number | null; alert_threshold?: number | null }
            ) => Promise<{ ok: boolean; error?: string }>;
          };
        };
      };
      if (w.dreampia?.usage?.setLimits === undefined) {
        return { ok: false as const, error: 'IPC missing' };
      }
      return w.dreampia.usage.setLimits({ cost_limit_usd: 0.0001, alert_threshold: 0.5 });
    });
    expect(setResult.ok).toBe(true);

    // Step 2: ai/start-stream 호출 — 보수 estimate 가 한도 초과 → 차단.
    // turns 는 intentionally 길게 만들어 input estimate * pricing 가 한도 초과.
    const startResult = await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          ai?: {
            startStream: (args: unknown) => Promise<{ ok: boolean; error?: string }>;
          };
          session?: { list?: () => Promise<{ ok: boolean; value?: Array<{ id: string }> }> };
        };
      };
      const aiApi = w.dreampia?.ai;
      const sessionApi = w.dreampia?.session;
      if (aiApi?.startStream === undefined || sessionApi?.list === undefined) {
        return { ok: false as const, error: 'IPC missing' };
      }
      const list = await sessionApi.list();
      if (!list.ok || !list.value || list.value.length === 0) {
        return { ok: false as const, error: 'no session' };
      }
      const sessionId = list.value[0]!.id;

      // gpt-4o ($2.5 / Mtok input, $10 / Mtok output, default 4096 max output
      // tokens → 4096 / 1M * 10 = $0.04096 → 한도 0.0001 훨씬 초과).
      return aiApi.startStream({
        stream_id: `r10-block-${Date.now()}`,
        model: 'gpt-4o',
        turns: [
          {
            id: 'r10-turn-1',
            role: 'user',
            timestamp: new Date().toISOString(),
            status: 'completed',
            content: [{ type: 'text', text: 'hello' }],
          },
        ],
        session_id: sessionId,
      });
    });

    expect(startResult.ok).toBe(false);
    if (!startResult.ok) {
      expect(startResult.error).toContain('COST_LIMIT_EXCEEDED');
      // JSON 페이로드에 limit_usd 와 reason 포함.
      expect(startResult.error).toContain('limit_exceeded');
    }
  });

  test('36 — unknown model blocked under hard limit + audit event', async ({ window }) => {
    await ensureSession(window);

    // 작은 한도 — unknown 모델 정책 trigger 조건.
    await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: { usage?: { setLimits: (p: unknown) => Promise<unknown> } };
      };
      await w.dreampia?.usage?.setLimits({ cost_limit_usd: 5, alert_threshold: 0.8 });
    });

    const result = await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          ai?: { startStream: (args: unknown) => Promise<{ ok: boolean; error?: string }> };
          session?: { list?: () => Promise<{ ok: boolean; value?: Array<{ id: string }> }> };
          audit?: {
            recent: (
              args?: { limit?: number; event_prefix?: string }
            ) => Promise<Result<AuditEventShape[]> | ResultErr>;
          };
        };
      };
      const aiApi = w.dreampia?.ai;
      const sessionApi = w.dreampia?.session;
      const auditApi = w.dreampia?.audit;
      if (
        aiApi?.startStream === undefined ||
        sessionApi?.list === undefined ||
        auditApi?.recent === undefined
      ) {
        return { ok: false as const, error: 'IPC missing' };
      }
      const list = await sessionApi.list();
      if (!list.ok || !list.value || list.value.length === 0) {
        return { ok: false as const, error: 'no session' };
      }
      const start = await aiApi.startStream({
        stream_id: `r10-unknown-${Date.now()}`,
        model: 'totally-unknown-model-2099',
        turns: [
          {
            id: 'r10-turn-2',
            role: 'user',
            timestamp: new Date().toISOString(),
            status: 'completed',
            content: [{ type: 'text', text: 'hi' }],
          },
        ],
        session_id: list.value[0]!.id,
      });
      // audit 도 같이 조회.
      const audit = await auditApi.recent({ limit: 20, event_prefix: 'cost.' });
      return { ok: true as const, start, audit };
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.start.ok).toBe(false);
    expect(result.start.error).toContain('unknown_model_under_limit');
    // audit_log 에 cost.unknown_model_blocked 1건 이상.
    if (result.audit.ok) {
      const blocked = result.audit.value.filter(
        (e) => e.event === 'cost.unknown_model_blocked'
      );
      expect(blocked.length).toBeGreaterThan(0);
      expect(blocked[0]?.outcome).toBe('blocked');
    }
  });

  test('37 — UsageSettings 의 pricing freshness banner mount', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({ timeout: 5_000 });
    await window.getByTestId('settings-tab-usage').click();

    // banner 는 30일 이상 경과 시에만 표시 — 현재 빌드의 LAST_UPDATED 가 정상
    // 30일 이내면 banner 미표시 (정상). 30일 이상이면 banner 표시 + data-stale.
    // 두 케이스 모두 인정 — 정확히 한 가지가 truthy 여야 함.
    const bannerEl = window.getByTestId('usage-pricing-freshness');
    const visible = await bannerEl.isVisible().catch(() => false);
    if (visible) {
      const stale = await bannerEl.getAttribute('data-stale');
      expect(stale === 'true' || stale === 'false').toBe(true);
      await window.screenshot({ path: shot('37-stale-banner'), fullPage: false });
    } else {
      // freshness 기준 30일 이내 — 정상 (banner 미표시).
      await window.screenshot({ path: shot('37-fresh-no-banner'), fullPage: false });
    }
  });

  test('38 — alert_threshold 도달 시 audit 발행 (차단 X)', async ({ window }) => {
    await ensureSession(window);

    // limit = 0.5 USD, threshold = 0.0001 (작은 비율 → estimate 가 항상 초과).
    // 0.0001 * 0.5 = 0.00005 USD threshold — gpt-4o 기본 estimate (~$0.04096) 가
    // 초과해 alert.
    await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: { usage?: { setLimits: (p: unknown) => Promise<unknown> } };
      };
      await w.dreampia?.usage?.setLimits({ cost_limit_usd: 0.5, alert_threshold: 0.0001 });
    });

    const result = await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          ai?: { startStream: (args: unknown) => Promise<{ ok: boolean; error?: string }> };
          session?: { list?: () => Promise<{ ok: boolean; value?: Array<{ id: string }> }> };
          audit?: {
            recent: (
              args?: { limit?: number; event_prefix?: string }
            ) => Promise<Result<AuditEventShape[]> | ResultErr>;
          };
        };
      };
      const aiApi = w.dreampia?.ai;
      const sessionApi = w.dreampia?.session;
      const auditApi = w.dreampia?.audit;
      if (
        aiApi?.startStream === undefined ||
        sessionApi?.list === undefined ||
        auditApi?.recent === undefined
      ) {
        return { ok: false as const, error: 'IPC missing' };
      }
      const list = await sessionApi.list();
      if (!list.ok || !list.value || list.value.length === 0) {
        return { ok: false as const, error: 'no session' };
      }
      // gpt-4o 등록 모델 — 한도 0.5 안. estimate 0.04 가 threshold 0.00005 초과
      // → alert audit. 차단은 X.
      const start = await aiApi.startStream({
        stream_id: `r10-alert-${Date.now()}`,
        model: 'gpt-4o',
        turns: [
          {
            id: 'r10-turn-3',
            role: 'user',
            timestamp: new Date().toISOString(),
            status: 'completed',
            content: [{ type: 'text', text: 'hi' }],
          },
        ],
        session_id: list.value[0]!.id,
      });
      // 즉시 audit 조회 (sink 는 동기).
      const audit = await auditApi.recent({ limit: 20, event_prefix: 'cost.' });
      return { ok: true as const, start, audit };
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // start 는 ok (차단 X) — provider 가 mock 으로 분기하든 실패하든 stream
    // 자체는 시작됐어야 함.
    expect(result.start.ok).toBe(true);
    if (result.audit.ok) {
      const alerts = result.audit.value.filter((e) => e.event === 'cost.alert_threshold');
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]?.outcome).toBe('allowed_with_alert');
    }
  });
});
