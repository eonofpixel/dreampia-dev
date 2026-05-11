/**
 * Sidebar.settings — v0.8.0 통합 SettingsModal 진입점 회귀.
 *
 * 검증:
 *  - 사이드바 [설정] 클릭 → onOpenSettings 호출 (App.tsx 가 SettingsModal 열기)
 *  - [사용량] 클릭 → onOpenUsage 호출 (App.tsx 가 SettingsModal 의 usage 탭으로
 *    진입)
 *  - 두 항목 모두 단일 unified modal 진입을 trigger 한다는 점은 App.test.tsx
 *    가 cover — 본 테스트는 Sidebar 의 prop wiring 만 검증.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../../src/renderer/components/sidebar/Sidebar';

describe('Sidebar — Settings entry points (v0.8.0)', () => {
  it('clicking [설정] calls onOpenSettings', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    render(
      <Sidebar
        sessions={[]}
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenSettings={onOpenSettings}
      />
    );
    // v2.10.0 (.omc/DESIGN.md γ) — footer icon-only row, label 미노출 →
    // testid 로 click.
    await user.click(screen.getByTestId('sidebar-open-settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('clicking [사용량] calls onOpenUsage (separate handler so usage tab is direct)', async () => {
    const user = userEvent.setup();
    const onOpenUsage = vi.fn();
    render(
      <Sidebar
        sessions={[]}
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenUsage={onOpenUsage}
      />
    );
    await user.click(screen.getByTestId('sidebar-open-usage'));
    expect(onOpenUsage).toHaveBeenCalledTimes(1);
  });

  it('omits 사용량 button when onOpenUsage is undefined', () => {
    render(
      <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
    );
    expect(screen.queryByTestId('sidebar-open-usage')).toBeNull();
  });
});
