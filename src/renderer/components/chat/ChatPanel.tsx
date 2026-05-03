/**
 * ChatPanel — center panel: conversation history + input.
 *
 * Day 6: 윤곽 + ChatInput.
 * Day 7: 스트리밍 표시 (pulsing cursor, tool call cards, auto-scroll, stop button).
 * P1-3: 툴 결과 인라인 표시 (tool turn 숨김, ToolCallCard 사용).
 * P1-4: ChatHeader 에 CLI 감지 상태 표시 (Claude/Codex/Mock).
 *
 * Spec: docs/ia/chat-flow.md, docs/design/components/chat-message.md,
 *       docs/ia/onboarding.md (CLI 감지)
 */

import { useEffect, useRef } from 'react';
import { ChatInput } from './ChatInput';
import type { PermissionLevel, Session, Turn, ToolResultRef } from '@/types';
import { EFFORT_LABELS_KO } from '@/types';
import { ToolCallCard } from './ToolCallCard';
import { findToolResult } from './toolDisplayHelpers';
import { PermissionDropdown } from './PermissionDropdown';
import type { SlashCommandId } from '../../commands/registry';
import type { ResolverContext } from '../../mentions/resolver';

/**
 * CLI 감지 상태 — App 이 useEffect 에서 ai/detect-cli 호출 후 설정.
 *
 * source = 'auto'  → CLI 감지 시도됨, claude/codex 가 null/non-null 로 표시
 * source = 'mock'  → IPC 사용 불가 또는 detect 실패 (모두 MockProvider 사용)
 */
export interface CliInfoShape {
  path: string;
  version: string | null;
}
export type CliStatus = null | {
  source: 'auto' | 'mock';
  claude: CliInfoShape | null;
  codex: CliInfoShape | null;
};

export interface ChatPanelProps {
  session: Session | null;
  onSubmit: (text: string) => void;
  isStreaming?: boolean;
  onCancel?: () => void;
  cliStatus?: CliStatus;
  /** 현재 작업 폴더 이름 — header 의 [폴더 변경] 버튼 옆에 표시. */
  workspaceName?: string;
  /** [폴더 변경] 클릭 시 main 의 dialog.showOpenDialog 호출. */
  onPickWorkspace?: () => void;
  /**
   * Phase 3 audit (HIGH) — production 에서 preload script 가 깨져 IPC 가
   * 누락된 상태. true 면 입력을 disable 하고 명시적 error banner 를 띄운다.
   */
  ipcUnavailable?: boolean;
  /**
   * Onboarding 추천 prompt → ChatInput 자동 채움 (Phase 3 B2).
   * 외부에서 값이 바뀌면 input 에 반영. auto-submit 은 하지 않아 사용자가 검토 가능.
   */
  initialInputValue?: string;
  /**
   * v0.5.0 (F-018) — slash command handler 맵. ChatInput 으로 그대로 forward.
   * 미지정이면 슬래시 명령은 그냥 메시지로 취급된다.
   */
  commandHandlers?: Partial<Record<SlashCommandId, (arg?: string) => void>>;
  /**
   * v0.6.0 (F-019) — @ mention popover 가 file 후보를 enumerate 할 root.
   * 미지정 시 file 멘션은 빈 popover.
   */
  mentionWorkspaceRoot?: string;
  /** v0.6.0 — file enumeration ignore patterns. */
  mentionIgnorePatterns?: ReadonlyArray<string>;
  /** v0.6.0 — `@session:` 멘션 후보 (id + title 만 사용). */
  mentionSessions?: ReadonlyArray<{ id: string; title: string }>;
  /** v0.6.0 — 멘션 resolve 단계의 IPC / store 의존성. */
  mentionResolverContext?: ResolverContext;
  /**
   * v0.7.0 (F-026) — Sidebar 검색 결과 클릭 시 "이 turn 으로 스크롤" 요청.
   * 활성 session 이 바뀐 직후 부모가 set 하면 MessagesArea 가 해당 turn 의
   * `[data-turn-id]` element 를 scrollIntoView 한다. 매칭되는 element 가
   * 발견되어 scroll 이 끝나면 onTurnFocused() 를 호출해 부모가 state 를 clear
   * 한다 — 그렇지 않으면 같은 검색을 두 번 클릭해도 두 번째 click 이 no-op.
   */
  pendingFocusTurnId?: string | null;
  onTurnFocused?: () => void;
  /**
   * v0.8.0 (H Permission Dropdown) — ChatHeader 의 권한 dropdown 변경 시
   * 호출. 미지정 시 dropdown 표시되지만 disabled. caller (App.tsx) 는 IPC
   * 호출 + local activeSession shadow 갱신을 수행.
   */
  onChangePermission?: (next: PermissionLevel) => void;
}

