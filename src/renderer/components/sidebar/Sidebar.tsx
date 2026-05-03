/**
 * Sidebar — left panel: navigation, projects, chats, settings.
 *
 * Day 6: 윤곽만. 채팅 목록 mock data.
 *
 * Spec: docs/ia/sidebar.md, docs/design/components/sidebar.md
 */

import type { Session } from '@/types';
import { Plus, Search, Puzzle, Bot, Folder, Pin, Settings, Compass } from 'lucide-react';

export interface SidebarProps {
  sessions: ReadonlyArray<Pick<Session, 'id' | 'title' | 'pinned'>>;
  activeSessionId?: string;
  projectName?: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  /** v0.2.0 — 설정 항목 클릭 시 호출. 미지정 시 버튼 placeholder 동작. */
  onOpenSettings?: () => void;
  /**
   * v0.3.0 — [온보딩 다시 보기] 클릭 시 호출. 미지정 시 버튼 자체를 숨김.
   * App.tsx 가 useOnboarding().reset 을 wire up.
   */
  onReopenOnboarding?: () => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  projectName = 'workspace',
  onSelectSession,
  onNewChat,
  onOpenSettings,
  onReopenOnboarding,
}: SidebarProps): React.JSX.Element {
  const pinned = sessions.filter((s) => s.pinned);
  const recent = sessions.filter((s) => !s.pinned);

  return (
    <aside
      className="flex h-full w-[286px] flex-col border-r border-border-primary bg-bg-secondary text-sm"
      aria-label="사이드바"
    >
      {/* Top action: 새 채팅 */}
      <div className="border-b border-border-primary p-2">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-bg-tertiary"
          aria-label="새 채팅"
        >
          <Plus className="h-4 w-4" />
          <span>새 채팅</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="border-b border-border-primary p-2 text-text-secondary">
        <SidebarNavItem icon={<Search className="h-4 w-4" />} label="검색" shortcut="Ctrl+K" />
        <SidebarNavItem icon={<Puzzle className="h-4 w-4" />} label="플러그인" />
        <SidebarNavItem icon={<Bot className="h-4 w-4" />} label="자동화" />
      </nav>

      {/* Projects (placeholder) */}
      <section className="border-b border-border-primary p-2">
        <SectionHeader>프로젝트</SectionHeader>
        <SidebarNavItem icon={<Folder className="h-4 w-4" />} label={projectName} />
      </section>

      {/* Chats */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="채팅 목록">
        <SectionHeader>채팅</SectionHeader>

        {sessions.length === 0 ? (
          <p className="px-3 py-2 text-xs text-text-tertiary">아직 채팅이 없어요.</p>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="mb-2">
                {pinned.map((s, idx) => (
                  <ChatItem
                    key={s.id}
                    session={s}
                    active={s.id === activeSessionId}
                    shortcut={idx < 9 ? `Ctrl+${idx + 1}` : undefined}
                    onClick={() => onSelectSession(s.id)}
                  />
                ))}
              </div>
            )}

            {recent.length > 0 && (
              <div>
                {recent.slice(0, 50).map((s) => (
                  <ChatItem
                    key={s.id}
                    session={s}
                    active={s.id === activeSessionId}
                    onClick={() => onSelectSession(s.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Bottom: 설정 + 온보딩 재진입 (v0.3.0) */}
      <div className="border-t border-border-primary p-2">
        {onReopenOnboarding !== undefined && (
          <SidebarNavItem
            icon={<Compass className="h-4 w-4" />}
            label="온보딩 다시 보기"
            onClick={onReopenOnboarding}
            testId="sidebar-reopen-onboarding"
          />
        )}
        <SidebarNavItem
          icon={<Settings className="h-4 w-4" />}
          label="설정"
          shortcut="Ctrl+,"
          onClick={onOpenSettings}
        />
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// Internal components
// ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
      {children}
    </h2>
  );
}

function SidebarNavItem({
  icon,
  label,
  shortcut,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  testId?: string;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-bg-tertiary"
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <kbd className="text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function ChatItem({
  session,
  active,
  shortcut,
  onClick,
}: {
  session: Pick<Session, 'id' | 'title' | 'pinned'>;
  active?: boolean;
  shortcut?: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-bg-tertiary data-[active=true]:bg-bg-tertiary data-[active=true]:font-medium"
      aria-current={active ? 'true' : undefined}
    >
      {session.pinned && <Pin className="h-3 w-3 flex-shrink-0 text-text-tertiary" />}
      <span className="flex-1 truncate">{session.title}</span>
      {shortcut && (
        <kbd className="text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
