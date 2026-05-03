# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식. [SemVer](https://semver.org/lang/ko/).

## [0.9.0] — 2026-05-03

**Feature release — F (Usage 보강) + E (MCP discovery): 운영 가시성 강화.**

Codex 권고 v0.9.0. v0.8.0 의 통합 Settings 진입점을 토대로, 사용자가 비용 /
사용량 / MCP 운영 상태를 한 눈에 확인할 수 있게 했다. CSV 내보내기로
스프레드시트 분석을 가능하게 하고, 일별 SVG 차트로 추세를 시각화하며,
비용 한도 / 임계 알림으로 폭주를 방지한다. MCP 측면은 Claude/Codex CLI
config 자동 탐지 + 정적 추천 서버 (filesystem / github / memory) 로 1-클릭
등록을 지원하고, Sidebar 에 상태 indicator (green/yellow/red dot) 와 wizard
의 미니 안내까지 노출한다.

### Added

- **`UsageStore.exportCsv(range)`** — RFC 4180 호환 CSV export. 콤마/따옴표/
  줄바꿈을 정확히 escape (`""` doubling), ISO 8601 timestamp 보존, 비용은
  6자리 fixed (no e-notation). 11 컬럼: timestamp, session_id, turn_id,
  provider, model, input_tokens, output_tokens, cache_creation, cache_read,
  reasoning, total_cost_usd. range filter (from/to/provider/model/session_id)
  지원, 시간 ASC 정렬.
- **신규 IPC channel `usage/export-csv`** — Range filter 입력, CSV 문자열
  반환. UsageSummaryArgsSchema 재사용 + Result wrapping.
- **신규 IPC channel `usage/get-limits` / `usage/set-limits`** — 비용 한도
  (`usage_cost_limit_usd`) 와 알림 임계 (`usage_alert_threshold`) 영속.
  threshold 는 0~1 범위 강제, 한도는 nonnegative. null patch 로 한도 제거.
- **`AppSettings.usage_cost_limit_usd` / `usage_alert_threshold` 필드** —
  음수 / 범위 외 / non-finite 값은 silent drop (corrupt-tolerant 패턴 유지).
- **`src/renderer/components/settings/UsageChart.tsx`** — 일별 stacked bar
  chart. 외부 dependency (recharts 등) 없이 plain SVG — 번들 크기 0,
  jsdom 호환, accessibility (`role="img"`, `<title>`). Provider 별 색상
  구분, ko-KR 한국어 tick formatter (M/D, 1.5K, $0).
- **UsageSettings 모달 / 패널 — `[CSV 내보내기]` 버튼** — 현재 preset
  range 의 데이터를 Blob + `<a download>` 로 트리거. UTF-8 BOM 추가해
  Excel 한글 호환. 파일명 `dreampia-usage-{range}-{date}.csv`.
- **UsageSettings — 비용 한도 section** — 한도 입력 (USD/월) + 임계 라디오
  (50% / 80% / 90%) + 상태 뱃지 (한도 미설정 / 안전 / 경고 / 한도 초과).
  `useUsageLimits` hook 으로 IPC 영속 + 자동 refresh.
- **UsageSettings — 일별 추이 차트 섹션** — 데이터 있을 시 표 위에 chart
  추가 표시. preset 변경 시 1/7/30 일 자동 재집계.
- **`useUsageLimits` hook** — `useUsage` 와 분리한 별도 hook. limits 가
  preset-independent 한 lifecycle 을 가지므로 useUsage 의 매-preset refresh
  와 충돌 방지.
- **`src/main/mcp/discovery.ts`** — MCP discovery 엔진. 정적 추천 (filesystem
  / github / memory) + Claude CLI (`~/.claude.json` / `~/.claude/config.json`)
  + Codex CLI (`~/.codex/config.json`) 자동 탐지. mcpServers map / mcp_servers
  array / nested mcp.servers 패턴 모두 지원, id 자동 sanitize. best-effort —
  파일 부재 / 권한 / parse 실패는 silent fallback (빈 배열).
- **신규 IPC channel `mcp/discover`** — `{ suggested, from_claude, from_codex }`
  반환. 이미 등록된 server id 는 from_claude / from_codex 에서 자동 제외 →
  사용자에게 중복 노출 X.
- **McpSettings 패널 — 추천 + 발견된 서버 section** — discovery 결과를
  add form 위에 표시. 각 행의 [추가] 버튼 클릭 시 add form 이 미리 채워진
  상태로 열림 (id / name / command / args / env 모두 prefill).
- **`McpAddForm.initial` prop** — discovery 클릭 진입 시 초기값 제공.
- **OnboardingWizard step 3 — MCP 미니 안내** — `mcp.list` 결과 기반
  상태 (등록된 서버 수 / ready / error 분포) 표시. `onOpenMcpSettings`
  prop 으로 `[더 알아보기]` 링크 → SettingsModal('mcp') 진입.
- **Sidebar — MCP status indicator** — bottom 영역에 dot+label. 색상:
  gray (0 서버), green (all ready), yellow (any connecting), red (any error).
  툴팁에 모든 서버의 status 노출. 클릭 시 `onOpenMcpSettings` 호출.
- **`useMcp().discover()` hook 메서드** — preload IPC 미지원 시 null 반환
  (기존 graceful fallback 패턴).
- **`tests/storage/UsageStore.csv.test.ts`** — 13 tests. header / 빈 결과 /
  RFC 4180 escaping (콤마, `""`, 줄바꿈) / 토큰 컬럼 / range filter (from/to/
  provider) / 시간 정렬 / cost 6자리 fixed (no e-notation).
- **`tests/main/ipc.usage-csv.test.ts`** — 9 tests. CSV export Result wrap /
  range 전달 / Zod 검증 / get-limits default / set-limits round-trip /
  null patch / negative 거절 / threshold > 1 거절 / strict mode.
- **`tests/main/settings.usage-limits.test.ts`** — 11 tests. cost limit
  read/write/clamp/silent-drop / threshold 범위 / 0 허용 (한도 0) /
  두 필드 동시 영속.
- **`tests/main/mcp/discovery.test.ts`** — 13 tests. SUGGESTED_MCP_SERVERS
  형태 / mcpServers map / mcp_servers array / nested mcp.servers / id sanitize
  / 깨진 항목 drop / 중복 dedup / detectMcpFromClaudeConfig 빈 배열 fallback.
- **`tests/main/ipc.mcp-discover.test.ts`** — 3 tests. discover Result
  wrap / suggested ids / 다중 호출 안전.
- **`tests/renderer/UsageChart.test.tsx`** — 6 tests. empty placeholder /
  svg + bars / legend / stacked / metric=cost / maxDays truncate.
- **`tests/renderer/UsageSettings.csv-limits.test.tsx`** — 9 tests.
  CSV 버튼 / IPC 호출 / 한도 status (미설정 / 안전 / 경고 / 초과) / save
  버튼 IPC / threshold radio.
- **`tests/renderer/McpSettings.discovery.test.tsx`** — 5 tests. 추천
  section / 발견된 section / [추가] 버튼 prefill / discovery 비어 있을
  때 section 숨김.
- **`tests/renderer/Sidebar.mcp-status.test.tsx`** — 5 tests. indicator
  표시 조건 / 0 서버 / all ready / any error / 클릭 wiring.
- **`tests/renderer/OnboardingWizard.mcp-mini.test.tsx`** — 4 tests.
  empty 표시 / 서버 카운트 + 상태 분포 / [더 알아보기] visible/hidden.

### Changed

- **`src/main/preload.ts`** — `usage/export-csv`, `usage/get-limits`,
  `usage/set-limits`, `mcp/discover` 4 channel whitelist + API 노출.
  `usage.exportCsv()`, `usage.getLimits()`, `usage.setLimits()`,
  `mcp.discover()` 메서드 추가.
- **`src/renderer/hooks/useUsage.ts`** — `exportCsv()` 메서드를 `useUsage`
  return 에 추가. `useUsageLimits` 별도 hook 추가 export.
- **`src/renderer/hooks/useMcp.ts`** — `discover()` 메서드 추가. preload
  미지원 시 null fallback.
- **App.tsx — wizard / Sidebar 의 `onOpenMcpSettings` wire up** —
  SettingsModal('mcp' tab) 진입점 통합.
