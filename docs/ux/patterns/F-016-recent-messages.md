---
title: F-016 — "최근 메시지 ›" Expand
parent: ../_index.md
priority: P0
phase: Phase 1
status: complete
---

# F-016: "최근 메시지 ›" Expand 패턴

> **한 줄 요약**: 채팅 히스토리를 hide + on-demand 펼침. 화면 공간 절약.

---

## UI 동작

```
[클릭 전]                       [클릭 후]
┌──────────────┐                ┌──────────────────────────────┐
│ 최근 메시지 › │                │ 최근 메시지              ⌄ │
└──────────────┘                ├──────────────────────────────┤
                                │ AI: <메시지>                 │
                                │ ┌─────────────┐               │
                                │ │ 미리보기카드  │ [열기]        │
                                │ └─────────────┘               │
                                │ 👍 👎 ↪                       │
                                └──────────────────────────────┘
```

## 핵심

```
- collapse 상태: 1줄 (높이 36px)
- expand 상태: 채팅 위로 펼쳐짐 (max-height 60vh)
- 클릭 시 부드럽게 transition
- Esc 키 → collapse
```

## Floating overlay 와 통합

[F-015](./F-015-floating-overlay.md) 의 핵심 동작:

```
일반 채팅 패널: 메시지 항상 보임
Floating overlay: 메시지 hidden + on-demand
                  → 미리보기 가시성 최대화
```

## 구현

```tsx
function RecentMessagesExpander() {
  const [expanded, setExpanded] = useState(false);
  const recentTurns = useRecentTurns(10);
  
  return (
    <>
      <button 
        className="w-full px-4 py-2 text-left flex justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <span>최근 메시지</span>
        <span>{expanded ? '⌄' : '›'}</span>
      </button>
      
      {expanded && (
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {recentTurns.map(turn => <TurnItem key={turn.id} turn={turn} />)}
        </div>
      )}
    </>
  );
}
```

## 관련

- [F-015](./F-015-floating-overlay.md)
