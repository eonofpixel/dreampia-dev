---
title: Session State — Examples & Export/Import
parent: ./_index.md
related:
  - ./schema.md
  - ./migration.md
status: draft
last_updated: 2026-05-02
---

# Examples & Export/Import

> **한 줄 요약**: 검증된 실제 세션 JSON + Markdown export + .dreampia-backup.zip 형식.

---

## Example 1: 신규 빈 세션

```json
{
  "id": "01999999-aaaa-bbbb-cccc-dddddddddddd",
  "schema_version": 1,
  "created_at": "2026-05-02T01:00:00.000Z",
  "updated_at": "2026-05-02T01:00:00.000Z",
  
  "provider": "codex",
  "workspace_id": "ws-a1b2c3d4e5f6g7h8",
  
  "title": "새 채팅",
  "pinned": false,
  "archived": false,
  
  "conversation": {
    "turns": [],
    "current_model": "gpt-5.5",
    "current_effort": "high",
    "current_mode": "standard"
  },
  
  "workspace": {
    "root": "C:\\Dev\\foo",
    "name": "foo",
    "worktrees": [],
    "recent_files": [],
    "open_files": [],
    "ignore_patterns": ["node_modules/**", ".git/**", "dist/**"],
    "index_status": "idle",
    "is_temporary": false
  },
  
  "terminal": {
    "panes": [],
    "panel_open": false,
    "height_px": 200
  },
  
  "browser": {
    "tabs": [],
    "panel_visible": false,
    "layout": "hidden",
    "partition_id": "codex-browser-app-01999999-aaaa-bbbb-cccc-dddddddddddd"
  },
  
  "plan": {
    "active": false,
    "browser_tool_enabled": false
  },
  
  "permission": {
    "grants": [],
    "default_level": "workspace_write",
    "temporarily_blocked_capabilities": []
  },
  
  "metadata": {}
}
```

---

## Example 2: 진행 중인 세션 (간단)

```json
{
  "id": "019de353-be46-7631-8000-827cfdb87ef8",
  "schema_version": 1,
  "created_at": "2026-05-01T19:46:00.000Z",
  "updated_at": "2026-05-02T01:54:30.000Z",
  
  "provider": "codex",
  "workspace_id": "ws-pyeongtaek-munhwa-portal",
  
  "title": "서버 열고 미리보기 확인",
  "pinned": false,
  "archived": false,
  
  "conversation": {
    "turns": [
      {
        "id": "turn-001",
        "role": "user",
        "timestamp": "2026-05-01T19:46:00.000Z",
        "status": "completed",
        "content": [
          { "type": "text", "text": "서버 열고 미리보기 보게해줘" }
        ]
      },
      {
        "id": "turn-002",
        "role": "assistant",
        "timestamp": "2026-05-01T19:46:30.000Z",
        "status": "completed",
        "content": [
          { "type": "text", "text": "browser-use 스킬을 사용하겠습니다..." },
          {
            "type": "embedded_card",
            "card": {
              "kind": "web_preview",
              "title": "웹 미리보기",
              "url": "http://127.0.0.1:3000/dashboard"
            }
          }
        ],
        "tool_calls": [
          { "id": "tc-001", "tool_id": "shell.run", "input": { "cmd": "npm run dev" } },
          { "id": "tc-002", "tool_id": "browser.navigate", "input": { "url": "http://127.0.0.1:3000/dashboard" } }
        ],
        "model": "gpt-5.5",
        "effort": "high"
      }
    ],
    "current_model": "gpt-5.5",
    "current_effort": "high",
    "current_mode": "standard"
  },
  
  "workspace": {
    "root": "C:\\Dev\\pyeongtaek-munhwa-portal",
    "name": "평택문화원 업무포털",
    "worktrees": [],
    "recent_files": [],
    "open_files": [],
    "ignore_patterns": ["node_modules/**", ".git/**"],
    "index_status": "ready",
    "indexed_at": "2026-05-01T19:00:00.000Z",
    "file_count": 1247,
    "is_temporary": false
  },
  
  "terminal": {
    "panes": [
      {
        "id": "pane-001",
        "title": "npm run dev",
        "shell": "powershell",
        "cwd": "C:\\Dev\\pyeongtaek-munhwa-portal\\renewal\\web",
        "env": {},
        "status": "running",
        "pid": 12345,
        "scrollback_lines": 87,
        "input_history": [],
        "spawned_by_ai": true,
        "turn_id": "turn-002"
      }
    ],
    "active_pane_id": "pane-001",
    "panel_open": false,
    "height_px": 280
  },
  
  "browser": {
    "tabs": [
      {
        "id": "tab-001",
        "title": "평택문화원 업무포털 - 대시보드",
        "url": "http://127.0.0.1:3000/dashboard",
        "status": "ready",
        "last_load": "2026-05-01T19:46:35.000Z",
        "history": [
          { "url": "http://127.0.0.1:3000/login", "ts": "2026-05-01T19:46:30.000Z" },
          { "url": "http://127.0.0.1:3000/dashboard", "ts": "2026-05-01T19:46:35.000Z" }
        ],
        "history_index": 1,
        "annotation_mode": false,
        "annotations": [],
        "spawned_by": "ai",
        "spawning_turn_id": "turn-002"
      }
    ],
    "active_tab_id": "tab-001",
    "panel_visible": true,
    "layout": "panel",
    "partition_id": "codex-browser-app-019de353-be46-7631-8000-827cfdb87ef8"
  },
  
  "plan": {
    "active": false,
    "browser_tool_enabled": false
  },
  
  "permission": {
    "grants": [
      {
        "id": "grant-001",
        "session_id": "019de353-be46-7631-8000-827cfdb87ef8",
        "capability": "LOCAL_EXECUTE",
        "target": {
          "kind": "path",
          "path": "C:\\Dev\\pyeongtaek-munhwa-portal",
          "recursive": true
        },
        "scope": "session",
        "granted_at": "2026-05-01T19:46:10.000Z",
        "granted_by": "user"
      }
    ],
    "default_level": "workspace_write",
    "temporarily_blocked_capabilities": []
  },
  
  "metadata": {
    "codex": {
      "deep_link": "codex://chat/019de353-be46-7631-8000-827cfdb87ef8"
    }
  }
}
```

