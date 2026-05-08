/**
 * drive_preview_annotation — PreviewPanel annotation visual diff (v2.1.0 C5 stub).
 *
 * Spec: docs/v2.x-roadmap.md (Phase C C5 — e2e regression sweep).
 * Status: STUB — 시나리오 정의 + skip annotation. 실제 implementation 은
 * v2.1.x 후속 슬롯에서 visual baseline 캡처 + screenshot diff 도입.
 *
 * 목적
 * ────────────
 * PreviewPanel 의 annotation overlay (사용자가 preview 위에 그리는 주석/
 * highlight) 가 layout 변경 / theme switch / zoom 후에도 정확한 위치에
 * 유지되는지 visual regression 으로 확인.
 *
 * 시나리오 (구현 시 활성):
 *   - DPA-1: annotation 그리기 → screenshot baseline
 *   - DPA-2: window resize 후 annotation 위치 보존 (zoom-aware)
 *   - DPA-3: theme dark→light 전환 후 annotation 색 contrast OK
 *   - DPA-4: annotation export → 다른 환경에서 import → 위치 정합
 *
 * 인프라 요구사항 (v2.1.x):
 *   - Playwright `toMatchSnapshot` 활성 + .png 저장소
 *   - PreviewPanel 의 annotation API testid (`preview-annotation-overlay`)
 *   - DPI / OS-platform 별 baseline 분기
 */

import { test } from './fixtures';

test.describe.skip('drive_preview_annotation — PreviewPanel annotation visual diff (v2.1.0 C5 stub)', () => {
  test('DPA-1 — annotation 그리기 → baseline screenshot', async () => {
    // TODO (v2.1.x): annotation API + screenshot capture
  });

  test('DPA-2 — window resize 후 위치 보존', async () => {
    // TODO: zoom + resize matrix
  });

  test('DPA-3 — theme switch 후 contrast', async () => {
    // TODO: data-theme=light/dark 전환 후 axe + visual diff
  });

  test('DPA-4 — annotation export/import round-trip', async () => {
    // TODO: settings UI 의 export → 새 session import → 위치 검증
  });
});
