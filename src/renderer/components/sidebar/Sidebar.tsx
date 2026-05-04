/**
 * Sidebar — left panel: navigation, projects, chats, settings.
 *
 * Day 6: 윤곽만. 채팅 목록 mock data.
 *
 * Spec: docs/ia/sidebar.md, docs/design/components/sidebar.md
 */

import type { Session } from '@/types';
import {
  Plus,
  Puzzle,
  Bot,
  Folder,
  Pin,
  Settings,
  Compass,
  BarChart3,
  Server,
} from 'lucide-react';
import { SearchSection, type SearchResultEntry } from './SearchSection';
import { useMcp } from '../../hooks/useMcp';
import { useT } from '../../i18n';

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
  /**
   * v0.4.0 — [사용량] 클릭 시 호출. 미지정 시 버튼 자체를 숨김.
   * App.tsx 가 UsageSettings 모달을 mount.
   */
  onOpenUsage?: () => void;
  /**
   * v0.9.0 — Sidebar 의 MCP status indicator 클릭 시 호출. 미지정 시 indicator
   * 자체를 숨김. App.tsx 가 SettingsModal('mcp' tab) 으로 wire up.
   */
  onOpenMcpSettings?: () => void;
  /**
   * v1.0.5 — [프로젝트] 폴더 항목 클릭 시 workspace 변경 picker. 미지정 시
   * disabled 처리. App.tsx 의 pickWorkspace (useWorkspace().pick) wire up.
   */
  onPickWorkspace?: () => void;

  // ── v0.7.0 (F-026 Chat Search) ────────────────────────────
  /**
   * 검색 입력 컨트롤드 value. App.tsx 가 set + debounce 후 IPC 호출.
   */
  searchQuery?: string;
  onSearchQueryChange?: (next: string) => void;
  searchResults?: ReadonlyArray<SearchResultEntry>;
  searchLoading?: boolean;
  searchError?: string | null;
  /**
   * 검색 결과 클릭. 부모는 sessionId 로 active session 전환 + turnId 를
   * pendingFocus state 로 보관해 ChatPanel 이 scroll 할 수 있게 한다.
   */
  onSearchResultClick?: (sessionId: string, turnId: string) => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  projectName,
  onSelectSession,
  onNewChat,
  onOpenSettings,
  onReopenOnboarding,
  onOpenUsage,
  onOpenMcpSettings,
  onPickWorkspace,
  searchQuery = '',
  onSearchQueryChange,
  searchResults,
  searchLoading = false,
  searchError = null,
  onSearchResultClick,
}: SidebarProps): React.JSX.Element {
  const t = useT();
  const pinned = sessions.filter((s) => s.pinned);
  const recent = sessions.filter((s) => !s.pinned);
  // v0.11.0 — projectName 미지정 시 locale-aware fallback. 한국어 default 는
  // 기존과 동일하게 "workspace" placeholder 가 아니라 의미 있는 라벨.
  const displayProjectName = projectName ?? 'workspace';

  // v0.7.0 (F-026) — 검색 결과의 row 가 어느 세션에 속하는지 표시할 수 있도록
  // sessions prop 으로 즉시 lookup map 구축. SidebarProps 가 이미 받는
  // sessions 배열을 재사용 — 추가 IPC 없음.
  const sessionTitleById = new Map<string, string>();
  for (const s of sessions) {
    sessionTitleById.set(s.id, s.title);
  }

  // 검색 콜백이 외부에서 제공되지 않으면 비활성화 (no-op). 이렇게 하면
  // 기존 caller (테스트 / 미설정) 가 깨지지 않는다.
  const handleSearchQueryChange = onSearchQueryChange ?? ((_n: string): void => undefined);
  const handleSearchResultClick =
    onSearchResultClick ?? ((_s: string, _t: string): void => undefined);

  return (
    <aside
      className="flex h-full w-[286px] flex-col border-r border-border-primary bg-bg-secondary text-sm"
      aria-label={t('sidebar.aria_label')}
    >
      {/* Top action: 새 채팅 */}
      <div className="border-b border-border-primary p-2">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-bg-tertiary"
          aria-label={t('sidebar.new_chat')}
          data-testid="sidebar-new-chat"
        >
          <Plus className="h-4 w-4" />
          <span>{t('sidebar.new_chat')}</span>
        </button>
      </div>

      {/* v0.7.0 (F-026) — 검색 입력 + 결과 — 이전엔 placeholder nav item 이었던
          자리를 활성화. 결과 영역은 query 가 비어있으면 hidden. */}
      <div className="border-b border-border-primary p-2">
        <SearchSection
          query={searchQuery}
          onQueryChange={handleSearchQueryChange}
          results={searchResults ?? []}
          loading={searchLoading}
          error={searchError}
          onResultClick={handleSearchResultClick}
          sessionTitleById={sessionTitleById}
        />
      </div>

      {/* Nav — v1.0.3: 미구현 placeholder 명시화 (이전엔 onClick 없이 hover만
          되어 사용자 혼란). v1.x 에서 실제 Plugin Loader / Automation 추가 예정. */}
      <nav className="border-b border-border-primary p-2 text-text-secondary">
        <SidebarNavItem
          icon={<Puzzle className="h-4 w-4" />}
          label={t('sidebar.nav.plugins')}
          comingSoon
          comingSoonHint={t('sidebar.coming_soon')}
        />
        <SidebarNavItem
          icon={<Bot className="h-4 w-4" />}
          label={t('sidebar.nav.automation')}
          comingSoon
          comingSoonHint={t('sidebar.coming_soon')}
        />
      </nav>

      {/* Projects — v1.0.5: 클릭 시 workspace 폴더 변경 picker 열림.
          이전엔 onClick 없어서 v1.0.3 자동 disabled 룰에 걸렸음 (사용자 보고).
          onPickWorkspace 미지정 시에는 disabled 처리 (안전 가드). */}
      <section className="border-b border-border-primary p-2">
        <SectionHeader>{t('sidebar.section.projects')}</SectionHeader>
        <SidebarNavItem
          icon={<Folder className="h-4 w-4" />}
          label={displayProjectName}
          onClick={onPickWorkspace}
          testId="sidebar-pick-workspace"
        />
      </section>

      {/* Chats */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label={t('sidebar.chats.aria_label')}>
        <SectionHeader>{t('sidebar.section.chats')}</SectionHeader>

        {sessions.length === 0 ? (
          <p className="px-3 py-2 text-xs text-text-tertiary">{t('sidebar.chats.empty')}</p>
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

      {/* Bottom: 사용량 (v0.4.0) + MCP 상태 (v0.9.0) + 설정 + 온보딩 재진입 (v0.3.0) */}
      <div className="border-t border-border-primary p-2">
        {onOpenMcpSettings !== undefined && <McpStatusIndicator onOpen={onOpenMcpSettings} />}
        {onOpenUsage !== undefined && (
          <SidebarNavItem
            icon={<BarChart3 className="h-4 w-4" />}
            label={t('sidebar.usage')}
            onClick={onOpenUsage}
            testId="sidebar-open-usage"
          />
        )}
        {onReopenOnboarding !== undefined && (
          <SidebarNavItem
            icon={<Compass className="h-4 w-4" />}
            label={t('sidebar.onboarding_reopen')}
            onClick={onReopenOnboarding}
            testId="sidebar-reopen-onboarding"
          />
        )}
        <SidebarNavItem
          icon={<Settings className="h-4 w-4" />}
          label={t('sidebar.settings')}
          shortcut="Ctrl+,"
          onClick={onOpenSettings}
          testId="sidebar-open-settings"
        />
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// MCP 상태 indicator (v0.9.0)
//
// useMcp 가 자동 refresh — Sidebar mount 시 1회 fetch + 추후 refresh 호출
// 시 갱신 (App 다른 부분에서 mcp 변경 후 렌더 트리거).
//
// 표시:
//  - 0 서버: "MCP" + dot:gray + "0 서버"
//  - all ready: dot:green + "X 서버"
//  - any connecting: dot:yellow + "X (Y connecting)"
//  - any error: dot:red + "X (Y 오류)"
// ────────────────────────────────────────────────────────────

function McpStatusIndicator({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const t = useT();
  const { servers, loading } = useMcp();

  let dotColor = 'bg-gray-500';
  let label = t('sidebar.mcp.zero_servers');
  if (loading) {
    dotColor = 'bg-gray-400';
    label = t('sidebar.mcp.loading');
  } else if (servers.length > 0) {
    let readyCount = 0;
    let errorCount = 0;
    let connectingCount = 0;
    for (const s of servers) {
      if (s.status === 'ready') readyCount += 1;
      else if (s.status === 'error') errorCount += 1;
      else if (s.status === 'connecting') connectingCount += 1;
    }
    if (errorCount > 0) {
      dotColor = 'bg-red-500';
      label = t('sidebar.mcp.error_count', { n: servers.length, e: errorCount });
    } else if (connectingCount > 0) {
      dotColor = 'bg-yellow-500';
      label = t('sidebar.mcp.connecting_count', { n: servers.length, c: connectingCount });
    } else if (readyCount === servers.length) {
      dotColor = 'bg-green-500';
      label = t('sidebar.mcp.ready_count', { n: servers.length });
    } else {
      dotColor = 'bg-gray-500';
      label = t('sidebar.mcp.servers_count', { n: servers.length });
    }
  }

  const tooltip =
    servers.length === 0
      ? t('sidebar.mcp.tooltip_zero')
      : t('sidebar.mcp.tooltip_with', {
          n: servers.length,
          list: servers.map((s) => `${s.config.id}: ${s.status}`).join(', '),
        });

  return (
    <button
      type="button"
      onClick={onOpen}
      title={tooltip}
      data-testid="sidebar-mcp-status"
      className="group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-bg-tertiary"
      aria-label={tooltip}
    >
      <span className="flex-shrink-0">
        <Server className="h-4 w-4" />
      </span>
      <span className="flex-1 truncate">{t('sidebar.mcp.label')}</span>
      <span className="flex flex-shrink-0 items-center gap-1.5 text-xs text-text-tertiary">
        <span
          className={`inline-block h-2 w-2 rounded-full ${dotColor}`}
          aria-hidden="true"
        />
        {label}
      </span>
    </button>
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
  comingSoon,
  comingSoonHint,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  testId?: string;
  /** v1.0.3: 미구현 placeholder. true 이면 disabled + 회색 + tooltip 표시. */
  comingSoon?: boolean;
  comingSoonHint?: string;
}): React.JSX.Element {
  // onClick 이 없거나 comingSoon 이면 button 비활성화. 사용자 혼란 방지.
  const isDisabled = comingSoon === true || (onClick === undefined && !comingSoon);
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      data-testid={testId}
      title={comingSoon === true ? comingSoonHint : undefined}
      aria-disabled={isDisabled}
      className={`group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left ${
        isDisabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-bg-tertiary'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {comingSoon === true ? (
        <span className="rounded-sm bg-bg-tertiary px-1 py-0.5 text-[9px] uppercase tracking-wide text-text-tertiary">
          {t_label_coming_soon()}
        </span>
      ) : (
        shortcut && (
          <kbd className="text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100">
            {shortcut}
          </kbd>
        )
      )}
    </button>
  );
}

/** Tiny helper — useT() 는 hook 이라 nested function 에선 호출 불가, 위치 기반
 *  static label 로 충당. i18n key 는 caller 가 comingSoonHint 로 전달. */
function t_label_coming_soon(): string {
  // 우선순위 한국어 default, 영어는 미세하게 다름. caller hint 가 우선.
  return '준비 중';
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
