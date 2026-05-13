import type { CSSProperties } from 'react';

/**
 * ThreePanelLayout — Sidebar + Chat + Preview.
 *
 * F-013 의 구현. resize 는 Phase 1 후반 (Day 6 은 fixed widths).
 *
 * Spec: docs/design/layout/3panel.md, docs/ux/patterns/F-013-3panel.md
 */

export interface ThreePanelLayoutProps {
  sidebar: React.ReactNode;
  chat: React.ReactNode;
  preview: React.ReactNode;
  sidebarToggle?: React.ReactNode;
  previewToggle?: React.ReactNode;
  /**
   * v0.10.0 (F-025) — Mod+B 단축키로 사이드바 토글. false 면 sidebar 자리를
   * 0px 로 collapse, chat 이 그 자리를 차지. 기본값 true.
   */
  sidebarVisible?: boolean;
  /**
   * v1.0.8 (FAKE-1 청산) — Mod+\\ 단축키로 미리보기 패널 토글. false 면
   * preview 자리를 0px 로 collapse, chat 이 우측까지 확장. 기본값 true.
   *
   * 이전엔 schema (browser.panel_visible) 만 있고 UI/IPC 0 — 사용자가 패널을
   * 닫을 방법 없었음. v1.0.8 에서 sidebar toggle 패턴 그대로 차용.
   */
  previewVisible?: boolean;
}

export function ThreePanelLayout({
  sidebar,
  chat,
  preview,
  sidebarToggle,
  previewToggle,
  sidebarVisible = true,
  previewVisible = true,
}: ThreePanelLayoutProps): React.JSX.Element {
  const layoutStyle = {
    '--sidebar-panel-width': sidebarVisible ? '286px' : '0px',
    '--chat-panel-width': previewVisible ? 'minmax(360px, min(740px, 45vw))' : 'minmax(0, 1fr)',
    '--preview-panel-width': previewVisible ? 'minmax(360px, 1fr)' : '0px',
    '--preview-rail-width': '44px',
  } as CSSProperties;

  return (
    <div
      className="three-panel-layout relative grid h-screen overflow-hidden bg-bg-primary text-text-primary"
      style={layoutStyle}
      data-sidebar-visible={sidebarVisible}
      data-preview-visible={previewVisible}
      data-testid="three-panel-layout"
    >
      {sidebarToggle !== undefined && (
        <div
          className="three-panel-sidebar-toggle absolute top-sm z-40 flex items-center justify-center"
          data-sidebar-open={sidebarVisible}
          data-testid="sidebar-toggle-anchor"
        >
          {sidebarToggle}
        </div>
      )}
      <div
        className="three-panel-sidebar min-w-0 overflow-hidden"
        data-open={sidebarVisible}
        aria-hidden={!sidebarVisible}
        data-testid="three-panel-sidebar"
      >
        {sidebar}
      </div>
      <div className="three-panel-chat min-w-0 overflow-hidden" data-testid="three-panel-chat">
        {chat}
      </div>
      <div
        className="three-panel-preview min-w-0 overflow-hidden"
        data-open={previewVisible}
        aria-hidden={!previewVisible}
        data-testid="three-panel-preview"
      >
        {preview}
      </div>
      <div
        className="three-panel-preview-rail flex min-w-0 items-start justify-center border-l border-hairline bg-canvas-soft px-1 py-sm"
        data-preview-open={previewVisible}
        aria-hidden={previewToggle === undefined}
        data-testid="three-panel-preview-rail"
      >
        {previewToggle}
      </div>
    </div>
  );
}