- **tests/setup.ts** — `mockStore.usageExportCsv`, `mockStore.usageLimits`,
  `mockStore.mcpDiscovery` 추가. `usage.exportCsv` / `usage.getLimits` /
  `usage.setLimits` / `mcp.discover` mock IPC 추가.

### Verification

- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 errors / 0 warnings.
- `npm test` — 1106 → 1181 tests pass (75 new). 0 회귀.

### Notes

- **Recharts 미사용 결정** — 원래 plan 은 recharts 의존 추가였지만, plain
  SVG 가 (a) 번들 크기 0 (b) jsdom 호환 (ResizeObserver mock 불필요) (c)
  ko-KR formatter 즉시 적용 등 장점이 명확해 채택. 향후 인터랙티브 hover
  / drilldown 이 필요해지면 그때 도입.
- **MCP discovery 의 enabled=false default** — 자동 탐지된 server 는 사용자
  의 의도된 등록이 아니므로 자동 spawn 하지 않는다. UI 의 `[추가]` 버튼
  클릭 → add form 에서 `[저장 후 즉시 실행]` 토글로 사용자가 명시 결정.
- **월 정확 비용 표시는 v0.10.0** — 현재 한도 비교는 preset 합계 기준
  (UI 명시). 정확한 월별 합계 IPC 추가 시 함께 갱신 예정.

## [0.8.0] — 2026-05-03

**Feature release — D1 통합 Settings 모달 + H Permission Dropdown.**

Codex 권고 v0.8.0. 두 항목을 함께 묶어 처리해 중복 UI churn 을 방지하고
권한 의미론을 먼저 고정. 이전엔 `McpSettings` / `UsageSettings` 두 별도
모달과 wizard step 4 에만 권한 preset 이 있었지만, 이제 사이드바 [설정]
한 진입점에서 7개 카테고리 (MCP / 사용량 / Provider / 권한 / 테마 /
단축키 / 온보딩) 를 모두 다루며, 채팅 헤더의 dropdown 으로 세션 단위 권한
변경이 가능하다.

### Added

- **`src/renderer/components/settings/SettingsModal.tsx`** — 7-tab 통합
  모달. 좌측 sidebar (180px) + 우측 panel. `initialTab` prop 으로 슬래시
  명령 진입점 분기 (`/settings` → mcp, `/usage` → usage). 각 탭이
  자체 panel: `McpSettingsPanel` / `UsageSettingsPanel` (refactor 된
  panel-only 변형) / Provider radio group / Permission level + capability
  list / Theme radio group / Keyboard placeholder + 매핑 미리 보기 /
  Onboarding [다시 보기] 버튼. `applyTheme(choice)` 헬퍼 export — App
  부팅 시 한 번 호출해 data-theme 즉시 적용.
- **`src/renderer/components/settings/McpSettings.tsx`** — `McpSettingsPanel`
  추가 export (chrome 없는 body-only 변형). 기존 `McpSettings` 모달은
  그대로 유지 — backwards compat 0 회귀.
- **`src/renderer/components/settings/UsageSettings.tsx`** — `UsageSettingsPanel`
  추가 export (chrome 없는 body-only 변형). 기존 모달도 유지.
- **`src/renderer/components/chat/PermissionDropdown.tsx`** — H Permission
  Dropdown. native `<select>` + `ShieldCheck` icon. 4개 preset (read_only /
  workspace_write / full_access / custom) 한국어 라벨로 노출.
- **신규 IPC channel `session/update-permission`** — `(sessionId, {default_level?})`
  → `Result<Session>`. Zod strict validation + Result wrapping. 갱신된
  Session 을 반환해 caller 가 즉시 shadow update.
- **신규 IPC channel `app:get-theme` / `app:set-theme`** — `'light' | 'dark' | 'system'`.
  미설정 시 `'system'` fallback. enum-only validation.
- **신규 IPC channel `app:get-permission-capabilities`** — read-only.
  `Record<PermissionLevel, string[]>` 반환. SettingsModal 의 권한 탭이
  사용자에게 each level 의 capability 를 명시적으로 보여줌.
- **`SessionStore.updatePermission(id, patch)`** — metadata-only update
  (sessions.metadata_json 만 변경). `default_level` 만 patch 가능. 향후
  grants API 는 별도 채널 (v0.13.0).
- **`AppSettings.theme` 필드** — `'light' | 'dark' | 'system'`. 알 수 없는
  값은 silent drop. 기존 corrupt-tolerant 패턴 유지.
- **`PermissionPatch` 타입** — preload-safe (`@/main/types`).
- **`ChatPanel` `onChangePermission` prop** — ChatHeader 의 dropdown 변경
  시 호출. `permissionDisabled` 도 함께 — IPC 미지원 / 스트리밍 중일 때
  dropdown disabled.
- **`useSessionStore.updatePermission(id, patch)`** — IPC + refresh wrapper.
  preload 에 메서드 미존재 시 silent null fallback (구버전 호환).
- **App.tsx `handleChangePermission`** — optimistic local shadow update +
  IPC 영속 + reconcile. 부팅 시 `applyTheme(getTheme().value)` 한 번 호출.
- **`tests/renderer/SettingsModal.test.tsx`** — 12 tests. 7 탭 모두 표시 /
  탭 전환 / `initialTab` 분기 / Provider 변경 / Permission 변경 +
  capability 표시 / Theme 변경 + data-theme 적용 / Keyboard placeholder /
  Onboarding 버튼 / 닫기.
- **`tests/renderer/PermissionDropdown.test.tsx`** — 6 tests. 현재 level /
  4 preset 옵션 / Korean 라벨 / onChange / disabled / title.
- **`tests/main/ipc.session-permission.test.ts`** — 6 tests. round-trip /
  strict mode / invalid enum / not-found / non-string id / 등록.
- **`tests/main/ipc.app-theme.test.ts`** — 8 tests. theme get/set/persist /
  invalid / 3 capability handler.
- **`tests/storage/SessionStore.permission.test.ts`** — 5 tests. round-trip /
  grants 보존 / 빈 patch no-op / not-found / updated_at bump.
- **`tests/renderer/Sidebar.settings.test.tsx`** — 3 tests. [설정] / [사용량]
  진입 wiring + omit when undefined.

### Changed

- **App.tsx — modal 통합** — 이전의 `mcpSettingsOpen` + `usageSettingsOpen`
  두 state 를 `settingsModalOpen` + `settingsInitialTab` 로 통합. 기존
  컴포넌트는 모두 import 되지 않지만 파일은 유지 (downstream backwards
  compat).
- **ChatHeader — Permission dropdown** — workspace pick 버튼과 CLI 뱃지
  사이에 dropdown 삽입. 기존 모델/effort 표시 그대로 유지.
- **preload.ts** — `app:get-theme` / `app:set-theme` /
  `app:get-permission-capabilities` / `session/update-permission` 4
  channel whitelist + API 노출.

### Settings 의미론

- **default_permission_level (settings)** — 새 세션이 만들어질 때 inherit
  하는 기본 level. wizard / SettingsModal 양쪽에서 변경 가능.
- **session.permission.default_level** — 각 세션이 자기 기본 level 을
  복제 보유. ChatHeader dropdown 으로 세션 단위 변경 — 다른 세션엔 영향
  없음. AI start-stream IPC 가 이 값을 forward.

### Migrations / Compat

- 데이터 마이그레이션 0. metadata_json 의 `_extra.permission.default_level`
  필드는 v0.3.0부터 이미 영속됨. v0.8.0 은 그 값을 변경할 IPC + UI 만 추가.
- preload 가 v0.7.x 인 경우 `useSessionStore.updatePermission` 은 silent
  null 반환 — UI 는 변경되지 않음을 사용자가 인지 가능.

### Verification

- `npm run typecheck` 0 errors
- `npm run lint` 0 errors
- `npm test` 1066 → 1106 passes (+40 tests across 5 new files)

## [0.7.0] — 2026-05-03

**Feature release — F-026 Chat Search (SQLite FTS5).**

Codex (read-only audit) 권고 v0.7.0. v0.5.0 (슬래시 명령) / v0.6.0 (@ 멘션)
가 입력 UX 를 강화한 뒤, 누적된 대화 데이터를 다시 찾고 재사용할 수 있는
접근성을 여는 단계. 사용자가 사이드바에서 한 번만 타이핑하면 모든 세션의
turn 본문이 즉시 BM25 ranking + snippet hilight 으로 검색되며, 결과 클릭
시 해당 세션이 활성화되고 정확히 그 turn 위치로 스크롤된다. early adopter
가 세션이 누적된 시점에 즉시 체감하며 v0.6 의 `@session:` 멘션과 시너지.

