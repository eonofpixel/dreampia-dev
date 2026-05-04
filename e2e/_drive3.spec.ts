/**
 * Agent drive spec — Round 3: 실제 메시지 송수신 + 스트리밍 흐름.
 *
 * MockProvider 가 user turn 을 그대로 echo 하므로 결정론적이다.
 * (claude/codex 가 설치돼있어도 e2e 는 NODE_ENV=production + DREAMPIA_TEST=1
 *  하에서 mock 으로 빠진다 — auto.ts 의 fallback 분기.)
 *
 * 출력: test-results/drive/r3-*.png + r3-*.json
 */

import { test, expect } from './fixtures';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });

const shot = (name: string): string => resolve(SHOT_DIR, `r3-${name}.png`);

test.describe('drive r3 — streaming', () => {
  test('12 — full message round-trip: type → stream → completed', async ({ window }) => {
    // 1) 새 세션 만들기
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await expect(input).toBeVisible({ timeout: 10_000 });

    await window.screenshot({ path: shot('12a-empty-composer'), fullPage: true });

    // 2) 메시지 타이핑
    await input.click();
    await input.fill('안녕 mock 테스트');
    await window.screenshot({ path: shot('12b-typed'), fullPage: true });

    // 3) Enter 로 전송 — 사용자 bubble 즉시
    await input.press('Enter');
    const userTurn = window.locator('[data-testid="turn-user"]');
    await expect(userTurn).toContainText('안녕 mock 테스트');

    // 4) 스트리밍 중 (cursor 보일 때)
    const cursor = window.getByTestId('streaming-cursor').first();
    try {
      await expect(cursor).toBeVisible({ timeout: 5_000 });
      await window.screenshot({ path: shot('12c-streaming'), fullPage: true });
    } catch {
      // Mock 이 너무 빨리 끝나면 cursor 캡처 못할 수 있음 — 정상.
      await window.screenshot({ path: shot('12c-streaming-missed'), fullPage: true });
    }

    // 5) 완료 상태
    const assistantTurn = window.locator('[data-testid="turn-assistant"]');
    await expect(assistantTurn).toHaveAttribute('data-status', 'completed', {
      timeout: 15_000,
    });
    await window.screenshot({ path: shot('12d-completed'), fullPage: true });

    // 6) DOM 상태 캡처 — 진단용
    const state = await window.evaluate(() => {
      const userBubbles = Array.from(document.querySelectorAll('[data-testid="turn-user"]'));
      const assistantBubbles = Array.from(
        document.querySelectorAll('[data-testid="turn-assistant"]')
      );
      return {
        userCount: userBubbles.length,
        assistantCount: assistantBubbles.length,
        userText: userBubbles.map((b) => b.textContent?.trim() ?? ''),
        assistantText: assistantBubbles.map((b) => ({
          status: b.getAttribute('data-status'),
          text: b.textContent?.trim().slice(0, 200) ?? '',
        })),
      };
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r3-12-state.json'),
      JSON.stringify(state, null, 2),
      'utf-8'
    );
  });

  test('13 — mid-stream cancel via [중지] button', async ({ window }) => {
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await input.click();
    // 긴 메시지 → mock stream 충분히 길게 (delayMs 15ms × ~80자 = ~1.2s)
    await input.fill(
      '이것은 충분히 긴 메시지여서 스트리밍 도중에 사용자가 중지 버튼을 누를 수 있는 시간이 됩니다 한국어 입력으로 IME 안전 경로 검증도 겸함'
    );
    await input.press('Enter');

    const stopBtn = window.getByTestId('stop-button');
    await expect(stopBtn).toBeVisible({ timeout: 5_000 });
    await window.screenshot({ path: shot('13a-streaming-with-stop'), fullPage: true });

    await stopBtn.click();
    await window.waitForTimeout(500);
    await window.screenshot({ path: shot('13b-after-cancel'), fullPage: true });

    // stop 버튼 사라져야 함 (isStreaming flipped back)
    await expect(stopBtn).not.toBeVisible({ timeout: 5_000 });

    // assistant turn 의 final status — cancel 후 어떤 상태가 되는지 캡처
    const finalState = await window.evaluate(() => {
      const at = document.querySelector('[data-testid="turn-assistant"]');
      return {
        present: at !== null,
        status: at?.getAttribute('data-status'),
        textLen: at?.textContent?.length ?? 0,
      };
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r3-13-cancel-state.json'),
      JSON.stringify(finalState, null, 2),
      'utf-8'
    );
  });

  test('14 — settings modal opens via Mod+,', async ({ window }) => {
    // 사이드바 ready 대기
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    await window.evaluate(() => document.body.focus());

    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({ timeout: 5_000 });
    await window.screenshot({ path: shot('14-settings-modal'), fullPage: true });

    // settings panel inventory — 어떤 탭들이 있는지 카탈로그
    const panels = await window.evaluate(() => {
      const all = Array.from(
        document.querySelectorAll('[data-testid^="settings-panel-"], [data-testid^="settings-tab-"]')
      );
      const w = globalThis as unknown as Window;
      return all.map((el) => ({
        testId: el.getAttribute('data-testid'),
        text: el.textContent?.trim().slice(0, 60) ?? '',
        visible: w.getComputedStyle(el).display !== 'none',
      }));
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r3-14-settings-inventory.json'),
      JSON.stringify(panels, null, 2),
      'utf-8'
    );

    // Esc 로 닫기 검증
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('settings-modal')).not.toBeVisible({ timeout: 3_000 });
    await window.screenshot({ path: shot('14b-after-esc'), fullPage: true });
  });

  test('15 — @ mention popover with file matches', async ({ window }) => {
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await expect(input).toBeVisible({ timeout: 10_000 });

    await input.click();
    await input.fill('@s');
    await expect(window.getByTestId('mention-popover')).toBeVisible({ timeout: 5_000 });
    await window.screenshot({ path: shot('15-mention-popover'), fullPage: true });

    const candidates = await window.evaluate(() => {
      const opts = Array.from(
        document.querySelectorAll('[data-testid^="mention-option-"]')
      );
      return opts.slice(0, 10).map((o) => ({
        testId: o.getAttribute('data-testid'),
        text: o.textContent?.trim() ?? '',
      }));
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r3-15-mention-state.json'),
      JSON.stringify(candidates, null, 2),
      'utf-8'
    );
  });

  test('16 — Mod+K focuses sidebar search', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    await window.evaluate(() => document.body.focus());

    await window.keyboard.press('ControlOrMeta+K');

    const search = window.getByTestId('sidebar-search-input');
    await expect(search).toBeFocused({ timeout: 3_000 });

    // 단축키가 실제로 focus 를 옮긴 직후 캡처
    await window.screenshot({ path: shot('16-mod-k-focused-search'), fullPage: true });
  });

  test('17 — reload persists conversation (SQLite roundtrip)', async ({ window }) => {
    // 1) 시드 메시지
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    const marker = '영속성마커-r3';
    await input.click();
    await input.fill(marker);
    await input.press('Enter');

    const assistantTurn = window.locator('[data-testid="turn-assistant"]');
    await expect(assistantTurn).toHaveAttribute('data-status', 'completed', {
      timeout: 15_000,
    });
    await window.screenshot({ path: shot('17a-before-reload'), fullPage: true });

    // 2) Reload
    await window.reload();
    await window.waitForFunction(() => {
      const root = document.getElementById('app');
      return root !== null && root.childElementCount > 0;
    });

    // 3) 사이드바 채팅 항목 클릭 → 메시지 복원 확인
    const chatList = window.getByRole('navigation', { name: '채팅 목록' });
    await chatList.getByRole('button', { name: /새 채팅 \d+/ }).first().click();
    await expect(window.getByTestId('turn-user').getByText(marker)).toBeVisible({
      timeout: 5_000,
    });
    await window.screenshot({ path: shot('17b-after-reload-restored'), fullPage: true });
  });
});