---

## Example 3: Plan 모드 활성 세션

```json
{
  "id": "01999999-bbbb-cccc-dddd-eeeeeeeeeeee",
  "schema_version": 1,
  "created_at": "2026-05-02T02:00:00.000Z",
  "updated_at": "2026-05-02T02:05:00.000Z",
  
  "provider": "claude",
  "workspace_id": "ws-foo",
  
  "title": "테스트 통과시키기",
  "pinned": false,
  "archived": false,
  
  "conversation": {
    "turns": [
      {
        "id": "turn-001",
        "role": "user",
        "timestamp": "2026-05-02T02:00:00.000Z",
        "status": "completed",
        "content": [
          { "type": "text", "text": "/플랜 모드" }
        ]
      },
      {
        "id": "turn-002",
        "role": "user",
        "timestamp": "2026-05-02T02:00:10.000Z",
        "status": "completed",
        "content": [
          { "type": "text", "text": "테스트 통과시켜줘" }
        ]
      },
      {
        "id": "turn-003",
        "role": "assistant",
        "timestamp": "2026-05-02T02:00:20.000Z",
        "status": "completed",
        "content": [
          { "type": "text", "text": "분석한 후 계획을 세웠습니다:\n\n1. 테스트 실패 원인 파악\n2. foo.ts 수정\n3. 테스트 재실행\n4. PR 작성" }
        ],
        "model": "claude-sonnet-4-6",
        "effort": "high"
      }
    ],
    "current_model": "claude-sonnet-4-6",
    "current_effort": "high",
    "current_mode": "plan"
  },
  
  "plan": {
    "active": true,
    "checklist": [
      {
        "id": "p-001",
        "text": "테스트 실패 원인 파악",
        "status": "in_progress",
        "related_turns": ["turn-003"]
      },
      {
        "id": "p-002",
        "text": "foo.ts 의 greeting 함수 수정",
        "status": "pending",
        "related_turns": []
      },
      {
        "id": "p-003",
        "text": "수정 후 테스트 재실행",
        "status": "pending",
        "related_turns": []
      },
      {
        "id": "p-004",
        "text": "PR 작성",
        "status": "pending",
        "related_turns": []
      }
    ],
    "current_item_index": 0,
    "browser_tool_enabled": false
  },
  
  "permission": {
    "grants": [],
    "default_level": "workspace_write",
    "temporarily_blocked_capabilities": [
      "LOCAL_WRITE.create",
      "LOCAL_WRITE.modify",
      "LOCAL_WRITE.delete",
      "LOCAL_EXECUTE",
      "NETWORK_REMOTE.upload",
      "BROWSER_INTERACT",
      "SYSTEM_AUTOMATION"
    ]
  },
  
  "workspace": { /* ... */ },
  "terminal": { "panes": [], "panel_open": false, "height_px": 200 },
  "browser": { "tabs": [], "panel_visible": false, "layout": "hidden", "partition_id": "..." },
  "metadata": { "claude": { "thread_id": "thread-..." } }
}
```

---

## Example 4: 사이드 채팅 (parent-child)

### 부모 세션
```json
{
  "id": "01a-parent",
  "title": "메인 작업",
  "browser": {
    "tabs": [
      {
        "id": "tab-side",
        "title": "사이드 채팅",
        "url": "dreampia://session/01a-side",
        "spawned_by": "user"
      }
    ]
  }
  /* ... */
}
```

### 자식 세션
```json
{
  "id": "01a-side",
  "parent_session_id": "01a-parent",
  "title": "메인 작업 (사이드)",
  "workspace_id": "ws-same-as-parent",
  /* ... */
}
```

→ 두 세션은 **별도** 저장. 부모 ↔ 자식 관계는 `parent_session_id` 만.

---

## Markdown Export

### 형식 (.md 파일)