interface MessagesAreaProps {
  turns: Turn[];
  /**
   * v0.3.0 — empty 상태일 때 WelcomeMessage 의 추천 prompt 가 클릭되면
   * 즉시 onSubmit 으로 위임. wizard 의 FirstChatStep 와 달리 사용자가 이미
   * 채팅 화면 안이라 fill-only 가 아닌 즉시 submit 이 자연스럽다.
   */
  onPickPrompt?: (prompt: string) => void;
  /** Empty WelcomeMessage 의 헤더에 폴더 이름 표시. */
  workspaceName?: string;
  /**
   * v0.7.0 (F-026) — 검색 결과 클릭에서 흘러온 scroll target. 매칭되는
   * `[data-turn-id]` element 가 있으면 scrollIntoView, 없으면 (turn 이 아직
   * 로드 안됨) 다음 turns prop change 까지 보류.
   */
  pendingFocusTurnId?: string | null;
  onTurnFocused?: () => void;
}

export function ChatPanel({
  session,
  onSubmit,
  isStreaming = false,
  onCancel,
  cliStatus = null,
  workspaceName,
  onPickWorkspace,
  ipcUnavailable = false,
  initialInputValue,
  commandHandlers,
  mentionWorkspaceRoot,
  mentionIgnorePatterns,
  mentionSessions,
  mentionResolverContext,
  pendingFocusTurnId,
  onTurnFocused,
  onChangePermission,
}: ChatPanelProps): React.JSX.Element {
  if (!session) {
    return (
      <main className="flex h-full flex-1 flex-col bg-bg-primary">
        {ipcUnavailable && <IpcUnavailableBanner />}
        <EmptyState />
      </main>
    );
  }

  return (
    <main className="flex h-full flex-1 flex-col bg-bg-primary">
      <ChatHeader
        session={session}
        cliStatus={cliStatus}
        workspaceName={workspaceName}
        onPickWorkspace={onPickWorkspace}
        onChangePermission={onChangePermission}
        permissionDisabled={ipcUnavailable}
      />
      {ipcUnavailable && <IpcUnavailableBanner />}
      <MessagesArea
        turns={session.conversation.turns}
        onPickPrompt={onSubmit}
        workspaceName={workspaceName}
        pendingFocusTurnId={pendingFocusTurnId ?? null}
        onTurnFocused={onTurnFocused}
      />
      <InputArea
        onSubmit={onSubmit}
        isStreaming={isStreaming}
        onCancel={onCancel}
        disabled={ipcUnavailable}
        initialValue={initialInputValue}
        commandHandlers={commandHandlers}
        mentionWorkspaceRoot={mentionWorkspaceRoot}
        mentionIgnorePatterns={mentionIgnorePatterns}
        mentionSessions={mentionSessions}
        mentionResolverContext={mentionResolverContext}
      />
    </main>
  );
}

/**
 * Production 에서 preload script 로딩 실패 시 표시. 사용자에게 재설치 또는
 * 재시작을 안내한다. dev/test 에선 MockProvider 로 fallback 되므로 여기에
 * 도달하지 않는다.
 */
function IpcUnavailableBanner(): React.JSX.Element {
  return (
    <div
      role="alert"
      data-testid="ipc-unavailable-banner"
      className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300"
    >
      <strong>⚠ AI 통신 채널이 비어있습니다.</strong> 앱을 재시작하거나 dev tools 에서{' '}
      <code>window.dreampia</code> 를 확인하세요. (preload script 또는 IPC 문제)
    </div>
  );
}

