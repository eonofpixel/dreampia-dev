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
import type { Session, Turn, ToolResultRef } from '@/types';
import { EFFORT_LABELS_KO } from '@/types';
import { ToolCallCard } from './ToolCallCard';
import { findToolResult } from './toolDisplayHelpers';

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
export type CliStatus =
  | null
  | {
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
}

export function ChatPanel({
  session,
  onSubmit,
  isStreaming = false,
  onCancel,
  cliStatus = null,
  workspaceName,
  onPickWorkspace,
}: ChatPanelProps): React.JSX.Element {
  if (!session) {
    return (
      <main className="flex h-full flex-1 flex-col bg-bg-primary">
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
      />
      <MessagesArea turns={session.conversation.turns} />
      <InputArea onSubmit={onSubmit} isStreaming={isStreaming} onCancel={onCancel} />
    </main>
  );
}

interface MessagesAreaProps {
  turns: Turn[];
}

function MessagesArea({ turns }: MessagesAreaProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastTurn = turns[turns.length - 1];
  const lastContentLen = lastTurn?.content.reduce((acc, b) => {
    return b.type === 'text' ? acc + b.text.length : acc;
  }, 0) ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length, lastContentLen]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {turns.length === 0 ? null : (
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
}

function InputArea({ onSubmit, isStreaming, onCancel }: InputAreaProps): React.JSX.Element {
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
      <ChatInput onSubmit={onSubmit} disabled={isStreaming} />
    </div>
  );
}

function ChatHeader({
  session,
  cliStatus,
  workspaceName,
  onPickWorkspace,
}: {
  session: Session;
  cliStatus: CliStatus;
  workspaceName?: string;
  onPickWorkspace?: () => void;
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

export function WelcomeMessage({ workspaceName }: { workspaceName: string }): React.JSX.Element {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="text-5xl">👋</div>
      <h2 className="mt-4 text-xl font-semibold">안녕하세요</h2>
      <p className="mt-1 text-sm text-text-secondary">{workspaceName} 작업 시작</p>
      <div className="mt-6 space-y-2 text-left text-sm">
        <p className="font-medium text-text-secondary">추천:</p>
        <SuggestionChip>이 프로젝트 구조 분석해줘</SuggestionChip>
        <SuggestionChip>최근 변경 사항 리뷰</SuggestionChip>
        <SuggestionChip>테스트 통과시키기</SuggestionChip>
      </div>
    </div>
  );
}

function SuggestionChip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <button className="block w-full rounded-md border border-border-primary bg-bg-secondary px-3 py-2 text-left text-sm hover:bg-bg-tertiary">
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
      data-testid={"turn-" + turn.role}
      data-status={turn.status}
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
              <ToolCallCard
                key={tc.id}
                call={tc}
                result={getResult(tc.id)}
              />
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
