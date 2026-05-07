# `_extra` Namespace 사용 감사 — v1.8.0

> **상태**: read-only deliverable. 코드 변경 없음.
> **목적**: v1.8.1 (column promote) 의사결정에 필요한 input 제공.
> **기준일**: 2026-05-07
> **베이스**: v1.4.11 (`9b97174`)

---

## 1. 배경

`metadata_json._extra.{workspace|terminal|browser|plan|permission}` 는
v1.0.0 (`001_init.sql`) 에서 schema-less JSON 으로 도입됐다. v1.4.2 의
B-3 1단계가 `conversation.{current_model, current_effort, current_mode}`
만 정식 컬럼으로 promote 했고, 나머지는 metadata_json 안에 그대로 남아
있다 (`010_json_columns_promote.sql` 은 marker only).

각 필드별로:

- **자주 read** + scalar → 컬럼 promote 적합 (JSON 파싱/추출 비용 제거,
  인덱스 가능).
- **가변/array/object** → JSON 유지 적합 (정규화 부담 큼).
- **거의 미사용** → 다음 단계까지 보류 (지금 promote 해도 ROI 낮음).

---

## 2. 단일 진입 / 출구 지점

`_extra.*` 의 read 는 **거의 모두** SessionStore 의 한 곳에 집중된다:

- **Read 진입**: `assembleSession()` — `meta._extra` 를 분해해 각
  sub-builder (`buildWorkspace`, `buildTerminalState`, …) 에 전달.
- **Write 진입**: `buildStoredMetadata()` — `s.workspace`, `s.terminal`,
  …을 `_extra` 객체로 직렬화.

따라서 storage 단의 promote 작업은 이 두 함수 + 새 컬럼 INSERT/UPDATE
SQL 의 좁은 표면이 끝이다. **renderer 쪽은 거의 영향 없음** —
`s.workspace.ignore_patterns` 같은 type-level 접근만 보존하면 된다.

예외 hot path (storage 외부):

- `src/permission/Resolver.ts:242` — `s.plan.active` (permission 결정에
  매 turn 사용).
- `src/permission/Resolver.ts:93,117,262` — `s.permission.{grants,
  default_level}` (permission 결정 hot path).
- `src/renderer/App.tsx:917` — `activeSession?.workspace.ignore_patterns`
  (mention popover validation).
- `src/renderer/App.tsx:868,882,1044` — `s.permission.default_level`
  (streaming provider forward, telemetry).
- `src/renderer/components/chat/ChatPanel.tsx:591` — header
  PermissionDropdown render.

---

## 3. Namespace 별 분석

### 3.1 `_extra.workspace`

**스키마 정의**: `src/types/workspace.ts:78-105`
**도입**: v1.0.0 (`001_init.sql`).

| 필드 | 추정 타입 | Read 빈도 | Write 빈도 | 권고 |
|---|---|---|---|---|
| `recent_files` | `FileRef[]` | low (load 1회) | medium (편집 시) | **JSON 유지** (array of objects, 가변 길이) |
| `open_files` | `FileRef[]` | low | low | **JSON 유지** (array of objects) |
| `ignore_patterns` | `string[]` | **high** (mention validation 매 keystroke) | low (config 변경 드뭄) | **JSON 유지 (Phase 2 candidate)** — 자주 read 지만 array. mention popover 가 매 keystroke 마다 호출하므로 in-memory cache 가 더 효과적 (별도 컬럼이 아니라 기존 cache layer 강화) |
| `active_worktree_id` | `string \| undefined` | low | low | **JSON 유지** (optional scalar, 저빈도) |

**결론**: workspace namespace 는 column promote 를 거의 안 하는 게
좋다. recent_files / open_files 는 array, ignore_patterns 는
mention-popover 측 in-memory cache 로 해결.

---

### 3.2 `_extra.terminal`

**스키마 정의**: `src/types/terminal.ts:57-64`
**도입**: v1.0.0 (`001_init.sql`).
**특이점**: `terminal.panes` 는 별도 테이블 `terminal_panes`. metadata
에 남아있는 건 패널 self-state 만.

| 필드 | 추정 타입 | Read 빈도 | Write 빈도 | 권고 |
|---|---|---|---|---|
| `active_pane_id` | `string \| undefined` | low | low | **JSON 유지** (optional, 저빈도) |
| `panel_open` | `boolean` | medium (UI render) | medium (toggle) | **Promote 후보** — boolean scalar, UI toggle 시 매번 갱신 |
| `height_px` | `number` | medium | medium (resize drag) | **Promote 후보** — number scalar, resize drag 마다 갱신 (debounce 후라도 빈도 있음) |

**결론**: panel_open + height_px 는 promote 후보. 단 두 필드 함께만
의미가 있고 양쪽 다 storage hot path 가 아니므로 **Phase 2** 로
보류해도 무방.

---

### 3.3 `_extra.browser`

