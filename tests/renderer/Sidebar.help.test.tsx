/**
 * v1.6.21 — Sidebar 의 [단축키 도움말] 진입점 회귀.
 *
 * 검증:
 *  - 사이드바 [단축키 도움말] 클릭 → onOpenHelp 호출 (App.tsx 가 SlashHelpModal 열기).
 *  - onOpenHelp 미지정 시 button 자체가 렌더되지 않음 (legacy 동작 보존).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../../src/renderer/components/sidebar/Sidebar';

describe('Sidebar — Help entry point (v1.6.21)', () => {
  it('clicking [단축키 도움말] calls onOpenHelp', async () => {
    const user = userEvent.setup();
    const onOpenHelp = vi.fn();
    render(
      <Sidebar
        sessions={[]}
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenHelp={onOpenHelp}
      />
    );
    await user.click(screen.getByTestId('sidebar-open-help'));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('omits help button when onOpenHelp is undefined', () => {
    render(
      <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
    );
    expect(screen.queryByTestId('sidebar-open-help')).toBeNull();
  });

  it('renders Ctrl+/ shortcut hint on the help button', () => {
    render(
      <Sidebar
        sessions={[]}
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenHelp={() => {}}
      />
    );
    const btn = screen.getByTestId('sidebar-open-help');
    expect(btn.textContent ?? '').toContain('Ctrl+/');
  });
});
