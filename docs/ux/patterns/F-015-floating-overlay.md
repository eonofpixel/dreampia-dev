---
title: F-015 — Floating 채팅 Overlay
parent: ../_index.md
priority: P0
phase: Phase 1
status: complete
---

# F-015: Floating 채팅 Overlay

> **한 줄 요약**: 전체화면 시 채팅이 사라지지 않고 하단 floating panel 로 변환.

---

## UI

```
전체화면 모드 시 화면 하단:

[하단 부유 채팅 입력]
┌─────────────────────────────────────────────────┐
│ 최근 메시지                                  ⌄ │ ← collapse
├─────────────────────────────────────────────────┤
│ + ⚠ 후속 변경 사항을 부탁하세요   5.5 매우 높음 🎤 ▶│
└─────────────────────────────────────────────────┘

z-index 최상위 (미리보기 콘텐츠 위)
"최근 메시지" 클릭 시 위로 펼쳐짐
```

## 핵심 특징

- **z-index 최상위**: 미리보기 위에 떠있음
- **반투명 배경**: 미리보기 살짝 보임
- **collapse/expand**: 최근 메시지 펼치기
- **항상 활성**: 어디에서도 입력 가능

## 위치

```
화면 하단 중앙 (양쪽 margin 80px)
미리보기 panel 의 1/3 폭 정도
```

## 구현

```tsx
function FloatingChatOverlay({ visible }: Props) {
  if (!visible) return null;
  
  return (
    <div className="fixed bottom-0 left-1/4 right-1/4 z-50 
                    bg-white/90 backdrop-blur shadow-xl 
                    rounded-t-lg">
      <RecentMessagesExpander />  {/* F-016 */}
      <ChatInput />
    </div>
  );
}
```

## 관련

- [F-014](./F-014-fullscreen.md) — 전체화면 토글
- [F-016](./F-016-recent-messages.md) — Recent messages
