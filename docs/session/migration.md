---
title: Session State — Migration & Validation
parent: ./_index.md
related:
  - ./schema.md
  - ./persistence.md
status: draft
last_updated: 2026-05-02
---

# Migration & Validation

> **한 줄 요약**: schema_version 증가 시 자동 마이그레이션 + Zod 검증으로 데이터 무결성.

---

## Schema 버전 정책

```
원칙:
  - 버전 증가 = 호환 깨지는 변경
  - 버전 동일 = 호환 가능 (필드 추가는 default 로 처리)
  - 한 번에 한 버전씩 (1 → 2 → 3, 1 → 3 직접 X)
  - Down-migration optional (사용자가 옛 버전 복귀 시)
```

### 버전 incremental rules

```
INCREMENT 필요 (BREAKING):
  - 필드 이름 변경
  - 필드 타입 변경
  - 필드 삭제
  - enum 값 의미 변경
  - 인덱스 변경 (성능 X 정합성 영향 시)

INCREMENT 불필요 (NON-BREAKING):
  - 새 필드 추가 (optional)
  - 새 enum 값 추가 (default 처리 가능)
  - 새 테이블 추가
  - 새 인덱스 추가
  - 새 view 추가
```

---

## Migration 인터페이스

```typescript
interface Migration {
  from: number;
  to: number;
  
  // SQLite migration (DB 스키마)
  up_sql: string;                      // ALTER TABLE / CREATE TABLE 등
  down_sql?: string;                   // optional rollback
  
  // JSON migration (ContentBlock 등 stored JSON)
  up_json?: (state: any) => any;
  down_json?: (state: any) => any;
  
  // 추가 후처리
  post_up?: (db: Database) => Promise<void>;
}
```

---

## 자동 마이그레이션 흐름

```typescript
async function migrateOnStartup(db: Database) {
  const currentVersion = parseInt(
    db.prepare(`SELECT value FROM schema_meta WHERE key = 'version'`).get().value
  );
  const targetVersion = LATEST_SCHEMA_VERSION;
  
  if (currentVersion === targetVersion) {
    return;  // 변경 없음
  }
  
  if (currentVersion > targetVersion) {
    // 더 높은 버전 (사용자 다운그레이드 시도)
    throw new Error(
      `DB schema version ${currentVersion} > app version ${targetVersion}. ` +
      `Please update Dreampia-Dev or contact support.`
    );
  }
  
  // 백업 생성
  await createBackup(db);
  
  // 순차 적용
  for (let v = currentVersion; v < targetVersion; v++) {
    const migration = MIGRATIONS[v + 1];
    if (!migration) {
      throw new Error(`No migration from v${v} to v${v + 1}`);
    }
    
    db.transaction(() => {
      // SQL 실행
      if (migration.up_sql) {
        db.exec(migration.up_sql);
      }
      
      // JSON state 변환
      if (migration.up_json) {
        migrateJsonStates(db, migration.up_json);
      }
      
      // 버전 갱신
      db.prepare(`UPDATE schema_meta SET value = ? WHERE key = 'version'`)
        .run(String(v + 1));
    })();
    
    // 트랜잭션 후 후처리
    if (migration.post_up) {
      await migration.post_up(db);
    }
  }
}
```

---

## 백업 정책

### 마이그레이션 전 자동 백업

```typescript
async function createBackup(db: Database): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    BACKUPS_DIR,
    `pre-migration-${timestamp}.sqlite`
  );
  
  await db.backup(backupPath);
  
  // 메타데이터 저장
  const metaPath = backupPath + '.meta.json';
  await fs.writeFile(metaPath, JSON.stringify({
    backed_up_at: new Date().toISOString(),
    from_version: currentVersion,
    target_version: targetVersion,
    app_version: APP_VERSION,
  }));
  
  return backupPath;
}
```

### Cleanup

```
- pre-migration 백업: 90일 후 삭제
- 사용자 명시 백업: 영구 (사용자 삭제 시까지)
- 일일 자동 백업 (별개): 30일 보관
```

---

## Migration 예시

### v1 → v2: PlanState 추가

```typescript
const v1_to_v2: Migration = {
  from: 1,
  to: 2,
  
  up_sql: `
    -- plan_items 테이블 추가
    CREATE TABLE plan_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      parent_id TEXT,
      seq INTEGER NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL,
      related_turns_json TEXT,
      evidence TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (parent_id) REFERENCES plan_items(id)
    );
    
    -- sessions 테이블에 plan_active 추가
    ALTER TABLE sessions ADD COLUMN plan_active INTEGER DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN plan_browser_tool_enabled INTEGER DEFAULT 0;
  `,
  
  down_sql: `
    DROP TABLE plan_items;
    -- ALTER COLUMN drop 은 SQLite 미지원 → 컬럼 유지
  `,
};
```

### v2 → v3: turn.thinking 필드

```typescript
const v2_to_v3: Migration = {
  from: 2,
  to: 3,
  
  up_sql: `
    ALTER TABLE turns ADD COLUMN thinking_json TEXT;
  `,
  
  // 기존 turns 의 content 안 thinking 블록 분리
  up_json: (turn: any) => {
    if (turn.content) {
      const thinking = turn.content.filter((b: any) => b.type === 'thinking');
      const rest = turn.content.filter((b: any) => b.type !== 'thinking');
      
      return {
        ...turn,
        content: rest,
        thinking_json: thinking.length ? JSON.stringify(thinking) : null,
      };
    }
    return turn;
  },
};
```

---

## Zod Validation

### 기본 schema