### Added

- **`src/storage/migrations/004_fts5_turns.sql`** — FTS5 contentless virtual
  table `turns_fts` (`turn_id` / `session_id` / `role` UNINDEXED + `body`
  indexed, `unicode61 remove_diacritics 1` tokenizer). Trigger 대신
  JS-level explicit sync 로 단일 진실의 원천 (`extractTurnText`) 확보. CREATE
  실패 시 schema_meta 의 `fts5_disabled='1'` 로 graceful degrade — searchTurns
  가 LIKE fallback 으로 자동 전환.
- **`src/storage/turnText.ts`** — `extractTurnText(content)` — ContentBlock[]
  에서 사람-가독 텍스트만 (text + mention.ref.display + embedded_card.title)
  추출. image / file blocks 는 의도적으로 skip (base64 / URI 는 search noise).
- **SessionStore 확장** — `searchTurns(q, limit?)` 가 BM25 ranked
  `TurnSearchResult[]` 반환. `appendTurn` / `insertTurns` / `clearTurns` /
  `deleteSession` 모두 같은 트랜잭션에서 turns_fts 를 동기화. FTS5
  unavailable 시 `__forceLikeFallbackForTests` 로 verify 가능한 LIKE 경로.
- **신규 IPC channel `session/search`** — `{q, limit?}` → `Result<TurnSearchResult[]>`.
  Zod 가 `q` 를 1~200자 / `limit` 을 1~100 으로 강제. 모든 검증 실패는
  Result.error 문자열로 변환되어 renderer 에서 alert 표시.
- **`src/renderer/components/sidebar/SearchSection.tsx`** — Sidebar 검색
  입력 + 결과 리스트. role="region" + role="listbox" + role="alert" 모두
  적용. snippet 의 `<mark>...</mark>` 는 React `<mark>` element 로 split-and-
  render — `dangerouslySetInnerHTML` 절대 미사용 (XSS 방어). 한국어 메시지
  (`메시지 검색…` / `검색 중...` / `검색 결과 없음` / `검색 중 오류가 발생했습니다`).
- **Sidebar 활성화** — 이전 placeholder `<SidebarNavItem label="검색">` 자리를
  실제 SearchSection 으로 교체. SidebarProps 에 `searchQuery` /
  `onSearchQueryChange` / `searchResults` / `searchLoading` / `searchError` /
  `onSearchResultClick` 추가 (모두 optional — 미주입 시 quietly disabled).
- **ChatPanel scroll-to-turn** — `pendingFocusTurnId` / `onTurnFocused` props
  추가. MessagesArea 의 useEffect 가 매칭되는 `[data-turn-id]` element 를
  찾아 `scrollIntoView({behavior:'smooth', block:'center'})`, 성공 시
  `onTurnFocused()` 호출로 부모가 state 를 clear (= 같은 검색 결과를 다시
  클릭해도 동작). focus 요청이 있는 동안 streaming auto-scroll 은 보류.
- **TurnDisplay** — `<article>` 에 `data-turn-id={turn.id}` 추가 — scroll
  target lookup 의 ground truth.
- **App.tsx wiring** — `searchQuery` / `searchResults` / `searchLoading` /
  `searchError` / `pendingFocusTurnId` state. 300ms debounced useEffect 가
  `window.dreampia.session.search()` 호출 (cancelled flag 로 race 방어).
  결과 클릭 → `setActiveSessionId` + `setPendingFocusTurnId` → ChatPanel
  scroll. session.search 가 미정 (구버전 preload) 이면 silent fallback.
- **`tests/storage/turnText.test.ts`** — 11 tests. undefined / 빈 배열 /
  multi-text join / image-file skip / mention.display / embedded_card.title /
  Korean / 빈 text skip / 비-array input / 단일 text.
- **`tests/storage/SessionStore.search.test.ts`** — 13 tests. FTS5 happy path
  / 빈 query / no match / multiple matches / limit 준수 / Korean / phrase /
  clearTurns 동기화 / deleteSession 동기화 / createSession bulk index /
  LIKE fallback (forced).
- **`tests/main/ipc.session-search.test.ts`** — 8 tests. 채널 등록 / Result
  wrap / no match → 빈 배열 / Zod 빈 q / Zod max(200) / strict mode unknown
  field / negative limit / over-100 limit / Korean.
- **`tests/renderer/Sidebar.search.test.tsx`** — 7 tests. 빈 query → results
  영역 hidden / 입력 → onChange 호출 / loading state / error state (alert
  role) / empty state / 결과 click → onSearchResultClick / `<mark>` 안전 렌더.
- **`tests/renderer/ChatPanel.scroll.test.tsx`** — 4 tests. data-turn-id
  존재 / pendingFocusTurnId set → scrollIntoView + onTurnFocused 호출 /
  null pendingFocusTurnId → onTurnFocused 미호출 / non-existent id →
  onTurnFocused 미호출.
- **e2e/chat.spec.ts** 에 `sidebar search: type → results → click → scrolls
  to matching turn` 시나리오 1개 추가 (Mock 응답까지 끝낸 뒤 unique marker
  검색 → 결과 row → 클릭 → user turn 가시성 확인).

### Changed

- `package.json`: `0.6.0` → `0.7.0` (minor bump for new feature).
- `src/storage/migrate.ts`: MIGRATIONS 배열에 `version: 4` 추가.
  `LATEST_SCHEMA_VERSION = 4`. v=4 만 try/catch 로 wrap 해 FTS5 unavailable
  환경에서도 schema bump 는 진행 (기능 일부 degrade).
- `src/storage/index.ts` barrel 에 `TurnSearchResult` 타입 export.
- `src/main/preload.ts` whitelist 에 `'session/search'` 채널 등록 +
  `session.search()` 메서드 노출 (`<mark>` 마커 포함된 `snippet` 을 안전하게
  리턴).
- `src/main/ipc.ts`: `SearchTurnsArgsSchema` zod schema + `session/search`
  handler 등록. `TurnSearchResult` import.
- `src/renderer/components/sidebar/Sidebar.tsx`: 기존 `<SidebarNavItem
  label="검색">` 제거, SearchSection 으로 교체. `Search` lucide icon 은
  SearchSection 내부에서 사용 (Sidebar 본체에서는 더 이상 import X).
- `src/renderer/components/chat/ChatPanel.tsx`: ChatPanelProps 에
  `pendingFocusTurnId` / `onTurnFocused` 추가. MessagesArea 가 컨테이너
  ref 를 갖도록 변경. TurnDisplay 의 `<article>` 에 `data-turn-id` 추가.
- `tests/setup.ts`: `mockStore.searchResults` Map + `searchError` 추가,
  `window.dreampia.session.search` mock 등록 (query 별로 미리 inject 된
  결과를 반환), 매 테스트 reset.
- `tests/storage/SessionStore.test.ts`: LATEST_SCHEMA_VERSION 검증을 4 로
  업데이트 (코멘트도 v0.7.0 / F-026 / 004_fts5_turns.sql 명시).

### Notes

- FTS5 의 unicode61 토크나이저는 한국어를 character-level 로 인덱싱한다 →
  `안녕` / `안녕하세요` 모두 substring match 가능. 추후 trigram 또는
  Korean-specific tokenizer (예: 형태소) 추가 검토 가능 (현재는 MVP).
- snippet markup 은 정확히 `<mark>` / `</mark>` 두 토큰만 split. FTS5 가
  emit 하는 다른 escape sequence (현재 없음) 는 일반 텍스트로 취급.
- 검색 입력은 200자 이상이면 Zod 가 reject — paste accident 보호. UI 측
  에서는 maxLength 를 강제하지 않아 사용자 경험은 입력 → 짧은 alert 으로
  일관됨.
- session/search 는 존재하는 모든 세션의 turn 을 검색한다 (workspace 별로
  나뉘지 않음). multi-workspace 가 도입되면 filter 인자 추가 필요.

## [0.6.0] — 2026-05-03

**Feature release — @ Mention palette (F-019).**

