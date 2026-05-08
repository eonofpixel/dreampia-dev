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
import { Virtuoso } from 'react-virtuoso';

/**
 * v2.x (Phase D — Chat virtualization).
 *
 * turns.length >= 본 threshold 시 react-virtuoso 로 windowing 활성. 작은
 * list 는 simple map (Virtuoso 의 wrapper overhead 회피). 100 은 일반
 * 사용자 세션의 평균 turn 수보다 충분히 높아 대부분 simple path.
 *
 * Spec: docs/v2.x-roadmap.md (Phase D, 사용자 결정 Q5).
 */
export const TURN_VIRTUALIZATION_THRESHOLD = 100;
import { ChatInput } from './ChatInput';
import { EmptyState as SharedEmptyState } from '../empty/EmptyState';
import type { ContentBlock, PermissionLevel, Session, Turn, ToolResultRef } from '@/types';
import { EFFORT_LABELS_KO } from '@/types';
import { FileReferenceChip } from './FileReferenceChip';
import { SessionReferenceChip } from './SessionReferenceChip';
import { ToolCallCard } from './ToolCallCard';
import { findToolResult } from './toolDisplayHelpers';
import { PermissionDropdown } from './PermissionDropdown';
import { ProviderDropdown } from './ProviderDropdown';
import type { SlashCommandId } from '../../commands/registry';
import type { ResolverContext } from '../../mentions/resolver';
import { useT } from '../../i18n';

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
  /**
   * v1.0.6 — drift detection. 이 세션이 처음 만들어진 폴더의 이름.
   * `workspaceName` (현재 작업 폴더) 와 다르면 ChatHeader 가 ⚠ badge 표시.
   */
  sessionWorkspaceName?: string;
  /** [폴더 변경] 클릭 시 main 의 dialog.showOpenDialog 호출. */
  onPickWorkspace?: () => void;
  /**
   * v1.0.8 (FAKE-1 청산) — 미리보기 패널 토글 상태. ChatHeader 의 [👁]
   * 버튼이 이 prop 으로 표시 (open/close icon).
   */
  previewVisible?: boolean;
  /** v1.0.8 — [👁] 버튼 클릭 시 호출. App.tsx 가 setPreviewVisible. */
  onTogglePreview?: () => void;
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
   * v0.13.0 (J) — typed block 경로 callback. 멘션이 있을 때 ChatInput 가
   * `(text, blocks)` 를 전달한다. 미지정 시 v0.6 plain-text 경로 유지.
   * App.tsx 가 활성 session 의 turns 에 user turn 을 push 할 때 이 blocks
   * 배열을 그대로 합성해 schema-typed `Turn.content` 를 만든다.
   */
  onSubmitBlocks?: (text: string, blocks: ContentBlock[]) => void;
  /**
   * v0.13.0 (J) — `session_reference` chip 클릭 시 그 세션으로 전환할 때
   * 사용. 미지정 시 chip 은 표시되지만 click 은 no-op.
   */
  onPickSession?: (sessionId: string) => void;
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
  /**
   * v1.1.11 (Workspace UX): per-session sticky workspace lock 상태. App.tsx 가
   * IPC `session/get-workspace-locked` 결과를 prop 으로 주입. 미지정 시
   * default false (UI 는 🔓).
   */
  workspaceLocked?: boolean;
  /**
   * v1.1.11: 🔒/🔓 toggle 클릭 시 호출. App.tsx 가 IPC
   * `session/set-workspace-locked` 호출 후 state 갱신.
   */
  onToggleWorkspaceLock?: () => void;
  /**
   * v1.6.11 — 채팅 header [fork] 버튼 클릭. App.tsx 가 IPC `session/fork`
   * 호출 + 새 session 활성화 + 사용자 toast.
   */
  onForkSession?: () => void;
  /**
   * v1.6.19 — per-turn fork. turn footer 의 🌿 버튼 클릭 시 호출. App.tsx
   * 가 `sessionApi.fork(activeId, { truncateAt: turnId })` 호출 → 그 turn
   * 까지만 복사된 새 세션 활성화. 미지정 시 turn 버튼 미노출.
   */
  onForkAtTurn?: (turnId: string) => void;
  /**
   * v1.6.13 — Pending typed blocks (PreviewPanel 캡처 결과 등). ChatInput
   * 의 chip 미리보기 + 다음 submit 시 함께 prepend.
   */
  pendingBlocks?: ReadonlyArray<ContentBlock>;
  /** Submit 직후 부모가 reset 하도록 callback. */
  onConsumePendingBlocks?: () => void;
  /** v1.6.16 — DnD/paste image → 부모가 pendingBlocks 에 push. */
  onAttachBlocks?: (blocks: ContentBlock[]) => void;
  /** v1.6.17 — chip [×] 클릭 시 부모가 제거. */
  onRemovePendingBlock?: (index: number) => void;
  /** v1.6.22 — empty state CTA: AutomationModal 열기. 미지정 시 chip 숨김. */
  onOpenAutomation?: () => void;
  /** v1.6.22 — empty state CTA: PluginsModal 열기. 미지정 시 chip 숨김. */
  onOpenPlugins?: () => void;
  /** v1.6.22 — empty state CTA: SlashHelpModal 열기. 미지정 시 chip 숨김. */
  onOpenHelp?: () => void;
  /**
   * v1.1.4 — turn 영속화 신호. App 이 await persistTurn() 후 turn.id 를 누적
   * 한 Set. MessagesArea/TurnDisplay 로 forward → `data-persisted="true"` 속성.
   * e2e 가 SQLite write 완료 시점을 기다리는 데 사용. optional — 미지정 시
   * 모든 turn 은 not persisted (외부 콜사이트 호환).
   */
  persistedTurnIds?: ReadonlySet<string>;
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
  /** v0.13.0 — session_reference chip click handler (forwarded from ChatPanel). */
  onPickSession?: (sessionId: string) => void;
  /** v1.6.19 — per-turn fork forwarded from ChatPanel. */
  onForkAtTurn?: (turnId: string) => void;
  /** v1.6.22 — empty state CTAs forwarded from ChatPanel. */
  onOpenAutomation?: () => void;
  onOpenPlugins?: () => void;
  onOpenHelp?: () => void;
  /**
   * v1.1.4 — turn 영속화 신호. App 이 await persistTurn() 후 turn.id 를 누적
   * 한 Set. TurnDisplay 가 `data-persisted="true"` 로 노출. e2e (drive14-3
   * 등) 가 SQLite write 완료 시점을 기다리는 데 사용. ChatPanel 외부 콜사이트
   * 호환을 위해 optional — 미지정 시 모든 turn 은 not persisted.
   */
  persistedTurnIds?: ReadonlySet<string>;
}

