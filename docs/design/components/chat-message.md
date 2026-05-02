---
title: Components — Chat Message
parent: ./_index.md
related:
  - tool-result.md
  - code-block.md
status: draft
last_updated: 2026-05-02
---

# ChatMessage

> **한 줄 요약**: 사용자/AI/Tool 메시지 통합 표시. F-024 인라인 액션 통합.

---

## Variants (role 기반)

```
[user]      사용자 메시지 (우측 정렬, 파란 배경)
[assistant] AI 응답 (좌측, 일반 배경 + actions)
[system]    시스템 (중앙, 작게)
[tool]      도구 결과 (좌측, ToolResult 컴포넌트로 위임)
```

## States

```
[completed]  정상
[streaming]  실시간 응답 중 (cursor blink)
[pending]    대기
[failed]     ✗ 표시
[cancelled]  사용자 취소
```

---

## Visual

```
[User]
                                ┌──────────────────────────┐
                                │ 테스트 통과시켜줘         │
                                │                  10:23 PM │
                                └──────────────────────────┘

[Assistant]
┌──────────────────────────────────────────────────┐
│ 5개 테스트 실패. 분석 중...                      │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ▶ shell.run("npm test")  (8.2s) ✗ exit 1   │ │ ← ToolResult
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ tests/foo.test.ts 의 assertion error 발견.      │
│                                                  │
│ 👍 👎 ↪ 📋 ✏ ⏰                                  │ ← inline actions (hover)
└──────────────────────────────────────────────────┘

[Streaming]
┌────────────────────────────────────────┐
│ 분석 중입니다...|                      │  ← cursor blink
└────────────────────────────────────────┘

[Failed]
┌────────────────────────────────────────┐
│ ✗ AI 호출 실패                         │
│   네트워크 연결 확인하세요             │
│                       [재시도]         │
└────────────────────────────────────────┘
```

---

## 구현

```tsx
function ChatMessage({ turn }) {
  const isUser = turn.role === 'user';
  const isStreaming = turn.status === 'streaming';
  
  return (
    <article 
      className={cn(
        'group',
        isUser ? 'flex justify-end' : 'flex justify-start'
      )}
    >
      <div className={cn(
        'max-w-[800px] rounded-2xl px-4 py-3',
        isUser ? 'bg-accent text-accent-text' : 'bg-bg-secondary'
      )}>
        {/* Content blocks */}
        {turn.content.map((block, i) => (
          <ContentBlock key={i} block={block} />
        ))}
        
        {/* Streaming cursor */}
        {isStreaming && <BlinkingCursor />}
        
        {/* Tool calls (assistant) */}
        {turn.tool_calls?.map(call => (
          <ToolCallResult key={call.id} call={call} />
        ))}
        
        {/* Timestamp + actions (assistant only) */}
        {!isUser && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <time className="text-text-tertiary">
              {formatTime(turn.timestamp)}
            </time>
            <MessageActions 
              turn={turn}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
        )}
      </div>
    </article>
  );
}

function MessageActions({ turn }) {
  return (
    <div className="flex gap-1">
      <IconButton tooltip="좋아요"><ThumbsUp className="w-4 h-4" /></IconButton>
      <IconButton tooltip="싫어요"><ThumbsDown className="w-4 h-4" /></IconButton>
      <IconButton tooltip="공유"><Share className="w-4 h-4" /></IconButton>
      <IconButton tooltip="복사"><Copy className="w-4 h-4" /></IconButton>
      <IconButton tooltip="편집"><Edit className="w-4 h-4" /></IconButton>
    </div>
  );
}
```

---

## ContentBlock 렌더러

```tsx
function ContentBlock({ block }) {
  switch (block.type) {
    case 'text':
      return <Markdown>{block.text}</Markdown>;
      
    case 'image':
      return <img src={block.data} alt={block.alt} className="rounded-md max-w-full" />;
      
    case 'file':
      return (
        <FileChip 
          name={block.name}
          size={block.size_bytes}
          mime={block.mime}
        />
      );
      
    case 'mention':
      return <MentionBadge ref={block.ref} />;
      
    case 'embedded_card':
      return <EmbeddedCard card={block.card} />;
      
    default:
      return null;
  }
}
```

---

## Streaming cursor

```tsx
function BlinkingCursor() {
  return (
    <span 
      className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-blink"
      aria-hidden="true"
    />
  );
}
```

```css
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.animate-blink {
  animation: blink 1s steps(2) infinite;
}
```

---

## Markdown 렌더링

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { codeBlockRenderer } from './CodeBlock';

function Markdown({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: codeBlockRenderer,
        // table, link, list 등 커스텀
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
```

---

## 편집 모드

```tsx
function EditableMessage({ turn, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(turn.content[0]?.text ?? '');
  
  if (editing) {
    return (
      <div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={() => { onSave(text); setEditing(false); }}>
            저장
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
            취소
          </Button>
        </div>
      </div>
    );
  }
  
  return <ChatMessage turn={turn} onEdit={() => setEditing(true)} />;
}
```

→ 사용자 메시지만 편집 가능 (P4 append-only history → edited[] 에 prev 보존).

---

## 주석 표시 (F-021)

```tsx
function MessageWithAnnotations({ turn }) {
  if (!turn.annotations?.length) {
    return <ChatMessage turn={turn} />;
  }
  
  return (
    <div>
      <ChatMessage turn={turn} />
      
      <div className="mt-2 ml-4 space-y-1">
        {turn.annotations.map((anno, i) => (
          <AnnotationItem key={anno.id} annotation={anno} index={i + 1} />
        ))}
      </div>
    </div>
  );
}

function AnnotationItem({ annotation, index }) {
  return (
    <div className="flex items-start gap-2 p-2 bg-bg-tertiary rounded">
      <Badge size="xs" variant="primary">{index}</Badge>
      <div className="flex-1 text-sm">
        <p>{annotation.comment}</p>
        <p className="text-xs text-text-tertiary mt-1">
          {annotation.dom_meta.tag} · {annotation.page_url}
        </p>
      </div>
      {annotation.screenshot_uri && (
        <img 
          src={annotation.screenshot_uri} 
          className="w-16 h-16 rounded object-cover"
          alt="주석 위치 스크린샷"
        />
      )}
    </div>
  );
}
```

---

## Accessibility

```
✓ <article> 시맨틱
✓ aria-label 으로 role 구분 ("사용자 메시지" / "AI 응답")
✓ Streaming 시 aria-live="polite" (실시간 읽음)
✓ 액션은 항상 키보드 접근 가능 (group-hover 외에도)
✓ 스크린리더용 timestamp 풀어 읽기 ("오후 10시 23분")
```

---

## 관련

- [tool-result.md](./tool-result.md) — Tool 결과 표시
- [code-block.md](./code-block.md) — 코드 블록
- [../../ux/patterns/F-024-inline-actions.md](../../ux/patterns/F-024-inline-actions.md)