Codex (read-only audit) 권고 v0.6.0. v0.5.0 의 슬래시 popover/IME/listbox 패턴을
그대로 재사용해 "내 파일/세션을 대화 컨텍스트로 넣는" 핵심 가치를 제공한다.
사용자가 메시지 안에서 `@<query>` 만 치면 workspace 파일 또는 다른 세션을
선택해 본문에 첨부할 수 있다. v1.0 의 "마우스 없이 주요 화면/액션 접근 가능"
방향에 맞춰 키보드-우선 + IME-안전 + workspace-안전.

### Added

- **`src/renderer/components/chat/ChatInputSuggestionPopover.tsx`** — 슬래시
  /멘션 양쪽이 공유하는 generic listbox popover. `SuggestionItem`(badge /
  primary / secondary) 추상화 + role="listbox" + role="option" + aria-selected
  + 안정 id (suggestionOptionId). emptyMessage / footerHint / ariaLabel /
  testid 모두 caller 가 한국어로 주입. mousedown preventDefault 로 textarea
  focus 유지.
- **`src/renderer/mentions/parser.ts`** — `@<query>` 토큰 파서. cursor 위치
  기준으로 활성 멘션을 detect (이메일 같은 `user@host` 거부 — `@` 앞이
  whitespace 또는 BOF 일 때만). kind 분류: file / session / unknown.
  `findActiveMention(text, cursorPos)` 와 `findAllMentions(text)` 두 함수
  export.
- **`src/renderer/mentions/resolver.ts`** — mention → context 변환.
  `resolveMentions(mentions, ctx)` 가 file IPC + getSession 으로 병렬 fetch.
  `formatMentionsAsContext(text, resolved)` 는 plain-text 컨텍스트 섹션을
  원본 텍스트 끝에 prepend (Turn.content schema 변경 X — MVP).
- **2개 신규 IPC channel (모두 `workspace/*`)**:
  - `workspace/list-files` — `{workspace_root, ignore_patterns?, max_files?}`
    → `Result<FileEntry[]>`. forward-slash relative 경로, max 5000 (default)
    / 10000 (hard cap), depth 16 한도, dependency-free glob matcher 로
    ignore_patterns 매칭. 권한/심볼릭 오류는 silent skip.
  - `workspace/read-file` — `{workspace_root, rel_path, max_bytes?}`
    → `Result<FileContent>`. **path traversal 거절** (workspace 바깥 거절),
    1MB 초과 거절, binary 파일 (NUL byte) 거절, max_bytes (default 8KB,
    hard cap 1MB) 까지 truncate.
- **ChatInput @ trigger 통합** — `@` 입력 시 mention popover 자동 열림.
  IME composition 중에는 안 뜸 (한글 자모 결합 보호). cursor 위치 추적
  (onChange / onSelect / onKeyUp / onClick 모두 sync). 슬래시 popover 와
  mutually exclusive (`/...` 입력 시 mention 숨김). ↑↓ 탐색, Enter 선택
  (텍스트 교체), Esc 닫기, Tab 자동완성. 첫 `@` trigger 시 `listFiles` 한 번
  lazy load. file (path 매칭) / session (title/id 매칭) / unknown (helper
  `session:` 1개) 분기.
- **ChatInput / ChatPanel 신규 props** — `workspaceRoot`, `ignorePatterns`,
  `sessions`, `resolverContext` (ChatPanel 은 `mention*` prefix 로 forward).
  resolverContext 미지정 시 멘션 resolve 단계 skip → raw 텍스트 그대로 전송.
- **`@/types/workspace`** 에 `FileEntry` / `FileContent` 인터페이스 추가
  (preload-safe).
- **`tests/renderer/ChatInputSuggestionPopover.test.tsx`** — 7 tests.
  empty / emptyMessage / 항목 렌더 / aria-selected / mousedown / id linkage /
  footerHint.
- **`tests/main/ipc.workspace-files.test.ts`** — 19 tests. 채널 등록 /
  enumerate 정상 / ignore_patterns 매칭 / max_files cap / forward-slash 정규화 /
  read content + line_count / truncated / path traversal 거절 / binary 거절 /
  directory 거절 / 1MB 초과 거절 / 존재하지 않는 파일 / Zod 검증 /
  max_bytes 1MB 한도.
- **`tests/renderer/mentions/parser.test.ts`** — 20 tests. findActiveMention
  / findAllMentions / kind 분류 / cursor edge cases / 이메일 거부 / 공백
  경계 / start/end 정확성.
- **`tests/renderer/mentions/resolver.test.ts`** — 12 tests. resolveMentions
  병렬 / file 정상 + 실패 + throw / session 정상 + 미발견 / unknown 처리 /
  formatMentionsAsContext file/session/error 직렬화.
- **`tests/renderer/ChatInput.mention.test.tsx`** — 12 tests. `@` 단독 /
  `@s` file 매칭 / `@session:` 후보 / IME composition 중 popover 미표시 /
  슬래시 우선순위 / ↑↓ 키 / Esc 닫기 / Enter 텍스트 교체 / mouseDown 클릭 /
  resolver 미주입 → raw / resolver 주입 → context prepend / 일반 텍스트 submit.
- **e2e/chat.spec.ts** 에 `@s` → mention popover + settings.json 후보 표시
  시나리오 1개 추가.

### Changed

- `package.json`: `0.5.0` → `0.6.0` (minor bump for new feature).
- `src/renderer/components/chat/SlashCommandPopover.tsx` 가 generic
  ChatInputSuggestionPopover 의 thin wrapper 로 refactor — 기존 호출 측
  인터페이스 (testid, aria-label, 표시 텍스트, commandOptionId) 모두 보존,
  내부 구현만 listbox 패턴을 공유.
- `src/main/ipc.ts` — `node:fs/promises` import 추가, ListFiles / ReadFile
  Zod 스키마, dependency-free glob matcher (`compileGlob`), path traversal
  guard (`resolveInsideWorkspace`), binary detector (`looksBinary`),
  `registerWorkspaceHandlers` 안에 2개 새 handler.
- `src/main/preload.ts` whitelist 에 2개 새 IPC channel
  (`workspace/list-files`, `workspace/read-file`) + `workspace.listFiles` /
  `workspace.readFile` API 노출.
- `tests/setup.ts` — mock IPC 에 `workspace.listFiles` / `workspace.readFile`
  추가, mockStore 에 `workspaceFiles` / `workspaceFileContents` state +
  beforeEach reset + mockClear 등록.

### Acceptance

- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 errors.
- `npm test` — 953 → 1023 tests, all passing (+70 신규).
- 수동 스모크: `@s` → 파일 후보, `@session:` → 세션 후보, ↑↓/Enter/Esc 동작,
  한글 조합 중 popover 미표시, `@README.md` 첨부 후 submit → user turn 본문에
  README 내용 포함, `@../../../etc/passwd` → IPC 거절 (path traversal).

## [0.5.0] — 2026-05-03

**Feature release — Slash Commands (F-018).**

Codex (read-only audit) 권고 v0.5.0. v0.4.0 까지 Provider / MCP / Onboarding /
Usage 가 빠르게 쌓이면서 사용자가 기능을 "찾아가는" 비용이 생기기 시작했다.
슬래쉬 명령은 새 도메인을 추가하지 않고 기존 기능 접근성을 크게 올린다 —
v1.0 의 "마우스 없이 주요 화면/액션 접근 가능" 목표에 정렬된 첫 키보드-우선
변경.

### Added

- **`src/renderer/commands/registry.ts`** — slash command 등록부.
  `SLASH_COMMANDS` 7개 (`/help`, `/clear`, `/new`, `/model`, `/settings`,
  `/usage`, `/onboarding`) + `KNOWN_MODELS` 화이트리스트 (Claude / Codex).
  `parseSlashInput(text)` 는 `/trigger arg` 형식을 파싱, `filterCommands(query)`
  는 popover 용 매칭 (prefix → label substring 순 정렬).
- **`SlashCommandPopover` 컴포넌트** — textarea 위쪽 floating popover.
  `role="listbox"` + `role="option"` + `aria-selected` + 안정 id (caller 가
  `aria-activedescendant` 로 가리킬 수 있도록). Footer 힌트 (↑↓ 탐색 · Enter
  선택 · Esc 닫기). mousedown preventDefault 로 textarea focus 유지.
- **`SlashHelpModal` 컴포넌트** — `/help` 가 여는 도움말 모달. 모든 명령을
  표 형태로 표시 (trigger / argHint / 라벨 / 설명). McpSettings / UsageSettings
  와 동일한 fixed overlay 패턴 + Esc 닫기.
