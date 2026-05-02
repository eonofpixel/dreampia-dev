---
title: F-023 — 메시지마다 모델 + 효력 강도
parent: ../_index.md
priority: P0
phase: Phase 1
---

# F-023: 메시지마다 모델 + 효력 강도

> **한 줄 요약**: 메시지마다 AI 모델 + reasoning effort 변경 가능. 대화 단위 X.

---

## UI

```
입력 박스 우측:
  + ⚠ <입력>... 5.5 매우 높음 🎤 ▶
                ─────────────
                모델 + 효력 (드롭다운)

옵션 추정:
  - 모델: 5.5 / 5 / 5 mini / 5 nano
  - 효력 (reasoning effort): 매우 높음 / 높음 / 중간 / 낮음
  - 메시지마다 변경 가능 (대화 단위 X)
```

## EffortLevel 매핑

```
한국어:    minimum / low / medium / high / maximum
표시:      최소 / 낮음 / 중간 / 높음 / 매우 높음
```

## 모델 옵션 (Codex)

```
GPT-5.5 (기본)
GPT-5 mini
GPT-5 nano
GPT-5.3-Codex-Spark (Codex 전용)
기타 모델...
```

## Dreampia-Dev 차이

```
Codex: GPT 모델만
Claude Desktop: Claude 모델만

Dreampia-Dev:
  메시지마다 GPT 또는 Claude 선택 가능
  → 같은 대화 안에서 cross-provider 가능
```

## 데이터 모델

```typescript
// docs/session/conversation.md
interface Turn {
  // ...
  model?: ModelId;                     // override session default
  effort?: EffortLevel;
}
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