function MessagesArea({
  turns,
  onPickPrompt,
  workspaceName,
  pendingFocusTurnId,
  onTurnFocused,
}: MessagesAreaProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const lastTurn = turns[turns.length - 1];
  const lastContentLen =
    lastTurn?.content.reduce((acc, b) => {
      return b.type === 'text' ? acc + b.text.length : acc;
    }, 0) ?? 0;

  // v0.7.0 (F-026) — 검색 결과 클릭에서 온 focus 요청. pendingFocusTurnId 가
  // null 이 아니고 그 id 의 element 가 mount 돼 있으면 scrollIntoView. 매칭되면
  // onTurnFocused() 로 부모 state 를 clear 해 같은 search 결과를 다시 클릭해도
  // 동작하도록. 매칭 안되면 (예: turns prop 이 아직 stale) 다음 turns 변경
  // 까지 보류 — 자동 재시도. focus 요청과 streaming auto-scroll 은 mutually
  // exclusive: focus 요청이 있으면 bottom 으로 scroll 하지 않는다 (사용자가
  // 의도한 위치에 머무르도록).
  useEffect(() => {
    if (pendingFocusTurnId === null || pendingFocusTurnId === undefined) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const root = containerRef.current;
    if (root === null) return;
    const el = root.querySelector(`[data-turn-id="${pendingFocusTurnId}"]`);
    if (el !== null) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onTurnFocused?.();
    }
  }, [turns.length, lastContentLen, pendingFocusTurnId, onTurnFocused]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
      {turns.length === 0 ? (
        // v0.3.0 — 빈 채팅에 진입하면 환영 메시지 + 추천 prompt 표시.
        // workspaceName 미정 시에도 안전한 default 로 fallback.
        <WelcomeMessage
          workspaceName={workspaceName ?? '작업 폴더'}
          onPickPrompt={onPickPrompt}
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {turns.map((turn, index) => (
            <TurnDisplay
              key={turn.id}
              turn={turn}
              getResult={(callId: string): ToolResultRef | undefined =>
                findToolResult(turns, index, callId)
              }
            />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

interface InputAreaProps {
  onSubmit: (text: string) => void;
  isStreaming: boolean;
  onCancel?: () => void;
  disabled?: boolean;
  initialValue?: string;
  commandHandlers?: Partial<Record<SlashCommandId, (arg?: string) => void>>;
  mentionWorkspaceRoot?: string;
  mentionIgnorePatterns?: ReadonlyArray<string>;
  mentionSessions?: ReadonlyArray<{ id: string; title: string }>;
  mentionResolverContext?: ResolverContext;
}

function InputArea({
  onSubmit,
  isStreaming,
  onCancel,
  disabled = false,
  initialValue,
  commandHandlers,
  mentionWorkspaceRoot,
  mentionIgnorePatterns,
  mentionSessions,
  mentionResolverContext,
}: InputAreaProps): React.JSX.Element {
  return (
    <div>
      {isStreaming && (
        <div className="flex items-center justify-end border-t border-border-primary bg-bg-secondary px-3 py-1">
          <button
            onClick={onCancel}
            className="rounded bg-bg-tertiary px-3 py-1 text-xs text-text-secondary hover:bg-border-primary"
            aria-label="스트리밍 중지"
            data-testid="stop-button"
          >
            ■ 중지
          </button>
        </div>
      )}
      <ChatInput
        onSubmit={onSubmit}
        disabled={isStreaming || disabled}
        initialValue={initialValue}
        commandHandlers={commandHandlers}
        {...(mentionWorkspaceRoot !== undefined && { workspaceRoot: mentionWorkspaceRoot })}
        {...(mentionIgnorePatterns !== undefined && { ignorePatterns: mentionIgnorePatterns })}
        {...(mentionSessions !== undefined && { sessions: mentionSessions })}
        {...(mentionResolverContext !== undefined && {
          resolverContext: mentionResolverContext,
        })}
      />
    </div>
  );
}

function ChatHeader({
  session,
  cliStatus,
  workspaceName,
  onPickWorkspace,
  onChangePermission,
  permissionDisabled = false,
}: {
  session: Session;
  cliStatus: CliStatus;
  workspaceName?: string;
  onPickWorkspace?: () => void;
  onChangePermission?: (next: PermissionLevel) => void;
  permissionDisabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex h-12 items-center justify-between border-b border-border-primary px-4">
      <h1 className="truncate text-sm font-semibold">{session.title}</h1>
      <div className="flex items-center gap-3 text-xs text-text-tertiary">
        {workspaceName !== undefined && onPickWorkspace !== undefined && (
          <button
            type="button"
            onClick={onPickWorkspace}
            className="rounded bg-bg-tertiary px-2 py-0.5 hover:bg-border-primary"
            title={`현재 작업 폴더: ${workspaceName}. 클릭하여 변경.`}
            aria-label="작업 폴더 변경"
            data-testid="workspace-pick-button"
          >
            📁 {workspaceName}
          </button>
        )}
        <PermissionDropdown
          level={session.permission.default_level}
          onChange={(next) => {
            if (onChangePermission !== undefined) onChangePermission(next);
          }}
          disabled={permissionDisabled || onChangePermission === undefined}
        />
        <CliStatusBadge status={cliStatus} />
        <span>
          {session.conversation.current_model}
          <span className="mx-1">·</span>
          {EFFORT_LABELS_KO[session.conversation.current_effort]}
        </span>
        <span aria-label="더보기">···</span>
      </div>
    </div>
  );
}

/**
 * CLI 감지 상태 뱃지 — onMount 후 갱신. Mock 도 명시적으로 표시.
 */
function CliStatusBadge({ status }: { status: CliStatus }): React.JSX.Element | null {
  if (status === null) return null;
  if (status.source === 'mock') {
    return (
      <span
        title="Mock provider in use (CLI not detected)"
        aria-label="Mock provider"
        className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px]"
      >
        Mock
      </span>
    );
  }
  if (status.claude !== null) {
    const v = status.claude.version ?? '?';
    return (
      <span
        title={`Claude CLI ${v} detected at ${status.claude.path}`}
        aria-label={`Claude CLI ${v}`}
        className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px]"
      >
        Claude CLI {v}
      </span>
    );
  }
  if (status.codex !== null) {
    const v = status.codex.version ?? '?';
    return (
      <span
        title={`Codex CLI ${v} detected at ${status.codex.path}`}
        aria-label={`Codex CLI ${v}`}
        className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px]"
      >
        Codex CLI {v}
      </span>
    );
  }
  return (
    <span
      title="No CLI detected — using Mock"
      aria-label="No CLI"
      className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px]"
    >
      No CLI
    </span>
  );
}

/**
 * v0.3.0 — 빈 채팅에 진입했을 때 표시되는 환영 메시지 + 추천 prompt.
 *
 * 추천 prompt 는 wizard 의 FirstChatStep 과 동일한 4개를 사용해 일관성 유지.
 * 클릭 시 즉시 `onPickPrompt(prompt)` 호출 → ChatPanel 의 onSubmit 으로 이어져
 * 사용자가 "추천을 클릭하면 곧바로 대화가 시작" 하는 직관에 맞춘다.
 */
export const WELCOME_SUGGESTIONS: ReadonlyArray<string> = [
  '이 프로젝트 구조 분석해줘',
  '최근 변경 사항 리뷰',
  '테스트 통과시키기',
];

export interface WelcomeMessageProps {
  workspaceName: string;
  /**
   * 추천 chip 클릭 시 호출. 미지정 시 chip 은 비활성화 (disabled) — 외부 prop
   * 누락으로 인한 silent no-op 을 방지.
   */
  onPickPrompt?: (prompt: string) => void;
}

export function WelcomeMessage({
  workspaceName,
  onPickPrompt,
}: WelcomeMessageProps): React.JSX.Element {
  return (
    <div className="mx-auto mt-16 max-w-md text-center" data-testid="welcome-message">
      <div className="text-5xl" aria-hidden="true">
        👋
      </div>
      <h2 className="mt-4 text-xl font-semibold">안녕하세요</h2>
      <p className="mt-1 text-sm text-text-secondary">{workspaceName} 작업 시작</p>
      <div className="mt-6 space-y-2 text-left text-sm">
        <p className="font-medium text-text-secondary">추천:</p>
        {WELCOME_SUGGESTIONS.map((prompt) => (
          <SuggestionChip
            key={prompt}
            onClick={onPickPrompt === undefined ? undefined : () => onPickPrompt(prompt)}
          >
            {prompt}
          </SuggestionChip>
        ))}
      </div>
    </div>
  );
}

function SuggestionChip({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}): React.JSX.Element {
  const isInteractive = onClick !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isInteractive}
      data-testid="welcome-suggestion-chip"
      className="block w-full rounded-md border border-border-primary bg-bg-secondary px-3 py-2 text-left text-sm hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-60"
    >
      • {children}
    </button>
  );
}