- **ChatInput 통합** — `/` 입력 시 popover 자동 열림 (IME composition 중에는
  열리지 않음 — 한글 자모 결합 보호). ↑↓ 탐색, Enter 선택, Esc 닫기, Tab 자동완성
  (인자 필요 명령은 trigger + space 까지 채움). 알 수 없는 trigger / handler 미등록
  시에는 그냥 메시지로 fallback (silent no-op 방지).
- **`SessionStore.clearTurns(id)`** — `/clear` 슬래시 명령 백엔드.
  현재 세션의 모든 turn + turn-level annotation 삭제, session 자체와
  conversation 메타 (current_model 등) 는 유지. updated_at 갱신.
- **`SessionStore.updateConversation(id, patch)`** — `/model <name>` 백엔드.
  metadata_json 의 `_extra.conversation` 의 current_model / current_effort /
  current_mode 갱신. 빈 patch 는 no-op.
- **2개 신규 IPC channel (모두 `session/*` namespace, mutation)**:
  - `session/clear-turns` — sessionId → Result<void>. Zod string 검증.
  - `session/update-conversation` — `(sessionId, patch)` → Result<Session>.
    patch 는 strict zod schema 로 enum 까지 검증.
- **preload.ts 의 `session.clearTurns` / `session.updateConversation`** —
  renderer 노출 + 채널 화이트리스트.
- **`useSessionStore.clearTurns` / `updateConversation` 메서드** — App.tsx 가
  쓰는 훅 단의 thin wrapper. 자동 refresh 로 sidebar updated_at 즉시 반영.
- **`commandHandlers` prop on ChatPanel + ChatInput** — App.tsx 가 빌드한
  `Partial<Record<SlashCommandId, (arg?: string) => void>>` 를 ChatInput 까지
  forward. App.tsx 는 7개 명령을 기존 state setter (mcpSettingsOpen 등) 와
  연결.
- **`tests/renderer/commands/registry.test.ts`** — 19 tests.
  parseSlashInput / filterCommands edge cases + KNOWN_MODELS 검증.
- **`tests/renderer/SlashCommandPopover.test.tsx`** — 8 tests.
  렌더 / 클릭 / a11y 속성 / argHint 표시 / id linkage.
- **`tests/renderer/ChatInput.slash.test.tsx`** — 14 tests.
  popover open/close, ↑↓ 키, Enter 실행, Esc 닫기, Tab 자동완성,
  ★ IME composition 중 popover 안 뜸, unknown trigger fallback,
  `/model gpt-4o` arg 전달, combobox a11y 속성.
- **`tests/main/ipc.session-clear-update.test.ts`** — 11 tests.
  채널 등록 / round-trip / 잘못된 sessionId / 알 수 없는 patch field /
  존재하지 않는 session 에러 메시지.
- **`tests/storage/SessionStore.clearTurns.test.ts`** — 11 tests.
  clearTurns + updateConversation round-trip / annotation 정리 /
  no-op patch / not-found throw.
- **e2e/first-chat.spec.ts** 에 slash command 시나리오 1개 추가 —
  `/usage` 로 사용량 모달 열기 + `/help` 로 도움말 모달 열기 + Esc 닫기.

### Changed

- `package.json`: `0.4.0` → `0.5.0` (minor bump for new feature).
- `src/main/types.ts` — `ConversationPatch` interface export (preload-safe).
- `src/main/preload.ts` whitelist 에 2개 새 IPC channel
  (`session/clear-turns`, `session/update-conversation`).
- `src/main/ipc.ts` — `ChatModeSchema` / `EffortLevelSchema` import + 새
  `ConversationPatchSchema` (strict). registerSessionHandlers 에 2개 새
  handler 추가.
- `tests/setup.ts` — mock IPC 에 `session.clearTurns` / `updateConversation`
  추가, beforeEach mockClear 에도 등록.

### Acceptance

- "마우스 없이 주요 화면/액션 접근 가능" — `/` 만 누르면 7개 모두 도달 가능.
- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 errors.
- `npm test` — 953 passed (890 → 953, +63 신규).

### Notes

- `/help`, `/settings`, `/usage` 는 새 도메인을 추가하지 않고 기존 모달을 재
  활용 (UsageSettings, McpSettings, SlashHelpModal). 이 PR 의 핵심 가치는
  "추가" 가 아니라 "도달성".
- 슬래시 명령은 IME 와 무관하게 한글 입력 보호 — composition 중에는 popover
  자체가 열리지 않는다. ChatInput 의 기존 `isComposing` 가드를 그대로 활용.
- 미등록 명령 (`/foo`) 또는 handler 가 없는 명령은 메시지로 fallback —
  사용자에게 "엇? 그냥 보내졌네?" 정도로 읽혀 silent failure 가 아니다.
- `/model <name>` 의 화이트리스트는 ChatInput 단 + App.tsx 단 양쪽에서 검증
  (UI 가드 + 외부 호출 방어). 미등록 모델은 콘솔 경고 + `/help` 모달로 안내.

## [0.4.0] — 2026-05-03

**Feature release — Usage / Cost Tracking MVP.**

Codex (read-only audit) 권고 v0.4.0. v0.3.0 의 onboarding polish 가 "처음 켰을
때 성공" 단계를 푸는 거였다면, v0.4.0 은 "계속 쓸 수 있느냐 (실사용 신뢰)" 단계
의 첫 블록이다. 초기 사용자들의 다음 병목 — "얼마나 썼고, 비용이 얼마나 나가나"
— 를 즉시 답할 수 있어야 v1.0 의 신뢰 단계로 진입한다.

### Added

- **`usage_events` 테이블 (migration 003)** — append-only token / cost
  telemetry. session_id / turn_id / provider / model / 5종 token 카운터
  (input / output / cache_creation / cache_read / reasoning) + total_cost_usd
  + recorded_at + 디버그용 source 필드. 인덱스 4개 (session+recorded /
  recorded / provider+recorded / model+recorded). FK 는 의도적으로 없음
  (cross-process import / dangling reference 허용).
- **`src/providers/pricing.ts`** — 모델 → USD/Mtoken 가격표 + estimateCostUsd
  함수. Claude (sonnet/haiku/opus) + Codex/OpenAI (gpt-4o/gpt-5.5/o1/o3-mini)
  포함. 미등록 모델은 cost=0 으로 fallback (token 은 여전히 기록). 정확 매칭
  우선, 그 다음 prefix 매칭으로 새 release 도 잡음.
- **StreamEvent `usage` variant** — translator 가 CLI JSONL 의 usage 필드를
  추출해 emit. main 의 runStreamPump 가 가로채 UsageStore.recordEvent 로 영속.
  한 turn 에 여러 번 emit 돼도 stream 종료 시 마지막 값 1건만 영속해 누적
  정확성 보장.
- **`UsageStore` (`src/storage/UsageStore.ts`)** — append-only persistence
  layer. recordEvent (write) + getSummary (provider/model 별 합계) +
  getDailyTotals (날짜별) + getBySession (디버그). UPDATE / DELETE 메서드 X.
  음수 토큰 / non-finite cost 는 0 으로 clamp.
- **3개 신규 IPC channel (모두 `usage/*` namespace, read-only)**:
  - `usage/summary` — `{from?, to?, provider?, model?, session_id?}` →
    UsageSummary[]. 모든 query Zod 검증.
  - `usage/daily` — `{days, provider?}` → DailyUsageRow[]. days 1-365 범위.
  - `usage/by-session` — sessionId 문자열 → UsageEvent[].
- **`useUsage` hook** — `summary` / `daily` 자동 fetch + preset 전환
  (today/7d/30d) + manual refresh + lastRefreshedAt 추적. 패턴은 useMcp 와
  동일.
- **`UsageSettings` 모달** — Sidebar 의 [사용량] 버튼이 mount. 헤더 + preset
  탭 + provider/model 별 합계 표 + 일별 추이 표 + 새로고침. 한국어 우선,
  USD 4-digit / 토큰 ko-KR 로케일 포맷팅. 빈 상태 안내 + IPC 에러 banner.
- **Sidebar [사용량] 항목** — `BarChart3` 아이콘 + `onOpenUsage` 콜백.
  미지정 시 항목 자체를 숨김 (다른 nav 항목 패턴 동일).
- **MockProvider usage emit** — synthetic usage event 도 emit (응답 길이 ÷ 4
  ≈ token 추정). dev / e2e 도 cost 흐름을 검증할 수 있음.

