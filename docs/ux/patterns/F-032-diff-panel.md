---
title: F-032 — Diff Panel (Git/PR)
parent: ../_index.md
priority: P1
phase: Phase 2
---

# F-032: Diff Panel

> **한 줄 요약**: "검토" 탭 = git diff viewer. AI 변경 + git 변경 통합 표시.

---

## UI

```
미리보기 패널 탭:
[검토] [페이지 미리보기] [+]
   ↑
   diff viewer 모드

[검토] 탭 내용:
┌────────────────────────────────────────────────────┐
│ Diff Viewer                          [···] [🔗] [📁]│
├────────────────────────────────────────────────────┤
│ 📂 변경된 파일 (3)                                  │
│   ✏ src/Button.tsx     (3 lines changed)           │
│   + src/utils/help.ts  (new file)                  │
│   ✗ tests/foo.test.ts  (deleted)                   │
├────────────────────────────────────────────────────┤
│ 📄 src/Button.tsx                                  │
│                                                    │
│ - export function bar() { ... }                    │
│ + export function bar(x: number) {                 │
│ +   return x * 2;                                  │
│ + }                                                │
│                                                    │
└────────────────────────────────────────────────────┘
```

## 모드

```
"마지막 턴" diff:        AI 가 방금 한 변경
"세션 전체" diff:        세션 시작부터 모든 변경
"git status" diff:       git working tree 변경
"git PR" diff:           특정 PR 의 변경
```

## 액션

```
파일별:
  [편집기에서 열기]
  [되돌리기 (이 파일만)]
  [stage]

전체:
  [모두 되돌리기]
  [Stage all]
  [Commit]
  [Push]
```

## "마지막 턴" 모드

```
AI 응답 후 자동으로 diff 표시:

1. AI 가 fs.write 5번
2. "마지막 턴" 자동 활성화
3. 5개 파일 변경 사항 시각화
4. 사용자 review:
   ✓ 좋음 → 계속
   ✗ 잘못됨 → "되돌리기"
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