**스키마 정의**: `src/types/browser.ts:64-73`
**도입**: v1.0.0.
**특이점**: tabs 는 별도 테이블 `browser_tabs`. 코멘트
(`App.tsx:254`, `ThreePanelLayout.tsx:22`) 에 "현재 UI/IPC 미구현,
v1.4.2.x 이후 예정" 명시.

| 필드 | 추정 타입 | Read 빈도 | Write 빈도 | 권고 |
|---|---|---|---|---|
| `active_tab_id` | `TabId \| undefined` | low (persist only) | low | **JSON 유지** |
| `panel_visible` | `boolean` | low (persist only) | low | **JSON 유지** (UI 미구현, ROI 0) |
| `layout` | `BrowserLayout` (object) | low | low | **JSON 유지** (object) |
| `partition_id` | `string` | low | low (1회 init) | **JSON 유지** (저빈도) |

**결론**: browser namespace 는 **현재 거의 미사용**. UI 가 본격 구현된
이후 (v1.4.2.x 이후 계획) 재평가. 지금 promote 하면 dead column 추가.

---

### 3.4 `_extra.plan`

**스키마 정의**: `src/types/plan.ts:45-55`
**도입**: v1.0.0.
**특이점**: `plan.checklist[]` 는 별도 테이블 `plan_items`. metadata
에 남아있는 건 plan self-state.

> **v1.4.13 정정 (2026-05-07)**: 본 audit 의 row "checklist - JSON 유지"
> 는 v1.4.11 시점 추정이었으나, 실제 `MetadataExtra.plan` interface +
> `PlanExtraSchema` (zod) 모두 `checklist` 필드를 한 번도 포함한 적이
> 없음. `plan_items` 테이블이 처음부터 단일 source. `assembleSession`
> 의 `buildPlanState` 가 `loadPlanItems` 결과를 PlanState 의 runtime
> `checklist` 로 wrapping 하는 것은 *runtime view* 이지 metadata 직렬화
> 와 별개. v1.4.13 슬롯에서 명시 contract guard test 추가
> (`tests/storage/extraSchemaContract.test.ts`).

| 필드 | 추정 타입 | Read 빈도 | Write 빈도 | 권고 |
|---|---|---|---|---|
| `active` | `boolean` | **high** (Resolver.ts:242 — 매 permission 결정) | low | **Promote 강력 후보** — boolean scalar, hot path (v1.8.1 promoted, v1.8.4 _extra write 제거) |
| `browser_tool_enabled` | `boolean` | low | low | **JSON 유지** (UI 토글 미구현) |
| ~~`checklist`~~ | (부재) | (해당 없음 — 테이블 source) | (해당 없음) | **v1.4.13 — 본디 부재 확정. contract guard test 로 명시.** |
| `current_item_index` | `number \| undefined` | low | low | **JSON 유지** (optional) |

**결론**: `plan.active` 는 Phase 1 promote 1순위. 다른 필드는 저빈도
또는 별도 테이블 source 가 있어 보류.

---

### 3.5 `_extra.permission`

**스키마 정의**: `src/types/permission.ts:142-156`
**도입**: v1.0.0.
**특이점**: `permission.grants[]` 는 별도 테이블 `permission_grants`.
metadata 에 캐시되어 있어 비정규화 — 향후 정규화 가치 있음.

> **v1.4.12 정정 (2026-05-07)**: 본 audit 의 "grants 가 metadata 에
> 캐시" 가설은 v1.4.11 시점 추정이었으나, 실제 `MetadataExtra` interface +
> `MetadataExtraSchema` 모두 `permission.grants` 필드를 한 번도 포함한
> 적이 없음 (`buildStoredMetadata` 도 직렬화 X). `permission_grants` 테이블이
> 처음부터 단일 source. v1.4.12 슬롯에서 명시 contract guard test 추가
> (`tests/storage/extraSchemaContract.test.ts`) — 향후 regression 즉시 fail.

| 필드 | 추정 타입 | Read 빈도 | Write 빈도 | 권고 |
|---|---|---|---|---|
| ~~`grants`~~ | (부재) | (해당 없음 — 테이블 source) | (해당 없음) | **v1.4.12 — 본디 부재 확정. contract guard test 로 명시.** |
| `default_level` | `PermissionLevel` (enum) | **very high** (Resolver + UI render + streaming forward) | medium (v0.8.0 IPC) | **Promote 강력 후보** — string enum scalar, 가장 자주 read 되는 \_extra 필드 |
| `temporarily_blocked_capabilities` | `string[]` | low | low | **JSON 유지** (array, 가변) |
| `last_denied` | `{ capability, ts } \| undefined` | low (audit only) | low | **JSON 유지** (optional, audit 용) |

**결론**: `permission.default_level` 은 promote 1순위. grants 의
metadata 캐시 제거 (정규화) 는 별도 슬롯 (v1.9.x) 에서 진행.

---

## 4. v1.8.1 권고: 컬럼 promote 대상