### Changed

- `package.json`: `0.3.0` → `0.4.0` (minor bump for new feature).
- `src/storage/migrate.ts` MIGRATIONS 배열에 v3 항목 추가 (LATEST = 3).
- `src/providers/types.ts` StreamEvent union 확장 + UsageEventData interface
  export.
- `src/providers/index.ts` pricing module + UsageEventData 타입 re-export.
- `src/main/preload.ts` whitelist 에 3개 새 IPC channel + `usage` namespace
  + UsageEventDataShape (sandbox-safe inline).
- `src/main/ipc.ts` registerIpcHandlers 8번째 파라미터로 `usage?: UsageStore`
  추가. AI handler 가 stream pump 안에서 fire-and-forget 으로 usage 기록.
- `src/main/index.ts` SessionStore 의 동일 connection 으로 UsageStore 인스턴스
  생성 + registerIpcHandlers 에 전달.
- `src/renderer/components/sidebar/Sidebar.tsx` `onOpenUsage` prop + 새 nav
  항목 (testId: `sidebar-open-usage`).
- `src/renderer/App.tsx` `usageSettingsOpen` state + Sidebar wire-up +
  `<UsageSettings>` mount.

### Tests

- 새 vitest: 797 → **890 tests pass** (+93 new — translator 회귀 테스트도 포함).
  - `tests/providers/pricing.test.ts` (15 tests) — lookup / estimate /
    rounding / cache rate fallback.
  - `tests/storage/UsageStore.test.ts` (25 tests) — migration 003 + record /
    summary 필터 / daily totals / append-only 불변.
  - `tests/providers/cli/translate.test.ts` (+8 tests) — Claude usage from
    assistant + result; Codex usage from turn.completed.
  - `tests/main/ipc.usage.test.ts` (15 tests) — 3개 channel Result wrapping +
    Zod validation + error 직렬화 + UsageStore 미주입 시 channel 미등록.
  - `tests/renderer/useUsage.test.ts` (8 tests) — hook fetch / preset
    전환 / error / refresh / rangeFromPreset.
  - `tests/renderer/UsageSettings.test.tsx` (10 tests) — render /
    빈 상태 / 합계 표 / 일별 표 / preset 전환 / 새로고침 / cost 포맷팅.
  - `tests/renderer/Sidebar.test.tsx` (+3 tests) — 사용량 버튼 조건부 렌더 +
    클릭 → callback.
- `tests/setup.ts` — `usage` namespace mock 추가 (summary / daily / bySession).
- typecheck: 0 errors / lint: 0 errors / 기존 e2e 영향 없음.

### Out of scope (별도 issue, v0.5.0+)

- E2E test (현재 manual smoke 로 검증 — `npm run dev` → 채팅 → DB 확인).
- 차트 (sparkline / bar chart) — 표만으로 v0.4.0 충분 검증.
- CSV / JSON export — 데이터 소유권 강화는 v0.5.0+.
- 영어 i18n — 별도 작업으로 분리.
- 가격 자동 동기화 — 현재 hardcoded, 변경 시 pricing.ts 수정 필요.
- Live cost streaming — 현재 turn 종료 후 1건만 영속.

### Migration notes

- 기존 SQLite DB 자동 v3 으로 마이그레이션 (idempotent — IF NOT EXISTS).
- 기존 IPC channel 변경 X — 추가만 발생.
- 가격이 없는 모델은 cost=0 으로 기록되지만 token 은 정상 누적 — 향후
  pricing.ts 에 추가하면 재계산은 별도 작업 필요 (당장은 미지원).

[0.4.0]: https://github.com/eonofpixel/dreampia-dev/releases/tag/v0.4.0

## [0.3.0] — 2026-05-03

**Feature release — Onboarding 5-step wizard polish.**

Codex (read-only audit) 권고 v0.3.0. 기능 추가가 아니라 "처음 켰을 때 성공" 비율
을 끌어올리는 첫 사용자 경험 polish. v0.2.0 의 MCP Bridge 위에 사용자 진입 부분
을 다듬어 10-30 명 초기 사용자 funnel 의 가장 큰 병목 (= empty chat 에서 무엇을
할 지 모름) 을 해소.

### Added

- **WelcomeMessage 통합** — 빈 채팅에 진입하면 ChatPanel 의 MessagesArea 가
  WelcomeMessage 를 자동 렌더. 이전엔 빈 turn 배열 → `null` 렌더로 화면이 비어
  사용자가 "뭘 해야 하지?" 상태였음. 이제 환영 인사 + 3개 추천 prompt chip 표시.
- **SuggestionChip onClick** — WelcomeMessage 의 chip 클릭 시 즉시 `onSubmit`
  호출 (wizard FirstChatStep 와 달리 사용자가 이미 채팅 안이라 submit-on-click
  이 자연스러움). 3개 추천: "이 프로젝트 구조 분석해줘" / "최근 변경 사항 리뷰" /
  "테스트 통과시키기".
- **온보딩 다시 보기 진입점** — Sidebar 하단에 [온보딩 다시 보기] 버튼 추가.
  클릭 시 `app:reset-onboarding` IPC → `settings.onboarding_completed=false`
  영속 → `useOnboarding.reset()` 가 in-memory state 도 토글 → wizard 가 다시
  mount. 다른 settings (workspace_root 등) 는 보존.
- **wizard Step 3 — Provider 선택** — AuthGuideStep 에 4개 옵션 라디오 그룹
  (자동 / Claude CLI / Codex CLI / Mock). CLI 미감지 옵션은 disable + "감지 안 됨"
  뱃지. 선택 즉시 `app:set-default-provider` IPC.
- **wizard Step 4 — Permission preset 선택** — WorkspaceStep 에 3개 옵션 라디오
  그룹 (read_only / workspace_write 권장 / full_access). 한국어 라벨은
  `PERMISSION_LEVEL_LABELS_KO` 재사용. 선택 즉시 `app:set-default-permission-level`
  IPC.
- **auto.ts userDefaultProvider override** — `getDefaultProvider` 시그니처에
  5번째 옵션 파라미터 추가. wizard 에서 사용자가 'claude' / 'codex' / 'mock' 를
  명시 선택했고 해당 CLI 가 감지된 경우 model-prefix routing 보다 우선. 'auto'
  나 미지정 시 종전 동작.
- **createDemoSession defaultPermissionLevel** — 새 세션의 `permission.default_level`
  이 더 이상 hardcoded 'workspace_write' 가 아니라 `app:get-default-permission-level`
  결과를 inherit. wizard 에서 변경한 값이 다음 세션부터 즉시 반영.
- **5개 신규 IPC channel (모두 `app:*` namespace)**:
  - `app:reset-onboarding` — 다른 settings 는 보존하고 onboarding_completed 만 reset
  - `app:get-default-provider` / `app:set-default-provider` — 사용자 provider
    선호 (Zod enum 검증)
  - `app:get-default-permission-level` / `app:set-default-permission-level` —
    권한 preset (Zod PermissionLevelSchema 검증)
- **`useOnboarding.reset()` API** — Sidebar 의 [온보딩 다시 보기] 가 직접 호출.
  IPC 미존재 (vitest 격리) 시에도 in-memory 만 토글하여 안전 fallback.

### Changed

- `package.json`: `0.2.0` → `0.3.0` (minor bump for new feature).
- `src/main/settings.ts` AppSettings 에 `default_provider` / `default_permission_level`
  필드 추가. 알 수 없는 값은 silent drop (graceful degradation).
- `src/main/preload.ts` whitelist 에 5개 새 IPC channel + `app` namespace 5개
  메서드 추가 (sandbox-safe inline shape).
- `src/renderer/App.tsx` `defaultPermissionLevel` state 추가 + wizard 완료 시
  re-fetch 후 새 session 에 반영. Sidebar 에 `onReopenOnboarding` 연결.

### Tests

