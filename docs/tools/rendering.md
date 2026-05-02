---
title: Tool Orchestration — Result Rendering
parent: ./_index.md
related:
  - ./interface.md
  - ./observability.md
status: draft
last_updated: 2026-05-02
---

# Tool Result Rendering

> **한 줄 요약**: Tool 결과를 React 컴포넌트로 변환하는 ToolResultRenderer.

---

## ToolResultRenderer 인터페이스

```typescript
interface ToolResultRenderer<TOutput> {
  tool_id: ToolId;
  
  // 요약 (메시지 안 inline)
  renderSummary(output: TOutput): React.Node;
  
  // 상세 (펼침 시)
  renderDetail(output: TOutput): React.Node;
  
  // 사이드 효과 표시
  renderSideEffects(effects: SideEffect[]): React.Node;
  
  // 실패 시
  renderError(error: ToolError): React.Node;
}
```

---

## 표시 형식 예시

### shell.run

```
inline:
  ▶ npm install                                [▼ 펼침]

펼침:
  ┌──────────────────────────────────────────┐
  │ ▼ npm install                            │
  ├──────────────────────────────────────────┤
  │ exit code: 0                             │
  │ 실행 시간: 12.4초                         │
  │                                          │
  │ ┌────────────────────────────────────┐  │
  │ │ added 247 packages, and audited... │  │
  │ │ found 0 vulnerabilities            │  │
  │ └────────────────────────────────────┘  │
  │                                          │
  │ 사이드 효과:                              │
  │   📦 node_modules/ 생성 (247개 패키지)   │
  │   📄 package-lock.json 변경              │
  │                                          │
  │ [전체 로그] [터미널에서 보기]             │
  └──────────────────────────────────────────┘
```

### 컴포넌트

```tsx
const ShellRunRenderer: ToolResultRenderer<ShellRunOutput> = {
  tool_id: 'shell.run',
  
  renderSummary(output) {
    const exitCode = output.exit_code;
    const Icon = exitCode === 0 ? '✓' : '✗';
    
    return (
      <div className="tool-summary">
        <span className={exitCode === 0 ? 'success' : 'error'}>{Icon}</span>
        <code>{output.cmd}</code>
        <small>{formatDuration(output.duration_ms)}</small>
      </div>
    );
  },
  
  renderDetail(output) {
    return (
      <div className="tool-detail">
        <div>exit code: {output.exit_code}</div>
        <div>실행 시간: {formatDuration(output.duration_ms)}</div>
        
        <pre className="output-block">
          {output.stdout.slice(0, 5000)}
          {output.stdout.length > 5000 && '... (truncated)'}
        </pre>
        
        {output.stderr && (
          <pre className="output-block error">
            {output.stderr}
          </pre>
        )}
        
        <div className="actions">
          <button onClick={() => openTerminal(output.pane_id)}>
            터미널에서 보기
          </button>
          <button onClick={() => exportLog(output.full_log_uri)}>
            전체 로그
          </button>
        </div>
      </div>
    );
  },
  
  renderSideEffects(effects) {
    return (
      <ul className="side-effects">
        {effects.map((e, i) => (
          <li key={i}>{renderSideEffect(e)}</li>
        ))}
      </ul>
    );
  },
  
  renderError(error) {
    return (
      <div className="tool-error">
        ✗ shell.run 실패
        <code>{error.message}</code>
        {error.user_visible_hint && <p>{error.user_visible_hint}</p>}
      </div>
    );
  },
};
```

### fs.write

```
inline:
  ✏ src/foo.ts (3 lines changed)             [▼ diff]

펼침:
  ┌──────────────────────────────────────────┐
  │ ▼ src/foo.ts (3 lines changed)           │
  ├──────────────────────────────────────────┤
  │ - export function bar() { ... }          │
  │ + export function bar(x: number) {       │
  │ +   return x * 2;                        │
  │ + }                                      │
  └──────────────────────────────────────────┘
```

```tsx
const FsWriteRenderer: ToolResultRenderer<FsWriteOutput> = {
  tool_id: 'fs.write',
  
  renderSummary(output) {
    return (
      <div>
        <span>✏</span>
        <code>{output.relative_path}</code>
        <small>({output.lines_changed} lines changed)</small>
      </div>
    );
  },
  
  renderDetail(output) {
    return <DiffViewer 
      before={output.diff.before}
      after={output.diff.after}
      hunks={output.diff.hunks}
    />;
  },
  // ...
};
```

