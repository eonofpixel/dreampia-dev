---
title: Components — Diff Viewer
parent: ./_index.md
related:
  - code-block.md
  - ../tokens/colors.md
status: draft
last_updated: 2026-05-02
---

# DiffViewer

> **한 줄 요약**: Git diff / file change 시각화. Side-by-side or unified.

---

## Variants

```
[Unified]      한 컬럼에 - / + 표시 (기본)
[Side-by-side] 좌우 비교 (큰 화면)
[Inline]       메시지 안 작은 diff (3-5줄)
```

---

## Visual

```
[Unified]
┌─────────────────────────────────────────────┐
│ src/foo.ts (3 changes)                      │
├─────────────────────────────────────────────┤
│  1   import { x } from './x';               │
│  2                                          │
│  3 - export function bar() {               │ ← 빨강 bg
│  4 -   return 'hi';                        │
│  5 - }                                     │
│  3 + export function bar(name: string) {   │ ← 녹색 bg
│  4 +   return `안녕 ${name}!`;             │
│  5 + }                                     │
│  6                                          │
└─────────────────────────────────────────────┘

[Side-by-side]
┌──────────────────────────┬──────────────────────────┐
│ Before                   │ After                    │
├──────────────────────────┼──────────────────────────┤
│ 3 export function bar()  │ 3 export function bar(   │
│ 4   return 'hi';         │ 4   name: string         │
│ 5 }                      │ 5 ) {                    │
│                          │ 6   return `안녕 ${name}!│
│                          │ 7 }                      │
└──────────────────────────┴──────────────────────────┘
```

---

## 구현 (Unified)

```tsx
function DiffViewer({ filePath, hunks, mode = 'unified' }) {
  return (
    <div className="border border-border-primary rounded-md overflow-hidden">
      <DiffHeader filePath={filePath} stats={computeStats(hunks)} />
      
      {mode === 'unified' 
        ? <UnifiedDiff hunks={hunks} />
        : <SideBySideDiff hunks={hunks} />
      }
    </div>
  );
}

function DiffHeader({ filePath, stats }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary border-b border-border-primary">
      <span className="font-mono text-sm">{filePath}</span>
      <div className="flex gap-2 text-xs">
        <span className="text-success-700">+{stats.added}</span>
        <span className="text-danger-700">-{stats.removed}</span>
      </div>
    </div>
  );
}

function UnifiedDiff({ hunks }) {
  return (
    <div className="font-mono text-sm">
      {hunks.map((hunk, hi) => (
        <div key={hi}>
          <HunkHeader hunk={hunk} />
          {hunk.lines.map((line, li) => (
            <DiffLine key={li} line={line} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DiffLine({ line }) {
  const bgColor = {
    added: 'bg-success-50/40 dark:bg-success-700/20',
    removed: 'bg-danger-50/40 dark:bg-danger-700/20',
    context: '',
  }[line.type];
  
  const prefix = {
    added: '+',
    removed: '-',
    context: ' ',
  }[line.type];
  
  return (
    <div className={cn('flex', bgColor)}>
      <span className="select-none text-text-tertiary px-2 w-12 text-right">
        {line.type !== 'added' ? line.oldLineNum : ''}
      </span>
      <span className="select-none text-text-tertiary px-2 w-12 text-right">
        {line.type !== 'removed' ? line.newLineNum : ''}
      </span>
      <span className="px-2 flex-1">
        <span className="select-none">{prefix}</span>
        {line.content}
      </span>
    </div>
  );
}
```

---

## Side-by-Side

```tsx
function SideBySideDiff({ hunks }) {
  return (
    <div className="grid grid-cols-2 font-mono text-sm">
      <div>
        <div className="px-3 py-2 bg-bg-tertiary text-xs font-medium">Before</div>
        {/* removed + context lines */}
      </div>
      <div className="border-l border-border-primary">
        <div className="px-3 py-2 bg-bg-tertiary text-xs font-medium">After</div>
        {/* added + context lines */}
      </div>
    </div>
  );
}
```

---

## "마지막 턴" 모드 (F-032)

AI 응답 후 자동으로 변경 사항 표시:

```tsx
function LastTurnDiff() {
  const lastTurn = useLastTurn();
  const changes = useChangesByTurn(lastTurn.id);
  
  if (changes.length === 0) return null;
  
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">마지막 턴 변경 사항 ({changes.length}개)</h3>
      
      {changes.map(change => (
        <DiffViewer 
          key={change.path}
          filePath={change.path}
          hunks={change.hunks}
        />
      ))}
      
      <div className="flex gap-2 mt-4">
        <Button variant="primary">변경 유지</Button>
        <Button variant="danger">모두 되돌리기</Button>
      </div>
    </div>
  );
}
```

---

## Inline (메시지 안)

```tsx
// fs.write tool 결과 안
function InlineDiff({ before, after }) {
  const hunks = computeDiff(before, after);
  
  if (hunks.length === 0) return <span>변경 없음</span>;
  
  // 작은 영역이므로 간단한 unified
  return (
    <div className="text-xs font-mono bg-bg-secondary rounded p-2 max-h-[200px] overflow-y-auto">
      {hunks.map(hunk => 
        hunk.lines.slice(0, 10).map((line, i) => (
          <DiffLine key={i} line={line} compact />
        ))
      )}
      
      {hunks[0].lines.length > 10 && (
        <button className="text-accent hover:underline mt-1">
          전체 보기
        </button>
      )}
    </div>
  );
}
```

---

## Diff 알고리즘

```typescript
import { diffLines, diffWords } from 'diff';

function computeHunks(before: string, after: string): Hunk[] {
  const lineDiff = diffLines(before, after);
  
  // ... line groups → hunks 변환
  // (with context lines)
}

// 또는 jsdiff 라이브러리 사용
```

---

## Accessibility

```
✓ Headers 명확 (filePath, stats)
✓ "+" / "-" 가 색만 X (prefix 시각적)
✓ Line numbers 는 select 가능 (참조 위해)
✓ aria-label = "src/foo.ts 의 변경 사항, +3 -2"
```

---

## 관련

- [code-block.md](./code-block.md) — 단순 코드
- [../tokens/colors.md](../tokens/colors.md) — diff 색
- [../../ux/patterns/F-032-diff-panel.md](../../ux/patterns/F-032-diff-panel.md)