- 새 vitest: 745 → **797 tests pass** (+52 new).
  - `tests/main/settings.test.ts` (13 tests) — default_provider /
    default_permission_level read/write/validation/graceful degradation.
  - `tests/main/ipc.workspace.test.ts` (+13 tests) — 새 5개 IPC channel +
    Zod validation + Result wrapping.
  - `tests/renderer/ChatPanel.streaming.test.tsx` (+6 tests) — WelcomeMessage
    렌더 + 3개 chip + onClick → onSubmit 위임 + workspaceName fallback.
  - `tests/renderer/OnboardingWizard.test.tsx` (+8 tests) — provider /
    permission selector 렌더 + IPC 호출 + 초기값 fetch + CLI 미감지 disable.
  - `tests/providers/auto.test.ts` (+5 tests) — userDefaultProvider override
    + claude/codex/mock 강제 + auto fallback + CLI 미감지 시 model-prefix
    routing 으로 fallback.
  - `tests/renderer/Sidebar.test.tsx` (+3 tests) — [온보딩 다시 보기] 버튼
    조건부 렌더 + 클릭 → callback 호출.
  - `tests/renderer/useOnboarding.test.ts` (+3 tests) — reset() 동작 + IPC
    호출 + IPC 미존재 시 in-memory fallback.
- 새 e2e: `e2e/first-chat.spec.ts` (3 tests) — fresh profile → wizard 5단계
  통과 + WelcomeMessage chip → streaming 응답 + Sidebar 의 reopen.
- typecheck: 0 errors / lint: 0 errors / 기존 e2e 영향 없음.

### Out of scope (별도 issue, v0.4.0+)

- MCP server 상태 step (대부분 fresh 사용자가 0 MCP server — 가치 낮음)
- Wizard step 재구조 (위험 큼)
- Cross-AI verify / compare (별도 feature)
- Cost tracking dashboard
- 영어 i18n

### Migration notes

- 기존 settings.json 호환 — `default_provider` / `default_permission_level` 미존재
  시 'auto' / 'workspace_write' 자동 적용 (silent fallback).
- 기존 IPC channel 변경 X — 추가만 발생.
- 기존 세션의 `permission.default_level` 보존 — 새 default 는 신규 세션부터 적용.

[0.3.0]: https://github.com/eonofpixel/dreampia-dev/releases/tag/v0.3.0

## [0.2.0] — 2026-05-02

