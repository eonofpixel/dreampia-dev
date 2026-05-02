---
title: Components — ToolResult
parent: ./_index.md
related:
  - chat-message.md
  - code-block.md
  - diff-viewer.md
status: draft
last_updated: 2026-05-02
---

# ToolResult

> **한 줄 요약**: AI 가 호출한 도구의 결과 표시. summary (inline) + detail (펼침).

---

## States

```
[pending]    🤔 호출 중
[streaming]  ⠋ 진행 (output 점진 도착)
[success]    ✓ 완료 (펼침 가능)
[failed]     ✗ 실패 (에러 카드 + 재시도)
[cancelled]  ⊘ 취소됨
```

---

## Visual

```
[Summary - inline]
▶ shell.run("npm test")  (8.2s)  ✗ exit 1     [▼ 펼침]
↑ icon ↑ tool ↑ summary       ↑ status

[Detail - 펼침]
┌──────────────────────────────────────────┐
│ ▼ shell.run("npm test")                  │
├──────────────────────────────────────────┤
│ exit code:    1                          │
│ 실행 시간:    8.2초                       │
│ 시도:         1번 만에 실패              │
│                                          │
│ stdout:                                  │
│ ┌────────────────────────────────────┐ │
│ │ FAIL tests/foo.test.ts             │ │
│ │   ✗ greets correctly (12ms)        │ │
│ │     expected: "hello"              │ │
│ │     actual:   "hi"                 │ │
│ └────────────────────────────────────┘ │
│                                          │
│ 사이드 효과:                              │
│   📦 node_modules 변경 (없음)            │
│                                          │
│ [전체 로그] [터미널에서 보기] [재실행]   │
└──────────────────────────────────────────┘

[Failed]
┌──────────────────────────────────────────┐
│ ✗ shell.run("npm test") 실패             │
│   exit code 1, 5 tests failed            │
│                                          │
│ AI 다음 행동:                             │
│ > foo.ts 의 greeting 함수 수정 시도      │
│                                          │
│ [전체 로그] [관련 파일] [수동 디버그]   │
└──────────────────────────────────────────┘
```

---

## 구현

```tsx
function ToolCallResult({ call, result }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!result) {
    return <ToolCallPending call={call} />;
  }
  
  if (result.status === 'failed') {
    return <ToolCallError call={call} result={result} />;
  }
  
  return (
    <div className="my-2 border border-border-primary rounded-md overflow-hidden">
      <button
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-bg-tertiary"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={result.status} />
        <code className="text-sm font-mono">{call.tool_id}</code>
        <span className="flex-1 truncate text-sm text-text-secondary">
          {summarizeInput(call.input)}
        </span>
        <span className="text-xs text-text-tertiary">
          {formatDuration(result.duration_ms)}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 transition-transform',
          expanded && 'rotate-180'
        )} />
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-border-primary"
          >
            <ToolResultDetail call={call} result={result} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

---

## ToolCallPending

```tsx
function ToolCallPending({ call }) {
  return (
    <div className="my-2 px-3 py-2 flex items-center gap-2 border border-border-primary rounded-md">
      <Spinner size="sm" />
      <code className="text-sm font-mono">{call.tool_id}</code>
      <span className="text-sm text-text-secondary">호출 중...</span>
      <button className="ml-auto text-xs text-text-tertiary hover:text-text-primary">
        취소
      </button>
    </div>
  );
}
```

---

## ToolCallError

```tsx
function ToolCallError({ call, result }) {
  return (
    <div className="my-2 border border-danger rounded-md bg-danger-50/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <X className="w-4 h-4 text-danger" />
        <code className="text-sm font-mono">{call.tool_id}</code>
        <Badge variant="danger" size="xs">실패</Badge>
      </div>
      
      <p className="text-sm">
        {result.error?.user_visible_hint ?? result.error?.message}
      </p>
      
      {result.error?.code && (
        <p className="text-xs text-text-tertiary mt-1 font-mono">
          {result.error.code}
        </p>
      )}
      
      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="secondary" onClick={() => retry(call)}>
          재시도
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openLog(call.id)}>
          전체 로그
        </Button>
      </div>
    </div>
  );
}
```

---

## Tool 별 Renderer

```tsx
// docs/tools/rendering.md 참고
function ToolResultDetail({ call, result }) {
  const renderer = rendererRegistry.get(call.tool_id);
  
  return (
    <div className="p-3">
      {renderer.renderDetail(result.output)}
      
      {result.side_effects?.length > 0 && (
        <SideEffectsList effects={result.side_effects} />
      )}
      
      <ToolResultActions call={call} result={result} />
    </div>
  );
}

function SideEffectsList({ effects }) {
  return (
    <div className="mt-3">
      <h4 className="text-xs font-medium text-text-secondary mb-1">사이드 효과</h4>
      <ul className="space-y-1">
        {effects.map((e, i) => (
          <li key={i} className="text-xs flex items-center gap-1">
            {SIDE_EFFECT_ICONS[e.kind]}
            <span>{describeSideEffect(e)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Tool 별 특별 표시

```typescript
// fs.write → DiffViewer
const FsWriteRenderer = {
  renderDetail: (output) => <DiffViewer hunks={output.diff} />,
};

// shell.run → CodeBlock + 사이드효과
const ShellRunRenderer = {
  renderDetail: (output) => (
    <>
      <div className="flex gap-4 text-xs text-text-secondary mb-2">
        <span>exit: {output.exit_code}</span>
        <span>{formatDuration(output.duration_ms)}</span>
      </div>
      <CodeBlock language="bash" value={output.stdout} />
      {output.stderr && <CodeBlock language="bash" value={output.stderr} variant="error" />}
    </>
  ),
};

// browser.screenshot → 이미지
const BrowserScreenshotRenderer = {
  renderDetail: (output) => (
    <img 
      src={output.screenshot_uri} 
      alt={`스크린샷: ${output.url}`}
      className="rounded max-w-full"
    />
  ),
};
```

---

## Trace timeline 통합

[F-32 Diff panel](../../ux/patterns/F-032-diff-panel.md), [docs/tools/observability.md](../../tools/observability.md) 참고.

---

## Accessibility

```
✓ <button> 으로 펼침/닫힘
✓ aria-expanded 표시
✓ aria-controls 펼침 영역 연결
✓ Status 색만으로 X (✓ ✗ 아이콘 함께)
✓ Failed = role="alert" 즉시 읽힘
```

---

## 관련

- [chat-message.md](./chat-message.md) — Tool 결과가 어디 표시되는지
- [code-block.md](./code-block.md) — stdout/stderr
- [diff-viewer.md](./diff-viewer.md) — fs.write 결과
- [../../tools/rendering.md](../../tools/rendering.md) — Renderer 시스템
