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
}

export function ThreePanelLayout({
  sidebar,
  chat,
  preview,
  sidebarVisible = true,
}: ThreePanelLayoutProps): React.JSX.Element {
  // sidebarVisible=false 일 때 sidebar 자리를 0px 로 collapse — chat 이 자연
  // 스럽게 그 자리를 채운다. CSS class 토글로 layout shift 가 즉시 반영.
  const cols = sidebarVisible
    ? 'grid-cols-[286px_minmax(400px,750px)_1fr]'
    : 'grid-cols-[0px_minmax(400px,750px)_1fr]';
  return (
    <div
      className={`grid h-screen ${cols} overflow-hidden bg-bg-primary text-text-primary`}
      data-sidebar-visible={sidebarVisible}
    >
      <div className={sidebarVisible ? '' : 'hidden'} aria-hidden={!sidebarVisible}>
        {sidebar}
      </div>
      {chat}
      {preview}
    </div>
  );
}
