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
}

export function ThreePanelLayout({
  sidebar,
  chat,
  preview,
}: ThreePanelLayoutProps): React.JSX.Element {
  return (
    <div className="grid h-screen grid-cols-[286px_minmax(400px,750px)_1fr] overflow-hidden bg-bg-primary text-text-primary">
      {sidebar}
      {chat}
      {preview}
    </div>
  );
}