### browser.screenshot

```
inline:
  📸 dashboard 스크린샷                      [▼ 보기]

펼침:
  ┌──────────────────────────────────────────┐
  │ ▼ http://localhost:3000/dashboard         │
  ├──────────────────────────────────────────┤
  │ ┌────────────────────────────────────┐  │
  │ │   [실제 스크린샷 thumbnail]        │  │
  │ │                                    │  │
  │ └────────────────────────────────────┘  │
  │ 1920x1080, 152 KB, 2026-05-02 02:00      │
  │ [전체 크기로 보기] [DOM 보기]            │
  └──────────────────────────────────────────┘
```

---

## RendererRegistry

```typescript
class RendererRegistry {
  private renderers = new Map<ToolId, ToolResultRenderer<any>>();
  
  register<T>(renderer: ToolResultRenderer<T>) {
    this.renderers.set(renderer.tool_id, renderer);
  }
  
  // 정확한 매칭 → fallback
  get(toolId: ToolId): ToolResultRenderer<any> {
    const exact = this.renderers.get(toolId);
    if (exact) return exact;
    
    // namespace 매칭 (예: "mcp.*" → MCP renderer)
    const namespace = toolId.split('.')[0];
    const ns = this.renderers.get(namespace);
    if (ns) return ns;
    
    return DEFAULT_RENDERER;
  }
}

const DEFAULT_RENDERER: ToolResultRenderer<unknown> = {
  tool_id: '*',
  renderSummary: (output) => (
    <code className="default-summary">
      {JSON.stringify(output).slice(0, 100)}
    </code>
  ),
  renderDetail: (output) => (
    <pre className="json-output">
      {JSON.stringify(output, null, 2)}
    </pre>
  ),
  renderSideEffects: () => null,
  renderError: (error) => (
    <div className="error">{error.message}</div>
  ),
};
```

---

## ToolCallBlock 컴포넌트

메시지 안에 표시되는 단위:

```tsx
function ToolCallBlock({ call, result }: Props) {
  const renderer = rendererRegistry.get(call.tool_id);
  const [expanded, setExpanded] = useState(false);
  
  if (result.status === 'pending' || result.status === 'streaming') {
    return <ToolCallPending call={call} />;
  }
  
  if (result.status === 'failed') {
    return (
      <div className="tool-call failed">
        {renderer.renderError(result.error!)}
        <button onClick={() => retry(call)}>재시도</button>
      </div>
    );
  }
  
  return (
    <div className="tool-call">
      <button 
        className="summary-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {renderer.renderSummary(result.output)}
        <span>{expanded ? '▼' : '▶'}</span>
      </button>
      
      {expanded && (
        <div className="detail">
          {renderer.renderDetail(result.output)}
          {result.side_effects?.length && renderer.renderSideEffects(result.side_effects)}
        </div>
      )}
    </div>
  );
}
```

---

## SideEffect 표시

```tsx
function renderSideEffect(effect: SideEffect): React.Node {
  switch (effect.kind) {
    case 'file_modified':
      return <span>📝 {effect.details.path} 수정</span>;
    case 'file_created':
      return <span>📄 {effect.details.path} 생성</span>;
    case 'file_deleted':
      return <span>🗑 {effect.details.path} 삭제</span>;
    case 'process_spawned':
      return <span>⚙ 프로세스 시작 (PID {effect.details.pid})</span>;
    case 'browser_tab_opened':
      return <span>🌐 새 탭 ({effect.details.url})</span>;
    case 'network_request_sent':
      return <span>🔗 {effect.details.method} {effect.details.url}</span>;
  }
}
```

---

## 한국어 / 영어 / 시간 포맷

```typescript
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}초`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 ${Math.floor((ms % 60_000) / 1000)}초`;
  return `${Math.floor(ms / 3_600_000)}시간 ${Math.floor((ms % 3_600_000) / 60_000)}분`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
```

---

## 검증 (Invariants)

```
INV-1: 모든 built-in tool 은 전용 renderer 보유
INV-2: MCP tool 은 namespace renderer (mcp.*) 사용
INV-3: renderError 는 항상 user_visible_hint 우선 표시
INV-4: SideEffect 표시는 length 순 (적은 것부터)
INV-5: 펼침 상태는 메시지 별로 독립
```

---

## 관련

- [interface.md](./interface.md) — ToolResult / SideEffect 정의
- [observability.md](./observability.md) — Trace timeline 통합
- [logging.md](./logging.md) — log_tail 표시
