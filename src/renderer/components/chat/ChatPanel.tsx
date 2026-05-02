/**
 * ChatPanel — center panel: conversation history + input.
 *
 * Day 6: 윤곽 + ChatInput.
 * Day 7: 스트리밍 표시 (pulsing cursor, tool call cards, auto-scroll, stop button).
 * P1-3: 툴 결과 인라인 표시 (tool turn 숨김, ToolCallCard 사용).
 *
 * Spec: docs/ia/chat-flow.md, docs/design/components/chat-message.md
 */

import { useEffect, useRef } from 'react';
import { ChatInput } from './ChatInput';
import type { Session, Turn, ToolResultRef } from '@/types';
import { EFFORT_LABELS_KO } from '@/types';
import { ToolCallCard } from './ToolCallCard';
import { findToolResult } from './toolDisplayHelpers';

export interface ChatPanelProps {
  session: Session | null;
  onSubmit: (text: string) => void;
  isStreaming?: boolean;
  onCancel?: () => void;
}

export function ChatPanel({
  session,
  onSubmit,
  isStreaming = false,
  onCancel,
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
      <ChatHeader session={session} />
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

function ChatHeader({ session }: { session: Session }): React.JSX.Element {
  return (
    <div className="flex h-12 items-center justify-between border-b border-border-primary px-4">
      <h1 className="truncate text-sm font-semibold">{session.title}</h1>
      <div className="flex items-center gap-3 text-xs text-text-tertiary">
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
