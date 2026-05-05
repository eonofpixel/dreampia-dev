/**
 * Agent drive spec — Round 13 (v1.1.0): SEC-2 full (Codex Q6 picking 그대로).
 *
 * 검증:
 *  46. Settings > 권한 — v1.0.10 deferred banner 제거 + grants block mount.
 *  47. dreampia.permission.* IPC 가 정상 노출 (respond / listPending /
 *      listGrants / revokeGrant).
 *  48. permission/list-pending 빈 결과 — 초기 상태 회귀 detector.
 *  49. permission/grants/list 빈 결과 — fixture session 에 grant 없음.
 *  50. PermissionDangerModal / PermissionApprovalCard 컴포넌트 mount 가능
 *      (실제 confirm flow 는 unit 테스트가 더 정확).
 *
 * 출력: test-results/drive/r13-*.png
 */

import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string): string => resolve(SHOT_DIR, `r13-${name}.png`);

interface Result<T> {
  ok: true;
  value: T;
}
interface ResultErr {
  ok: false;
  error: string;
}

test.describe('drive r13 — SEC-2 full (v1.1.0)', () => {
  test('46 — PermissionPanel grants block mount + deferred banner 제거', async ({
    window,
  }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({ timeout: 5_000 });
    await window.getByTestId('settings-tab-permission').click();
    await expect(window.getByTestId('settings-permission-panel')).toBeVisible();

    // v1.1.0: deferred banner 제거 검증.
    const oldBanner = window.getByTestId('settings-permission-grant-status');
    expect(await oldBanner.count()).toBe(0);

    // 새 grants block.
    const grantsBlock = window.getByTestId('settings-permission-grants');
    await expect(grantsBlock).toBeVisible();
    // 빈 상태 — fixture 세션에 active grant 0.
    const empty = window.getByTestId('settings-permission-grants-empty');
    await expect(empty).toBeVisible();
    await window.screenshot({ path: shot('46-grants-empty'), fullPage: true });
  });

  test('47 — dreampia.permission API 모두 노출', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    const apis = await window.evaluate(() => {
      const w = window as unknown as { dreampia?: { permission?: Record<string, unknown> } };
      const p = w.dreampia?.permission;
      if (p === undefined) return null;
      return {
        onRequest: typeof p.onRequest === 'function',
        respond: typeof p.respond === 'function',
        listPending: typeof p.listPending === 'function',
        listGrants: typeof p.listGrants === 'function',
        revokeGrant: typeof p.revokeGrant === 'function',
      };
    });
    expect(apis).not.toBeNull();
    if (apis !== null) {
      expect(apis.onRequest).toBe(true);
      expect(apis.respond).toBe(true);
      expect(apis.listPending).toBe(true);
      expect(apis.listGrants).toBe(true);
      expect(apis.revokeGrant).toBe(true);
    }
  });

  test('48 — permission/list-pending 빈 배열 (초기 상태)', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    const result = await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          permission?: { listPending: () => Promise<Result<unknown[]> | ResultErr> };
        };
      };
      const api = w.dreampia?.permission;
      if (api?.listPending === undefined) {
        return { ok: false as const, error: 'IPC missing' };
      }
      return api.listPending();
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value.length).toBe(0);
    }
  });

  test('49 — permission/grants/list 빈 배열 (fixture 세션 grant X)', async ({
    window,
  }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    // 새 채팅 → 세션 1개.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await window.waitForFunction(async () => {
      const w = window as unknown as {
        dreampia?: { session?: { list?: () => Promise<{ ok: boolean; value?: unknown[] }> } };
      };
      const list = await w.dreampia?.session?.list?.();
      return list?.ok === true && Array.isArray(list.value) && list.value.length > 0;
    }, undefined, { timeout: 10_000 });

    const result = await window.evaluate(async () => {
      const w = window as unknown as {
        dreampia?: {
          permission?: {
            listGrants: (sid: string) => Promise<Result<unknown[]> | ResultErr>;
          };
          session?: {
            list?: () => Promise<Result<Array<{ id: string }>> | ResultErr>;
          };
        };
      };
      const sessionApi = w.dreampia?.session;
      const permApi = w.dreampia?.permission;
      if (sessionApi?.list === undefined || permApi?.listGrants === undefined) {
        return { ok: false as const, error: 'IPC missing' };
      }
      const list = await sessionApi.list();
      if (!list.ok || list.value.length === 0) {
        return { ok: false as const, error: 'no session' };
      }
      return permApi.listGrants(list.value[0]!.id);
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // fixture 세션에 active grant 0.
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value.length).toBe(0);
    }
  });

  test('50 — DOM 에 PermissionApprovalCard 미마운트 (초기 상태) — 회귀 detector', async ({
    window,
  }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    // pending 요청 없으면 inline card / center modal 둘 다 mount X.
    const inline = window.getByTestId('permission-approval-card');
    const danger = window.getByTestId('permission-danger-modal');
    expect(await inline.count()).toBe(0);
    expect(await danger.count()).toBe(0);
    // 그러나 component 자체는 import 되어 있어야 — 별도 unit 테스트에서 검증.
  });
});
