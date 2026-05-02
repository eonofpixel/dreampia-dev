---
title: F-022 — 임베디드 미리보기 카드
parent: ../_index.md
priority: P0
phase: Phase 1
---

# F-022: 임베디드 미리보기 카드

> **한 줄 요약**: AI 응답 안에 액션 카드 (웹/이미지/PDF/차트). [열기] 클릭 → 미리보기 탭 전환.

---

## UI

```
채팅 안에:
  ┌────────────────────────────────┐
  │ 🌐 웹 미리보기            [열기]│
  │    웹사이트                    │
  └────────────────────────────────┘

특징:
  - AI 응답 안에 액션 카드
  - 클릭 가능 (전체 영역)
  - "열기" 버튼 → 미리보기 탭으로 점프
  - 아이콘으로 종류 구분 (🌐 / 🖼 / 📄 / 📊)
```

## 카드 종류

```
🌐 web_preview        URL 페이지
🖼 image              이미지 파일
📄 pdf                PDF 문서
📊 chart              데이터 시각화
```

## 동작

```
[열기] 클릭 →
  1. 미리보기 패널의 해당 URL 탭으로 즉시 점프
  2. 사이드 채팅 탭 등 다른 탭은 유지 (탭 닫지 않음)
  3. URL 자동 navigate (브라우저 동작)
```

## 데이터 모델

```typescript
// docs/session/conversation.md 참고
interface EmbeddedCard {
  kind: 'web_preview' | 'image' | 'pdf' | 'chart';
  title: string;
  url?: Uri;                           // [열기] 버튼 동작
  thumbnail?: Uri;
  meta?: Record<string, unknown>;
}
```

## 출처

- [docs/findings/round4-context-menus.md](../../findings/round4-context-menus.md)