```markdown
# 서버 열고 미리보기 확인

**날짜**: 2026-05-01 19:46 ~ 2026-05-02 01:54
**Provider**: Codex
**Workspace**: 평택문화원 업무포털
**Session ID**: 019de353-be46-7631-8000-827cfdb87ef8

---

> **사용자**: 서버 열고 미리보기 보게해줘

**Codex (GPT-5.5)**:

browser-use 스킬을 사용하겠습니다...

<details><summary>도구 실행 2개</summary>

- ▶ shell.run: `npm run dev` (12.4초)
- ▶ browser.navigate: `http://127.0.0.1:3000/dashboard`

</details>

🌐 [웹 미리보기 → http://127.0.0.1:3000/dashboard](http://127.0.0.1:3000/dashboard)

---

...
```

### 생성 코드

```typescript
function exportToMarkdown(session: Session): string {
  const lines: string[] = [];
  
  // 헤더
  lines.push(`# ${session.title}\n`);
  lines.push(`**날짜**: ${formatDate(session.created_at)} ~ ${formatDate(session.updated_at)}`);
  lines.push(`**Provider**: ${capitalize(session.provider)}`);
  lines.push(`**Workspace**: ${session.workspace.name}`);
  lines.push(`**Session ID**: ${session.id}`);
  lines.push('\n---\n');
  
  // 메시지
  for (const turn of session.conversation.turns) {
    if (turn.role === 'user') {
      lines.push(`> **사용자**: ${textOf(turn.content)}\n`);
    } else if (turn.role === 'assistant') {
      lines.push(`**${capitalize(session.provider)} (${turn.model ?? session.conversation.current_model})**:\n`);
      lines.push(textOf(turn.content));
      
      if (turn.tool_calls?.length) {
        lines.push(`\n<details><summary>도구 실행 ${turn.tool_calls.length}개</summary>\n`);
        for (const call of turn.tool_calls) {
          lines.push(`- ▶ ${call.tool_id}: \`${shortInput(call.input)}\``);
        }
        lines.push('\n</details>\n');
      }
    }
    lines.push('\n---\n');
  }
  
  return lines.join('\n');
}
```

---

## Backup ZIP 형식 (.dreampia-backup.zip)

```
backup-2026-05-02.zip
├── manifest.json
├── sessions/
│   ├── {session_id_1}.json
│   ├── {session_id_2}.json
│   └── ...
├── workspaces/
│   ├── {workspace_id_1}.json
│   └── ...
├── blobs/
│   ├── {hash[0:2]}/
│   │   └── {hash}.bin
│   └── ...
└── audit.json (감사 로그)
```

### manifest.json

```json
{
  "format": "dreampia.backup.v1",
  "created_at": "2026-05-02T02:00:00.000Z",
  "app_version": "0.1.0",
  "schema_version": 1,
  
  "stats": {
    "session_count": 12,
    "turn_count": 234,
    "workspace_count": 3,
    "blob_count": 56,
    "total_size_bytes": 134217728
  },
  
  "included_sessions": ["01a-...", "01b-...", "..."],
  
  "platform": "win32",
  "exported_by": "user@example.com"
}
```

---

## Single Session Export (.dreampia.session)

```json
{
  "format": "dreampia.session.v1",
  "exported_at": "2026-05-02T02:00:00.000Z",
  "app_version": "0.1.0",
  
  "session": { /* Session 객체 전체 */ },
  
  "blobs": [
    {
      "uri": "blob://sha256/abc123...",
      "data_base64": "iVBORw0KGgo..."
    }
  ],
  
  "workspace_snapshot": {
    "root": "C:\\Dev\\foo",
    "file_list": [...],
    "git_state": {...}
  }
}
```

---

## Import 정책

```typescript
async function importSession(data: SessionExport): Promise<SessionId> {
  // 1. 검증
  const session = SessionSchema.parse(data.session);
  
  // 2. 충돌 체크
  if (await sessionExists(session.id)) {
    // ID 충돌 → 새 ID 부여 옵션
    session.id = uuidv7();
  }
  
  // 3. workspace 자동 ensure
  await ensureWorkspace(session.workspace_id);
  
  // 4. blobs 복원
  for (const blob of data.blobs) {
    await storeBlob(Buffer.from(blob.data_base64, 'base64'));
  }
  
  // 5. DB 삽입 (트랜잭션)
  await db.transaction(async () => {
    await insertSession(session);
    for (const turn of session.conversation.turns) {
      await insertTurn(session.id, turn);
    }
    // ...
  });
  
  return session.id;
}
```

---

## 검증 (Invariants)

```
INV-1: Export 한 데이터를 Import 시 100% 복원
INV-2: Backup ZIP 의 모든 blob 은 manifest.json 에 등록됨
INV-3: Import 시 schema_version 호환 검증 → 미스매치 시 마이그레이션
INV-4: Import 후 SessionSchema.parse() 통과
INV-5: blobs 의 hash 검증 통과 (무결성)
```

---

## 관련

- [schema.md](./schema.md) — 검증 가능한 schema
- [migration.md](./migration.md) — 다른 버전 import 시
- [persistence.md](./persistence.md) — 저장 형식 매핑