| 우선 | 필드 | 새 컬럼 | 타입 | 사유 |
|---|---|---|---|---|
| **P1** | `_extra.permission.default_level` | `sessions.permission_default_level` | `TEXT` (enum) | 가장 자주 read 되는 \_extra 필드. enum scalar |
| **P1** | `_extra.plan.active` | `sessions.plan_active` | `INTEGER` (boolean 0/1) | Permission resolver hot path. boolean scalar |
| **P2** | `_extra.terminal.panel_open` | `sessions.terminal_panel_open` | `INTEGER` | UI toggle 자주 갱신, boolean scalar |
| **P2** | `_extra.terminal.height_px` | `sessions.terminal_height_px` | `INTEGER` | UI resize 자주 갱신, number scalar |

**P1 두 필드 만으로 v1.8.1** 진행 권고. P2 는 ROI 낮아 v1.8.2 또는
이후로 미룸.

---

## 5. v1.8.1 마이그레이션 형태 (예시)

```sql
-- migrations/0XX_extra_promote_v1.sql
ALTER TABLE sessions
  ADD COLUMN permission_default_level TEXT
  CHECK(permission_default_level IN ('read_only','workspace_write','full_access','custom'));
ALTER TABLE sessions ADD COLUMN plan_active INTEGER NOT NULL DEFAULT 0;

-- backfill from metadata_json._extra.permission.default_level + plan.active
UPDATE sessions
SET permission_default_level = json_extract(metadata_json, '$._extra.permission.default_level'),
    plan_active = CASE WHEN json_extract(metadata_json, '$._extra.plan.active') = 1 THEN 1 ELSE 0 END;
```

**Read 측**: `assembleSession()` 이 `s.permission.default_level` /
`s.plan.active` 를 새 컬럼에서 우선, fallback 으로 _extra (legacy 데이터).

**Write 측**: `INSERT/UPDATE sessions` 에 새 컬럼 dual-write, 동시에
metadata_json._extra 도 유지 (다음 슬롯에서 _extra 에서 제거).

---

## 6. JSON 유지 (현재 상태 그대로) 필드

다음 필드들은 변경 없음 — 가변, array, optional, 또는 미사용:

- `_extra.workspace.{recent_files, open_files, ignore_patterns, active_worktree_id}`
- `_extra.terminal.active_pane_id`
- `_extra.browser.*` (전부 — UI 미구현, 재평가 후순위)
- `_extra.plan.{browser_tool_enabled, checklist, current_item_index}`
- `_extra.permission.{grants, temporarily_blocked_capabilities, last_denied}`

---

## 7. 비정규화 정리 (별도 트랙, v1.9.x 이후)

- `_extra.permission.grants[]` 가 `permission_grants` 테이블과 중복.
  source of truth 를 테이블로 통일 + metadata 에서 제거.
- `_extra.plan.checklist[]` 가 `plan_items` 와 중복. 동일 정리.

이 트랙은 v1.8.x 와 별도로 진행. 본 문서 범위 외.

---

## 8. 위험 요소

- **하위 호환**: 기존 sessions 의 metadata_json 에 _extra 가 있어야
  v1.8.1 backfill 가능. 빈 metadata 도 default 채워 안전 (NOT NULL
  default, JSON null 안전).
- **dual-write 구간**: v1.8.1 이후 한 슬롯 동안 column + _extra 양쪽
  유지. 다음 슬롯에서 _extra 측 read 제거 후 그 다음에 _extra 필드
  제거.
- **Test fixtures**: `tests/fixtures/sessions/*.json` 의 `_extra` 가
  새 컬럼 backfill 검증에 그대로 사용 가능 — fixture 수정 불필요.

---

## 9. 다음 슬롯 (v1.8.1) 진입 조건

본 문서가 v1.8.1 의 "어떤 필드를 promote 하느냐?" 의사결정의 단일
진실. 변경 시 본 문서 갱신 후 commit.

다음 슬롯 시작 시:

1. 본 문서 § 4 의 P1 필드 2개로 범위 한정.
2. SessionStore.assembleSession + buildStoredMetadata 만 수정 (renderer
   touch X, type 만 보존).
3. 신규 unit: backfill round-trip + dual-write 분리 검증.

---

## 10. 참고 파일

```
src/storage/SessionStore.ts:202-236        # MetadataExtra interface
src/storage/SessionStore.ts:1548-1551      # assembleSession() entry
src/storage/SessionStore.ts:1587-1639      # buildStoredMetadata()
src/storage/SessionStore.ts:1671-1699      # buildWorkspace()
src/storage/SessionStore.ts:1911-1923      # buildTerminalState()
src/storage/migrations/001_init.sql        # _extra 도입 (v1.0.0)
src/storage/migrations/010_json_columns_promote.sql  # promote marker (v1.3.2)
src/storage/migrations/014_conversation_columns_promote.sql  # B-3 1단계 (v1.4.2)
src/types/{workspace,terminal,browser,plan,permission}.ts  # zod 스키마
src/permission/Resolver.ts:93,117,242,262  # permission/plan hot path
src/renderer/App.tsx:917                   # ignore_patterns mention validation
```
