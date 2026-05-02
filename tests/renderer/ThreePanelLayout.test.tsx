/**
 * ThreePanelLayout test.
 *
 * Spec: docs/design/layout/3panel.md
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