export function ChatPanel({
  session,
  onSubmit,
  isStreaming = false,
  onCancel,
  cliStatus = null,
  workspaceName,
  sessionWorkspaceName,
  onPickWorkspace,
  previewVisible,
  onTogglePreview,
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
  onSubmitBlocks,
  onPickSession,
  workspaceLocked = false,
  onToggleWorkspaceLock,
  onForkSession,
  pendingBlocks,
  onConsumePendingBlocks,
  onAttachBlocks,
  onRemovePendingBlock,
  onForkAtTurn,
  onOpenAutomation,
  onOpenPlugins,
  onOpenHelp,
  persistedTurnIds,
}: ChatPanelProps): React.JSX.Element {
  if (!session) {
    return (
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
        {ipcUnavailable && <IpcUnavailableBanner />}
        <EmptyState />
      </main>
    );
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <ChatHeader
        session={session}
        cliStatus={cliStatus}
        workspaceName={workspaceName}
        sessionWorkspaceName={sessionWorkspaceName}
        onPickWorkspace={onPickWorkspace}
        previewVisible={previewVisible}
        onTogglePreview={onTogglePreview}
        onChangePermission={onChangePermission}
        permissionDisabled={ipcUnavailable}
        workspaceLocked={workspaceLocked}
        onToggleWorkspaceLock={onToggleWorkspaceLock}
        onForkSession={onForkSession}
      />
      {ipcUnavailable && <IpcUnavailableBanner />}
      <MessagesArea
        turns={session.conversation.turns}
        onPickPrompt={onSubmit}
        workspaceName={workspaceName}
        pendingFocusTurnId={pendingFocusTurnId ?? null}
        onTurnFocused={onTurnFocused}
        onPickSession={onPickSession}
        {...(onForkAtTurn !== undefined && { onForkAtTurn })}
        {...(onOpenAutomation !== undefined && { onOpenAutomation })}
        {...(onOpenPlugins !== undefined && { onOpenPlugins })}
        {...(onOpenHelp !== undefined && { onOpenHelp })}
        {...(persistedTurnIds !== undefined && { persistedTurnIds })}
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
        onSubmitBlocks={onSubmitBlocks}
        pendingBlocks={pendingBlocks}
        onConsumePendingBlocks={onConsumePendingBlocks}
        onAttachBlocks={onAttachBlocks}
        onRemovePendingBlock={onRemovePendingBlock}
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
  const t = useT();
  return (
    <div
      role="alert"
      data-testid="ipc-unavailable-banner"
      className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300"
    >
      <strong>{t('chat.ipc.banner_strong')}</strong> {t('chat.ipc.banner_detail')}{' '}
      <code>window.dreampia</code> {t('chat.ipc.banner_check')}
    </div>
  );
}

function MessagesArea({
  turns,
  onPickPrompt,
  workspaceName,
  pendingFocusTurnId,
  onTurnFocused,
  onPickSession,
  onForkAtTurn,
  onOpenAutomation,
  onOpenPlugins,
  onOpenHelp,
  persistedTurnIds,
}: MessagesAreaProps): React.JSX.Element {
  const t = useT();
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
          workspaceName={workspaceName ?? t('sidebar.workspace.fallback')}
          onPickPrompt={onPickPrompt}
          {...(onOpenAutomation !== undefined && { onOpenAutomation })}
          {...(onOpenPlugins !== undefined && { onOpenPlugins })}
          {...(onOpenHelp !== undefined && { onOpenHelp })}
        />
      ) : (
        // v2.x (Phase D — Chat virtualization, Open Questions Q5).
        // turns.length 가 threshold 초과 시 react-virtuoso 로 windowing —
        // 10000 turn 도 60fps scroll. 작은 list 는 simple map (overhead 회피).
        // testid 호환을 위해 두 path 모두 TurnDisplay 를 동일 props 로 사용.
        turns.length >= TURN_VIRTUALIZATION_THRESHOLD ? (
          <Virtuoso
            data={turns}
            className="mx-auto max-w-3xl"
            style={{ height: '100%' }}
            followOutput="smooth"
            initialTopMostItemIndex={turns.length - 1}
            itemContent={(index, turn) => (
              <div className="pb-4">
                <TurnDisplay
                  turn={turn}
                  getResult={(callId: string): ToolResultRef | undefined =>
                    findToolResult(turns, index, callId)
                  }
                  onPickSession={onPickSession}
                  {...(onForkAtTurn !== undefined && { onForkAtTurn })}
                  isPersisted={persistedTurnIds?.has(turn.id) === true}
                />
              </div>
            )}
            data-testid="chat-turns-virtuoso"
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
                onPickSession={onPickSession}
                {...(onForkAtTurn !== undefined && { onForkAtTurn })}
                isPersisted={persistedTurnIds?.has(turn.id) === true}
              />
            ))}
          </div>
        )
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
  /** v0.13.0 — typed-block submit callback (forwarded from ChatPanel). */
  onSubmitBlocks?: (text: string, blocks: ContentBlock[]) => void;
  /** v1.6.13 — pending typed blocks (forwarded). */
  pendingBlocks?: ReadonlyArray<ContentBlock>;
  onConsumePendingBlocks?: () => void;
  /** v1.6.16 — DnD/paste image push (forwarded). */
  onAttachBlocks?: (blocks: ContentBlock[]) => void;
  /** v1.6.17 — chip [×] 클릭 시 부모가 제거 (forwarded). */
  onRemovePendingBlock?: (index: number) => void;
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
  onSubmitBlocks,
  pendingBlocks,
  onConsumePendingBlocks,
  onAttachBlocks,
  onRemovePendingBlock,
}: InputAreaProps): React.JSX.Element {
  const t = useT();
  return (
    <div>
      {isStreaming && (
        <div className="flex items-center justify-end border-t border-border-primary bg-bg-secondary px-3 py-1">
          <button
            onClick={onCancel}
            className="rounded bg-bg-tertiary px-3 py-1 text-xs text-text-secondary hover:bg-border-primary"
            aria-label={t('chat.streaming.stop_aria')}
            data-testid="stop-button"
          >
            {t('chat.streaming.stop')}
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
        {...(onSubmitBlocks !== undefined && { onSubmitBlocks })}
        {...(pendingBlocks !== undefined && { pendingBlocks })}
        {...(onConsumePendingBlocks !== undefined && { onConsumePendingBlocks })}
        {...(onAttachBlocks !== undefined && { onAttachBlocks })}
        {...(onRemovePendingBlock !== undefined && { onRemovePendingBlock })}
      />
    </div>
  );
}

function ChatHeader({
  session,
  cliStatus,
  workspaceName,
  sessionWorkspaceName,
  onPickWorkspace,
  previewVisible,
  onTogglePreview,
  onChangePermission,
  permissionDisabled = false,
  workspaceLocked = false,
  onToggleWorkspaceLock,
  onForkSession,
}: {
  session: Session;
  cliStatus: CliStatus;
  workspaceName?: string;
  sessionWorkspaceName?: string;
  onPickWorkspace?: () => void;
  previewVisible?: boolean;
  onTogglePreview?: () => void;
  onChangePermission?: (next: PermissionLevel) => void;
  permissionDisabled?: boolean;
  /**
   * v1.1.11 (Workspace UX): per-session sticky workspace lock.
   * App 이 IPC `session/get-workspace-locked` 결과를 prop 으로 주입.
   */
  workspaceLocked?: boolean;
  /** Toggle handler. App 이 IPC `session/set-workspace-locked` 호출 후 state 갱신. */
  onToggleWorkspaceLock?: () => void;
  /**
   * v1.6.11 — Session fork. App.tsx 가 `session/fork` IPC 호출 + 새 session
   * 활성화. 미지정 시 [fork] 버튼 미노출 (legacy 동작).
   */
  onForkSession?: () => void;
}): React.JSX.Element {
  const t = useT();
  // v1.0.6 — drift detection: 이 세션이 만들어진 폴더 이름과 현재 작업 폴더 이름이
  // 다르면 사용자에게 시각적으로 알린다. 옛 turn 의 파일 참조가 더 이상 유효하지
  // 않을 가능성을 의미한다 (DB 자체는 안전 — 삭제 X).
  // v1.1.19 (Workspace UX): 잠긴 세션 (workspaceLocked=true) 은 drift 표시 X —
  // 사용자가 이 세션을 자기 workspace 에 고정 의도. 미래 자동 복귀 흐름의 prep.
  const driftDetected =
    !workspaceLocked &&
    sessionWorkspaceName !== undefined &&
    workspaceName !== undefined &&
    sessionWorkspaceName !== workspaceName;

  return (
    // v1.0.7 — Codex 검토 반영: flex-shrink-0 + whitespace-nowrap + min-w-0 로
    // narrow 한 header 에서 모든 자식이 단일 row 유지. 이전 v1.0.6 는 drift
    // badge 추가로 모든 요소 wrap 됐었음.
    <div className="flex h-12 items-center justify-between gap-3 border-b border-border-primary px-4">
      <h1 className="min-w-0 truncate text-sm font-semibold">{session.title}</h1>
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-text-tertiary">
        {driftDetected && (
          // v1.1.21 (Workspace UX): drift menu — 짧은 ⚠ icon 을 click 시
          // popover (group focus-within) 로 detail + 액션 노출. v1.0.7 의
          // tooltip 만 으론 사용자가 정확히 무슨 의미인지 모름.
          <div className="relative shrink-0 group">
            <button
              type="button"
              className="rounded bg-yellow-900/30 px-1.5 py-0.5 text-[11px] leading-none text-yellow-400 hover:bg-yellow-900/50"
              title={t('chat.header.drift_tooltip', { name: sessionWorkspaceName })}
              aria-label={t('chat.header.drift_aria', { name: sessionWorkspaceName })}
              data-testid="workspace-drift-badge"
            >
              ⚠
            </button>
            <div
              className="invisible absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-yellow-600/50 bg-bg-primary p-3 text-xs shadow-lg group-focus-within:visible group-hover:visible"
              role="menu"
              data-testid="workspace-drift-menu"
            >
              <p className="mb-2 font-semibold text-yellow-300">
                {t('chat.header.drift_menu_title')}
              </p>
              <p className="mb-2 text-text-secondary leading-snug">
                {t('chat.header.drift_menu_body', {
                  session: sessionWorkspaceName ?? '',
                  current: workspaceName ?? '',
                })}
              </p>
              {onToggleWorkspaceLock !== undefined && (
                <button
                  type="button"
                  onClick={onToggleWorkspaceLock}
                  className="w-full rounded border border-border-primary bg-bg-secondary px-2 py-1 text-left hover:bg-bg-tertiary"
                  data-testid="workspace-drift-menu-lock"
                >
                  🔒 {t('chat.header.drift_menu_lock')}
                </button>
              )}
            </div>
          </div>
        )}
        {workspaceName !== undefined && onPickWorkspace !== undefined && (
          <button
            type="button"
            onClick={onPickWorkspace}
            className="max-w-[160px] shrink-0 truncate rounded bg-bg-tertiary px-2 py-0.5 hover:bg-border-primary"
            title={t('chat.header.workspace_tooltip', { name: workspaceName })}
            aria-label={t('chat.header.workspace_pick_aria')}
            data-testid="workspace-pick-button"
          >
            📁 {workspaceName}
          </button>
        )}
        {/*
         * v1.1.11 (Workspace UX): per-session sticky workspace lock toggle.
         * 잠긴 세션은 폴더 변경 시 자기 workspace 로 복귀 (drift 검사 분기는
         * v1.1.13+ 후속 commits 에서). default 표시 (workspaceLocked=false).
         */}
        {onToggleWorkspaceLock !== undefined && (
          <button
            type="button"
            onClick={onToggleWorkspaceLock}
            className="shrink-0 rounded px-1.5 py-0.5 text-[14px] leading-none hover:bg-bg-tertiary"
            title={
              workspaceLocked
                ? t('chat.header.workspace_unlock_tooltip')
                : t('chat.header.workspace_lock_tooltip')
            }
            aria-label={
              workspaceLocked
                ? t('chat.header.workspace_unlock_aria')
                : t('chat.header.workspace_lock_aria')
            }
            aria-pressed={workspaceLocked}
            data-testid="workspace-lock-toggle"
            data-locked={workspaceLocked ? 'true' : 'false'}
          >
            {workspaceLocked ? '🔒' : '🔓'}
          </button>
        )}
        <PermissionDropdown
          level={session.permission.default_level}
          onChange={(next) => {
            if (onChangePermission !== undefined) onChangePermission(next);
          }}
          disabled={permissionDisabled || onChangePermission === undefined}
        />
        {/*
         * v1.5.2 — global default_provider 의 quick-access dropdown. settings
         * → Provider 탭과 동일 IPC. self-managed 라 ChatPanel 에 추가 state X.
         * CliStatusBadge (실제 감지 결과 표시) 는 그대로 유지 — dropdown 은
         * 사용자 선택, badge 는 실제 routing source 결과.
         */}
        <ProviderDropdown />
        <CliStatusBadge status={cliStatus} />
        <span className="shrink-0">
          {session.conversation.current_model}
          <span className="mx-1">·</span>
          {EFFORT_LABELS_KO[session.conversation.current_effort]}
        </span>
        {/*
         * v1.0.8 — 미리보기 패널 토글 (FAKE-1 청산). schema 만 있고 UI/IPC 0
         * 이었던 panel_visible 을 진짜 토글로. Mod+\\ 단축키와 동기화.
         */}
        {onTogglePreview !== undefined && (
          <button
            type="button"
            onClick={onTogglePreview}
            className="shrink-0 rounded px-1.5 py-0.5 text-[14px] leading-none hover:bg-bg-tertiary"
            title={
              previewVisible === true
                ? t('chat.header.preview_hide_tooltip')
                : t('chat.header.preview_show_tooltip')
            }
            aria-label={
              previewVisible === true
                ? t('chat.header.preview_hide_aria')
                : t('chat.header.preview_show_aria')
            }
            aria-pressed={previewVisible === true}
            data-testid="preview-toggle-button"
          >
            {previewVisible === true ? '👁' : '👁‍🗨'}
          </button>
        )}
        {/*
         * v1.6.11 — Session fork 버튼. 클릭 시 부모가 session/fork IPC 호출.
         * onForkSession 미지정 시 노출 X (legacy 동작 유지).
         */}
        {onForkSession !== undefined && (
          <button
            type="button"
            onClick={onForkSession}
            className="shrink-0 rounded px-1.5 py-0.5 text-[14px] leading-none hover:bg-bg-tertiary"
            title={t('chat.header.fork_tooltip')}
            aria-label={t('chat.header.fork_aria')}
            data-testid="chat-fork-button"
          >
            🌿
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * CLI 감지 상태 뱃지 — onMount 후 갱신. Mock 도 명시적으로 표시.
 */
/**
 * v1.1.28 (Visual polish): provider-source 별 색상 paradigm 통일.
 *
 * 이전엔 모두 `bg-bg-tertiary` 동일 색상이라 사용자가 mock 인지 real CLI
 * 인지 글자 읽어야 구분 가능. 이제:
 *   - claude-cli → 파랑 (text-blue-300, border).
 *   - codex-cli → 보라 (text-purple-300, border).
 *   - mock → yellow (사용자에게 fake 임을 시각적으로).
 *   - none → 회색 (info).
 *
 * 동일 typography (text-[10px] + 1.5px+0.5px padding) 유지.
 */
const PROVIDER_BADGE_CLASS: Record<string, string> = {
  'claude-cli': 'border-blue-600/40 bg-blue-900/20 text-blue-300',
  'codex-cli': 'border-purple-600/40 bg-purple-900/20 text-purple-300',
  mock: 'border-yellow-600/40 bg-yellow-900/20 text-yellow-300',
  none: 'border-border-primary bg-bg-tertiary text-text-tertiary',
};

function CliStatusBadge({ status }: { status: CliStatus }): React.JSX.Element | null {
  const t = useT();
  if (status === null) return null;
  const baseClass = 'rounded border px-1.5 py-0.5 text-[10px]';
  if (status.source === 'mock') {
    return (
      <span
        title={t('chat.provider_badge.mock_title')}
        aria-label="Mock provider"
        className={`${baseClass} ${PROVIDER_BADGE_CLASS.mock}`}
        data-testid="provider-status-badge"
        data-provider-source="mock"
      >
        {t('chat.provider_badge.mock')}
      </span>
    );
  }
  if (status.claude !== null) {
    const v = status.claude.version ?? '?';
    return (
      <span
        title={t('chat.provider_badge.claude_title', { version: v, path: status.claude.path })}
        aria-label={t('chat.provider_badge.claude', { version: v })}
        className={`${baseClass} ${PROVIDER_BADGE_CLASS['claude-cli']}`}
        data-testid="provider-status-badge"
        data-provider-source="claude-cli"
      >
        {t('chat.provider_badge.claude', { version: v })}
      </span>
    );
  }
  if (status.codex !== null) {
    const v = status.codex.version ?? '?';
    return (
      <span
        title={t('chat.provider_badge.codex_title', { version: v, path: status.codex.path })}
        aria-label={t('chat.provider_badge.codex', { version: v })}
        className={`${baseClass} ${PROVIDER_BADGE_CLASS['codex-cli']}`}
        data-testid="provider-status-badge"
        data-provider-source="codex-cli"
      >
        {t('chat.provider_badge.codex', { version: v })}
      </span>
    );
  }
  return (
    <span
      title={t('chat.provider_badge.none_title')}
      aria-label={t('chat.provider_badge.none')}
      className={`${baseClass} ${PROVIDER_BADGE_CLASS.none}`}
      data-testid="provider-status-badge"
      data-provider-source="none"
    >
      {t('chat.provider_badge.none')}
    </span>
  );
}

/**
 * v0.3.0 — 빈 채팅에 진입했을 때 표시되는 환영 메시지 + 추천 prompt.
 *
 * 추천 prompt 는 wizard 의 FirstChatStep 과 동일한 4개를 사용해 일관성 유지.
 * 클릭 시 즉시 `onPickPrompt(prompt)` 호출 → ChatPanel 의 onSubmit 으로 이어져
 * 사용자가 "추천을 클릭하면 곧바로 대화가 시작" 하는 직관에 맞춘다.
 *
 * v0.11.0 (B2) — 추천 prompt 도 i18n. 한국어 default + 영어 opt-in.
 * 키 사용으로 export 하여 wizard FirstChatStep 과 공유 가능.
 */
export const WELCOME_SUGGESTION_KEYS: ReadonlyArray<string> = [
  'chat.welcome.suggestion.analyze_structure',
  'chat.welcome.suggestion.review_changes',
  'chat.welcome.suggestion.pass_tests',
];

/**
 * @deprecated v0.11.0 — 한국어 raw string 배열. 새 코드는 WELCOME_SUGGESTION_KEYS
 * + useT 사용. 본 export 는 backward compat 용으로 유지하되 prompt 가 사용자에게
 * 보내지는 시점에는 i18n 처리됨.
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
  /** v1.6.22 — empty state 빠른 진입 CTA. 미지정 시 해당 chip 숨김. */
  onOpenAutomation?: () => void;
  onOpenPlugins?: () => void;
  onOpenHelp?: () => void;
}

export function WelcomeMessage({
  workspaceName,
  onPickPrompt,
  onOpenAutomation,
  onOpenPlugins,
  onOpenHelp,
}: WelcomeMessageProps): React.JSX.Element {
  const t = useT();
  const hasCtas =
    onOpenAutomation !== undefined || onOpenPlugins !== undefined || onOpenHelp !== undefined;
  return (
    <div className="mx-auto mt-16 max-w-md text-center" data-testid="welcome-message">
      <div className="text-5xl" aria-hidden="true">
        👋
      </div>
      <h2 className="mt-4 text-xl font-semibold">{t('chat.welcome.greeting')}</h2>
      <p className="mt-1 text-sm text-text-secondary">
        {t('chat.welcome.start', { name: workspaceName })}
      </p>
      <div className="mt-6 space-y-2 text-left text-sm">
        <p className="font-medium text-text-secondary">{t('chat.welcome.suggestions_label')}</p>
        {WELCOME_SUGGESTION_KEYS.map((key) => {
          const prompt = t(key);
          return (
            <SuggestionChip
              key={key}
              onClick={onPickPrompt === undefined ? undefined : () => onPickPrompt(prompt)}
            >
              {prompt}
            </SuggestionChip>
          );
        })}
      </div>
      {hasCtas && (
        <div className="mt-6 space-y-2 text-left text-sm" data-testid="welcome-cta-section">
          <p className="font-medium text-text-secondary">{t('chat.welcome.cta.label')}</p>
          {onOpenAutomation !== undefined && (
            <CtaChip onClick={onOpenAutomation} testId="welcome-cta-automation">
              {t('chat.welcome.cta.automation')}
            </CtaChip>
          )}
          {onOpenPlugins !== undefined && (
            <CtaChip onClick={onOpenPlugins} testId="welcome-cta-plugins">
              {t('chat.welcome.cta.plugins')}
            </CtaChip>
          )}
          {onOpenHelp !== undefined && (
            <CtaChip onClick={onOpenHelp} testId="welcome-cta-help">
              {t('chat.welcome.cta.help')}
            </CtaChip>
          )}
        </div>
      )}
    </div>
  );
}

function CtaChip({
  children,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="block w-full rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-left text-sm text-accent hover:bg-accent/10"
    >
      → {children}
    </button>
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
  /**
   * v0.13.0 — `session_reference` chip 클릭 시 부모에게 위임. 미지정 시
   * chip 은 표시되지만 click 은 disabled.
   */
  onPickSession?: (sessionId: string) => void;
  /**
   * v1.6.19 — turn footer 의 [🌿] 버튼 클릭. 미지정 시 버튼 미노출.
   */
  onForkAtTurn?: (turnId: string) => void;
  /**
   * v1.1.4 — 이 turn 이 SQLite 에 영속화되었는지. App.tsx 가 persistTurn()
   * resolve 후 set. `data-persisted` DOM 속성으로 노출되어 e2e 가 race 없이
   * SQLite 조회 시점을 기다리는 용도.
   */
  isPersisted?: boolean;
}

function TurnDisplay({
  turn,
  getResult,
  onPickSession,
  onForkAtTurn,
  isPersisted = false,
}: TurnDisplayProps): React.JSX.Element | null {
  const t = useT();
  // tool 역할 턴은 렌더링하지 않음 — 결과는 어시스턴트 턴 내 인라인으로 표시
  if (turn.role === 'tool') return null;

  const isUser = turn.role === 'user';
  const isStreamingTurn = turn.status === 'streaming';

  // v0.13.0 — typed block 렌더링 시점에 "마지막 text block 의 streaming
  // cursor" 위치를 찾기 위해 마지막 text block 의 array index 를 미리 계산.
  // 단순히 `i === turn.content.length - 1` 만으로는 chip block 이 마지막
  // 자리에 와있는 user turn 에서 cursor 가 잘못된 자리에 붙는다.
  let lastTextBlockIndex = -1;
  for (let k = turn.content.length - 1; k >= 0; k -= 1) {
    if (turn.content[k]?.type === 'text') {
      lastTextBlockIndex = k;
      break;
    }
  }

  return (
    <article
      className={`group ${isUser ? 'flex justify-end' : 'flex justify-start'}`}
      data-testid={'turn-' + turn.role}
      data-status={turn.status}
      data-turn-id={turn.id}
      data-persisted={isPersisted ? 'true' : 'false'}
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
                {isStreamingTurn && i === lastTextBlockIndex && (
                  <span
                    className="ml-0.5 inline-block animate-pulse"
                    aria-label={t('chat.streaming.cursor_aria')}
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
                {t('chat.embedded_card.label', { title: block.card.title })}
              </p>
            );
          }
          if (block.type === 'file_reference') {
            // v0.13.0 (J) — typed file mention as chip.
            return (
              <FileReferenceChip
                key={i}
                path={block.path}
                snippet={block.snippet}
                lineCount={block.line_count}
                truncated={block.truncated}
                {...(block.language !== undefined && { language: block.language })}
                inverse={isUser}
              />
            );
          }
          if (block.type === 'session_reference') {
            // v0.13.0 (J) — typed session mention as chip.
            return (
              <SessionReferenceChip
                key={i}
                sessionId={block.session_id}
                title={block.title}
                contextText={block.context_text}
                turnCount={block.turn_count}
                inverse={isUser}
                {...(onPickSession !== undefined && {
                  onPick: () => onPickSession(block.session_id),
                })}
              />
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
        {/* v1.6.19 — per-turn fork. streaming turn 은 미노출 (불완전 상태에서
            분기 방지). hover 시에만 visible — 일상 viewing 의 시각 noise 최소화. */}
        {onForkAtTurn !== undefined && !isStreamingTurn && (
          <div
            className={`mt-1 flex ${isUser ? 'justify-start' : 'justify-end'} opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100`}
          >
            <button
              type="button"
              onClick={() => onForkAtTurn(turn.id)}
              title={t('chat.turn.fork_tooltip')}
              aria-label={t('chat.turn.fork_aria')}
              data-testid={`turn-fork-button-${turn.id}`}
              className="rounded-md px-1.5 py-0.5 text-xs hover:bg-bg-tertiary"
            >
              🌿
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

// v1.1.7 — 통일된 EmptyState 컴포넌트 사용. 이전엔 ChatPanel 내부에 별도
// emoji-only EmptyState 가 있어 Sidebar/Settings 등 다른 빈 상태와 paradigm
// 불일치. 공유 EmptyState 로 통일 (icon + title + description).
function EmptyState(): React.JSX.Element {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <SharedEmptyState icon="💬" title={t('chat.empty.message')} />
    </div>
  );
}
