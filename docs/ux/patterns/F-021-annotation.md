---
title: F-021 — ★ 주석 달기 모드 (Annotation Mode)
parent: ../_index.md
priority: P0
phase: Phase 1
---

# F-021: 주석 달기 모드 ★ (강력한 차별화)

> **한 줄 요약**: 미리보기 요소 호버/클릭 → DOM 자동 인식 + 입력창. AI 컨텍스트 정확.

---

## UI

```
[주석 모드 활성화 시]

화면 우상단:  [⚙ 주석 다는 중]  ← 인디케이터

미리보기 안:
  ┌──────────────────────────────────────────┐
  │ ╔═══════════════════════════════════════╗│ ← 호버 outline
  │ ║  대시보드                             ║│
  │ ║  HOME › 업무 현황                ① ←━━┃━━ 마커
  │ ╚═══════════════════════════════════════╝│
  │                                           │
  │              ┌──────────────────────┐    │
  │              │ 댓글 추가...      🎤 │    │ ← 인라인 입력창
  │              └──────────────────────┘    │
  └──────────────────────────────────────────┘
```

## 동작

```
1. 주석 모드 활성화 (버튼)
2. 미리보기 요소 호버 → 파란색 outline (자동 인식)
3. 클릭 → 번호 마커 + 인라인 입력창
4. 댓글 작성 (음성 가능) → AI 컨텍스트 자동 첨부
5. AI가 정확한 위치 + DOM selector 인식 → 수정
```

## 기술 추정

```
- iframe / webview 에 클릭 리스너 주입
- DOM 요소 → CSS selector 추출
- 좌표 + 부분 screenshot 첨부
- JSON: {selector, screenshot, comment, position}
```

## Dreampia-Dev Annotation 데이터

상세는 [docs/session/conversation.md](../../session/conversation.md) 의 Annotation 인터페이스.

```typescript
interface Annotation {
  selector: string;                    // CSS selector
  bounding_box: { x, y, w, h };
  screenshot_uri: Uri;                 // 부분 스크린샷
  dom_meta: { tag, color, font, ... };
  comment: string;
  comment_audio_uri?: Uri;             // 음성 입력
  page_url: string;
}
```

## 차별화 가치

```
일반 채팅앱: "이 부분 고쳐줘" → AI 가 어디인지 모름
Codex/Dreampia: 호버만 → AI 가 정확한 selector + screenshot 받음
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