**Feature release — MCP Bridge MVP (Issue #5).**

`Model Context Protocol` 서버를 stdio 로 spawn 하고, 그 서버의 도구를 Dreampia
의 `ToolQueue` 가 자체 도구처럼 호출할 수 있는 첫 번째 통합. v0.1.x 의 모든
hardening 기반 위에 v0.2 의 핵심 신기능을 추가.

### Added

- **`src/main/mcp/McpClient.ts`** — 단일 MCP 서버용 stdio JSON-RPC 2.0 클라이언트.
  - `initialize` → `notifications/initialized` → `tools/list` handshake
  - `tools/call` (요청 단위 30s timeout)
  - `shutdown` notification + SIGTERM (1s grace) → SIGKILL fallback
  - non-JSON line silent skip (Codex MCP parser 버그 회피)
  - stderr / non-JSON stdout 을 ring buffer (50줄) 로 보관 → 사용자 진단용
  - exit listener 가 pending request 들을 모두 reject (hang 방지)
- **`src/main/mcp/McpManager.ts`** — 다중 MCP 서버 라이프사이클 + ToolRegistry 통합.
  - `addServer` / `removeServer` / `restartServer` / `loadFromSettings`
  - 서버 1개의 `tools/list` 결과를 `mcp.{server_id}.{tool_name}` 형식으로
    `ToolRegistry` 에 등록 (mcp-bridge.md INV-2 적용)
  - 모든 wrapper Tool 은 `required_capabilities = ['NETWORK_MCP']` +
    `permission_target = { kind:'global', value: server_id }` 반환 → 사용자가
    서버 단위로 grant 부여 가능 (Resolver 통합)
  - `tools-updated` 이벤트마다 registry 재동기화 (unregister → register)
- **`src/types/mcp.ts`** — `McpServerConfig` (Zod), `McpServerStatus`,
  `McpToolInfo`, `McpServerState`, JSON-RPC envelope 타입.
- **`src/main/settings.ts`** — `mcp_servers` 영속 (Zod 검증, 손상 항목 silent drop).
- **IPC handlers (5)**: `mcp/list`, `mcp/add`, `mcp/remove`, `mcp/restart`,
  `mcp/get-logs`. 모두 `Result<T>` wrapping + Zod validation.
- **`src/renderer/hooks/useMcp.ts`** — IPC bridge React hook (refresh / add /
  remove / restart / getLogs + loading + error state).
- **`src/renderer/components/settings/McpSettings.tsx`** — 설정 모달.
  - 서버 목록 (status badge / 도구 개수 / pid / last_error)
  - 추가 폼 (id / name / command / args / env / cwd / enabled)
  - [재시작] / [제거] / [로그 보기] 버튼 + 로그 modal
- **Sidebar**: `[설정]` 클릭 시 `McpSettings` modal 열림 (`onOpenSettings` prop).

### Changed

- `package.json`: `0.1.3` → `0.2.0` (minor bump for new feature).
- `src/main/preload.ts`: 5 MCP IPC channel + `mcp` namespace 노출 (sandbox-safe
  inline shape).
- `src/main/index.ts`: 부팅 시 `McpManager.loadFromSettings()` 자동 호출 +
  `app.before-quit` 시 모든 child process 정리.

### Tests

- `tests/main/mcp/McpClient.test.ts` (12 tests) — handshake / non-JSON skip /
  stderr / timeout / abort / exit cleanup.
- `tests/main/mcp/McpManager.test.ts` (12 tests) — settings 영속 / Tool 등록 /
  remove / restart / disabled skip / failed start / shutdown.
- `tests/main/ipc.mcp.test.ts` (15 tests) — 5 IPC channel 의 Result wrapping +
  Zod 검증 + 에러 직렬화.
- `tests/renderer/useMcp.test.ts` (7 tests) — refresh / add / remove / restart /
  getLogs hook 동작.
- `tests/renderer/McpSettings.test.tsx` (12 tests) — modal smoke + form submit /
  validation / 로그 보기.
- 합계: 687 → **745 tests pass** (+58 new).
- typecheck: 0 errors / lint: 0 errors / e2e 영향 없음.

### Out of scope (별도 issue)

- HTTP/SSE transport (stdio 만 지원)
- OAuth 흐름
- Resources / Prompts (tools 만)
- Sampling 통합
- MCP server 자동 discovery (수동 add only)
- 설치 안내 wizard (Phase 4)
- JSON Schema → Zod 변환 (P2 — input_schema 는 현재 `z.unknown()`)

### Migration notes

- 신기능 only — 기존 워크스페이스 / 세션 / 권한 grant 호환.
- `settings.json` 에 `mcp_servers` 필드가 없는 경우 빈 배열로 자동 채움.
- 손상된 mcp_servers entry 는 다음 write 시 자동 제거 (graceful degradation).

[0.2.0]: https://github.com/eonofpixel/dreampia-dev/releases/tag/v0.2.0

## [0.1.3] — 2026-05-03

**Hardening release — Codex 권고 v0.1.3 Early adopter hardening (3 issues).**

Patch release. 새 기능 X. release pipeline 신뢰도 + 첫 사용자 onboarding 자동화.

### Added

- **Issue #2**: `scripts/extract-release-notes.cjs` — CHANGELOG.md 의
  버전 섹션을 자동 추출하여 GitHub Release notes 로 사용. release.yml
  publish job 이 더 이상 'Auto-generated' 메모만 쓰지 않고, 이 변경
  로그가 release 페이지에 그대로 표시됨.
- **Issue #3**: release.yml 의 publish job 에 `Verify asset completeness`
  step 추가. 8개 필수 artifact (Win exe + macOS x64/arm64 dmg + Linux
  AppImage/.deb + 3 latest*.yml) 누락 시 publish 차단 + `::error::` 주석.
  v0.1.0 macOS 누락 같은 partial release 재발 방지.
- **Issue #4**: `.github/ISSUE_TEMPLATE/smoke-matrix.md` 신규.
  10-30명 초기 사용자가 같은 형식으로 결과 보고 → v0.1.x patch
  우선순위 결정 빠름. 6 단계 체크리스트 (설치 → Onboarding →
  첫 채팅 → Tool → BrowserView → 자동 업데이트).

### Tests

- 새 vitest 3개 (extract-release-notes): 684 → 687 tests pass.

### Distributed Artifacts

v0.1.2 와 동일 5 OS — release pipeline 변경 외 source 영향 X.

- ✅ Linux AppImage (`Dreampia-Dev-0.1.3-x86_64.AppImage`)
- ✅ Linux Debian (`Dreampia-Dev-0.1.3-amd64.deb`)
- ✅ Windows NSIS (`Dreampia-Dev-Setup-0.1.3-x64.exe`)
- ✅ macOS Intel (`Dreampia-Dev-0.1.3-x64.dmg`)
- ✅ macOS Apple Silicon (`Dreampia-Dev-0.1.3-arm64.dmg`)

[0.1.3]: https://github.com/eonofpixel/dreampia-dev/releases/tag/v0.1.3

## [0.1.2] — 2026-05-03

**Hardening release — dev DX (ABI 자동 토글) + branded icons.**

### Added

- `scripts/ensure-abi.cjs`: better-sqlite3 native binding 의 현재 ABI
  검증 + 필요 시 자동 rebuild. Smart skip (이미 일치하면 ~100ms).
- `scripts/generate-icons.cjs`: SVG → PNG (1024×1024) + ICO (multi-size)
  cross-platform 생성 (`@resvg/resvg-js` + `png-to-ico`). macOS ICNS 는
  electron-builder 가 PNG 로부터 자동 변환.
- `build/icon.png` (180 KB) — Linux + macOS source.
- `build/icon.ico` (370 KB) — Windows multi-size (16/32/48/64/128/256).
- `package.json` scripts: `predev` / `pretest` (자동 ABI 토글) +
  `icons:generate` (SVG 변경 시 manual 재생성).
- `electron-builder.yml`: `win.icon` / `mac.icon` / `linux.icon` 명시
  (이전엔 default Electron icon fallback).

### Changed

- **Dev DX**: 사용자가 더 이상 `npm run dev:rebuild` / `test:rebuild` 수동
  호출 안 함. `npm run dev` / `npm test` / `npm run pretest:e2e` 가
  자동으로 ABI 보장 (smart skip — 이미 맞으면 50ms 추가만).
- ESLint config: `scripts/**/*.cjs` 용 CJS globals 블록 추가
  (`__dirname` / `require` / `module` 인식).

### Distributed Artifacts

v0.1.1 와 동일 5 OS — 모든 빌드에 새 branded icon 포함:

- ✅ Linux AppImage (`Dreampia-Dev-0.1.2-x86_64.AppImage`)
- ✅ Linux Debian (`Dreampia-Dev-0.1.2-amd64.deb`)
- ✅ Windows NSIS (`Dreampia-Dev-Setup-0.1.2-x64.exe`) — branded icon
- ✅ macOS Intel (`Dreampia-Dev-0.1.2-x64.dmg`) — branded icon
- ✅ macOS Apple Silicon (`Dreampia-Dev-0.1.2-arm64.dmg`) — branded icon

### Internals

- 새 dep: `@resvg/resvg-js@^2.6.2` (Rust-based SVG 렌더러), `png-to-ico@^3.0.1`
  (둘 다 devDependencies)
- ensure-abi.cjs 의 Windows EPERM 회피: child process 에서 `require(binding)`
  검증 후 즉시 종료 (parent 의 lock 해제)

[0.1.2]: https://github.com/eonofpixel/dreampia-dev/releases/tag/v0.1.2

## [0.1.1] — 2026-05-03

**Hardening release — macOS DMG 추가 + 운영 장치.**

### Fixed

- **Issue #1**: macOS DMG publish race condition. 3 OS matrix 가 동시에
  GitHub Releases create 시도 → 422 already_exists 로 macOS 누락.
  release.yml 을 2-stage 파이프라인 (build matrix `--publish never` →
  단일 publish job 이 atomic Release 생성) 으로 재작성. v0.1.1-rc1 dry-run
  으로 macOS DMG x64 + arm64 둘 다 release 에 업로드되는 것 검증.

### Added

- `.github/ISSUE_TEMPLATE/`: 4 template (bug-report / install-problem /
  feedback / config). Discussions 링크 포함.
- GitHub Labels (10): platform (windows/linux/macos) + 영역 (installer /
  cli-detection / onboarding / browser-view / permission / feedback / v0.1.1).
- Milestone `v0.1.1 Hardening` (#1).
- `.gitignore`: `.omc/` `.omx/` (Claude Code 멀티에이전트 runtime).

### Distributed Artifacts

- ✅ Linux AppImage (`Dreampia-Dev-0.1.1-x86_64.AppImage`)
- ✅ Linux Debian (`Dreampia-Dev-0.1.1-amd64.deb`)
- ✅ Windows NSIS (`Dreampia-Dev-Setup-0.1.1-x64.exe`)
- ✅ **macOS Intel** (`Dreampia-Dev-0.1.1-x64.dmg`) — v0.1.0 누락 fix
- ✅ **macOS Apple Silicon** (`Dreampia-Dev-0.1.1-arm64.dmg`) — v0.1.0 누락 fix

[0.1.1]: https://github.com/eonofpixel/dreampia-dev/releases/tag/v0.1.1

## [0.1.0] — 2026-05-03

**첫 unsigned early adopter build (Linux + Windows only).**

> macOS DMG 는 v0.1.1 에서 추가 예정 (publish race condition fix 대기).
> Phase 1 + Phase 2 + Phase 3 B1/B2 완료. Codex audit GO 판정.

### Distributed Artifacts

- ✅ Linux AppImage (`Dreampia-Dev-0.1.0-x86_64.AppImage`)
- ✅ Linux Debian (`Dreampia-Dev-0.1.0-amd64.deb`)
- ✅ Windows NSIS (`Dreampia-Dev-Setup-0.1.0-x64.exe`)
- ⏳ macOS DMG — v0.1.1 예정 (race condition fix 후)

### Added

- **Phase 1 P0 백엔드 (5 commits)**:
  - PM-3 Permission Resolver (5단계 우선순위 + 30+ 위험 패턴)
  - SS-4 SessionStore (better-sqlite3 + WAL + 마이그레이션 v1/v2)
  - SS-6 Provider Adapter (Claude/Codex/Mock streaming)
  - TO-4 Tool Queue + shell.run + permission 통합
  - ChatPanel streaming UI (▋ 펄싱 + char-by-char + auto-scroll)
- **Phase 1 P1 production wiring (6 commits)**:
  - SessionStore main process IPC 통합
  - Tool result inline display (ToolCallCard 5 status)
  - SS-5 Multi-window leader election (heartbeat 5s + TTL 30s)
  - BrowserView (WebContentsView + partition isolation)
  - Real CLI subprocess (Claude/Codex spawn + JSONL parser)
- **Phase 2 검증 + Codex audit fix (10 commits)**:
  - Production build 가능 + Electron 실행
  - Real CLI JSONL 형식 보정
  - Tool IPC handler (AI ↔ ToolQueue 통합)
  - BrowserView URL allowlist
  - Production fail-closed (Mock fallback 차단)
  - Codex CLI --sandbox 매핑 (PermissionLevel chain)
  - Workspace picker (settings 영속)
  - Playwright Electron E2E (smoke + chat + sidebar + browser-view + tool-call + permission)
- **Phase 3 B1 Release 정밀화**:
  - electron-updater 자동 업데이트
  - Win/macOS code-signing secrets 분리
  - App-level 회귀 테스트
- **Phase 3 B2 Onboarding 5-step UI**:
  - Welcome → CLI 감지 → 인증 안내 → workspace 선택 → 첫 채팅
  - 한국어 정중 톤
  - settings.onboarding_completed 영속

### Tests

- 684 vitest unit/integration tests (mocked I/O)
- 19 Playwright Electron E2E tests (real Electron launch)
- 0 typecheck errors / 0 lint errors

### Known Limitations (v0.1.0)

- 첫 release 는 unsigned (Win/macOS code-signing 인증서 필요 — Phase 4)
- 아이콘은 SVG placeholder (디자이너 작업 대기)
- Tool Queue 는 shell.run 만 등록 (다른 built-in tools — Phase 4)
- Plugin / MCP Bridge / Skill Loader 미구현 (Phase 4)
- Annotation 모드 (DOM Inspector) 미구현 (Phase 4)
- Side chat tab fork 미구현 (Phase 4)

### Internals

- Electron 33 + Vite 6 + React 18 + TypeScript 5.6 strict
- Tailwind 3.4 + Pretendard (한국어 우선)
- better-sqlite3 (Node ABI ↔ Electron ABI 토글)
- ESLint 9 flat config + Vitest + Playwright

[0.1.0]: https://github.com/eonofpixel/dreampia-dev/releases/tag/v0.1.0
