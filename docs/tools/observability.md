---
title: Tool Orchestration — Observability (Trace UI)
parent: ./_index.md
related:
  - ./logging.md
  - ./rendering.md
status: draft
last_updated: 2026-05-02
---

# Observability UX

> **한 줄 요약**: "무슨 일이 일어났는지 납득 가능한 에이전트" — Codex 5번째 권고.

---

## TraceTimeline 인터페이스

```typescript
interface TraceTimeline {
  session_id: SessionId;
  turn_id: TurnId;
  
  events: TraceEvent[];
  
  // 요약
  total_duration_ms: number;
  total_tools_called: number;
  failures: number;
}

interface TraceEvent {
  timestamp: ISO8601;
  type: 'tool_call' | 'permission_request' | 'ai_thinking' | 'response_chunk' 
       | 'subagent_call' | 'plugin_loaded' | 'error';
  
  // Tool call
  tool_id?: ToolId;
  call_id?: ToolCallId;
  
  // 표시 정보
  title: string;
  duration_ms?: number;
  status?: 'success' | 'failed' | 'cancelled';
  
  // 펼침 시 보여줄 내용
  details?: unknown;
}
```

---

## Timeline UI

```
[메시지 응답 헤더]
┌──────────────────────────────────────────┐
│ ▼ 5개 도구 실행 (12.3초)                  │
├──────────────────────────────────────────┤
│ ⏱ 0.0s  🤔 모델 추론 시작                │
│ ⏱ 0.8s  ⚙ shell.run("ls")  (0.1s)       │
│ ⏱ 0.9s  ✓ 결과 받음                      │
│ ⏱ 1.0s  ⚙ fs.read("package.json")       │
│ ⏱ 1.0s  ✓ 결과 받음                      │
│ ⏱ 1.1s  ⚙ shell.run("npm test")  (8.2s) │
│ ⏱ 9.3s  ✗ exit code 1                    │
│ ⏱ 9.4s  🤔 분석 중                       │
│ ⏱ 11.0s ⚙ fs.write("test.js") (0.2s)    │
│ ⏱ 11.2s ✓ 저장 완료                      │
│ ⏱ 11.3s ⚙ shell.run("npm test") (1.0s)  │
│ ⏱ 12.3s ✓ exit code 0                    │
│ ⏱ 12.3s ✓ 응답 완료                      │
│                                          │
│ [전체 로그 보기] [로그 내보내기]         │
└──────────────────────────────────────────┘
```

### 컴포넌트

```tsx
function TraceTimeline({ turnId }: { turnId: TurnId }) {
  const events = useTraceEvents(turnId);
  const [expanded, setExpanded] = useState(false);
  
  const summary = computeSummary(events);
  
  return (
    <div className="trace-timeline">
      <button 
        className="header"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '▼' : '▶'}
        {summary.tool_count}개 도구 실행 ({formatDuration(summary.total_duration_ms)})
        {summary.failure_count > 0 && (
          <span className="failures">{summary.failure_count}개 실패</span>
        )}
      </button>
      
      {expanded && (
        <div className="events">
          {events.map(event => (
            <TraceEventRow key={event.timestamp} event={event} />
          ))}
          
          <div className="actions">
            <button onClick={() => openFullLog(turnId)}>전체 로그 보기</button>
            <button onClick={() => exportLog(turnId)}>로그 내보내기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TraceEventRow({ event }: { event: TraceEvent }) {
  return (
    <div className={`event event-${event.type}`}>
      <span className="time">⏱ {formatRelativeTime(event.timestamp)}</span>
      <span className="icon">{eventIcon(event)}</span>
      <span className="title">{event.title}</span>
      {event.duration_ms && (
        <span className="duration">({formatDuration(event.duration_ms)})</span>
      )}
    </div>
  );
}
```

---

## 이벤트 종류별 표시

```typescript
function eventIcon(event: TraceEvent): string {
  switch (event.type) {
    case 'tool_call':
      return event.status === 'success' ? '⚙' :
             event.status === 'failed' ? '✗' :
             event.status === 'cancelled' ? '⊘' :
             '⏳';
    case 'permission_request':
      return '🔒';
    case 'ai_thinking':
      return '🤔';
    case 'response_chunk':
      return '💬';
    case 'subagent_call':
      return '🤖';
    case 'plugin_loaded':
      return '🔌';
    case 'error':
      return '⚠';
  }
}
```

---

## Failure Reason Card

실패 시 단순/명확한 카드:

```
┌──────────────────────────────────────────┐
│ ✗ npm test 실패                          │
├──────────────────────────────────────────┤
│ 어디서: tests/foo.test.ts:15             │
│ 무엇이: assertion error                  │
│   expected: "hello"                      │
│   actual:   "hi"                         │
│                                          │
│ AI 의 다음 행동:                          │
│   foo.ts 의 greeting 함수 수정 시도      │
│                                          │
│ [전체 로그] [관련 파일] [수동 디버그]    │
└──────────────────────────────────────────┘
```

