/**
 * Multi-instance spec — second instance is rejected via requestSingleInstanceLock.
 *
 * Spec: src/main/index.ts:227 (requestSingleInstanceLock + second-instance handler)
 *
 * Codex audit: multi-window LeaderElection 의 일부 — 같은 OS user 가 두 개의
 * Electron 프로세스 띄우려 할 때 두 번째는 즉시 종료되고 첫 번째 윈도우가
 * focus 되어야 함. 일반 OS desktop app 의 표준 패턴.
 *
 * Note: 이 spec 은 fixtures.ts 의 default fixture 를 재사용하지 않고 직접
 *       두 ElectronApplication 을 launch 한다. fixture 는 per-test 격리 + close
 *       lifecycle 을 가정하지만 우리는 의도적으로 "두 번째 launch 가 곧바로
 *       끝나는지" 검증한다.
 */
import { test, expect, _electron as electron } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

test.describe('multi-instance', () => {
  // Playwright 의 electron.launch 는 매번 별도 process 를 띄우는데,
  // requestSingleInstanceLock 은 동일 OS user 의 동시 실행 (같은 user-data-dir) 일 때만 false 반환.
  // 실제 packaged build 에선 동작하지만 Playwright 의 launch flow 에서는
  // 두 번째 process 도 lock 획득에 성공할 수 있음 (race / detached 문제).
  // → manual smoke matrix 에서 검증하기로 하고 자동화는 .skip.
  test.skip('second launch is rejected by single-instance lock — manual smoke 검증', async () => {
    // 공유 userDataDir — 두 launch 가 같은 dir 사용해야 lock 충돌 발생.
    // (서로 다른 dir 면 별개 instance 로 인식됨.)
    const sharedDir = mkdtempSync(join(tmpdir(), 'dreampia-multi-'));
    writeFileSync(
      join(sharedDir, 'settings.json'),
      JSON.stringify(
        {
          onboarding_completed: true,
          workspace_root: sharedDir,
          workspace_name: 'multi-test-workspace',
        },
        null,
        2
      )
    );

    const mainEntry = resolve(__dirname, '..', 'dist', 'main', 'index.js');
    const baseArgs: string[] = [mainEntry, `--user-data-dir=${sharedDir}`];
    const baseEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      NODE_ENV: 'production',
      DREAMPIA_TEST: '1',
    };

    let app1: Awaited<ReturnType<typeof electron.launch>> | null = null;
    let app2: Awaited<ReturnType<typeof electron.launch>> | null = null;

    try {
      // 첫 instance — lock 획득 + 윈도우 표시.
      app1 = await electron.launch({
        args: [...baseArgs],
        timeout: 30_000,
        env: { ...baseEnv },
      });
      const win1 = await app1.firstWindow({ timeout: 15_000 });
      await win1.waitForLoadState('domcontentloaded');
      expect(await win1.title()).toBe('Dreampia-Dev');

      // 두 번째 instance — `requestSingleInstanceLock()` 이 false 반환 →
      // app.quit() 즉시 호출 → process exit. firstWindow 호출이 fail or timeout.
      app2 = await electron.launch({
        args: [...baseArgs],
        timeout: 10_000,
        env: { ...baseEnv },
      });

      // 두 번째 instance 의 firstWindow 가 짧은 timeout 안에 등장 안 해야 함.
      // (single-instance lock 이 동작했다면 process 가 빨리 종료됨.)
      let secondWindowAppeared = false;
      try {
        await app2.firstWindow({ timeout: 3_000 });
        secondWindowAppeared = true;
      } catch {
        // expected: timeout — second instance never opened a window.
      }

      expect(secondWindowAppeared).toBe(false);

      // 첫 윈도우는 여전히 살아있어야 함 (second-instance 이벤트 핸들러가
      // app.focus() 호출 후 app1 자체는 계속 동작).
      expect(await win1.title()).toBe('Dreampia-Dev');
    } finally {
      if (app2 !== null) {
        try {
          await app2.close();
        } catch {
          /* second instance 이미 종료됐을 수 있음 */
        }
      }
      if (app1 !== null) {
        try {
          await app1.close();
        } catch {
          /* ignore */
        }
      }
      try {
        rmSync(sharedDir, { recursive: true, force: true });
      } catch {
        /* Windows file lock — ignore */
      }
    }
  });
});
