---
title: F-028 — 모델 + 인텔리전스 + 속도 3단
parent: ../_index.md
priority: P0
phase: Phase 1
---

# F-028: 모델 + 인텔리전스 + 속도 3단 분리

> **한 줄 요약**: 모델 / 효력 / 모드 3가지를 별도 dropdown 으로 분리.

---

## 3개 별도 컨트롤

```
입력창 하단 우측:

[모델: 5.5 ▼]  [효력: 매우 높음 ▼]  [모드: ⚡ 속도형 ▼]
   ↑                ↑                    ↑
   AI 모델 선택     reasoning effort   /속도형 / /플랜
```

## 1. 모델 dropdown

```
GPT-5.5 (기본)
GPT-5
GPT-5 mini
GPT-5 nano
GPT-5.3-Codex-Spark (Codex 전용)
─ 다른 ─
Claude Opus 4.7
Claude Sonnet 4.6
...
```

## 2. 효력 (Effort)

```
매우 높음   maximum
높음        high
중간        medium  
낮음        low
최소        minimum
```

## 3. 모드 (선택적)

```
표준 (없음)
⚡ 속도형     /속도형 활성화
⊟ 플랜 모드  /플랜 활성화 (read-only)
```

## 시각 표시

```
모드 활성 시 입력창에 아이콘 추가:
  표준:    [+ ⚠ <텍스트>...]
  속도형:  [+ ⚠ <텍스트>...   ⚡ 5.5 매우 높음]
  플랜:    [+ ⊟ 🌐 <텍스트>...   5.5 매우 높음]
```

## 분리의 의미

```
일반 채팅앱: 모델 1개만 선택
Codex/Dreampia:
  - 모델 (어떤 AI)
  - 효력 (얼마나 깊이 생각)
  - 모드 (어떤 패턴)
  
3개 독립 = 더 정밀한 제어
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
- [docs/findings/round4-parallel-skills.md](../../findings/round4-parallel-skills.md)