```typescript
import { z } from 'zod';

const ContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ 
    type: z.literal('image'), 
    mime: z.string(), 
    data: z.string(), 
    alt: z.string().optional() 
  }),
  z.object({
    type: z.literal('file'),
    mime: z.string(),
    uri: z.string(),
    size_bytes: z.number(),
    name: z.string(),
  }),
  z.object({
    type: z.literal('mention'),
    ref: z.object({
      kind: z.enum(['agent', 'file', 'skill']),
      id: z.string(),
      display: z.string(),
    }),
  }),
  z.object({
    type: z.literal('embedded_card'),
    card: z.object({
      kind: z.enum(['web_preview', 'image', 'pdf', 'chart']),
      title: z.string(),
      url: z.string().optional(),
      thumbnail: z.string().optional(),
    }),
  }),
]);

const TurnSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  timestamp: z.string().datetime(),
  status: z.enum(['pending', 'streaming', 'completed', 'cancelled', 'failed']),
  content: z.array(ContentBlockSchema),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_results: z.array(ToolResultSchema).optional(),
  model: z.string().optional(),
  effort: z.enum(['minimum', 'low', 'medium', 'high', 'maximum']).optional(),
});

const SessionSchema = z.object({
  id: z.string(),
  schema_version: z.number().int().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  provider: z.enum(['claude', 'codex']),
  workspace_id: z.string(),
  title: z.string(),
  pinned: z.boolean(),
  archived: z.boolean(),
  parent_session_id: z.string().optional(),
  conversation: z.object({
    turns: z.array(TurnSchema),
    pending_input: PendingInputSchema.optional(),
    current_model: z.string(),
    current_effort: z.enum(['minimum', 'low', 'medium', 'high', 'maximum']),
    current_mode: z.enum(['standard', 'plan', 'speed', 'custom']),
  }),
  workspace: WorkspaceSchema,
  terminal: TerminalStateSchema,
  browser: BrowserStateSchema,
  plan: PlanStateSchema,
  permission: PermissionStateSchema,
  metadata: z.object({
    codex: CodexMetadataSchema.optional(),
    claude: ClaudeMetadataSchema.optional(),
  }),
});
```

### 사용 시점

```typescript
// 1. DB 에서 load 시
function loadSession(id: SessionId): Session {
  const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
  const conversation = loadConversation(id);
  // ... 다른 sub-states
  
  const session = {
    ...row,
    conversation,
    // ...
  };
  
  return SessionSchema.parse(session);  // ← 여기서 검증 + throw if invalid
}

// 2. API 호출 시 (외부 데이터 검증)
function importSession(json: unknown): Session {
  return SessionSchema.parse(json);  // 외부 import 시 강제 검증
}

// 3. 테스트 시
function makeTestSession(): Session {
  return SessionSchema.parse({ ... });  // 테스트 데이터도 검증 통과 필요
}
```

---

## Custom Validators (Invariants)

```typescript
// Schema 만으로 표현 안 되는 검증
function validateSessionInvariants(session: Session): void {
  // INV-3: created_at <= updated_at
  if (session.created_at > session.updated_at) {
    throw new Error(`created_at (${session.created_at}) > updated_at`);
  }
  
  // INV-6: archived=true 면 pinned=false
  if (session.archived && session.pinned) {
    throw new Error(`archived session cannot be pinned`);
  }
  
  // INV-1: turns 의 seq 는 unique + monotonic
  const seqs = session.conversation.turns.map((_, i) => i);
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] <= seqs[i - 1]) {
      throw new Error(`turns seq not monotonic at index ${i}`);
    }
  }
  
  // INV-3: tool_calls 가 있는 턴 다음엔 반드시 role='tool' 턴
  for (let i = 0; i < session.conversation.turns.length - 1; i++) {
    const turn = session.conversation.turns[i];
    const next = session.conversation.turns[i + 1];
    if (turn.tool_calls?.length && next.role !== 'tool') {
      throw new Error(`turn ${turn.id} has tool_calls but next turn is not 'tool'`);
    }
  }
}
```

---

## 호환성 정책

### Forward compatibility (앞 버전 데이터)

```
사용자가 v3 앱 → v4 앱 업그레이드:
  v3 데이터 → 마이그레이션 → v4 → 사용
  ✓ 자동 처리 (위 흐름)
```

### Backward compatibility (뒤 버전 데이터)

```
사용자가 v4 앱 → v3 앱 다운그레이드:
  v4 데이터 → v3 앱이 인식 못함 → ★ 차단
  
  옵션:
    A. 명시적 down_migration 제공 (선택)
    B. 사용자에게 백업 복원 안내
```

### Cross-app compatibility

```
다른 앱 (Cursor, Continue, etc.) 의 세션 import:
  - 별도 import adapter 작성
  - SessionSchema 형식으로 변환 후 import

Codex 세션 import (Phase 2+):
  - Codex 의 SQLite/JSON 읽기
  - 우리 schema 로 변환
  - 사용자 confirm 후 적용
```

---

## 검증 (Invariants)

```
INV-1: schema_meta.version 은 항상 양의 정수
INV-2: 마이그레이션은 트랜잭션 안에서 실행
INV-3: 마이그레이션 실패 시 자동 rollback
INV-4: 마이그레이션 전 백업 필수
INV-5: 모든 row 는 SessionSchema.parse() 통과 (DB 일관성)
```

---

## 관련

- [schema.md](./schema.md) — schema_version 필드
- [persistence.md](./persistence.md) — schema_meta 테이블
- [examples.md](./examples.md) — 검증 통과한 예시 데이터
