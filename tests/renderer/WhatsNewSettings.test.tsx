/**
 * WhatsNewSettings — Settings 모달의 What's new 탭 (v2.7.x sub-PR).
 *
 * Decision doc: ../../CODE_TAB_DECISION.md (#5).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsModal } from '../../src/renderer/components/settings/SettingsModal';
import { WhatsNewSettings } from '../../src/renderer/components/settings/WhatsNewSettings';

describe('WhatsNewSettings (v2.7.x sub-PR)', () => {
  it('renders the title and at least one release entry', () => {
    render(<WhatsNewSettings />);
    expect(
      screen.getByText(/이번 업데이트의 주요 변화|Highlights of this update/)
    ).toBeInTheDocument();
    const list = screen.getByTestId('whats-new-release-list');
    expect(list.children.length).toBeGreaterThan(0);
  });

  it('renders v2.7.0 entry with bullets', () => {
    render(<WhatsNewSettings />);
    const entry = screen.getByTestId('whats-new-release-v2.7.0');
    expect(entry).toBeInTheDocument();
    expect(entry.textContent).toContain('Code 모드');
    // At least 3 bullets (Code mode summary should have several).
    expect(screen.getByTestId('whats-new-bullet-v2.7.0-0')).toBeInTheDocument();
    expect(screen.getByTestId('whats-new-bullet-v2.7.0-2')).toBeInTheDocument();
  });

  it('renders v2.4.1 emoji-cleanup entry', () => {
    render(<WhatsNewSettings />);
    expect(screen.getByTestId('whats-new-release-v2.4.1')).toBeInTheDocument();
  });
});

describe('SettingsModal — whats_new tab integration', () => {
  it("shows the What's new tab in the sidebar", () => {
    render(<SettingsModal open={true} onClose={() => {}} initialTab="whats_new" />);
    expect(screen.getByTestId('settings-tab-whats_new')).toBeInTheDocument();
  });

  it('clicking the tab activates the panel', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} initialTab="onboarding" />);
    await user.click(screen.getByTestId('settings-tab-whats_new'));
    expect(screen.getByTestId('settings-panel-whats_new-content')).toBeInTheDocument();
  });

  it('initialTab="whats_new" opens directly on the tab', () => {
    render(<SettingsModal open={true} onClose={() => {}} initialTab="whats_new" />);
    expect(screen.getByTestId('settings-panel-whats_new-content')).toBeInTheDocument();
  });
});
