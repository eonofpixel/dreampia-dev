---
title: Session State — Workspace 서브 스키마
parent: ./_index.md
related:
  - ./schema.md
  - ./terminal.md
status: draft
last_updated: 2026-05-02
---

# Workspace Sub-schema

> **한 줄 요약**: 작업 디렉토리 + git 상태 + worktree 다중 + 파일 인덱싱.

---

## Workspace 인터페이스

```typescript
interface Workspace {
  root: AbsolutePath;                  // "C:\\Dev\\foo"
  name: string;                        // 표시명
  
  worktrees: WorkTree[];               // git worktree 다중 지원
  active_worktree_id?: WorkTreeId;
  
  recent_files: FileRef[];             // LRU 100개
  open_files: FileRef[];               // 미리보기 탭에 열림
  
  git_state?: GitState;                // git repo인 경우
  
  ignore_patterns: string[];           // .gitignore + .codexignore
  
  // 자동 인덱싱
  index_status: 'idle' | 'indexing' | 'ready' | 'failed';
  index_at?: ISO8601;
  file_count?: number;
  
  // 영구/임시 분리
  is_temporary: boolean;               // /포크로 만든 임시 worktree
}
```

---

## WorkTree

```typescript
interface WorkTree {
  id: WorkTreeId;
  path: AbsolutePath;                  // 별도 dir
  branch: string;                      // git branch
  is_permanent: boolean;               // "영구 작업 트리" (Codex 패턴)
  parent_session_id?: SessionId;       // 포크 출처
  created_at: ISO8601;
}
```

**Codex 의 worktree 패턴 (DEEP_EXPLORATION_FINDINGS K-6-1)**:
- "프로젝트 ✏ 컨텍스트 메뉴" → "🌳 영구 작업 트리 생성"
- 채팅 ··· 메뉴 → "🌳 새 작업 트리로 포크"

→ AI 가 위험한 변경 시도할 때 worktree 분리 = 메인 브랜치 보호.

---

## FileRef

```typescript
interface FileRef {
  uri: Uri;                            // file:///...
  name: string;
  size_bytes: number;
  language?: string;                   // typescript, python, ...
  last_accessed: ISO8601;
}
```

**recent_files 정책**:
- LRU (Least Recently Used) 100개
- 사용자가 직접 열거나 AI 가 읽은 파일 모두 포함
- 100개 초과 시 가장 오래된 것 자동 제거

---

## GitState

```typescript
interface GitState {
  branch: string;
  ahead: number;                       // origin 대비 +N
  behind: number;
  staged_count: number;
  unstaged_count: number;
  untracked_count: number;
  last_commit?: { sha: string; subject: string };
}
```

**갱신 시점**:
- 세션 열림 시 (1회)
- 사용자가 git 명령 실행 후 (자동)
- AI 가 git 작업 후 (자동)
- 매 60초 주기 polling (active 세션만)

---

## Workspace 식별 (workspace_id)

```typescript
function workspaceIdFor(rootPath: string): WorkspaceId {
  // 정규화
  const normalized = path
    .resolve(rootPath)
    .toLowerCase()                     // Windows 대소문자 무시
    .replace(/\\/g, '/');              // Slash 통일
  
  // SHA256 hash (앞 16자)
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// 예시:
//   C:\Dev\foo  →  "ws-a1b2c3d4e5f6g7h8"
//   C:\dev\Foo  →  "ws-a1b2c3d4e5f6g7h8"  (같은 ID)
```

**이유**: 같은 디렉토리는 같은 workspace_id → 여러 세션이 같은 workspace 참조.

---

## 인덱싱 (index_status)

```
[idle]      → 처음 진입
              ↓ workspace 열림
[indexing]  → ripgrep + 파일 트리 구축 중
              ↓ 완료
[ready]     → 검색·자동완성 사용 가능
              ↓ 파일 변경 감지
[indexing]  → 부분 재인덱스
              ↓
[failed]    → 인덱스 실패 (큰 디렉토리, 권한 문제 등)
```

**구현 (Phase 1)**:
- ripgrep (`rg.exe`) 로 파일 목록 → SQLite FTS5 인덱스
- chokidar 로 변경 감지 → 부분 업데이트
- `node_modules`, `.git`, `dist` 등 자동 제외

---

## ignore_patterns

```typescript
// 기본 제외 (always)
const DEFAULT_IGNORES = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  '.next/**',
  '*.log',
  '*.tmp',
];

// + .gitignore 의 패턴
// + .codexignore 의 패턴 (Codex 호환)
// + .dreampiaignore 의 패턴 (자체)
```

---

## Workspace 추가/삭제 vs Session

```
원칙:
  - Session 추가 시 → workspace 자동 ensure (없으면 생성)
  - Session 삭제 시 → workspace 유지 (다른 세션이 쓸 수 있음)
  - Workspace 명시 삭제 → 연결된 모든 session 도 ARCHIVED
```

---

## 검증 (Invariants)

```
INV-1: root 는 절대 경로 + 존재하는 디렉토리
INV-2: active_worktree_id 가 있으면 worktrees 안에 존재
INV-3: is_temporary=true 면 자동 cleanup 대상
INV-4: index_status='ready' 면 file_count 존재
INV-5: git_state 가 있으면 root 가 git repo
INV-6: parent_session_id (in WorkTree) 가 있으면 해당 세션 존재
```

---

## 예시

```json
{
  "root": "C:\\Dev\\pyeongtaek-munhwa-portal",
  "name": "평택문화원 업무포털",
  "worktrees": [
    {
      "id": "wt-001",
      "path": "C:\\Dev\\pyeongtaek-munhwa-portal-fix-login",
      "branch": "fix/login-bug",
      "is_permanent": false,
      "parent_session_id": "01a-...",
      "created_at": "2026-05-02T01:00:00.000Z"
    }
  ],
  "active_worktree_id": "wt-001",
  "recent_files": [
    {
      "uri": "file:///C:/Dev/pyeongtaek-munhwa-portal/renewal/web/pages/login.tsx",
      "name": "login.tsx",
      "size_bytes": 2456,
      "language": "typescript",
      "last_accessed": "2026-05-02T01:54:00.000Z"
    }
  ],
  "open_files": [],
  "git_state": {
    "branch": "fix/login-bug",
    "ahead": 0,
    "behind": 2,
    "staged_count": 0,
    "unstaged_count": 1,
    "untracked_count": 0,
    "last_commit": {
      "sha": "abc1234",
      "subject": "fix: dashboard layout"
    }
  },
  "ignore_patterns": ["node_modules/**", ".git/**", "dist/**"],
  "index_status": "ready",
  "index_at": "2026-05-02T01:00:00.000Z",
  "file_count": 1247,
  "is_temporary": false
}
```

---

## 관련

- [schema.md](./schema.md) — Session 안에서 workspace 의 위치
- [terminal.md](./terminal.md) — TerminalPane 의 cwd 가 workspace.root 기반
- [persistence.md](./persistence.md) — workspaces 테이블 스키마