interface TurnDisplayProps {
  turn: Turn;
  getResult: (callId: string) => ToolResultRef | undefined;
}

function TurnDisplay({ turn, getResult }: TurnDisplayProps): React.JSX.Element | null {
  // tool 역할 턴은 렌더링하지 않음 — 결과는 어시스턴트 턴 내 인라인으로 표시
  if (turn.role === 'tool') return null;

  const isUser = turn.role === 'user';
  const isStreamingTurn = turn.status === 'streaming';

  return (
    <article
      className={isUser ? 'flex justify-end' : 'flex justify-start'}
      data-testid={'turn-' + turn.role}
      data-status={turn.status}
      data-turn-id={turn.id}
    >
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-2xl bg-accent px-4 py-2 text-white'
            : 'max-w-[80%] rounded-2xl bg-bg-secondary px-4 py-2'
        }
      >
        {turn.content.map((block, i) => {
          if (block.type === 'text') {
            return (
              <p key={i}>
                {block.text}
                {isStreamingTurn && i === turn.content.length - 1 && (
                  <span
                    className="ml-0.5 inline-block animate-pulse"
                    aria-label="스트리밍 중"
                    data-testid="streaming-cursor"
                  >
                    ▋
                  </span>
                )}
              </p>
            );
          }
          if (block.type === 'embedded_card') {
            return (
              <p key={i} className="text-xs italic opacity-70">
                [임베디드 카드: {block.card.title}]
              </p>
            );
          }
          return null;
        })}
        {turn.tool_calls && turn.tool_calls.length > 0 && (
          <div className="mt-2 space-y-1">
            {turn.tool_calls.map((tc) => (
              <ToolCallCard key={tc.id} call={tc} result={getResult(tc.id)} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center text-text-tertiary">
      <div className="text-5xl">💬</div>
      <p className="mt-4">사이드바에서 채팅을 선택하거나 새로 만드세요</p>
    </div>
  );
}
