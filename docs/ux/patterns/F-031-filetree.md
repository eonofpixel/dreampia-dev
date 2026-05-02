---
title: F-031 — 파일 트리 패널
parent: ../_index.md
priority: P1
phase: Phase 2
---

# F-031: 파일 트리 패널

> **한 줄 요약**: 좌측 파일 트리 + AI 변경 표시 + git status.

---

## UI

```
┌──────────────────────────┐
│ 📁 pyeongtaek-munhwa-portal│
├──────────────────────────┤
│ ▾ 📁 src                  │
│   ▾ 📁 components         │
│     📄 Button.tsx     ✏  │ ← AI 가 수정함
│     📄 Card.tsx           │
│   ▾ 📁 utils              │
│     📄 format.ts          │
│     📄 helpers.ts     +  │ ← 새로 만듦
│ ▾ 📁 tests                │
│   📄 foo.test.ts      ✗  │ ← AI 가 삭제
│ 📄 package.json       M  │ ← git modified
│ 📄 README.md              │
└──────────────────────────┘
```

## 표시 정보

```
파일 옆 마커:
  ✏    AI 가 이번 세션에서 수정
  +    AI 가 새로 만듦
  ✗    AI 가 삭제 (그래도 표시)
  M    git modified
  +    git untracked
  D    git deleted
  ?    무시 (.gitignore)
```

## 단축키

```
Ctrl+Shift+E  파일 트리 토글
Ctrl+Shift+F  workspace 전체 검색 (rg)
F2            파일 이름 변경
Ctrl+P        파일 quick open (fuzzy)
```

## 필터

```
[검색: <keyword>]    fuzzy filter
☑ AI 변경만
☑ Git changes
☐ Hidden files
☐ Node modules
```

## 데이터 모델

```typescript
// docs/session/workspace.md
interface FileRef {
  uri: Uri;
  name: string;
  size_bytes: number;
  language?: string;
  last_accessed: ISO8601;
}

// 추가 메타
interface FileMeta {
  ai_modified_in_session: boolean;
  git_status?: 'M' | 'A' | 'D' | '?';
  ignored: boolean;
}
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
