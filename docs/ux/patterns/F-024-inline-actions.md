---
title: F-024 — 좋아요/싫어요/공유 인라인 액션
parent: ../_index.md
priority: P0
phase: Phase 1
---

# F-024: 좋아요/싫어요/공유 인라인 액션

> **한 줄 요약**: AI 응답 하단에 inline `👍 👎 ↪`. 별도 메뉴 X.

---

## UI

```
AI 응답 하단:
  👍 👎 ↪

특징:
  - 별도 메뉴 X (인라인)
  - 한 줄에 명확
  - 공유 (↪) = URL 복사 / 외부 공유
```

## 동작

```
👍 thumbs up   → "좋아요" 표시 (학습용)
👎 thumbs down → "싫어요" 표시 + (옵션) 사유 입력
↪ 공유          → 옵션 메뉴:
                  - 딥링크 복사 (codex://chat/<id>?turn=...)
                  - Markdown 으로 복사
                  - 메시지만 캡처 이미지
```

## 데이터 모델

```typescript
interface Reaction {
  kind: 'thumbs_up' | 'thumbs_down' | 'shared';
  timestamp: ISO8601;
  comment?: string;                    // optional 사용자 메모
}
```

## hover 시 추가 아이콘

```
일반:    [          ] (안 보임)
hover:   [👍 👎 ↪ 📋 ✏ ⏰]
              ↑   ↑  ↑   ↑
              복사 편집 시간
```

→ Codex 의 hover-trigger 패턴.

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
