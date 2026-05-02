---
title: Performance — Streaming (AI Response)
parent: ./_index.md
related:
  - ../tools/queue.md
  - rendering.md
status: draft
last_updated: 2026-05-02
---

# Streaming AI Response

> **한 줄 요약**: 첫 토큰 < 500ms. SSE 파싱. 60fps 유지하며 표시.

---

## SSE (Server-Sent Events) 파싱

```typescript
// Claude API
async function* streamClaudeResponse(messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      messages,
      stream: true,
    }),
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';     // 미완성 line 보관
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        yield data;
      }
    }
  }
}
```

---

## React 표시 (60fps)

### 문제: 매 토큰마다 re-render = 느림

```tsx
// ✗ 비효율
function StreamingMessage() {
  const [text, setText] = useState('');
  
  useEffect(() => {
    streamResponse((chunk) => {
      setText(t => t + chunk);     // 매 토큰마다 re-render
    });
  }, []);
  
  return <div>{text}</div>;
}
```

### 해결: Batch updates

```tsx
function StreamingMessage() {
  const [text, setText] = useState('');
  const bufferRef = useRef('');
  const rafRef = useRef<number>();
  
  useEffect(() => {
    streamResponse((chunk) => {
      bufferRef.current += chunk;
      
      // 다음 frame 에 batch update
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          setText(t => t + bufferRef.current);
          bufferRef.current = '';
          rafRef.current = undefined;
        });
      }
    });
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  
  return <div>{text}</div>;
}
```

→ Browser frame rate 따라 update (60fps).

---

## React 18 startTransition

```tsx
import { useTransition } from 'react';

function StreamingMessage() {
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  
  const onChunk = (chunk) => {
    startTransition(() => {
      setText(t => t + chunk);     // non-urgent
    });
  };
  
  // Urgent updates (input 등) 끊김 X
}
```

---

## Markdown 점진 렌더링

```tsx
function StreamingMarkdown({ text }) {
  // 매 토큰마다 markdown parse 비용 큼
  // 해결: debounce (50ms)
  const debouncedText = useDebounce(text, 50);
  
  return <ReactMarkdown>{debouncedText}</ReactMarkdown>;
}

// 또는 raw text 우선, 완료 후 markdown
function StreamingMessage({ text, completed }) {
  if (completed) {
    return <ReactMarkdown>{text}</ReactMarkdown>;
  }
  
  return (
    <pre className="font-sans whitespace-pre-wrap">
      {text}
    </pre>
  );
}
```

---

## Auto scroll 동기화

```tsx
function ChatPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Streaming 중 매 update 시 스크롤
  useEffect(() => {
    if (autoScroll) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'instant',           // 'smooth' 면 streaming 중 끊김
      });
    }
  });
  
  // 사용자 위로 스크롤 → auto 비활성
  const handleScroll = () => {
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setAutoScroll(isAtBottom);
  };
}
```

---

## 메시지 버퍼링 (네트워크 burst)

```typescript
class StreamBuffer {
  private buffer = '';
  private flushScheduled = false;
  
  constructor(private onFlush: (text: string) => void) {}
  
  push(chunk: string) {
    this.buffer += chunk;
    
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      requestAnimationFrame(() => {
        this.onFlush(this.buffer);
        this.buffer = '';
        this.flushScheduled = false;
      });
    }
  }
}

// 사용
const buffer = new StreamBuffer((text) => {
  setMessage(m => m + text);
});

stream.on('chunk', (chunk) => buffer.push(chunk));
```

---

## 중단 (사용자 STOP)

```typescript
async function streamWithCancel(messages, signal: AbortSignal) {
  const response = await fetch('...', {
    body: JSON.stringify({ messages }),
    signal,                          // ★ AbortSignal
  });
  
  for await (const chunk of streamReader(response.body)) {
    if (signal.aborted) {
      return;                        // 즉시 중단
    }
    yield chunk;
  }
}

// 사용자 STOP 클릭
const abortController = new AbortController();
streamWithCancel(messages, abortController.signal);

stopButton.onclick = () => abortController.abort();
```

---

## 토큰 계산

```typescript
// 실시간 토큰 카운트 (옵션)
function useTokenCount(text: string) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    // tiktoken 또는 비슷한 tokenizer
    const debounced = setTimeout(() => {
      setCount(estimateTokens(text));
    }, 100);
    
    return () => clearTimeout(debounced);
  }, [text]);
  
  return count;
}
```

---

## Side-by-side streaming (사이드 채팅)

```tsx
// 메인 + 사이드 채팅 동시 streaming
function ParallelStreaming() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <StreamingMessage 
        sessionId={mainId}
        provider="claude"
      />
      <StreamingMessage 
        sessionId={sideId}
        provider="codex"
      />
    </div>
  );
}
```

→ 두 stream 독립적. 60fps 유지.

---

## 첫 토큰 시간 (TTFT)

```typescript
// 측정
const start = performance.now();

stream.on('first-chunk', () => {
  const ttft = performance.now() - start;
  metrics.histogram('ai.ttft', ttft);
  
  if (ttft > 2000) {
    console.warn(`Slow TTFT: ${ttft}ms`);
  }
});
```

---

## 에러 처리

```typescript
async function streamWithRetry(messages, options) {
  let attempt = 0;
  
  while (attempt < 3) {
    try {
      return await streamResponse(messages);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;       // 사용자 취소 = retry X
      }
      
      if (err.code === 'rate_limit') {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        attempt++;
        continue;
      }
      
      throw err;
    }
  }
}
```

---

## 관련

- [rendering.md](./rendering.md) — 60fps
- [../tools/queue.md](../tools/queue.md) — Tool streaming
- [../session/cross-ai-sync.md](../session/cross-ai-sync.md) — Provider 별 stream 형식
