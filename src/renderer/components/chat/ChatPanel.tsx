/**
 * ChatPanel — center panel: conversation history + input.
 *
 * Day 6: 윤곽 + ChatInput. 메시지 표시는 Day 7+.
 *
 * Spec: docs/ia/chat-flow.md, docs/design/components/chat-message.md
 */

import { ChatInput } from './ChatInput';
import type { Session, Turn } from '@/types';
import { EFFORT_LABELS_KO } from '@/types';

export interface ChatPanelProps {
  session: Session | null;
  onSubmit: (text: string) => void;
}

export function ChatPanel({ session, onSubmit }: ChatPanelProps): React.JSX.Element {
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

      <div className="flex-1 overflow-y-auto p-4">
        {session.conversation.turns.length === 0 ? (
          <WelcomeMessage workspaceName={session.workspace.name} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {session.conversation.turns.map((turn) => (
              <TurnDisplay key={turn.id} turn={turn} />
            ))}
          </div>
        )}
      </div>

      <ChatInput onSubmit={onSubmit} />
    </main>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

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

function WelcomeMessage({ workspaceName }: { workspaceName: string }): React.JSX.Element {
  // Spec: docs/ux/patterns/F-029-empty-state.md
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

function TurnDisplay({ turn }: { turn: Turn }): React.JSX.Element {
  const isUser = turn.role === 'user';

  return (
    <article className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-2xl bg-accent px-4 py-2 text-white'
            : 'max-w-[80%] rounded-2xl bg-bg-secondary px-4 py-2'
        }
      >
        {turn.content.map((block, i) => {
          if (block.type === 'text') return <p key={i}>{block.text}</p>;
          if (block.type === 'embedded_card')
            return (
              <p key={i} className="text-xs italic opacity-70">
                [임베디드 카드: {block.card.title}]
              </p>
            );
          return null;
        })}
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
