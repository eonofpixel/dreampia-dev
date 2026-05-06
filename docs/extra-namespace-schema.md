# `_extra` Namespace Canonical Schema — v1.8.2

> **상태**: live reference. PR 추가 시 본 문서 + `MetadataExtraSchema` +
> `MetadataExtra` interface 세 곳을 동시 갱신.
> **단일 진실**: `src/storage/metadataExtraSchema.ts` (zod strict schema).
> **Contract test**: `tests/storage/extraSchemaContract.test.ts` —
> 등록되지 않은 필드 추가 시 실패.

---

## 1. 정의 위치

| 위치 | 역할 |
|---|---|
| `src/storage/SessionStore.ts` `MetadataExtra` interface | TypeScript 타입 |
| `src/storage/metadataExtraSchema.ts` `MetadataExtraSchema` | 런타임 strict 검증 |
| `tests/storage/extraSchemaContract.test.ts` | 두 정의 + 직렬화 round-trip 검증 |
| `docs/extra-namespace-audit.md` | 사용 빈도 + promote 결정 (의사결정) |
| 본 문서 | 현재 schema 상태의 canonical reference |

---

## 2. 현재 namespace + 필드

### 2.1 `_extra.conversation`

| 필드 | 타입 | 컬럼 promote? |
|---|---|---|
| `pending_input` | `PendingInput \| undefined` | — |
| `current_model` | `string` | ✅ `sessions.current_model` (v1.4.2 / mig 014) |
| `current_effort` | `string` | ✅ `sessions.current_effort` (v1.4.2 / mig 014) |
| `current_mode` | `string` | ✅ `sessions.current_mode` (v1.4.2 / mig 014) |

### 2.2 `_extra.workspace`

| 필드 | 타입 | 컬럼 promote? |
|---|---|---|
| `recent_files` | `FileRef[]` | — (array, JSON 유지) |
| `open_files` | `FileRef[]` | — (array, JSON 유지) |
| `ignore_patterns` | `string[]` | — (mention validation cache 강화로 충분) |
| `active_worktree_id` | `string \| undefined` | — (저빈도) |

### 2.3 `_extra.terminal`

| 필드 | 타입 | 컬럼 promote? |
|---|---|---|
| `active_pane_id` | `string \| undefined` | — (저빈도) |
| `panel_open` | `boolean` | 보류 (P2 — UI toggle, ROI 작음) |
| `height_px` | `number` | 보류 (P2 — UI resize) |

### 2.4 `_extra.browser`

| 필드 | 타입 | 컬럼 promote? |
|---|---|---|
| `active_tab_id` | `string \| undefined` | — (UI 미구현) |
| `panel_visible` | `boolean` | — (UI 미구현) |
| `layout` | `BrowserState['layout']` | — (object) |
| `partition_id` | `string` | — (저빈도) |

### 2.5 `_extra.plan`

| 필드 | 타입 | 컬럼 promote? |
|---|---|---|
| `active` | `boolean` | ✅ `sessions.plan_active INTEGER` (v1.8.1 / mig 015) |
| `browser_tool_enabled` | `boolean` | — (저빈도) |
| `current_item_index` | `number \| undefined` | — (저빈도) |

> `plan.checklist` 는 `_extra` 가 아니라 별도 테이블 `plan_items` source.

### 2.6 `_extra.permission`

| 필드 | 타입 | 컬럼 promote? |
|---|---|---|
| `default_level` | `'read_only' \| 'workspace_write' \| 'full_access' \| 'custom'` | ✅ `sessions.permission_default_level TEXT` (v1.8.1 / mig 015) |
| `last_denied` | `{ capability, ts } \| undefined` | — (audit only) |
| `temporarily_blocked_capabilities` | `string[]` | — (array, 가변) |

> `permission.grants` 는 `_extra` 가 아니라 별도 테이블 `permission_grants`
> source (단, 비정규화 캐시 우려 — v1.9.x 트랙으로 이전).

---

## 3. PR 추가 시 체크리스트

새 `_extra` 필드를 추가하려는 경우:

- [ ] `SessionStore.ts` 의 `MetadataExtra` interface 에 추가.
- [ ] `metadataExtraSchema.ts` 의 해당 namespace zod schema 에 동일 정의
      추가 (`.strict()` 안에서).
- [ ] 본 문서의 해당 § 표에 row 추가.
- [ ] (read 빈도가 높다면) column promote 도 함께 검토:
      `docs/extra-namespace-audit.md` 의 P1/P2 표 갱신 → 다음 슬롯에서
      migration + dual-write.
- [ ] `tests/storage/extraSchemaContract.test.ts` 자동 검증 (실패 시
      schema 미등록).

---

## 4. promote 패턴 (참고)

v1.4.2 (mig 014, conversation) + v1.8.1 (mig 015, permission/plan) 의
공통 패턴:

```
1. ALTER TABLE sessions ADD COLUMN <name> <TYPE> [DEFAULT ...];
2. UPDATE sessions SET <name> = json_extract(metadata_json, '$._extra.X.Y');
3. SessionStore.SessionRow 에 새 필드.
4. assembleSession: row.<name> ?? meta._extra.X.Y (column 우선, JSON fallback).
5. insertSessionRow / updateXxx: dual-write (column + _extra 양쪽).
6. (한 슬롯 후) _extra 측 read 제거 — column 만 source of truth.
7. (그 다음 슬롯) buildStoredMetadata 에서 _extra 필드 삭제.
8. 본 문서 + audit 문서 갱신.
```

3단계까지가 v1.8.1 완료 상태. 4-8단계는 v1.8.3+ 후속.

---

## 5. 비정규화 정리 (별도 트랙, v1.9.x)

`_extra` 와 무관하지만 schema 정리 차원에서 추적:

- `_extra.permission.grants[]` ↔ `permission_grants` 테이블 중복
  (현재 metadata 캐시 + DB 양쪽 유지). source of truth 를 테이블로 통일.
- `_extra.plan.checklist[]` ↔ `plan_items` 테이블 중복. 동일 정리.

본 문서 범위 외, v1.9.x 이후.
