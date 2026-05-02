/**
 * PreviewPanel — right panel: in-app browser, diff viewer, side chats.
 *
 * Day 6: 빈 placeholder + 탭 윤곽.
 *
 * Spec: docs/ia/preview-panel.md, docs/session/browser.md
 */

import type { BrowserState } from '@/types';
import { ArrowLeft, ArrowRight, RotateCw, Plus, Maximize2 } from 'lucide-react';

export interface PreviewPanelProps {
  browser: BrowserState | null;
}

export function PreviewPanel({ browser }: PreviewPanelProps): React.JSX.Element {
  return (
    <aside
      className="flex h-full flex-1 flex-col border-l border-border-primary bg-bg-primary"
      aria-label="미리보기"
    >
      <PreviewTabs tabs={browser?.tabs ?? []} activeTabId={browser?.active_tab_id} />
      <BrowserControls />

      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        {browser && browser.tabs.length > 0 ? (
          <ActiveTabContent />
        ) : (
          <EmptyPreview />
        )}
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// Tabs (F-017)
// ────────────────────────────────────────────────────────────

function PreviewTabs({
  tabs,
  activeTabId,
}: {
  tabs: BrowserState['tabs'];
  activeTabId?: string;
}): React.JSX.Element {
  return (
    <div className="flex h-9 items-center border-b border-border-primary bg-bg-secondary">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-active={tab.id === activeTabId}
          className="flex items-center gap-2 border-r border-border-primary px-3 py-1.5 text-xs hover:bg-bg-tertiary data-[active=true]:bg-bg-primary"
        >
          <span className="max-w-[140px] truncate">{tab.title || '새 탭'}</span>
        </button>
      ))}
      <button
        className="px-3 py-1.5 text-text-tertiary hover:bg-bg-tertiary"
        aria-label="새 탭"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Browser controls
// ────────────────────────────────────────────────────────────

function BrowserControls(): React.JSX.Element {
  return (
    <div className="flex h-10 items-center gap-1 border-b border-border-primary px-2">
      <button
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        disabled
        aria-label="뒤로"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        disabled
        aria-label="앞으로"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
      <button
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary"
        aria-label="새로고침"
      >
        <RotateCw className="h-4 w-4" />
      </button>

      <div className="ml-2 flex flex-1 items-center rounded-md bg-bg-secondary px-3 py-1">
        <input
          type="text"
          placeholder="URL 입력 또는 검색"
          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
          aria-label="URL"
        />
      </div>

      <button
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary"
        aria-label="전체화면"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Empty / Active state
// ────────────────────────────────────────────────────────────

function EmptyPreview(): React.JSX.Element {
  return (
    <div className="text-center">
      <div className="text-5xl">🌐</div>
      <p className="mt-4">미리보기할 페이지가 없어요</p>
      <p className="mt-2 text-xs">AI가 띄운 서버 또는 직접 URL 입력</p>
    </div>
  );
}

function ActiveTabContent(): React.JSX.Element {
  return (
    <div className="h-full w-full">
      {/*
       * Phase 1+: BrowserView 또는 webview tag 로 실제 페이지 렌더.
       * Day 6 에서는 placeholder.
       */}
      <div className="flex h-full items-center justify-center text-text-tertiary">
        <p>(BrowserView 통합은 Phase 1 후반)</p>
      </div>
    </div>
  );
}