```tsx
function FailureCard({ event, nextAction }: Props) {
  const error = event.details as ToolError;
  const parsedFailure = parseTestFailure(error);
  
  return (
    <div className="failure-card">
      <div className="header">
        <span>✗</span>
        <span>{event.title} 실패</span>
      </div>
      
      <div className="details">
        {parsedFailure.location && (
          <Field label="어디서">
            <code>{parsedFailure.location}</code>
          </Field>
        )}
        
        {parsedFailure.what && (
          <Field label="무엇이">
            <pre>{parsedFailure.what}</pre>
          </Field>
        )}
        
        {nextAction && (
          <Field label="AI 의 다음 행동">
            <p>{nextAction}</p>
          </Field>
        )}
      </div>
      
      <div className="actions">
        <button onClick={() => openLog(event.call_id)}>전체 로그</button>
        <button onClick={() => openFiles(parsedFailure.related_files)}>관련 파일</button>
        <button onClick={() => startDebug(event)}>수동 디버그</button>
      </div>
    </div>
  );
}
```

---

## Diff Viewer (fs.write 결과)

```tsx
function DiffViewer({ before, after, hunks }: DiffProps) {
  return (
    <div className="diff-viewer">
      <div className="header">
        <span className="filename">{filename}</span>
        <span className="stats">
          <span className="add">+{stats.added}</span>
          <span className="del">-{stats.deleted}</span>
        </span>
      </div>
      
      <div className="hunks">
        {hunks.map(hunk => (
          <DiffHunk key={hunk.id} hunk={hunk} />
        ))}
      </div>
    </div>
  );
}
```

---

## Browser Snapshot Gallery

여러 스크린샷을 시간순 표시:

```
┌────────────────────────────────────────────────┐
│ 브라우저 스크린샷 (4)                          │
├────────────────────────────────────────────────┤
│ 09:00:01  /login          [thumb]  [전체보기]   │
│ 09:00:05  /login (입력)   [thumb]  [전체보기]   │
│ 09:00:08  /dashboard      [thumb]  [전체보기]   │
│ 09:00:12  /dashboard (스크롤) [thumb]           │
└────────────────────────────────────────────────┘
```

```tsx
function BrowserSnapshotGallery({ tabId }: Props) {
  const snapshots = useBrowserSnapshots(tabId);
  
  return (
    <div className="snapshot-gallery">
      {snapshots.map(snap => (
        <div key={snap.id} className="snapshot">
          <time>{formatTime(snap.timestamp)}</time>
          <span className="url">{snap.url}</span>
          <img src={snap.thumbnail_uri} alt="" />
          <button onClick={() => openFull(snap.full_uri)}>전체보기</button>
        </div>
      ))}
    </div>
  );
}
```

---

## Agent Trace (sub-agent 호출 시)

```
[메시지 안 inline]
  ┌──────────────────────────────────────┐
  │ 🤖 @Analyst 호출 (45.2초)            │
  ├──────────────────────────────────────┤
  │ 입력: "이 코드 검토해줘"             │
  │                                      │
  │ Sub-conversation (12 turns):         │
  │   1. 💬 분석 시작                    │
  │   2. ⚙ fs.read x 5                   │
  │   3. 💬 패턴 식별                    │
  │   4. ⚙ fs.search                     │
  │   5. ...                             │
  │   12. 💬 최종 보고서                 │
  │                                      │
  │ 결과: "3개 이슈 발견 (상세 보고서)"  │
  │                                      │
  │ [전체 sub-conversation 보기]         │
  └──────────────────────────────────────┘
```

---

## 검색 / 필터

```
┌─────────────────────────────────────────┐
│ Trace 검색  [tool name 또는 키워드 ▼]   │
├─────────────────────────────────────────┤
│ 필터:                                   │
│   ☑ tool_call  ☑ error                 │
│   ☐ ai_thinking  ☐ response_chunk      │
│                                         │
│ 시간:    [2026-05-02] ~ [2026-05-02]   │
│ 상태:    ☑ success  ☑ failed           │
│ Tool:    [shell.run                  ▼]│
└─────────────────────────────────────────┘
```

---

## Export Log

```typescript
async function exportLog(turnId: TurnId): Promise<Blob> {
  const events = await loadTraceEvents(turnId);
  const session = await loadSession(currentSessionId);
  
  // Markdown 으로 변환
  const md = `
# 작업 로그

**세션**: ${session.title}
**Turn**: ${turnId}
**날짜**: ${formatDate(events[0].timestamp)}

---

## 이벤트

${events.map(e => `
### ${formatTime(e.timestamp)} - ${e.title}

${e.duration_ms ? `소요: ${formatDuration(e.duration_ms)}\n` : ''}
${e.status ? `상태: ${e.status}\n` : ''}
${e.details ? '```\n' + JSON.stringify(e.details, null, 2) + '\n```' : ''}
`).join('\n')}
  `;
  
  return new Blob([md], { type: 'text/markdown' });
}
```

---

## 검증 (Invariants)

```
INV-1: Trace 는 turn 단위 (turn 별 별도 timeline)
INV-2: 모든 ToolCall 은 trace 에 등장 (누락 X)
INV-3: 시간 정렬 보장 (timestamp ASC)
INV-4: Failure card 는 user_visible_hint 우선 표시
INV-5: Sub-agent trace 는 nested timeline
```

---

## 관련

- [logging.md](./logging.md) — Trace 의 데이터 출처
- [rendering.md](./rendering.md) — Tool result 렌더링과 통합
- [docs/session/conversation.md](../session/conversation.md) — Turn 안 trace
