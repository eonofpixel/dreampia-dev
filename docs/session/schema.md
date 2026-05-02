---
title: Session State — Top-level Schema
parent: ./_index.md
related:
  - ./principles.md
  - ./conversation.md
  - ./workspace.md
status: draft
last_updated: 2026-05-02
---

# Top-level Session Schema

> **한 줄 요약**: 모든 서브 스키마의 진입점이 되는 `Session` 인터페이스 + lifecycle.

---

## Session 인터페이스

```typescript
interface Session {
  // ─── Identity ───
  id: SessionId;                      // UUIDv7 (시간 정렬)
  schema_version: number;             // 마이그레이션용 (현재: 1)
  created_at: ISO8601;
  updated_at: ISO8601;

  // ─── Origin ───
  provider: 'claude' | 'codex';       // 현재 주 provider
  workspace_id: WorkspaceId;          // 작업 디렉토리 식별자

  // ─── Display ───
  title: string;                      // "서버 열고 미리보기 확인"
  pinned: boolean;                    // 사이드바 고정
  archived: boolean;                  // 보관 (삭제 X)
  parent_session_id?: SessionId;      // 포크 출처

  // ─── Sub-states (각각 별도 페이지) ───
  conversation: Conversation;         // → conversation.md
  workspace: Workspace;               // → workspace.md
  terminal: TerminalState;            // → terminal.md
  browser: BrowserState;              // → browser.md
  plan: PlanState;                    // → plan.md
  permission: PermissionState;        // → ../../PERMISSION_MODEL.md

  // ─── Provider-specific (namespaced) ───
  metadata: {
    codex?: CodexSessionMetadata;
    claude?: ClaudeSessionMetadata;
  };
}
```

## 보조 타입

```typescript
type SessionId = string;        // "019de353-be46-7631-8000-827cfdb87ef8" (UUIDv7)
type WorkspaceId = string;       // 작업 디렉토리 hash
type ISO8601 = string;           // "2026-05-02T01:54:00.000Z"
```

---

## 왜 UUIDv7?

```
UUIDv4: 완전 랜덤 → DB 인덱스 비효율
UUIDv7: time-ordered → DB 인덱스 효율 + 정렬 가능
        Codex 도 UUIDv7 사용 ("019de353..." 패턴 확인됨)
```

**구현 라이브러리**: `uuidv7` npm 패키지 (TypeScript 지원).

---

## Lifecycle Events

```
[CREATE]     → Session 생성 (id, workspace_id 부여)
                ↓
[ACTIVE]     ← Conversation 진행 중
   ⇅
[IDLE]       → 잠시 사용 안 함 (메모리 unload 가능)
   ⇅
[PINNED]     → pinned: true (메모리 유지)
   ⇅
[ARCHIVED]   → archived: true (사이드바 hide)
                ↓
[DELETED]    → 90일 후 자동 (또는 명시 삭제)
```

### 상태 전이 규칙

| From | To | 트리거 |
|------|----|----|
| (none) | CREATE | 사용자 "새 채팅" 클릭 |
| CREATE | ACTIVE | 첫 메시지 전송 |
| ACTIVE | IDLE | 5분 사용 안 함 |
| IDLE | ACTIVE | 사용자 입력 / AI 자동화 트리거 |
| ACTIVE/IDLE | PINNED | 사용자 핀 클릭 |
| PINNED | ACTIVE | 핀 해제 + 사용 |
| ACTIVE/IDLE/PINNED | ARCHIVED | 사용자 보관 클릭 |
| ARCHIVED | ACTIVE | 사용자 다시 열기 |
| ARCHIVED | DELETED | 90일 경과 (auto) or 사용자 명시 삭제 |

---

## Provider-specific Metadata

### Codex

```typescript
interface CodexSessionMetadata {
  deep_link?: string;                  // "codex://chat/<session-id>"
  imported_from?: string;              // 다른 도구에서 import 시
  
  // 5시간/7일 한도 추적 (Codex 특유)
  usage_buckets?: {
    last_5h_at: ISO8601;
    last_7d_at: ISO8601;
  };
}
```

### Claude

```typescript
interface ClaudeSessionMetadata {
  thread_id?: string;                  // Claude Code의 thread ID
  hooks_active?: string[];             // 활성 hooks 목록
}
```

---

## ID 생성 규칙

### Session ID
```typescript
import { uuidv7 } from 'uuidv7';

function createSession(workspace: Workspace): Session {
  return {
    id: uuidv7(),                      // 자동 시간 정렬
    schema_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // ...
  };
}
```

### Workspace ID
```typescript
import { createHash } from 'crypto';

function workspaceId(rootPath: string): WorkspaceId {
  // 정규화 (lowercase + slash 통일)
  const normalized = rootPath.toLowerCase().replace(/\\/g, '/');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
// "C:\Dev\foo" → "ws-a1b2c3d4e5f6g7h8"
```

---

## 검증 (Invariants)

세션이 valid 하려면:

```
INV-1: id 는 UUIDv7 형식
INV-2: schema_version >= 1
INV-3: created_at <= updated_at
INV-4: provider ∈ {'claude', 'codex'}
INV-5: workspace_id 매칭되는 workspace 존재
INV-6: archived=true 면 pinned=false
INV-7: parent_session_id 가 있으면 해당 세션 존재
INV-8: metadata.codex 와 metadata.claude 동시 존재 가능 (둘 다 사용 시)
```

검증 코드 → [migration.md](./migration.md) 의 Zod schema.

---

## 관련

- [principles.md](./principles.md) — 이 schema 가 따르는 원칙
- [conversation.md](./conversation.md) — `conversation` 필드 상세
- [workspace.md](./workspace.md) — `workspace` 필드 상세
- [persistence.md](./persistence.md) — DB 매핑
