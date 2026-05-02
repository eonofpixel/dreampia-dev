---
title: F-027 — 권한 4단계 dropdown
parent: ../_index.md
priority: P0
phase: Phase 1
---

# F-027: 권한 4단계 dropdown

> **한 줄 요약**: 입력창 안 권한 dropdown. 메시지 보내기 전 level 선택.

---

## UI

```
입력창 우측 (모델 선택 옆):

┌─────────────────────────────────┐
│ 🔵 워크스페이스 쓰기 (기본값)   │ ← 현재
├─────────────────────────────────┤
│ 🔒 읽기 전용                    │
│ 🔵 워크스페이스 쓰기            │
│ 🔓 전체 접근                    │
│ ⚙ 사용자 지정...                │ ← 4번째
└─────────────────────────────────┘
```

## 4가지 Level

```
LEVEL 1: read_only         🔒 읽기 전용
LEVEL 2: workspace_write   🔵 워크스페이스 쓰기 (기본값)
LEVEL 3: full_access       🔓 전체 접근
LEVEL 4: custom            ⚙ 사용자 지정
```

상세: [docs/permission/levels.md](../../permission/levels.md).

## 메시지 단위 변경

```
Per-turn 변경 가능:
  Turn 1: workspace_write
  Turn 2: full_access (이번만)
  Turn 3: workspace_write (다시)
  
실제 변경 시점:
  드롭다운 클릭 → 모달 (Level 변경 확인)
  → 충돌하는 grants 처리 안내
  → 확인 시 적용
```

## /플랜 모드 시

```
Plan 모드 활성 → 권한 dropdown 자동 숨김
  → read_only 강제
  → 사용자 변경 X
```

## 색상 / 아이콘

```
🔒 읽기 전용     - 회색 (보수적)
🔵 워크스페이스  - 파란 (기본)
🔓 전체 접근     - 주황 (주의)
⚙ 사용자 지정    - 보라 (전문)
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
- [docs/permission/levels.md](../../permission/levels.md)
