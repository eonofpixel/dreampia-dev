---
title: Round 4 — 컨텍스트 메뉴 (프로젝트 / 채팅 / +)
parent: ./_index.md
related:
  - ./round4-parallel-skills.md
status: complete
last_updated: 2026-05-02
---

# Round 4: 컨텍스트 메뉴

> **방법**: ✏ / ··· / + 버튼 모두 클릭
>
> **결과**: 프로젝트 6개, 채팅 12개, + 3개 옵션 발견

---

## 1. 프로젝트 ✏ 컨텍스트 메뉴 (6 옵션)

```
사이드바 → 프로젝트 hover → ✏ 클릭:

┌────────────────────────────────┐
│ 📌 프로젝트 고정                │
│ 🗂 탐색기에서 열기              │
│ 🌳 영구 작업 트리 생성          │ ← Codex 차별화
│ ✏ 프로젝트 이름 변경            │
│ 💾 채팅 보관                    │
│ × 제거하기                      │
└────────────────────────────────┘
```

### 핵심 발견

```
"영구 작업 트리 생성" = 프로젝트 단위 git worktree 자동 생성
  → AI 가 위험 변경 시도할 때 메인 브랜치 보호
  → Dreampia-Dev 도 차용 (P0)
```

---

## 2. 채팅 제목 ··· 메뉴 (★ 12 옵션 — 가장 큰 발견)

```
채팅 제목 옆 ··· 클릭:

┌─────────────────────────────────────────────────┐
│ 📌 채팅 고정                    Ctrl+Alt+P     │
│ ✏ 채팅 이름 바꾸기              Ctrl+Alt+R     │
│ 💾 채팅 보관                    Ctrl+Shift+A   │
│ ─────────────                                   │
│ 📋 작업 중인 디렉토리 복사       Ctrl+Shift+C   │
│ 🆔 세션 ID 복사                 Ctrl+Alt+I     │
│ 🔗 딥링크 복사                  Ctrl+Alt+L     │ ← Deep link!
│ 📄 Markdown으로 복사                            │ ← 채팅 → MD export
│ ─────────────                                   │
│ 🔀 사이드 채팅 열기                              │
│ 🍴 로컬로 포크                                   │ ← 채팅 → 다른 dir 클론
│ 🌳 새 작업 트리로 포크                           │ ← 채팅 → worktree
│ 🤖 자동화 추가...                               │ ← 채팅 → automation
│ 📦 미니 창에서 열기                              │ ← floating mini window
└─────────────────────────────────────────────────┘
```

### 핵심 인사이트

```
세션 = first-class object:
  - 딥링크 (codex://chat/<id>) 로 외부 공유
  - Markdown export (사람이 읽음)
  - 로컬 포크 (다른 디렉토리에서 계속)
  - Worktree 포크 (git branch 별도)
  - 미니 창 분리 (멀티 윈도우)
  - 자동화 변환 (반복 가능)

→ Dreampia-Dev: 동일 12개 옵션 모두 차용 (P0)
```

### 단축키 시스템

```
모든 채팅 작업에 Ctrl+Alt+letter 단축키:
  Ctrl+Alt+P  Pin
  Ctrl+Alt+R  Rename
  Ctrl+Shift+A Archive (왜 Shift?)
  Ctrl+Shift+C Copy CWD
  Ctrl+Alt+I  ID
  Ctrl+Alt+L  Link
```

→ Dreampia-Dev: 동일 단축키 + 한국어 IME 충돌 방지.

---

## 3. + 첨부 버튼 메뉴 (3 옵션)

```
입력창 좌측 + 클릭:

┌──────────────────────┐
│ 📎 사진 및 파일 추가  │
│ ⊟ 플랜 모드      [●] │ ← 토글
│ 🔌 플러그인          │
└──────────────────────┘
```

### 핵심 인사이트

```
+ 는 단순 파일 첨부 X
  → 메시지 단위 모드/플러그인 컨텍스트 변경 통합 진입점

옵션:
  1. 파일/이미지 첨부
  2. 플랜 모드 토글 (이번 메시지만)
  3. 플러그인 추가
```

→ Dreampia-Dev: + 메뉴는 다목적 entry point 로 차용.

---

## 종합

| 항목 | 발견 | 영향력 |
|-----|------|--------|
| 프로젝트 ✏ 6 옵션 | 영구 worktree 생성 등 | 강 |
| 채팅 ··· 12 옵션 | 딥링크/Markdown/포크/미니창 | ★★★ |
| + 3 옵션 | 다목적 진입점 | 중 |

---

## 관련

- [round4-mcp-themes.md](./round4-mcp-themes.md) — MCP 편집 / 테마
- [round4-parallel-skills.md](./round4-parallel-skills.md) — 병렬 모드
