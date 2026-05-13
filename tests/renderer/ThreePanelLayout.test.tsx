/**
 * ThreePanelLayout test.
 *
 * Spec: docs/design/layout/3panel.md
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThreePanelLayout } from '../../src/renderer/components/layout/ThreePanelLayout';

describe('ThreePanelLayout', () => {
  it('renders all three panels', () => {
    render(
      <ThreePanelLayout
        sidebar={<div data-testid="sidebar">사이드바</div>}
        chat={<div data-testid="chat">채팅</div>}
        preview={<div data-testid="preview">미리보기</div>}
      />
    );

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('chat')).toBeInTheDocument();
    expect(screen.getByTestId('preview')).toBeInTheDocument();
  });

  it('uses CSS grid for layout', () => {
    const { container } = render(
      <ThreePanelLayout sidebar={<div />} chat={<div />} preview={<div />} />
    );

    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('grid');
  });

  it('shows the preview rail when preview is collapsed', () => {
    render(
      <ThreePanelLayout
        sidebar={<div data-testid="sidebar">사이드바</div>}
        chat={<div data-testid="chat">채팅</div>}
        preview={<div data-testid="preview">미리보기</div>}
        previewVisible={false}
        previewToggle={<button data-testid="preview-rail-toggle">열기</button>}
      />
    );

    expect(screen.getByTestId('preview-rail-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('preview')).toBeInTheDocument();
  });

  it('keeps the sidebar toggle available when sidebar is collapsed', () => {
    const { container } = render(
      <ThreePanelLayout
        sidebar={<div data-testid="sidebar">사이드바</div>}
        chat={<div data-testid="chat">채팅</div>}
        preview={<div data-testid="preview">미리보기</div>}
        sidebarVisible={false}
        sidebarToggle={<button data-testid="sidebar-rail-toggle">열기</button>}
      />
    );

    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-sidebar-visible')).toBe('false');
    expect(screen.getByTestId('sidebar-rail-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders a dismiss scrim for the open mobile sidebar state', () => {
    const onDismiss = vi.fn();
    render(
      <ThreePanelLayout
        sidebar={<div data-testid="sidebar">사이드바</div>}
        chat={<div data-testid="chat">채팅</div>}
        preview={<div data-testid="preview">미리보기</div>}
        sidebarVisible={true}
        onSidebarScrimClick={onDismiss}
        sidebarScrimLabel="사이드바 닫기"
      />
    );

    const scrim = screen.getByTestId('sidebar-mobile-scrim');
    expect(scrim).toHaveAccessibleName('사이드바 닫기');
    fireEvent.click(scrim);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
