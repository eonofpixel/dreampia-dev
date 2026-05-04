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
  sidebarVisible = true,
  previewVisible = true,
}: ThreePanelLayoutProps): React.JSX.Element {
  // 4 가지 조합 (sidebar × preview) 에 따른 grid template.
  // Tailwind 의 동적 class 빌드 한계 우회 — inline style.
  // chat 의 max-width 750px 는 항상 유지 (가독성).
  const gridTemplateColumns = `${sidebarVisible ? '286px' : '0px'} minmax(400px,750px) ${previewVisible ? '1fr' : '0px'}`;
  return (
    <div
      className="grid h-screen overflow-hidden bg-bg-primary text-text-primary"
      style={{ gridTemplateColumns }}
      data-sidebar-visible={sidebarVisible}
      data-preview-visible={previewVisible}
    >
      <div className={sidebarVisible ? '' : 'hidden'} aria-hidden={!sidebarVisible}>
        {sidebar}
      </div>
      {chat}
      <div className={previewVisible ? '' : 'hidden'} aria-hidden={!previewVisible}>
        {preview}
      </div>
    </div>
  );
}
