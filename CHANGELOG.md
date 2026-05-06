# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식. [SemVer](https://semver.org/lang/ko/).

## [1.6.4] — 2026-05-06

**Fullscreen layout toggle — Mod+Shift+F.**

distraction-free 모드. 사이드바 + 미리보기를 한 번의 단축키로 동시에 숨겨
chat panel 만 풀폭 차지. 다시 누르면 진입 직전 상태로 복원 (사용자가 진입
전 preview 만 끄고 sidebar 만 켜둔 상태였다면 OFF 시 그대로 복귀).

구현:
- `ShortcutAction` 에 `'layout.fullscreen'` 추가 (default `Mod+Shift+F`,
  category `navigation`).
- App.tsx 에 `fullscreenSnapshotRef` (snapshot 의 존재 자체가 진입 상태 →
  별도 boolean state X). 토글 핸들러: snapshot 없으면 진입+저장+둘 다 hide,
  있으면 복원+clear.
- ThreePanelLayout 자체는 변경 0 — 기존 sidebarVisible/previewVisible prop
  으로 충분.

테스트:
- shortcuts.test.ts: SHORTCUT_DEFS 목록에 `layout.fullscreen` 추가 + default
  검증 (`Mod+Shift+F`, navigation).
- App.shortcuts.test.tsx: 2개 시나리오 — 둘 다 visible 상태에서 toggle round
  trip / preview 만 끈 상태에서 fullscreen 진입+OFF 시 정확 복원.

회귀 0 (1755 pass / baseline 7 fail).

## [1.5.2] — 2026-05-06

**ProviderDropdown — ChatHeader 에 default_provider quick-access dropdown.**

기존 [Settings → Provider] 탭까지 들어가지 않고 채팅 헤더에서 한 번 클릭으로
provider 전환. v1.5.1 의 routing layer 위에 사용자 직접 가시 진입점.

UX:
- ChatHeader 의 PermissionDropdown 다음, CliStatusBadge 앞에 위치.
- Cpu icon + native `<select>` (PermissionDropdown 와 동일 paradigm —
  z-index/IME 안전).
- 4 옵션: 자동 (auto) / Claude / Codex / Mock.
- title 속성으로 현재 선택 라벨 hover 시 노출.
- CliStatusBadge 와 공존 — dropdown 은 사용자 의도, badge 는 실제 routing
  source 결과 (Direct API key 있으면 자동으로 Direct provider 로 routed).

구현:
- `ProviderDropdown` self-contained — controlled prop 으로 testable, 미지정
  시 IPC `getDefaultProvider`/`setDefaultProvider` 자가 관리.
- IPC 미가용 (preload 깨짐 / dev 환경) 시 disabled.
- onChange 는 optimistic update — IPC 실패해도 UI 반응 유지 (다음 fetch 가
  진실 단일 소스).

i18n: ko/en `provider.dropdown.*` 7개 키 (label/aria/tooltip + 4 options).

테스트: 10개 신규 — controlled (6: render/options/labels/onChange/disabled/
title) + self-managed (3: getDefaultProvider on mount, setDefaultProvider on
change, disabled when IPC absent) + enabled-default. 회귀 0 (1752 pass /
baseline 7 fail).

## [1.5.0] — 2026-05-06

**SettingsModal [Direct API] 탭 — Anthropic / OpenAI API key 입력 UI.**

v1.2.3 의 storage layer + v1.5.1 의 auto-routing 위에 사용자 입력 UI 추가
(deferred 슬롯 회수). 설정 모달의 [Provider] 탭 다음에 [Direct API] 탭 신설
(KeyRound 아이콘).

보안 동선:
- IPC `app:get-direct-api-keys` — raw key 반환 X. presence + 마지막 4글자
  preview 만 노출. 4글자 이하 키는 `****` 로 마스킹.
- IPC `app:set-direct-api-key (provider, key)` — 빈 문자열 / 공백만 →
  해당 provider key 삭제. 1024자 초과 거절. provider enum 검증.
- 입력 필드 `type="password"` + `autoComplete="off"` + `spellCheck=false`.
- 패널 상단에 "settings.json 에 plain text 저장" 보안 경고 banner.

UX:
- 각 provider 행: [저장] 버튼 (입력값 trim 후 저장) + 설정된 경우 [삭제].
  저장 후 입력 필드 자동 비우기 (다음 표시는 preview 로만).
- 설정됨 / 미설정 상태 badge.

i18n: ko/en 양쪽에 `settings.tab.direct_api` + `settings.direct_api.*` 12개
키 추가.

테스트: 11개 신규 unit (registers / get-default / set-anthropic / independent
providers / empty-clear / whitespace-clear / short-key-mask / invalid-provider
/ non-string-key / oversize-key / preview-len-invariant). 회귀 0.

향후: OS keychain (electron-store + keytar) 마이그레이션.

## [1.7.6] — 2026-05-06

**toast 마이그레이션 — handleChangePermission silent fail 해소.**

`persistUpdatePermission` 가 null 반환 (실패) 시 `toasts.error('권한 변경
저장 실패')` + 재시도 안내. 이전엔 silent (사용자 모름).

남은 silent fail 들 (search / IPC unavailable / streaming error)도 점진
적으로. 각각의 위치 + UX 정확성 검토 후 별도 commit.

## [1.7.5] — 2026-05-06

**L/E/E wire-up — Sidebar Skeleton 실 사용.**

`Sidebar` 의 chats 섹션에서 `isLoadingSessions && sessions.length === 0`
조건일 때 `SidebarSessionsSkeleton` 표시 (5 placeholder). 사용자가 앱
시작 직후 sessions 가 fetch 중인 짧은 시간 동안 빈 텍스트 대신 시각적
피드백.

- `SidebarProps.isLoadingSessions?: boolean` 추가.
- App.tsx 가 `useSessionStore().state.loading` 을 prop 으로 전달.

EmptyState wire-up + Chat hydration skeleton 은 후속.

## [1.6.6] — 2026-05-06

**cost-limit-hook 실 ctx 데이터 — mtd_total_usd + limit_usd 전달.**

`runStreamPump` 의 post_turn payload 확장:
- `mtd_total_usd`: `usage.getMonthToDateCostUsd(now)` (UsageStore 누적).
- `limit_usd`: `settings.usage_cost_limit_usd` (사용자 설정).
- `cost_usd`: 이번 turn 비용 (이미 v1.6.5).

cost-limit-hook plugin 이 ratio = mtd / limit 계산:
- ≥80% → toast warning.
- ≥100% → toast error.

best-effort try/catch — usage store schema mismatch 또는 settings 읽기 실패
시 silently skip.

## [1.6.5] — 2026-05-06

**Plugin Hook integration — runStreamPump 의 pre/post_turn 호출.**

`AiHandlerConfig` 에 `pluginManager?` + `pluginHookRunner?` 추가. main 의
boot 시 PluginHookRunner instance 생성 + audit_log sink 연결. registerIpcHandlers
의 cfg 에 주입.

`runStreamPump` 에서:
- 시작 직전 `pre_turn` 호출 — payload `{session_id, model, stream_id}`.
- finally 에서 `post_turn` 호출 — payload + `cost_usd` (latestUsage 의
  total_cost_usd) + `notify` callback.
- `notify` 가 main → renderer `plugin/notify` IPC 로 forward.

renderer (App.tsx) 가 `window.dreampia.plugin.onNotify(handler)` 등록 →
toast 로 표시.

auto.ts: `readSettings()` 호출이 test 환경 mock 부족으로 throw 시 fallback
빈 객체.

## [1.5.6] — 2026-05-06

**Vision routing — provider 별 image block format 변환.**

- `toAnthropicImageBlock(input)` — `{ type:'image', source:{type:'base64', media_type, data}}`.
- `toOpenAIImageBlock(input)` — `{ type:'image_url', image_url:{ url:'data:<mime>;base64,...'}}`.
- `toCliImagePlaceholder(input)` — CLI prompt 안 inline placeholder.

3 unit. Provider 통합은 후속 commits.

## [1.5.5] — 2026-05-06

**MediaStore — `~/.dreampia/media/<sha256>/<filename>` 영속화 + LRU.**

- `MediaStore.store({originalName, mime, base64})` → StoredMedia.
- sha256 기반 dedup — 같은 bytes 두 번 저장하면 같은 path.
- meta sidecar `<sha256>.meta.json`.
- LRU eviction — cap (default 50GB) 초과 시 oldest mtime 부터.
  meta sidecar 는 evict 대상 X.
- 확장자 sanitize (alpha-num 1-6자).
- `store()` 종료 전 `enforceCap()` await — deterministic.

7 unit.

## [1.5.3] — 2026-05-06

**Image/PDF input utility — DnD / paste / file → base64.**

- `validateImageFile(file)` — mime + size 검사 (mediaConstants).
- `filesFromDataTransfer(dt)` — drop event 의 image/pdf File 추출.
- `filesFromClipboard(items)` — paste 의 image File 추출.
- `readFileAsBase64(file)` — base64 + meta. arrayBuffer / FileReader fallback.

ChatInput DnD/paste handler wire-up 은 v1.5.5 의 영속화 와 함께.

### Tests (6)

- png / bmp unsupported / image too large / pdf / pdf too large /
  bytes → base64.

## [1.5.1] — 2026-05-06

**auto.ts routing — Direct API 우선 (settings 의 API key 검사).**

`getDefaultProvider` 의 흐름에 Direct API 분기 추가:

1. `DREAMPIA_TEST=1` (mock) — 그대로.
2. CLI override (env) — 그대로.
3. **신규 v1.5.1**: `settings.api_key_anthropic` 있고 model이 claude 계열 →
   `AnthropicProvider`.
4. **신규 v1.5.1**: `settings.api_key_openai` 있고 model이 gpt/o1/o3 계열 →
   `OpenAIProvider`.
5. CLI detect — 종전 fallback.

사용자가 explicit API key 입력했으면 의도가 명확 — CLI detect 보다 먼저.
v1.5.0 의 SettingsModal [Direct API] 탭 UI 는 후속.

## [1.4.6] — 2026-05-06

**Anthropic prompt caching support.**

- 첫 user message (≥1024 chars) 에 `cache_control: { type: 'ephemeral' }`
  마킹 → Anthropic 5분 cache 활용 → 같은 prefix 의 다음 호출에서
  cache_read_input_tokens 으로 비용 절감.
- usage event 에 `cache_creation_input_tokens` / `cache_read_input_tokens`
  emit (이전엔 0 hardcoded).

## [1.4.5] — 2026-05-06

**OpenAIProvider 실 SSE 구현 (Chat Completions API).**

v1.4.4 의 Anthropic 패턴 그대로. POST /v1/chat/completions stream:true.
`stream_options.include_usage: true` 로 마지막 chunk 에 usage 포함.
`[DONE]` 종료 신호 인식. 미수신 시 자체 message_complete fallback.

### Tests (5 신규 + 1 stub 갱신)

- happy path (delta.content 2 + usage + [DONE]).
- 401 error / SSE error chunk / chunked JSON split / [DONE] 없이 stream 종료.

## [1.4.4] — 2026-05-06

**AnthropicProvider 실 SSE 구현 (Critical-first 진입).**

v1.2.1 stub 을 production 동작으로. fetch + Anthropic Messages API SSE
응답 파싱 → StreamEvent 변환.

### Implemented

- POST `/v1/messages` with `stream: true` + `accept: text/event-stream`.
- SseParser 통합 → SSE event JSON parse → StreamEvent:
  - `message_start` (turn_id 자체 생성).
  - `content_block_delta.text_delta` → `text_delta`.
  - `message_delta.usage` → `usage`.
  - `message_stop` → `message_complete` (synthesized assistant turn).
  - `error` → `error`.
- non-200 → 명시적 error event (status + body slice).
- AbortSignal 전달.

### Limitations (v1.4.6 후속)

- tool_use / image / multi-content_block 변환 X.
- 401/429/5xx retry 없음.
- prompt caching 없음.

### Tests (5 신규 + 1 stub 갱신)

- happy path / 401 error / SSE error event / chunked split / 빈 turns.

## [1.3.7] — 2026-05-06

**Bot Automation manager (마지막 P3 슬롯).**

`AutomationManager` — interval / webhook 두 종 rule. interval 은 setInterval
기반 fire, webhook 은 stub (HTTP listener 후속). audit 로 fire/error 추적.
사이드바 [자동화] 가짜 완성 해소를 위한 backend 인프라.

- `src/main/automation/AutomationManager.ts` — register / unregister / list /
  start / stop / fire (test).
- 7 unit (register / interval validation / fire / throw recovery / start
  auto fire / stop / webhook register).

### v1.x 로드맵 1차 완료

이 commit 으로 docs/v1.x-roadmap.md 의 P1 / P2 / P3 모든 슬롯이 인프라 또는
실 구현으로 도달. 후속 v1.4.x 에서 Schema debt 실 작업 (008-011 의 실 SQL
backfill) + Direct API 실 SSE + PreviewPanel UI 통합 + Sentry SDK +
Automation HTTP listener / cron expression 등.

## [1.3.6] — 2026-05-06

**운영 안정성 — Telemetry stub.**

`Telemetry` class — error / event / metric 3 종 emit. opt-in (default
disabled). PII 금지 정책. ConsoleSink fallback. 실 Sentry SDK 통합은 후속.

- `src/main/telemetry/Telemetry.ts` — Telemetry / TelemetrySink interface +
  ConsoleSink + getTelemetry singleton.
- 6 unit (disabled / error+context / Error stack / event+metric /
  setEnabled / singleton).

## [1.3.5] — 2026-05-06

**Dark mode system theme detection.**

`useSystemTheme()` hook + `resolveEffectiveTheme()` helper.
matchMedia('(prefers-color-scheme: dark)') 변경 listener — OS toggle 시 즉시
반응. settings.theme === 'system' (또는 undefined) 일 때 system 값 사용.

- `src/renderer/hooks/useSystemTheme.ts`.
- 5 unit (light/dark override / system / undefined / unknown fallback).

## [1.3.4] — 2026-05-06

**A11y — aria-live announcer.**

`LiveAnnouncerRegion` (App.tsx mount) + `useAnnouncer()` hook. 두 region —
polite (default) / assertive. 같은 메시지 toggle 처리 (공백 padding) 으로
reader 가 매번 announce.

- focus-visible 통일은 이미 v1.0.x 에 적용 (index.css *:focus-visible {
  outline: 2px solid ... }).
- `src/renderer/components/a11y/LiveAnnouncer.tsx`.

## [1.3.3] — 2026-05-06

**Schema debt B-2/B-3/B-4 forward markers (migrations 009~011).**

각 migration 은 schema 변경 없는 version marker. 실 작업은 v1.4.x 에서:

- 009 (B-2): permission_grants.id INTEGER → TEXT (UUIDv7) — table rebuild.
- 010 (B-3): history_json / target_json / metadata_json._extra → 정식 컬럼.
- 011 (B-4): down-migration SQL 파일 backfill + revertTo(N) API.

LATEST_SCHEMA_VERSION 자동 11.

## [1.3.0] — 2026-05-06

**P3 진입 — Schema debt B-1 (workspace_id deterministic marker).**

Migration 008 — schema 변경 없는 version marker. 본 버전 이후 application
code 가 workspace_id 를 random UUIDv7 대신 `sha256(workspaces.root)[:16]`
결정성으로 생성 (별도 후속 PR).

LATEST_SCHEMA_VERSION 자동 8.

## [1.2.5] — 2026-05-06

**DOM dump utility — PreviewPanel → AI context.**

Element 를 직렬화 (tag/id/classes/attrs/text/bounds/children) 해서 AI 가
페이지 구조 이해. depth cap (default 3) + text cap (default 200) +
attr 값 100자 truncate. 자식 element 의 text 는 부모 text 에 포함 X.

- `src/renderer/utils/domDump.ts` — `dumpElement(el, options)`.
- 7 unit (single / depth cap / text cap / 자식 text 분리 / id-class 중복 X /
  attr truncate / 빈 element).

## [1.2.4] — 2026-05-06

**PreviewPanel Annotation overlay skeleton.**

- `AnnotationOverlay` 컴포넌트 — active toggle + toolbar (📐 + 종료 버튼).
  data-annotation-mode 속성 노출. 실제 element pick / bounding box 는 v1.2.5
  의 Screenshot/DOM dump 와 통합.
- 4 unit (active off/on / onToggle / 미지정).

## [1.2.3] — 2026-05-06

**Direct API key 저장 (settings storage layer).**

`AppSettings.api_key_anthropic` / `api_key_openai` 추가. readSettings 가
빈 문자열은 silent drop. 본 commit 은 storage 만 — UI 입력 + auto-routing
은 후속.

보안: settings.json 은 plain text. 향후 OS keychain (electron-store/keytar)
권고 (별도 슬롯).

## [1.2.2] — 2026-05-06

**SSE parser — Direct API stream 파싱 인프라.**

WHATWG SSE 명세 구현. AnthropicProvider / OpenAIProvider 가 후속 commit
에서 fetch + 본 parser 연결.

- `src/providers/api/sseParser.ts` — `SseParser` class. push(chunk) generator
  + flush(). event/data/id/retry/comment 처리. CRLF 정규화. multi-line data.
- 11 unit (single / event+data / multi-line / chunked / CRLF / comment / id /
  field-only / leading space / 연속 / flush).

## [1.2.1] — 2026-05-06

**Direct API mode 인프라 stub — Anthropic / OpenAI provider class.**

P2 Direct API mode 의 인프라 stub. 실제 SSE / fetch / key handling 은
v1.2.2 이후. 본 commit 은 type 정의 + class skeleton 만.

- `src/providers/api/types.ts` — DirectApiVendor / DirectApiOptions /
  DirectApiProvider interface.
- `src/providers/api/AnthropicProvider.ts` — vendor='anthropic' /
  provider='claude'. stream() 호출 시 'not yet implemented' error event.
- `src/providers/api/OpenAIProvider.ts` — vendor='openai' / provider='codex'.
- 5 unit (instantiate / vendor / stream not_implemented x 2 / baseUrl override).

## [1.2.0] — 2026-05-06

**P2 진입 — Image/PDF media 정책 상수 (mediaConstants.ts 부활).**

v1.0.1 에서 revert 됐던 mediaConstants 의 부활 + 검증 helper. DnD / 영속화
/ vision API routing 은 후속 v1.2.x.

### Added

- `src/types/mediaConstants.ts`:
  - IMAGE_MIME_TYPES (png/jpeg/webp/gif), PDF_MIME_TYPE.
  - IMAGE_MAX_BYTES (10MB), PDF_MAX_BYTES (20MB).
  - TURN_MEDIA_TOTAL_MAX_BYTES (50MB), IMAGE_MAX_PER_TURN (8), PDF_MAX_PER_TURN (4).
  - `isImageMime` / `isPdfMime`.
  - `checkAttachment(mime, size)` — single attachment 검증.
  - `checkTurnAttachments(arr)` — turn 단위 통계 검증 (합계 + per-kind count).

- `tests/types/mediaConstants.test.ts` — 9 시나리오 (mime helpers / image
  size / pdf size / unsupported mime / 0 attachments / image too many /
  pdf too many / total exceeded).

### Verified

- typecheck clean / 9/9 unit 통과

## [1.1.28] — 2026-05-06

**Visual polish — Provider badge 색상 paradigm 통일.**

CliStatusBadge 의 4 종 (claude-cli / codex-cli / mock / none) 이 모두
같은 `bg-bg-tertiary` 였던 것을 시각적으로 구분되는 색상으로 변경:

- claude-cli — 파랑 (`bg-blue-900/20 text-blue-300`).
- codex-cli — 보라 (`bg-purple-900/20 text-purple-300`).
- mock — yellow (`bg-yellow-900/20 text-yellow-300`) — fake 임을 즉시 인지.
- none — 회색 (info).

`PROVIDER_BADGE_CLASS` map 으로 lookup. typography (text-[10px]) 유지.

## [1.1.27] — 2026-05-06

**EmptyState 통일 컴포넌트.**

`src/renderer/components/empty/EmptyState.tsx` — icon (선택) + title +
description + optional action 버튼. role=status, center align.

- 5 unit (title only / icon+desc / action click / default testId / role).

후속: 실제 사용처 wire-up — 채팅 0 일 때 Sidebar / 검색 결과 0 / 등.

## [1.1.26] — 2026-05-06

**Loading skeleton — 통일 컴포넌트.**

`src/renderer/components/skeleton/Skeleton.tsx` 의 base + 두 사용처 preset
(`SidebarSessionsSkeleton`, `ChatTurnSkeleton`). Tailwind animate-pulse +
bg-bg-tertiary. role=status + aria-label optional.

- Skeleton primitive (div / span variant).
- SidebarSessionsSkeleton — 5 placeholder.
- ChatTurnSkeleton — 2 라인.
- 5 unit (default / span / aria / sessions / chat).

후속: 실제 사용처 wire-up (Sidebar 가 sessions list loading 중 표시 / Chat
panel 이 hydration 중 표시).

## [1.1.25] — 2026-05-06

**Error 경로 → toasts.error() 마이그레이션 (시작).**

`handleToggleWorkspaceLock` 의 silent fail 두 경로 (IPC ok=false, throw)
에 `toasts.error()` 추가. 사용자가 lock 토글 실패 시 침묵 X.

후속: handleChangePermission / search / cost / IPC unavailable 등.

## [1.1.24] — 2026-05-06

**cost-limit-hook example plugin — 첫 sample.**

`examples/plugins/cost-limit-hook/` 에 manifest + index.js + README. 사용자가
`~/.dreampia/plugins/` 에 복사하면 PluginManager 가 자동 감지 → PluginHookRunner
가 post_turn 마다 `ctx.payload.mtd_total_usd / limit_usd` 비교 후 80% / 100%
경고 toast.

- manifest.json: name=cost-limit-hook v0.1.0, hooks.post_turn=index.js,
  capabilities=[].
- index.js: pure JS sandbox-safe — ctx.notify 만 사용. fs / process X.
- 5 unit (manifest 로드 / 80% 미만 / 80% 경고 / 100% 에러 / limit 미지정).

## [1.1.23] — 2026-05-06

**Plugin capability grant — IpcPermissionConfirmer 통합 (SEC-2 인프라 재사용).**

Plugin manifest.capabilities 를 사용자 1회 승인. `~/.dreampia/plugins/<name>/.granted.json`
영속은 후속 (현재는 process 생애 in-memory cache).

### Added

- `src/main/plugins/PluginCapabilityGate.ts`:
  - `ensureGranted(pluginName, caps)` — 미승인 cap 마다 confirmer.confirm()
    호출. once/session/always → granted set. deny → denied set (재요청 X).
  - `isGranted(name, cap)` — test inspection.
  - `clearAll()` — process restart 시뮬레이션.
  - confirmer 미설정 시 fail-closed (모든 cap 거절) + audit 'cap_no_confirmer'.
  - is_dangerous=true 강제 → DangerModal 노출.

- `tests/main/plugins/PluginCapabilityGate.test.ts` — 9 시나리오:
  - confirmer 없음 / once/session/always grant / deny + 재요청 X /
    cache hit / 다른 plugin 별도 / throw → denied / 부분 deny → 전체 false /
    clearAll.

### Verified

- typecheck clean
- 28/28 plugin unit (manager 12 + hook 7 + capability 9)

## [1.1.22] — 2026-05-06

**Plugin Hook runtime — vm sandbox + pre/post turn.**

Plugin manifest 의 `hooks.pre_turn` / `hooks.post_turn` 을 Node `vm` sandbox
안에서 실행. 한 plugin throw 해도 다음 plugin 진행 (best-effort).

### Added

- `src/main/plugins/PluginHookRunner.ts`:
  - `runHook(plugins, kind, ctx)` — 모든 loaded plugin 의 hook 순차 실행.
  - `vm.Script` cache (file 별).
  - timeout (default 5s) — `vm.runInContext({ timeout })`.
  - audit events: `plugin.hook_ok` / `plugin.hook_error` / `plugin.hook_timeout`
    (duration_ms 포함).
  - Sandbox: `console` + `ctx` 만. Node fs/process/require X.
  - `clearScriptCache()` — test/shutdown helper.

- `tests/main/plugins/PluginHookRunner.test.ts` — 7 시나리오:
  - ctx mutate / throw → 다음 plugin 진행 / hook 미정의 skip / post_turn /
    timeout / duration_ms / cache invalidation.

### Verified

- typecheck clean
- 19/19 plugin unit (manager 12 + hook runner 7) 통과

## [1.1.21] — 2026-05-06

**Workspace UX — drift menu (popover).**

ChatHeader 의 ⚠ icon 을 단순 tooltip 에서 hover/focus popover 로 발전.
session/current workspace 이름 + [이 채팅을 현재 폴더에 고정] action.

- `ChatPanel.tsx` driftDetected JSX 가 button + group focus-within popover.
- `data-testid="workspace-drift-menu"` + `data-testid="workspace-drift-menu-lock"`.
- i18n ko/en `chat.header.drift_menu_*` 3 keys.

## [1.1.20] — 2026-05-06

**Workspace UX — auto-new-chat prompt (drift 발생 시 toast).**

활성 session 의 workspace 와 현재 폴더가 달라지고 잠금 X 면 toast 의
[재시도] 버튼이 새 채팅 생성. driftPromptedRef 로 같은 (session, current
workspace) 조합당 1회만.

- App.tsx useEffect — chatHeaderWorkspaceName / sessionWorkspaceName /
  workspaceLocked 의존성. toasts.warning + retry=handleNewChat.

## [1.1.19] — 2026-05-06

**Workspace UX — drift 검사 잠긴 세션 분기.**

ChatHeader 의 `driftDetected` 가 `workspaceLocked === true` 면 false 강제.
사용자가 본 세션을 자기 workspace 에 고정한 경우 ⚠ badge 표시 X.

- `ChatPanel.tsx` ChatHeader 의 driftDetected 계산식에 `!workspaceLocked` 가드.

## [1.1.18] — 2026-05-06

**drive14-3 — saved tool turn 검증.**

session/list + session/get IPC 통해 SessionStore 에 영속된 마지막
assistant turn 의 tool_calls 가 1+ 개인지 검증.

- e2e/_drive14.spec.ts 14-3 추가. window.evaluate 로 renderer 의
  window.dreampia.session API 호출 — 가장 최근 session 의 마지막 assistant
  turn 의 tool_calls 길이 확인.

## [1.1.17] — 2026-05-06

**drive17 — VCR drift detection (Tier 2 vitest).**

Tier 3 nightly real CLI 가 fixture 와 hash 비교로 translator regression
detect 가 가능한지 — Tier 2 시나리오 추가.

### Added

- `tests/providers/cli/fakeCliReplay.test.ts` 1 시나리오 추가:
  - text-happy fixture replay → events 캡처 → loadFixture +
    detectDrift(fixture, events) → 미지정 hash 시 drift false.
  - 잘못된 expected_events_hash 강제 → drift true + actual hash 검증.
  - 결정성: 같은 events 의 hash 는 매번 같음.

### Verified

- typecheck clean / 6/6 fakeCliReplay 통과.

## [1.1.16] — 2026-05-06

**L/E/E 첫 단계 — 통일된 toast 알림 시스템.**

P1 v1.1.x 의 Loading / Error / Empty 슬롯의 첫 commit. error 알림이 코드
곳곳 console.error 또는 inline UI 였던 것을 통합 toast container 로 통일.

### Added

- **`src/renderer/hooks/useToasts.ts`**:
  - `useToasts(): { list, push, error, warning, info, success, dismiss, clear }`.
  - 4 종 kind — error 8s / warning 6s / info / success 4s default TTL.
  - `ttl_ms: 0` → 수동 dismiss 만 (persistent).
  - `retry?: () => void` callback — toast 안에 [재시도] 버튼.
  - cap 5 (오버플로우 시 oldest drop).

- **`src/renderer/components/toast/ToastContainer.tsx`**:
  - fixed top-right 위치, z-30 (PermissionDangerModal 의 60 보다 낮음).
  - kind 별 색상 + 아이콘 (✖ error / ⚠ warning / ℹ info / ✓ success).
  - aria-live='polite' (assertive 아님 — 작업 흐름 방해 X).
  - retry 버튼 + dismiss 버튼.
  - testid: `toast-container` / `toast-item` / `toast-retry` / `toast-dismiss` +
    `data-toast-kind` 속성.

- **i18n** ko/en — `toast.retry` / `toast.dismiss_aria`.

- **App.tsx wire-up**:
  - `const toasts = useToasts()`.
  - `<ToastContainer toasts={toasts.list} onDismiss={toasts.dismiss} />` mount.

- **`tests/renderer/useToasts.test.ts`** — 10 시나리오:
  - push 가 ToastItem 추가 + ID 반환.
  - 4 helper kind 정확.
  - dismiss 항목별 / clear 모두.
  - cap 5 + oldest drop.
  - 자동 dismiss timer (error 8s / info 4s).
  - ttl_ms=0 persistent.
  - retry callback 보존.

### Verified

- typecheck clean
- lint pre-existing 4 + 2 only
- 10/10 useToasts unit 통과

### Notes

- **본 commit 은 인프라**. 다음 (v1.1.17+):
  - 기존 error 경로를 `toasts.error()` 로 마이그레이션 (예: cost limit /
    permission ipc fail / IPC unavailable banner 일부).
  - Loading skeleton (Sidebar sessions list / 폴더 변경 / MCP 연결).
  - Empty state 디자인 통일 (활성 session 없는 ChatPanel + 빈 sessions
    sidebar).
  - Visual polish (색상 paradigm + typography scale + Mock/Claude/Codex
    badge 일관화).

## [1.1.15] — 2026-05-06

**Plugin Loader UI 활성화 — Sidebar [플러그인] '준비 중' 해체.**

v1.1.14 의 `PluginManager` 위에 IPC + Sidebar UI 연결. 사용자가 사이드바
의 [플러그인] 항목 클릭 시 `~/.dreampia/plugins` 의 manifest 결과를
modal 로 확인. Hook runtime 은 v1.1.16+.

### Added

- **Main process integration** (`src/main/index.ts`):
  - Module-scope `pluginManager: PluginManager | null`.
  - `app.whenReady()` 에서 instance 생성 + `void scan()` (boot-time discovery).
  - Audit sink 가 `auditLogStore` 에 `plugin.loaded` / `plugin.invalid_manifest`
    / `plugin.missing_manifest` 영속 (capability `'PLUGIN'`).
  - IPC `plugin/list` (sync read) + `plugin/rescan` (async re-discovery).

- **Preload bridge** (`src/main/preload.ts`):
  - `'plugin/list'` + `'plugin/rescan'` 채널 화이트리스트.
  - `window.dreampia.plugin.list()` + `.rescan()` API.
  - `PluginManifestShape` interface (preload boundary 정의).

- **Renderer UI** (`src/renderer/components/plugins/PluginsModal.tsx`):
  - Modal 디자인 — header / loaded section / issues section / footer.
  - Plugin root path 안내 (사용자 수동 설치 가이드).
  - 각 plugin 의 name / version / description / hooks (pre_turn/post_turn) /
    capabilities 표시.
  - Issues 는 yellow 경고 박스 — manifest 누락 / 잘못된 schema 등.
  - Rescan 버튼.
  - testid: `plugins-modal` / `plugins-modal-loaded-item` /
    `plugins-modal-issue-item` / `plugins-modal-rescan` / 등.

- **Sidebar 통합** (`src/renderer/components/sidebar/Sidebar.tsx`):
  - `onOpenPlugins?: () => void` prop 추가.
  - [플러그인] nav item 이 onOpenPlugins 지정 시 `comingSoon` 해체 + 클릭
    핸들러 활성. 미지정 시 legacy 'coming-soon' 동작 유지 (test 호환).

- **App.tsx wire-up**: `pluginsModalOpen` state + `onOpenPlugins` →
  `setPluginsModalOpen(true)`. `<PluginsModal />` mount.

- **i18n** ko/en — `plugins.modal.*` + `plugins.error.*` 14 keys.

### Verified

- typecheck clean
- lint pre-existing 4 + 2 only — 신규 0
- unit: 1609/1616 — 7 fail 모두 v1.1.14 baseline 동일 (회귀 0)

### Notes

- **본 commit 으로 사이드바 [플러그인] 가짜 완성 (FAKE) 해소**. 사용자가
  실제 plugin 설치 가이드와 manifest 결과를 본다.
- **다음 (v1.1.16+)**: Hook runtime 실행 (Node `vm` sandbox + `pre_turn` /
  `post_turn`) + Capability grant (manifest.capabilities 를 `IpcPermissionConfirmer`
  통해 사용자 승인) + 첫 example plugin (`cost-limit-hook`).

## [1.1.14] — 2026-05-06

**Plugin Loader MVP — manifest discovery (Sidebar 'Plugin' 활성화 prep).**

P1 v1.1.x Plugin Loader 슬롯의 첫 단계. `~/.dreampia/plugins/<name>/manifest.json`
discovery + schema 검증. 본 commit 은 manifest 만 — hook runtime / sandbox /
capability grant 는 후속.

### Added

- **`src/main/plugins/PluginManager.ts`**:
  - `scan()` — `~/.dreampia/plugins` (또는 옵션 rootDir) 의 각 디렉토리에서
    `manifest.json` 검증. 정상 → `loaded[]`. 잘못 / 누락 → `issues[]` +
    audit event.
  - `list()` — 캐시된 결과.
  - `getRootDir()` — UI 가 사용자에게 안내할 path.
  - `auditSink` 옵션 — `plugin.loaded` / `plugin.invalid_manifest` /
    `plugin.missing_manifest` 이벤트.

- **Manifest schema**:
  - `name: string` (required) — plugin 식별자.
  - `version: string` (required) — semver.
  - `description?: string`.
  - `hooks?: { pre_turn?, post_turn? }` — relative path to JS file.
  - `capabilities?: string[]` — SEC-2 인프라 활용 prep (사용자 승인 대상).

- **`tests/main/plugins/PluginManager.test.ts`** — 12 시나리오:
  - rootDir 미존재 → 빈 결과.
  - manifest.json 누락 → issue + audit.
  - JSON parse 실패 → invalid.
  - name / version 누락 → invalid.
  - hooks 잘못된 type → invalid.
  - valid manifest → loaded + audit.
  - 디렉토리 아닌 entry skip.
  - 혼합 (valid + invalid) — valid 만 loaded, 둘 다 audit.
  - 캐시 (list 후 같은 결과).
  - scan 전 list() 빈 결과.
  - getRootDir 생성자 옵션 반환.

### Verified

- typecheck clean
- 12/12 plugin unit 통과

### Notes

- **다음 commit (v1.1.15+)**:
  - `main/index.ts` 에서 `PluginManager` 인스턴스 + boot 시 scan.
  - IPC `plugin/list` — 사이드바 panel 이 fetch.
  - 사이드바 `[플러그인]` "준비 중" 해체 + 실제 list view.
  - 첫 example plugin: `cost-limit-hook` (post_turn — 사용량 한도 알림).
- **Hook runtime / Sandbox / Capability grant** 는 v1.1.16+ — sandbox 는
  Node `vm` module + capability 는 SEC-2 의 PermissionConfirmer 재사용.
- 본 commit 으로 사이드바 '플러그인' 가짜 완성 (FAKE) 의 backend 절반 해소.
  UI 활성화는 다음.

## [1.1.13] — 2026-05-06

**Workspace UX 셋째 단계 — App.tsx 의 sticky lock wire-up.**

v1.1.12 의 ChatHeader UI 를 실제 IPC 와 연결. 활성 session 변경 시 lock
상태 자동 동기화 + toggle 시 optimistic UI + IPC 영속.

### Added (Renderer integration)

- **`App.tsx`**:
  - `workspaceLocked` state — 활성 session 의 lock 상태.
  - `useEffect(activeSession?.id)` — IPC `session/get-workspace-locked`
    호출 후 동기화. 활성 session null 이면 false 리셋.
  - `handleToggleWorkspaceLock` — optimistic UI + IPC
    `session/set-workspace-locked` 호출. 실패 시 원복.
  - `<ChatPanel workspaceLocked onToggleWorkspaceLock>` props 전달.

### Verified

- typecheck clean
- lint pre-existing 4 + 2 only
- unit: 1597/1604 — 회귀 0

### Notes

- **다음 commits (Workspace UX 마무리)**:
  - drift 검사 분기 (잠긴 세션은 drift dialog 비활성).
  - Auto-new-chat prompt (폴더 변경 시 dialog).
  - drift menu (현재 ⚠ icon 에서 짧은 설명 popover 로).
- 이상까지가 P1 v1.1.x **Workspace UX 슬롯 완료**.
- 그 다음 v1.1.14 = Plugin Loader MVP / v1.1.15 = L/E/E + visual polish.

## [1.1.12] — 2026-05-06

**Workspace UX 둘째 단계 — sticky lock UI (preload bridge + ChatHeader toggle).**

v1.1.11 의 storage layer 위에 renderer 측 UI 연결. ChatHeader 의 🔒/🔓
toggle 이 실제 IPC 호출로 잠금 상태 변경.

### Added

- **Preload bridge**:
  - `'session/set-workspace-locked'` + `'session/get-workspace-locked'`
    채널 화이트리스트.
  - `window.dreampia.session.setWorkspaceLocked(sessionId, locked)` —
    `Promise<Result<{ ok: boolean }>>`.
  - `window.dreampia.session.getWorkspaceLocked(sessionId)` —
    `Promise<Result<{ locked: boolean }>>`.

- **`ChatPanel` / `ChatHeader`** props:
  - `workspaceLocked?: boolean` (default false).
  - `onToggleWorkspaceLock?: () => void`.
  - 🔒/🔓 toggle button — `data-testid="workspace-lock-toggle"` +
    `data-locked` 속성. Tooltip + aria.

- **i18n** ko/en — `chat.header.workspace_lock_*` 4 keys.

### Verified

- typecheck clean
- lint pre-existing 4 + 2 only
- unit: 1597/1604 — 7 fail 모두 v1.1.11 baseline 동일 (회귀 0)

### Notes

- **App.tsx 통합** (실제 toggle handler 가 IPC 호출 + state 갱신) +
  **drift 검사 분기** (잠긴 세션은 prompt 제외) 는 v1.1.13+ 에서.
- **Auto-new-chat prompt** + **drift menu** 도 후속.

## [1.1.11] — 2026-05-06

**Workspace UX 첫 단계 — Per-session sticky workspace lock (storage layer).**

P1 v1.1.x Workspace UX 슬롯의 첫 단계. ChatHeader 의 🔒 toggle 로 사용자가
본 세션을 특정 workspace 에 고정 — 폴더 변경 / drift 발생 시 본 세션은
자기 workspace 로 복귀.

### Added (Storage layer)

- **Migration 007 — `sessions.workspace_locked`**:
  - `INTEGER NOT NULL DEFAULT 0` (boolean flag).
  - `idx_sessions_workspace_locked` partial index (locked=1 만).

- **`WorkspaceSchema.locked?: boolean`** — Session.workspace 에 optional 필드.
  ChatHeader 가 본 값으로 toggle UI 렌더.

- **`SessionStore`**:
  - `setWorkspaceLocked(id, locked)` — UPDATE + return changed boolean.
  - `getWorkspaceLocked(id)` — UI mount 동기화.
  - `listLockedSessions()` — boot-time workspace 복귀 흐름용.

- **IPC handlers**:
  - `session/set-workspace-locked` — payload `{ sessionId, locked }`.
  - `session/get-workspace-locked` — payload `sessionId` → `{ locked }`.

### Verified

- typecheck clean
- lint pre-existing 4 + 2 only
- unit: 1597/1604 — 7 fail 모두 v1.1.10 baseline 동일 (회귀 0)
- LATEST_SCHEMA_VERSION 자동 7 (MIGRATIONS 마지막). 기존 SessionStore
  migration 테스트 통과.

### Notes

- **다음 commit (v1.1.12)**: ChatHeader UI 의 🔒 toggle 버튼 + 잠긴 세션의
  drift 검사 분기 + 잠금 상태 보존을 위한 Session.workspace.locked
  hydration (read path).
- **Auto-new-chat prompt** (폴더 변경 시 dialog) + **drift menu** 는 후속
  commits.

## [1.1.10] — 2026-05-06

**VCR loader (drive17 prep) — Codex Q10 권고 replay/record/live mode 인프라.**

drive17 (VCR drift detection) 의 핵심 모듈. Tier 3 nightly real CLI 가
fixture 와 hash 비교로 translator regression detect.

### Added

- **`src/providers/cli/vcrLoader.ts`**:
  - `loadFixture(path)` — JSON 파싱 + schema 검증 (version === '1', provider
    claude|codex, spawn{argv, cwd}, exit{code, signal} 필수). missing →
    `VcrFixtureMissingError`. invalid → `VcrFixtureInvalidError`.
  - `eventsHashOf(events)` — StreamEvent[] 결정성 SHA-256 hash. timestamps
    / turn_id / cost float / tool_call.id 제외.
  - `detectDrift(fixture, events)` — `expected_events_hash` 와 비교, drift
    + actual + expected 반환. fixture hash 미지정 시 drift X (opt-in).
  - `updateFixtureHash(path, events)` — record mode helper. fixture 의
    `expected_events_hash` + `recorded_at` 갱신 후 file 에 write.
  - `shouldRequireFixture(mode)` — replay → true / record / live → false.

- **`tests/providers/cli/vcrLoader.test.ts`** — 18 시나리오:
  - `loadFixture`: missing / parse fail / version mismatch / missing
    provider / invalid provider / missing spawn / valid (7 시나리오).
  - `eventsHashOf`: 빈 배열 / 같은 events 같은 hash (turn_id 무시) / 다른
    text 다른 hash / 순서 바뀌면 다른 hash (4 시나리오).
  - `detectDrift`: hash 미지정 opt-in / 일치 false / mismatch true (3 시나리오).
  - `updateFixtureHash`: 파일 갱신 검증 (1 시나리오).
  - `shouldRequireFixture`: 3 mode 검증 (3 시나리오).

### Verified

- typecheck clean
- 신규 18 unit 통과

### Notes

- **drive17 spec 본체** (DREAMPIA_VCR_MODE=replay missing fail / live drift
  detection) 은 별도 후속. 본 commit 은 인프라.
- **PR CI 통합 권고**: nightly job 에서 `DREAMPIA_VCR_MODE=live` 로 e2e 실행
  → drift 발견 시 fail → 사람이 fixture 갱신 + commit (Codex Q10 picking
  manual record).

## [1.1.9] — 2026-05-06

**drive16 — Real CLI integration e2e: failure modes (Codex Q9 권고 시나리오).**

CliProvider 의 fail-closed 정책이 production code path 에서도 정상 작동
하는지 회귀 lock. fake CLI 가 의도적으로 실패 (exit !=0 / stderr error)
하면 renderer 가 error UI 를 통해 사용자에게 알림.

### Added

- **Fixtures (2 신규)**:
  - `tests/fixtures/cli-vcr/claude/failure-exit-nonzero.json` — system init
    chunk 만 emit 한 뒤 exit 1.
  - `tests/fixtures/cli-vcr/claude/failure-stderr-error.json` — system init
    + stderr 에 "Error: API authentication failed (401 Unauthorized)" 출력
    + exit 0. CliProvider 의 stderr error keyword 매칭이 caller 에 error
    이벤트 전달하는지 검증.

- **`tests/providers/cli/fakeCliReplay.test.ts` Tier 2 시나리오 2 추가**:
  - `failure: exit code !== 0` — error event 의 message 가 `exit code 1`
    포함.
  - `failure: stderr error keyword + exit 0` — error event 의 message 가
    `authentication failed` 포함.

- **`e2e/_drive16.spec.ts`** 신규:
  - 16-1: fake CLI exit 1 → assistant turn mount + streaming-cursor 사라짐.
  - 16-2: fake CLI stderr 401 → 마찬가지.

### Verified

- typecheck clean
- lint pre-existing 4 + 2 only
- fakeCliReplay: 5/5 (text + tool_use + exit_nonzero + stderr_error +
  argv_mismatch).
- Playwright spec list: drive16 = 2 tests.

### Notes

- **drive17 (VCR drift detection)** 은 VCR loader / replay-record-live
  mode 전환 모듈 필요 — 별도 commit (v1.1.10).
- **drive14-3 (saved tool turn)** 도 별도 후속 — `session/get-tool-history`
  IPC 또는 sqlite 직접 query.

## [1.1.8] — 2026-05-06

**drive14 확장 + drive15 (KR cwd) — Codex Q9/Q10 권고 시나리오 보강.**

v1.1.7 의 drive14-1 minimum 위에 14-2 (tool_result UI) 와 14-4 (mock
fallback 금지) 추가. 한국어 워크스페이스 회귀 lock (Codex Q5 picking) 을
drive15 로 분리.

### Added

- **`ChatPanel.tsx` `CliStatusBadge` testid 추가**:
  - `data-testid="provider-status-badge"` + `data-provider-source="<source>"`
    (mock / claude-cli / codex-cli / none).
  - drive14-4 의 mock fallback 검증 가능.

- **`e2e/fixtures-vcr.ts` `MakeVcrTestOptions`**:
  - `koreanWorkspace?: boolean` — workspace 디렉토리 prefix 를
    `dreampia-한국어-` 로 변경. drive15 가 사용.

- **`e2e/_drive14.spec.ts` 14-2 / 14-4** 추가:
  - 14-2: tool 실행 결과가 ChatPanel 의 `tool-call-card` UI 로 노출.
  - 14-4: Mock fallback 미발생 — `provider-status-badge` 의
    `data-provider-source !== 'mock'`. badge 미마운트도 OK (detect
    pending). 핵심 assertion 은 mock 으로 fallback 안 함.

- **`e2e/_drive15.spec.ts`** 신규:
  - 15-1: 한국어 워크스페이스 폴더 (`dreampia-한국어-...`) 에서 tool_use
    round-trip 정상 — `ensureAsciiCwd` 의 Windows 8.3 short path 변환
    회귀 lock + KR prompt 회귀 lock.

### Verified

- typecheck clean
- lint pre-existing 4 + 2 only (신규 0)
- unit: 1577/1584 — 7 fail 모두 v1.1.7 baseline 동일 (회귀 0)
- Playwright spec enumerate: 4 tests in 2 files (drive14: 3, drive15: 1)

### Notes

- **다음 commit**: drive16 (failure modes — fake CLI exit !=0 / stderr
  error / killed) + drive17 (VCR drift detection — fixture 변경 시 drift
  fail).
- **drive14-3 (saved tool turn)** 은 sessions.sqlite 직접 query 필요 →
  `session/get-tool-history` IPC 또는 fs 직접 query. 별도 후속 commit.

## [1.1.7] — 2026-05-06

**drive14 — Real CLI integration e2e: Claude CLI tool_use round-trip
(Codex Q9/Q10 권고 본격 시나리오).**

v1.1.5 의 VCR 인프라 + v1.1.6 의 tool_use fixture 위에 Playwright e2e
spec 추가. Production code path (CliProvider) + IPC + Queue + Permission
+ React UI 가 한 통합 시나리오에서 검증.

### Added

- **`e2e/fixtures-vcr.ts`** — VCR variant Playwright fixture:
  - `makeVcrTest(fixtureRelPath)` factory — spec 단위 fixture path 주입.
  - `DREAMPIA_TEST=0` (mock 조기 반환 회피).
  - `DREAMPIA_CLI_COMMAND=process.execPath` + `DREAMPIA_CLI_PREARGS=fake-cli.cjs`
    + `DREAMPIA_VCR_FIXTURE=<path>` env launch.
  - userDataDir / workspaceDir 격리 — 기존 `fixtures.ts` 와 동일 패턴.
  - settings.json 미리 작성 (onboarding wizard 우회).

- **`e2e/_drive14.spec.ts`** — 14-1 시나리오 (minimum):
  - 사용자 prompt "현재 디렉토리 파일 목록 보여줘" 입력 (한국어 prompt
    + KR cwd 회귀 lock).
  - Fake CLI 가 fixture 의 tool_use 응답 emit → AI stream 이 shell.run
    호출.
  - PermissionApprovalCard inline 표시 (testid `permission-approval-card`).
  - 'once' 클릭 → Permission 통과 → tool 실행 (workspaceDir 의 ls).
  - PermissionApprovalCard 사라짐으로 round-trip 완료 검증.

### Verified

- typecheck clean
- Playwright spec list — 1 test 정상 enumerate.
- Spec testids 검증 — `sidebar-search-input` / `chat-input` /
  `permission-approval-card` / `permission-approval-once` 모두 src/renderer
  에 존재.

### Notes

- **본 commit 은 14-1 minimum**. 후속 commits 에서 추가:
  - 14-2: tool_result 가 ChatPanel 에 turn-tool 또는 tool_call_result
    UI 로 표시 검증.
  - 14-3: SessionStore 의 saved tool turn 검증 (sessions.sqlite 직접
    query 또는 IPC 통한 state 조회).
  - 14-4: source=claude-cli 검증 (mock fallback 금지) — provider source
    badge 가 ChatHeader 에 노출되는지.
- **drive15/16/17 후속** (KR cwd / failure modes / VCR drift) — 별도 슬롯.
- **Real Electron 실행 환경** 필요 — better-sqlite3 ABI rebuild + vite
  build (pretest:e2e). 본 commit 은 spec compile + testid 검증만. 실제
  spec 실행은 dev/CI 환경에서 사용자가 트리거.

## [1.1.6] — 2026-05-06

**drive14 prep — Tool_use round-trip fixture + Tier 2 통합 검증.**

v1.1.5 의 VCR 인프라 위에 tool_use 시나리오 추가. drive14 (Playwright e2e)
는 후속 commit — 이번엔 main process layer 의 tool_use round-trip 만 검증.

### Added (Fixtures + Tests)

- **`tests/fixtures/cli-vcr/claude/tool-use-roundtrip.json`** — Claude CLI
  의 `tool_use` block 을 포함한 fixture. 한국어 prompt "현재 디렉토리 파일
  목록 보여줘" → assistant text + `shell_run` tool call + result.
  - `tool_use.id` = `toolu_vcr_001` (안정적 ID — 검증 가능).
  - `tool_use.input` = `{"command":"ls"}`.
  - Claude convention: tool name `shell_run` → translator 가
    `shell.run` 으로 변환 (underscore → dot).

- **`tests/providers/cli/fakeCliReplay.test.ts`** — Tier 2 시나리오 신규 1:
  - Tool_use round-trip: text_delta + tool_call_start + tool_call_complete
    + message_complete event sequence.
  - `tool_call.id` / `tool_id` / `input` 정확성 검증.
  - 에러 event 0 (happy path).

### Verified

- typecheck clean
- lint pre-existing 4 errors + 2 warnings only
- 신규 1 unit (Tier 2 tool_use) 통과 — 합계 3/3 fakeCliReplay.

### Notes

- **다음 commit (drive14 e2e)**:
  - `e2e/_drive14.spec.ts` — Playwright + Electron + 실제 UI flow.
  - Fixtures 확장: `DREAMPIA_CLI_COMMAND` / `DREAMPIA_CLI_PREARGS` /
    `DREAMPIA_VCR_FIXTURE` env 를 Electron launch 시 set.
  - 검증: 사용자 메시지 → fake CLI 의 tool_use → PermissionApprovalCard
    표시 → 'once' 클릭 → tool 실행 (fake) → tool_result UI →
    저장된 tool turn (sessions.sqlite).

## [1.1.5] — 2026-05-06

**Real CLI integration e2e 인프라 — Codex Q10 권고 (VCR fixture format +
fake CLI + provider env override).**

Tier 2 / Tier 3 CLI integration 의 기반. Tier 1 vi.mock 은 unit 으로 이미
존재 (CliProvider.test.ts), Tier 2 fake binary integration 이 본 commit 의
새 인프라. Tier 3 nightly real CLI 는 ANTHROPIC_API_KEY 가 있는 CI 에서만
드라이브.

### Added (Infrastructure)

- **VCR fixture format** (`src/providers/cli/vcr.ts`):
  - `VcrFixture` 인터페이스 — `version` / `fixture_id` / `provider` /
    `recorded_at` / `spawn{argv, cwd, env_keys}` / `stdin_chunks` /
    `stdout_chunks{delay_ms, data}` / `stderr_chunks` / `exit{code, signal}` /
    `expected_events_hash` / `timing` / `argv_assert{prompt_last, model_arg}`.
  - Codex Q10 권고 그대로 — fake CLI replay 와 translator 검증을 분리하면서
    argv-last + KR cwd 회귀 고정.
  - `getVcrMode()` — `DREAMPIA_VCR_MODE=replay|record|live` 파싱. default replay.
  - `getCliCommandOverride()` — `DREAMPIA_CLI_COMMAND` + `DREAMPIA_CLI_PREARGS`
    파싱. drive harness 가 fake CLI 사용. `DREAMPIA_TEST=1` (mock 조기
    반환) 보다 먼저 적용.

- **`tests/fixtures/fake-claude-cli.cjs`** — pure Node CJS replay (Codex Q10
  picking):
  - `argv-last` 검증 (fixture 의 `argv_assert.prompt_last` 와 일치).
  - `model_arg` 검증 (선택).
  - `stdout_chunks` + `stderr_chunks` 를 `delay_ms` timing 으로 emit.
  - `exit.code` 로 종료 (signal 종료는 별도 fixture).
  - `DREAMPIA_VCR_FIXTURE` env 가 fixture path. 미지정 시 stderr + exit 2.
  - `.cjs` 확장자 — `package.json` `"type":"module"` 충돌 회피.

- **`tests/fixtures/cli-vcr/claude/text-happy.json`** — 첫 fixture (drive14
  prep): Claude CLI text-only happy stream, 한국어 prompt "안녕".

- **`CliProvider.preArgs` 옵션**:
  - binary 앞에 prepend 할 args. fake CLI replay 시 사용.
  - 예: `binaryPath = process.execPath`, `preArgs = ['fake-cli.cjs']` →
    `spawn(node, ['fake-cli.cjs', ...args])`.
  - production 에선 `auto.ts` 의 env override 가 set.

- **`auto.ts` `DREAMPIA_CLI_COMMAND` env override**:
  - `getCliCommandOverride()` 가 non-null 이면 model prefix 로 provider
    결정 (claude / codex) → fake CliProvider 반환.
  - `DREAMPIA_TEST=1` mock 조기 반환 보다 **먼저** 적용 (Codex Q10 picking).
  - test-only IPC 회피.

- **ESLint flat config** `tests/fixtures/**/*.cjs` 추가 — Node CJS globals.

### Added (Tests)

- **`tests/providers/cli/vcr.test.ts`** — 10 시나리오:
  - `getVcrMode` 5: 미지정 / replay / record / live / 알 수 없는 fallback.
  - `getCliCommandOverride` 5: 미지정 / 빈 문자열 / COMMAND only / single
    PREARGS / 다중 토큰 PREARGS.

- **`tests/providers/cli/fakeCliReplay.test.ts`** — Tier 2 integration 2:
  - `process.execPath` + fake CLI + fixture replay → CliProvider 가 message_start
    + text_delta + message_complete emit. 누적 텍스트 검증.
  - `argv_assert.prompt_last` mismatch → fake CLI exit 5 → CliProvider error event.

### Verified

- typecheck clean
- lint pre-existing 4 errors + 2 warnings only — 신규 0
- unit: 1576/1583 — 7 fail 모두 v1.1.4 baseline 동일 (회귀 0)
- 신규 12 unit (vcr 10 + fakeCliReplay 2) 통과

### Notes

- 본 commit 은 v1.1.4 슬롯 (Real CLI integration e2e) 의 인프라 단계.
  다음 commit 은 drive14 (Claude CLI tool_use round-trip + permission flow
  + saved tool turn).
- **fake CLI 작동 검증**: `DREAMPIA_VCR_FIXTURE=...path... node
  tests/fixtures/fake-claude-cli.cjs --print --output-format stream-json
  --bare --verbose --model claude-sonnet-4-6 "안녕"` → fixture 의 stdout
  chunks 를 정상 emit. 한국어 prompt + Windows + Node CJS 호환 확인.

## [1.1.4] — 2026-05-06

**Real CLI integration e2e 슬롯 첫 commit — Codex Q10 권고 보안 prep.**

Codex Q10 외부 검토에서 v1.1.3 까지 미해결된 두 가지 IPC origin 검증
gap 지적:

1. **`tool/cancel-call`, `tool/cancel-turn` origin 미검증** — 다른
   webContents 가 임의로 active call 또는 turn 을 abort 시키는 attack
   면. privilege escalation 은 아니지만 cross-window DoS 가능.
2. **`IpcPermissionConfirmer` -1 sentinel future footgun** — production
   main 에는 도달 불가 (send 가 항상 `{sent, web_contents_id}` 반환)
   이지만, 다른 caller 가 -1 owner 의 request 를 만들면 모든 sender 가
   응답 가능했던 코드 path. fail-closed 로 정리.

### Fixed (Security)

- **`cancelCall` / `cancelTurn` origin 검증** (Codex Q10):
  - `ToolQueue.cancelCall(callId, reason, requesterWebContentsId?)` —
    active call 의 `web_contents_id` 와 비교, 다르면 false 반환 (no-op).
  - `ToolQueue.cancelTurn(turnId, reason, requesterWebContentsId?)` —
    같은 owner 의 calls 만 cancel. 다른 owner 의 calls 는 skip.
  - NO_ORIGIN(0) 또는 미지정 = 호환 (테스트 / 프로그램적 호출).
  - `ActiveExecution.web_contents_id` + `PendingEntry.web_contents_id`
    필드 — runTool 진입 + waitForCapacity 시 webContentsId 캡처.
  - `tool/cancel-call`, `tool/cancel-turn` IPC 핸들러가
    `event.sender.id` 전달.

- **IpcPermissionConfirmer -1 sentinel fail-closed** (Codex Q10):
  - `respond` 가 `senderWebContentsId !== undefined` + owner === -1 인
    경우 fail-closed. 이전엔 모든 sender 수락 (legacy 호환 명목).
  - `getPendingRequests(senderId)` 가 owner === -1 인 request 를 노출 X.
  - production 정합성 — main 의 send 는 항상 owner 추적 (-1 도달 불가).
    legacy boolean send 는 sender 미지정 시만 수락 (테스트 호환).

### Added (Tests)

- **`tests/tools/Queue.cancel-origin.test.ts`** — 6 시나리오:
  - cancelCall 같은 webContents 수락 / 다른 webContents 거절.
  - requesterWebContentsId 미지정 호환.
  - owner === NO_ORIGIN 모든 sender 수락.
  - cancelTurn 같은 webContents 의 calls 만 취소.
  - cancelTurn 미지정 모든 calls 취소 (legacy).

- **`tests/main/IpcPermissionConfirmer.test.ts`** 갱신:
  - boolean send + sender 명시 → fail-closed (이전엔 -1 모든 수락이었음).
  - sender 미지정 → 수락 (테스트 호환).

### Verified

- typecheck clean
- lint pre-existing 4 errors + 2 warnings only
- unit: 1564/1571 — 7 fail 모두 v1.1.3 baseline 동일 (회귀 0)
- 신규 6 unit (Queue.cancel-origin) + 갱신 1 (IpcPermissionConfirmer
  legacy fail-closed) 통과

### Notes

- **v1.1.4 슬롯 = "Real CLI integration e2e"** 의 첫 commit (보안 prep).
  나머지 작업은 후속 commits:
  - VCR fixture format + fake-claude-cli.js + provider env override.
  - drive14 (Claude CLI tool_use round-trip) — argv-last + KR cwd +
    permission flow + 저장된 tool turn 검증.
  - drive15 (KR cwd + streaming) / drive16 (failure modes) /
    drive17 (VCR drift detection).
- **`permission/grants/list` / `grants/revoke` owner binding** 은 mainWindow
  1개 가정 환경 (production 현재) 에서는 사실상 trivial — Codex Q10 은
  "외부 릴리스 전 합치기" 권고했으나 melti-window 도입 (v1.2.x scope)
  시점에 적정 architectural fix. v1.1.4 에서는 -1 fail-closed 로 충분.

## [1.1.3] — 2026-05-06

**v1.1.2 SEC-2 hotfix 의 외부 검토 후속 — Codex Q9 strict blind spot 청산.**

Codex Q9 외부 검토 strict 발견:

1. **`findActiveGrants` session_id 필터 누락** — `webContentsId` 격리만으로 부족.
   같은 webContents 안에서 sessionA 의 'session' grant 가 sessionB 호출에서
   활성될 수 있음. v1.1.2 의 webContentsId 키 전환은 다른 webContents 의 grant
   spoof 는 막지만, 같은 webContents 안의 cross-session 누수는 미해결.
2. **`permission/respond` owner binding 부재** — pending 요청을 emit 한
   webContents 가 아닌 다른 sender 가 응답 가능. 이론상 다른 BrowserWindow
   또는 spoofed sender 가 다른 창의 권한 결정 빌릴 수 있음.

### Fixed (Security)

- **`augmentSessionWithRuntimeGrants` session_id 필터** (Codex Q9 핵심 fix):
  - Queue 의 1차 필터 — webContentsId 버킷의 grant 중 `g.session_id ===
    session.id` 만 머지. 같은 webContents 의 sessionA grant 가 sessionB
    호출에서 활성되는 누수 차단.
  - 'session' grant 의미 정합: 사용자 인식 ("이 chat session 동안") 과
    실제 동작 일치.

- **`findActiveGrants` defense-in-depth 필터**:
  - Resolver 의 2차 필터 — `g.session_id !== session.id` grant 무시. 다른
    caller (DB 직접 fetch / plugin 등) 가 session.permission.grants 에 다른
    세션의 grant 를 섞을 가능성에 대한 안전망.

- **`IpcPermissionConfirmer` owner binding** (v1.1.3 Codex Q9):
  - `send` 가 `boolean | { sent, web_contents_id }` 반환 — confirm 시점에
    pending 에 owner webContentsId 캡처.
  - `respond(request_id, decision, reason?, senderWebContentsId?)` — 같은
    webContents 의 응답만 수락. 다른 sender 는 silently drop + console.warn
    (정상 흐름이 아닌 spoof 시도).
  - `getPendingRequests(senderWebContentsId?)` — 같은 webContents 의 pending
    만 노출. legacy boolean send 와 미지정 sender 는 모든 sender 수락 (-1
    sentinel) — 테스트 호환.
  - `permission/respond`, `permission/list-pending` IPC 핸들러가
    `event.sender.id` 전달.

### Added (Tests)

- **`tests/permission/Resolver.test.ts`** — 2 시나리오 (#19):
  - 다른 session_id grant 무시 — default level fallback.
  - 같은 session_id grant 정상 활성.

- **`tests/main/IpcPermissionConfirmer.test.ts`** — 5 시나리오 (owner binding):
  - send 가 webContentsId 반환 시 owner 캡처.
  - 다른 webContents 에서 respond 시 silently drop.
  - senderWebContentsId 미지정 시 모두 수락 (legacy 호환).
  - boolean send 의 -1 sentinel 모든 sender 수락.
  - getPendingRequests(senderId) 가 같은 webContents 만 반환.

- **`tests/tools/Queue.web-contents-binding.test.ts`** — 1 신규 시나리오:
  - 같은 webContentsId 안에서 sessionA grant 가 sessionB 호출에 활성되지 않음.

### Verified

- typecheck clean
- lint pre-existing 4 errors + 2 warnings only — 신규 0
- unit: 1558/1565 — 7 fail 모두 v1.1.2 baseline 동일 (5 ipc.workspace +
  2 SessionStore migrations). 회귀 0.
- 신규 8 unit (Resolver session filter 2 + IpcPermissionConfirmer owner 5 +
  Queue cross-session 1) 통과.

### Notes

- **슬롯 재배열**: 본 hotfix 가 v1.1.3 슬롯 차지. Codex iterative hotfix 패턴
  (Q5→v1.0.14 / Q6→v1.0.15 / Q7→v1.1.1 / Q8→v1.1.2 / Q9→v1.1.3). 새 plan:
  v1.1.4 Real CLI e2e / v1.1.5 Workspace UX / v1.1.6 Plugin Loader / v1.1.7
  Loading-Error-Empty + visual polish.
- **`tool/cancel-call` / `tool/cancel-turn` origin 검증** 은 v1.1.4 (Real CLI
  e2e 슬롯) 의 IPC binding 시나리오로 묶음 — privilege escalation 아니라
  정도 낮음. drive 시나리오 추가 시 같이 해결.

## [1.1.2] — 2026-05-06

**v1.1.1 SEC-2 hotfix 의 외부 검토 후속 — Codex Q8 strict blind spot 청산.**

Codex Q8 외부 검토 strict 발견:

1. **`sessionId` IPC trust 미검증** — `tool/execute` / `ai/start-stream` 핸들러가
   renderer payload 의 `session_id` 를 그대로 ToolQueue 에 전달. v1.1.1 의
   `sessionGrants: Map<SessionId, ...>` 가 이 값을 키로 사용 → renderer 가
   임의 sessionId 를 spoof 하면 다른 세션의 in-memory grant 를 빌릴 수 있음.
   "session in-memory 전환이 보안 경계가 아니라 캐시" — Codex 정확한 표현.
2. **`sessionGrants` cleanup 부재** — `clearSessionGrants()` 가 test/shutdown
   helper 만, production 호출 위치 0. 세션 close / window destroy / TTL 모두
   미연결 → 앱 생애 동안 grant 메모리 누적.
3. **`permission.high_risk_downgrade` 침묵 정책** — audit event 는 emit 되지만
   사용자 UI 에 "이 권한은 high-risk 라 1회만 적용" 명시 없음. DangerModal 이
   이미 'once'/'deny' 만 노출하지만 그 이유가 보이지 않음.

### Fixed (Security)

- **`sessionGrants` 키 SessionId → webContentsId 전환** (Codex Q8 핵심 fix):
  - `ToolQueue.sessionGrants: Map<number, PermissionGrant[]>` — Electron 이
    보장하는 신뢰 가능 출처 `event.sender.id` 가 격리 키. renderer 가 IPC
    payload 의 session_id 를 spoof 해도 다른 webContents 의 grant 절도 불가.
  - `enqueue(call, origin?: { web_contents_id: number })` — main 의
    `tool/execute` IPC 핸들러가 `event.sender.id` 를 두 번째 arg 로 전달.
    `ai/start-stream` 의 streaming tool_call 도 `runStreamPump` →
    `runToolCallFromStream` 으로 webContentsId 스레딩.
  - origin 미전달 (테스트/프로그램적 호출) 은 `ToolQueue.NO_ORIGIN(0)` 버킷
    으로 격리 — 별도 세션처럼 동작 (테스트 호환).
  - **API 정리**: `appendSessionGrant`, `augmentSessionWithRuntimeGrants`,
    `getSessionGrants` 모두 webContentsId 키. `getSessionGrants` 는 default
    `NO_ORIGIN` 으로 기존 unit 테스트 패턴 유지.

- **`sessionGrants` cleanup hook 추가**:
  - `ToolQueue.clearGrantsForWebContents(webContentsId): void` — 신규 public API.
    BrowserWindow `'closed'` 이벤트가 호출 → 닫힌 창의 grants 즉시 제거.
    webContentsId 가 (이론상 거의 불가능하지만) 다른 창에 재할당될 때 grant
    누수 방지.
  - `app.on('before-quit')` — 강제 종료 흐름 안전망. 모든 grants `clearSessionGrants()`.
  - `toolQueue` 변수 module scope 호이스트 — `createMainWindow()` 의 `'closed'`
    핸들러가 접근하기 위함.

- **High-risk downgrade UI 명시 고지**:
  - `permission.danger.once_only_notice` 신규 i18n key (ko/en).
  - `PermissionDangerModal` 에 빨간 배너 추가 — "보안 위험이 높아 '이번 한 번
    만' 외 다른 선택지는 제공되지 않습니다. 다음에도 같은 작업이 필요하면
    매번 다시 승인해야 해요." `data-testid="permission-danger-once-only-notice"`.
  - audit event `permission.high_risk_downgrade` (v1.1.1) + UI 고지가 한 짝.

### Added (Tests)

- **`tests/tools/Queue.web-contents-binding.test.ts`** — 6 시나리오:
  - 다른 webContents 호출에서 grant 격리 (가장 중요).
  - 같은 webContents 의 다음 호출은 grant 활성 (confirm 생략).
  - `clearGrantsForWebContents` 해당 버킷만 제거, 다른 버킷 유지.
  - `clearSessionGrants` 모든 버킷 제거 (shutdown).
  - origin 미전달 호출은 `NO_ORIGIN` 버킷 격리.
  - `NO_ORIGIN === 0` 상수 검증.

- **`tests/tools/Queue.high-risk.test.ts`** + **`Queue.permission.confirm.test.ts`**
  갱신: `getSessionGrants(session.id)` → `getSessionGrants()` (default NO_ORIGIN).
  의미는 동일 — origin 미전달 호출의 grant 검증.

- **`tests/main/ipc.tool.test.ts`** + **`ipc.ai.test.ts`** evt stub 갱신:
  `{ sender: { id: 1 } }` — IPC 핸들러가 `event.sender.id` 접근하므로.

### Verified

- typecheck clean
- lint: 4 errors + 2 warnings — 모두 v1.1.1 사전 존재, 신규 0.
- unit (tools+main): 440/445 — 5 fail 모두 v1.1.1 baseline 동일 (ipc.workspace
  pre-existing). 회귀 0.
- 신규 6 unit (Queue.web-contents-binding) 통과.
- drive harness: 변경 범위 (Queue API ctx + cleanup + i18n+modal banner) 가
  drive flow 의 happy path 미영향 (drive13 testid `permission-danger-modal`
  보존). 본 hotfix 는 drive 신규 X — Real CLI e2e 슬롯 (v1.1.3) 에서 권한
  IPC bind 회귀 시나리오 추가 예정.

### Notes

- **슬롯 재배열**: 본 hotfix 가 v1.1.2 슬롯 차지. Codex Q8 권고 슬롯 한 칸씩
  밀림. 새 plan: v1.1.3 Real CLI e2e / v1.1.4 Workspace UX / v1.1.5 Plugin
  Loader / v1.1.6 Loading-Error-Empty + visual polish.
- **option B 채택** (full server-side session-binding + 신규 IPC 채널 vs
  webContentsId 격리): 동일한 spoof 방어 효과를 ½ surgery 로 — sidebar session
  전환 IPC 신규 추가 / sessionRegistry 인프라 신규 같은 architectural 변경은
  v1.2.x 멀티-window 슬롯에 어울림. 본 hotfix 는 minimal blast radius.
- **'session' grant 의미 변화**: 사용자 인식 ("이 chat session 동안") 과 실제
  ("이 webContents 생애") 불일치 — 다만 같은 webContents 안의 모든 chat
  session 이 같은 사용자/프로세스이므로 보안상 OK. 멀티-window v1.2.x 에서
  chat session 별 grant 격리 가 진짜 필요해지면 그때 신규 슬롯.

## [1.1.1] — 2026-05-05

**v1.1.0 SEC-2 full hotfix — Codex Q7 외부 검토 발견 두 blind spot 청산.**

v1.1.0 commit 직후 Codex 가 strict 기준 두 가지 hole 발견:

1. **'session' grant 가 DB 영속** — `expires_at=null` 로 저장돼 앱 재시작 후
   에도 active. 사실상 'always' 와 같은 효과 (만료 없음).
2. **High-risk capability 우회** — `LOCAL_WRITE.delete`, `LOCAL_OUTSIDE_CWD.write`,
   `LOCAL_EXECUTE.elevated`, `NETWORK_REMOTE.upload` 가 dangerous_pattern 에만
   묶여 있음. 사용자가 'always' 로 한 번 승인하면 영원히 silent. 또한
   parent capability (예: `LOCAL_WRITE` → `LOCAL_WRITE.delete`) 매칭으로
   confirm 없이 바로 통과.

Codex 권고 그대로 반영. v1.1.0 → v1.1.1 release branch (main) 로 hotfix.

### Fixed (Security)

- **'session' grant in-memory only**:
  - `ToolQueue` 에 `sessionGrants: Map<SessionId, PermissionGrant[]>` 추가.
  - `askConfirmation` 의 'session' 응답 → `appendSessionGrant` (in-memory) +
    grantPersister 호출 X. 'always' 만 grantPersister 호출 (DB 영속).
  - `checkPermissions` 가 Resolver 호출 전 `augmentSessionWithRuntimeGrants`
    로 session.permission.grants + sessionGrants 머지 (immutable shallow copy).
  - 앱 재시작 = sessionGrants Map 초기화 = 'session' grant 자동 사라짐.
  - main/index.ts grant_persister 단순화: `if (duration !== 'always') return`.

- **High-risk capability 강제 escalation**:
  - 새 `HIGH_RISK_CAPABILITIES` set: `LOCAL_WRITE.delete`,
    `LOCAL_OUTSIDE_CWD.write`, `LOCAL_EXECUTE.elevated`, `NETWORK_REMOTE.upload`.
  - **Resolver 호출 전 강제 confirm** — high-risk cap 만나면 parent capability
    매칭 우회 차단. `is_dangerous=true` 강제 → renderer 가 center modal.
  - **응답 silently downgrade**: 'session' / 'always' 응답 → 'once' 로
    server-side downgrade. UI 가 의도와 달리 보내도 (또는 사용자가 IPC
    직접 호출 등 우회 시도) 차단됨.
  - audit event `permission.high_risk_downgrade` 영속 — 사용자 의도와 실제
    적용 결정의 차이 추적 가능.

- **`Queue` 추가 helper API** (test / inspection):
  - `getSessionGrants(sessionId)` — 현재 in-memory grant 목록 (read-only).
  - `clearSessionGrants()` — test/shutdown helper.

### Added (Tests)

- **`tests/tools/Queue.high-risk.test.ts`** — 8 시나리오:
  - high-risk + session/always/deny 각 응답.
  - high-risk → confirmer.is_dangerous=true 강제 검증.
  - non-high-risk + session → in-memory 추가, persister X.
  - non-high-risk + always → persister 호출, in-memory X (DB 만).
  - 'session' grant 재호출 시 confirm 생략 (Resolver augmented 인식).
  - clearSessionGrants helper.

- **`tests/tools/Queue.permission.confirm.test.ts`** 갱신: 'session' 응답
  → in-memory only + persister 호출 X 검증으로 변경 (v1.1.1 행동 반영).

### Verified

- typecheck clean
- lint: pre-existing 4 issues only — 새 추가 0
- 115/115 tools + main unit (8 신규 high-risk + 기존 회귀 0)
- 11/11 spawnSafe
- 59/59 drive e2e (drive r1-r13 모두 회귀 0 — IPC layer 무관 변경)

### Notes

- **drive harness 신규 X**: hotfix 가 Queue 내부 로직 변경이라 unit 으로
  충분 검증. 8 신규 unit + 기존 SEC-2 unit (15) 가 contract 보장.
- v1.1.x 후속 (Codex Q7 권고): v1.1.2 Real CLI integration e2e (VCR + live
  gated), v1.1.3 Workspace UX, v1.1.4 Plugin Loader MVP, v1.1.5 Loading/Error.

## [1.1.0] — 2026-05-05

**SEC-2 full — 권한 승인 modal + Queue async pause-resume + grant 관리.**

`docs/v1.x-roadmap.md` 의 P1 첫 슬롯 (Codex Q5 picking). v1.0.10 의 SEC-2
minimal banner ("v1.1.0 예정") 가 약속한 본체. Codex Q6 의 모든 picking 을
그대로 반영:

- **(3a) Queue async pause-resume** — Queue 가 permission/audit 단일 관문
  이라 여기서 `requires_user_confirmation` 처리. `PermissionConfirmer`
  인터페이스 주입 (Electron 직접 의존 X).
- **(4b) Allow once / this session / always (영속) / Deny** — 4 가지 결정.
- **(5c) Inline ChatPanel approval card 기본 + dangerous 는 center modal**.
- **(6)** 60s timeout = auto deny (fail-closed) / X / Esc dismiss = deny
  grant 영속 X / 같은 session 다음 tool 대기 / 다른 session 진행.

### Added (Core)

- **`src/tools/types.ts` PermissionConfirmer interface**:
  - `PermissionRequest` (request_id / session/turn/call/tool ID / capability /
    target / hint / is_dangerous / tool_display_name / requested_at).
  - `PermissionResponse` (request_id / decision / reason?).
  - `PermissionGrantDuration` = 'once' | 'session' | 'always' | 'deny'.
  - `confirm(request) → Promise<response>` — Queue 가 await.

- **`ToolQueue` async permission flow**:
  - `permission_confirmer?` + `grant_persister?` 옵션. 미설정 시 v1.0.x
    호환 (즉시 deny).
  - `checkPermissions` async — `requires_user_confirmation` 또는
    dangerous_pattern 'require_modal' 만나면 confirmer.confirm() await.
  - 응답 처리:
    - 'once' → 통과 (grant 영속 X).
    - 'session' / 'always' → grantPersister 호출 후 통과 (DB 영속).
    - 'deny' → permission_denied error.
    - confirmer throw → fail-closed deny + audit.
    - persister throw → 이번 call 만 통과 (once 처럼).

- **`src/main/IpcPermissionConfirmer.ts`** — main-side bridge:
  - `webContents.send('permission/request', request)` 발화.
  - `respond(request_id, decision, reason?)` ← renderer 응답 매칭.
  - 60s timeout = auto deny.
  - send 실패 / throw → 즉시 deny (fail-closed).
  - `drainAllAsDeny()` 셧다운 helper.

- **`SessionStore.addPermissionGrant(grant)`** — 단일 grant INSERT + audit
  자동 (createSession 의 bulk 와 분리). v1.0.11 audit 인프라 활용.
- **`SessionStore.revokePermissionGrant(grantId, revokedAt)`** — JSON1
  json_extract 로 target_json.id 매칭 + revoked_at 설정.
- **`SessionStore.listActivePermissionGrants(sessionId)`** — UI list view.

### Added (IPC)

- **`permission/request`** (main → renderer, receive) — IpcPermissionConfirmer
  가 webContents.send 로 발화.
- **`permission/respond`** — renderer 응답.
- **`permission/list-pending`** — UI mount/reload 시 pending 복원.
- **`permission/grants/list`** — Settings > 권한 panel 의 grant 목록.
- **`permission/grants/revoke`** — grant 즉시 revoke.

### Added (UI)

- **`PermissionApprovalCard`** (`src/renderer/components/permission/`) —
  inline approval card. fixed bottom-right (chat 입력 가리지 않음).
  - 4 버튼: 이번만 / 이 세션 동안 / 항상 / 거부.
  - 60s 카운트다운 표시.
  - testid: `permission-approval-card`, `permission-approval-{once|session|always|deny}`,
    `permission-approval-countdown`.

- **`PermissionDangerModal`** — center modal escalation (dangerous 만).
  - X / Esc dismiss 불가 — 명시 응답 필수 (Codex 권고).
  - reason textarea (audit 기록).
  - testid: `permission-danger-modal`, `permission-danger-{once|deny|reason}`.

- **`usePermissionRequests`** hook — IPC subscribe + listPending 초기화.
  multi-pending 추적 + dangerous 우선.

- **Settings > 권한 panel 갱신** — v1.0.10 deferred banner 제거. 새
  `PermissionGrantsBlock`:
  - active grants table (capability / target / scope / granted_at + revoke).
  - `permission/grants/list` 호출 + 즉시 reload.
  - testid: `settings-permission-grants`, `settings-permission-grants-table`,
    `settings-permission-grant-row-{id}`, `settings-permission-grant-revoke-{id}`,
    `settings-permission-grants-empty`.

- **i18n ko/en** (`permission.card.*` + `permission.danger.*` +
  `settings.permission.grants.*`).

### Added (Tests)

- **`tests/main/IpcPermissionConfirmer.test.ts`** — 8 시나리오:
  - confirm() send 호출 + Promise pending.
  - respond() 매칭 → resolve + reason 보존.
  - timeout → deny (fakeTimers).
  - send=false → 즉시 deny.
  - send throw → deny.
  - respond 미매칭 → false.
  - drainAllAsDeny.
  - getPendingRequests 동시 다중.

- **`tests/tools/Queue.permission.confirm.test.ts`** — 7 시나리오:
  - 'once' / 'session' / 'always' / 'deny' 각 응답 확인.
  - confirmer 미설정 → v1.0.x 호환 deny.
  - confirmer throw → fail-closed deny + audit.
  - grant_persister throw → 이번 call 통과.

- **`e2e/_drive13.spec.ts`** — 5 시나리오:
  - 46: PermissionPanel grants block mount + deferred banner 제거.
  - 47: dreampia.permission API (5개) 모두 노출.
  - 48: list-pending 빈 배열.
  - 49: grants/list 빈 배열.
  - 50: 초기 상태 inline card / center modal mount X (회귀 detector).

- **`e2e/_drive8.spec.ts`** 갱신 — v1.1.0 의 deferred banner 제거 확인.

### Changed

- **drive8 r30** 회귀: v1.0.10 ~ v1.0.15 의 `settings-permission-grant-status`
  banner 가 사라졌는지 검증으로 변경. 기존 banner 의 v1.1.0 약속이 이번
  commit 으로 이행됨.

### Verified

- typecheck clean
- lint: pre-existing 4 issues only — 새 추가 0
- 15/15 SEC-2 unit (IpcPermissionConfirmer 8 + Queue.permission 7)
- 11/11 spawnSafe
- **59/59 drive e2e** (drive r1-r12 회귀 0 + drive13 5 신규)

### Codex 권고 — P1 다음 슬롯 순서

Codex Q5 picking 그대로:
- v1.1.1: Real CLI integration e2e (VCR + live gated).
- v1.1.2: Workspace UX 마무리 (Auto-new-chat prompt, sticky workspace lock,
  drift badge → real menu).
- v1.1.3: Plugin Loader MVP (sandbox + capability grant — 본 SEC-2 인프라
  활용).
- v1.1.4: Loading / Error / Empty + 필요한 visual polish.

### Notes

- **release/1.0.x branch** 가 v1.0.15 (e3811bc) 까지 매칭. 본 commit 은
  main 만 — release 는 hotfix 만 cherry-pick.
- 'session' grant 가 현재는 expires_at 미설정으로 영속 동작 — 더 정교한
  in-memory only lifecycle 은 v1.1.x 후속.

## [1.0.15] — 2026-05-05

**META-4 두 번째 hotfix — Codex Q6 의 lexical 우회 차단.**

v1.0.14 의 META-4 hotfix 가 picker / saved settings 두 경로를 다 닫았지만,
`workspaceConflict.ts` 가 `path.resolve` 만 사용한 lexical 비교라 다음 경로
들로 우회 가능했음 (Codex 외부 검토 Q6 발견):

- **Symlink / junction**: workspace 외부의 symlink 가 userData 를 가리키면
  lexical 비교는 다른 path 로 봄.
- **`subst`** (Windows): 사용자가 drive letter alias 를 만들면 같은 효과.
- **`\\?\` long-path prefix** (Windows): `\\?\C:\foo` 와 `C:\foo` 는 같은
  path 지만 lexical 비교는 다름.

### Fixed (Security)

- `src/main/workspaceConflict.ts` — `fs.realpathSync.native` 정규화 추가.
  - 두 path 모두 realpath 통해 정규화 후 비교.
  - realpath 실패 (path 미존재) 시 lexical fallback (picker UX 보호).
  - `\\?\` prefix strip (`\\?\UNC\server\share` 도 `\\server\share` 로):
    - `stripLongPathPrefix()` helper 추가.
    - realpath 결과 + lexical fallback 양쪽 모두 적용.
  - Windows case-insensitive 비교 그대로 유지.

### Added (Tests)

- `tests/main/workspaceConflict.test.ts` — 4 신규 시나리오 (총 16):
  - **Symlink → userData 정확 일치**: tmpdir 에 실제 symlink 생성 후 차단
    검증. POSIX + Windows admin 만; non-admin 은 자동 skip (사용자도 못 만듦).
  - **Symlink → userData 자식**: child kind 로 분류.
  - **Windows `\\?\` long-path prefix**: realpath 실패 fallback + strip 으로
    exact 일치 검증 (Windows 만, runIf).
  - **미존재 path lexical fallback**: 기존 동작 회귀 0.

### Verified

- typecheck clean
- lint: pre-existing 4 issues only — 새 추가 0
- 16/16 workspaceConflict + drive 54/54 회귀 0

### Notes

- v1.0.14 에서 분리된 `release/1.0.x` branch 에 cherry-pick 예정 — 두 branch
  보안 동등 유지.
- Codex 권고 그대로 main 은 v1.1.0 (SEC-2 full) 진입.

## [1.0.14] — 2026-05-05

**META-4 hotfix — Codex 외부 검토 (Q5) 에서 발견된 P0 closure blind spot.**

v1.0.13 의 META-4 가 `workspace/pick-folder` 시점만 차단하고, 저장된
`settings.workspace_root` 는 `app:get-default-workspace` / `workspace/get`
에서 재검증 없이 반환했다. 이전 버전 / 수동 settings 편집 / upgrade
케이스에서 우회 가능했음.

Codex 결론: "v1.0.14 급 hotfix 후보 — 본 커밋이 그것."

### Fixed (Security)

- **META-4 우회 청산**:
  - `app:get-default-workspace` IPC 가 저장된 `workspace_root` 를 반환 전
    `checkUserDataConflict` 재검증. 충돌 시 null 반환 → renderer 가
    onboarding/picker 강제.
  - `workspace/get` IPC 도 동일 재검증.
  - **Boot 시점 dialog**: `app.whenReady` 직후 `checkSavedWorkspaceConflictAtBoot()`
    가 settings 검사 + 충돌 시 사용자에게 명시 dialog ("저장된 작업 폴더가
    위험합니다") + `writeSettings({workspace_root: undefined, workspace_name: undefined})`
    로 자동 리셋. 기존 채팅 세션은 보존 (workspace_root 만 제거).
  - packaged build 에서만 dialog (dev/e2e 자동화 흐름 보호).

- **Module extraction**: `src/main/workspaceConflict.ts` — `checkUserDataConflict`
  + `classifyUserDataConflict` 를 ipc.ts 에서 추출. main/index.ts 와 ipc.ts
  가 같은 함수 사용 + 단위 테스트 가능.

### Fixed (Docs)

- `docs/v1.x-roadmap.md` 의 v1.1.0 sticky workspace lock migration 번호 정정:
  **006 → 007** (006 은 v1.0.12 의 cost / audit 이 이미 사용). Codex 추가 발견.

### Fixed (Test fixtures)

- `e2e/fixtures.ts` 가 `workspace_root = userDataDir` 패턴을 사용했었음 — META-4
  hotfix 가 정확히 차단하는 시나리오. 별도 `workspaceDir` fixture 추가, 두
  폴더 분리. sample 파일 (sample.txt / session.md / src.ts) 미리 생성 —
  mention popover 등 spec 호환.
- `_drive7.spec.ts` 28/29 — `userDataDir` → `workspaceDir` 변경.
- `_drive5.spec.ts` 23 — fixture path basename 정규식 `dreampia-(e2e|ws)-`.

### Added (Tests)

- `tests/main/workspaceConflict.test.ts` — 12 시나리오:
  - 정확/자식/부모/무관/형제 분류.
  - Windows case-insensitive (runIf platform=win32).
  - Boundary safety (prefix-only false positive 방지).
  - **Codex blind spot regression**: settings 우회 케이스 직접 검증.
- `e2e/_drive12.spec.ts` — 2 시나리오 (별도 fixture 로 직접 settings 주입):
  - 44: saved workspace_root = userDataDir → `app:get-default-workspace` null.
  - 45: saved workspace_root = 정상 폴더 → 정상값 (회귀 0).

### Verified

- typecheck clean
- lint: pre-existing 4 issues only — 새 추가 0
- 756/756 unit (12 신규 workspaceConflict)
- 11/11 spawnSafe
- **54/54 drive e2e** (drive r1-r11 회귀 0 + drive12 2 신규)

### Notes (P0 진짜 종료)

Codex 의 v1.0.13 review 가 이 blind spot 을 잡지 못한 채 P0 종료를 선언했지만,
본 hotfix 가 진짜로 P0 를 닫는다. **다음 슬롯 v1.1.0 (P1) 진입 가능**:
SEC-2 full (권한 grant UI 본체) 가 Codex Q5 의 첫 슬롯 추천.

## [1.0.13] — 2026-05-05

**P0 종료 슬롯 — FAKE 정리 + 입력/메타.**

`docs/v1.x-roadmap.md` 의 P0 마지막 묶음 (1.2.2 / 1.2.4 / 1.2.5 / 1.2.8).
Codex 외부 검토 (`codex-question-4.md`, 2026-05-05) 의 picking 그대로 반영.
v1.0.7~1.0.13 으로 P0 종료 — Codex 결론: "추가로 보이는 P0 는 없다."

### Fixed (Workspace drift)

- **WS-1**: `/compare` slash 가 v1.0.5 의 workspace drift fix 누락이었음.
  - `App.tsx:809`: `activeSession.workspace.root` 사용 → `defaultWorkspace?.root ?? activeSession.workspace.root` 로 통일.
  - 사용자가 [프로젝트] 폴더 변경 후 `/compare` 했을 때 옛 폴더로 가던 회귀 청산.

### Added (FAKE 정리)

- **FAKE-2 (Compare 활성화)** — Codex picking: 활성화 (deferred banner X).
  - 사이드바 [비교 (Cross-AI)] 항목 추가 (`GitCompareArrows` icon).
  - testid `sidebar-open-compare`. 클릭 → CompareModal mount.
  - i18n ko/en `sidebar.nav.compare`.
  - 백엔드 (v0.12.0) 가 이미 있어 정직 wire — Codex 권고 ("백엔드 있으면 deferred 보단 정직 wire").

- **FAKE-3** — v1.0.7 에서 이미 청산 (ChatHeader ··· 장식 제거 — 회귀 0).

- **FAKE-4 (single-instance UX)** — Codex picking (a): production 연결 + 기존 창 focus + dialog.
  - 두 번째 instance 시도 시 packaged build 에서 modal 표시: "이미 실행 중. 이 창이 활성 인스턴스입니다."
  - 첫 instance 의 mainWindow focus + minimize 해제 (기존 동작 유지).
  - dev/e2e 에선 modal 미표시 (자동화 흐름 보호).
  - LeaderElection stale lock recovery 테스트는 이미 v0.x 부터 `tests/storage/LeaderElection.test.ts:117` 에 존재 — 회귀 0.

- **FAKE-5 (MCP input_schema)** — Codex picking (b): 중간 변환.
  - 새 `src/main/mcp/jsonSchemaToZod.ts` — top-level `type=object` + `required[]` + 기본 type (string/number/integer/boolean/array/object) 변환.
  - nested 는 `z.record(z.unknown())` (full JSON Schema 변환은 P1 명시 이관).
  - `additionalProperties: false` → strict mode, default 는 passthrough (MCP 가 추가 필드 보낼 수 있어 관대).
  - 변환 결과 audit_log 영속 — Codex 추가 권고 ("조용한 validation fail 은 디버깅 비용 큼"):
    - `mcp.input_schema_converted` (정상 변환)
    - `mcp.input_schema_unconverted` (z.unknown fallback)
    - capability=NETWORK_MCP, target_json 에 server_id / tool_name / warnings.

### Added (Mention rate-limit)

- **MENT-1** — Codex picking: 50 + dedupe + 200KB.
  - `MENTION_MAX_COUNT = 50`, `MENTION_CUMULATIVE_BYTES = 200 * 1024`.
  - 새 `resolveMentionsRich()` — `{ resolved, limits: MentionLimitsApplied }` 반환.
  - 기존 `resolveMentions()` 는 호환 유지 (limits drop).
  - dedupe: `kind::value` 기준, 첫 occurrence 만 유지.
  - 초과 시 사용자 노출 banner — Codex 추가 권고 ("N개/X KB 제외됨 표시 필수"):
    - testid `chat-input-mention-exclusion`, role=status.
    - 5초 후 자동 dismiss.
    - 메시지: "⚠ 멘션 제외됨 — N개 (개수 한도 초과), N개 (중복), N개 (용량 한도 초과). 누적 X KB 사용."

### Added (META 안전)

- **META-4 (userData = workspace 차단)** — Codex picking (a): 차단 modal.
  - `workspace/pick-folder` IPC 가 picked 폴더와 `app.getPath('userData')` 충돌 검사.
  - 정확 일치 / 자식 / 부모 모두 차단 (3개 케이스 다른 메시지).
  - `dialog.showMessageBox` 로 사용자에게 명시 안내 + Result.fail (`WORKSPACE_CONFLICT: ...`).
  - 차단 사유: SQLite WAL/journal/sessions.sqlite 파일이 사용자 작업 트리에 노출되면 실수 commit / 삭제 위험.
  - Windows path 비교는 case-insensitive (현실 사용 패턴).

- **META-5 (CONTRIBUTING 가이드)** — README/CONTRIBUTING 정리.
  - Windows VS Build Tools 2022 + Python 3 설치 가이드.
  - macOS / Linux toolchain 안내.
  - 한국어 / 비-ASCII 폴더 경로 — 저장소 path 는 ASCII 권장, 사용자 workspace 는 한국어 자유 (spawnSafe 본업).
  - `chcp 65001` 권장 한국어 폴더 외부 tool 호출 시.
  - userData / workspace 충돌 정책 명시.

### Added (Tests)

- `tests/main/jsonSchemaToZod.test.ts` — FAKE-5 변환 contract 11 시나리오:
  - non-object input + type 미지정 → unknown.
  - type=object + properties 없음 → record(unknown).
  - 기본 type (string/number/integer/boolean/array) 매핑.
  - nested object → record(unknown).
  - additionalProperties strict / passthrough.
  - 지원 X type → warnings.

- `tests/renderer/mention-rate-limit.test.ts` — MENT-1 rate-limit 5 시나리오:
  - 정상 입력 → limits 0.
  - 51개 → dropped_over_count=1.
  - 5개 같은 path → dropped_duplicate=4.
  - dedupe + count 동시.
  - cumulative byte 한도 초과 → dropped_over_bytes 누적.

- `e2e/_drive11.spec.ts` — Round 11 drive harness 5 시나리오:
  - 39: /compare 가 defaultWorkspace 사용 (WS-1 회귀 detector).
  - 40: 사이드바 [비교] click → CompareModal mount.
  - 41: audit/recent 의 mcp.input_schema_* prefix query.
  - 42: 51개 mention 입력 → banner 표시.
  - 43: workspace IPC 존재 검증 (META-4 IPC 차단은 단위 테스트).

- 부수: `tests/renderer/keyboard/shortcuts.test.ts` — pre-existing fail 청산 (v1.0.8 의 `preview.toggle` 누락이었음, v1.0.13 에서 정정).

### Verified

- typecheck clean
- lint: pre-existing 4 issues only (e2e/_drive.spec.ts, App.tsx) — 새 추가 0
- 940/940 unit (16 신규: jsonSchemaToZod 11 + mention-rate-limit 5)
- 11/11 spawnSafe
- 52/52 drive e2e (drive1-10 회귀 0 + drive11 5 추가)

### P1 명시 이관 (Codex 권고)

- **multi-instance 진짜 지원** — 현재 single-instance 만, 다중 윈도우 (각 별도 SQLite) 는 v1.1.x 별도 슬롯.
- **full JSON Schema → Zod 변환** — nested properties 까지. ajv-to-zod 등 의존 추가 필요 (v1.1.x).
- **mention UX 고도화** — 단순 banner 보다 inline diff / preview 등 (v1.1.x+).

### P0 종료

`v1.x-roadmap.md` 의 P0 (FAKE / SEC / COST / WS / MENT / META) 모두 청산.
Codex 결론: "v1.0.13 으로 P0 종료해도 된다. 추가로 보이는 P0 는 없다."

다음 슬롯은 v1.1.0 (P1) — Workspace UX 마무리 + Plugin Loader + Loading/Error states + Visual polish + Real CLI integration e2e.

## [1.0.12] — 2026-05-05

**COST-1 + COST-2 청산 — pricing 정직성 + 실제 hard limit enforcement.**

`docs/v1.x-roadmap.md` 1.2.3 의 비용 / 한도 묶음. v1.0.11 audit 인프라 위에
실제 차단 enforcement + unknown 모델 정직 분리. 두 항목은 한도 도달 정책의
prerequisite 라 같이 가는 게 자연스러움.

Codex 외부 검토 (2026-05-04 — `codex-question-3.md`) 의 picking 그대로 반영:
- (4a) **unknown 모델 + hard-limit 활성 = 즉시 차단** ("초과 방지" 가 hard
  limit 의 핵심).
- **MTD UTC 자동 reset** — 매월 1일 00:00 UTC, manual reset X (사용자 운영
  실수 위험).
- **하드 차단 (계속 진행 X)** — soft override 필요시 별도 명시 설정.
- **Pre-flight estimate**: durable MTD + reserved + 보수 (input + output_max).

### Added (Cost-1: 가격 정직성)

- **`MODEL_PRICING_LAST_UPDATED = '2026-05-04'`** 상수 + UI stale 경고.
  - 30일 미만 → 미표시 (fresh).
  - 30~89일 → 회색 hint.
  - 90일+ → 노란색 경고 banner ("가격표가 오래되어 비용 추정이 부정확할 수
    있어요").
  - 위치: Settings > 사용량 panel 상단. testid `usage-pricing-freshness`.
- **`priceUsage(model, usage) → { usd, found }`** — 정식 API. found=false
  면 미등록 모델. 기존 `estimateCostUsd` 는 호환 유지 (number 반환, 0 for
  unknown).
- **`estimatePreflightCost({ model, input_estimate_tokens, output_max_tokens })`**
  — pre-flight 보수 estimate. default output_max=4096.
- **`UsageEvent.unknown_pricing`** 컬럼 (migration 006). UI 가 "?" badge
  분기. translator (Claude / Codex / Mock) 모두 `unknown_pricing` 영속.
- **공식 가격 fetch (B 옵션 = HTML scrape)** 채택 X — Codex 권고대로 manual
  갱신 + provider Costs/Admin Usage API 어댑터는 별도 슬롯 (v1.1.x+).

### Added (Cost-2: hard limit enforcement)

- **`src/main/CostGate.ts`** — pre-flight 차단 모듈.
  - `checkBeforeStream({ model, input_estimate_tokens, output_max_tokens })`
    → `{ kind: 'allow' | 'block', ... }`.
  - 차단 reason: `'limit_exceeded'` | `'unknown_model_under_limit'`.
  - In-memory reserved ledger (`reserve(streamId, usd)` / `release(streamId)`)
    — 동시 진행 중 stream 의 보수 estimate 합산 → race condition 방지.
  - `getMonthToDateCostUsd(now?)` — UsageStore 새 helper, UTC 월 시작 시각
    이상 sum. 매월 1일 00:00 UTC 자동 reset (별도 reset 로직 X — query 가
    시작 시각만 필터링하므로 동일 효과).

- **`ai/start-stream` IPC gate** — main IPC boundary 에서만 enforcement
  (Codex 권고: renderer pre-flight 는 UX 용, trust 는 main 에서만).
  - 차단 시 즉시 `Result.fail` with `code: 'COST_LIMIT_EXCEEDED'` JSON
    payload (limit_usd / mtd_total_usd / projected_total_usd / reason).
  - Provider detection / spawn / stream 어떤 비용도 발생 X.
  - allow 시 `gate.reserve(stream_id, projected)` → `runStreamPump.finally`
    에서 `gate.release(stream_id)`.
  - alert_threshold 도달 시 audit 만 발행 (차단 X).

- **Stream 중 한도 도달 정책** — Codex 권고 그대로: 현재 turn complete,
  다음 turn 부터 차단 (mid-cancel X). UsageStore 의 durable 합계 + reserved
  합계가 다음 호출 gate 결정에 자동 반영.

- **CostLimitModal** (`src/renderer/components/cost/CostLimitModal.tsx`) —
  사용자가 차단을 명확히 인지하는 modal.
  - reason 별 i18n title/body (limit_exceeded vs unknown_model_under_limit).
  - 한도 / 이번 달 사용 / 예상 합계 / 다음 reset (매월 1일 00:00 UTC) 표시.
  - "한도 설정" 버튼 → Settings > 사용량 탭 직접 이동.
  - **"계속 진행" 버튼 X** — Codex 결정 (4a): hard limit 은 차단, override
    원하면 별도 명시 설정.
  - testid: `cost-limit-modal`, `cost-limit-modal-title`,
    `cost-limit-modal-stats`, `cost-limit-modal-open-settings`,
    `cost-limit-modal-close`.
  - i18n ko/en (`cost.modal.*`).

- **`parseCostLimitError(raw)`** — IpcStreamingProvider 의 error string 을
  파싱해 ParsedCostLimitError 또는 null 반환. App.tsx `onError` 에서 검사 후
  modal 발화.

### Added (audit_log 확장)

- **migration 006 — `audit_log.tool_id` 정식 컬럼** (Codex 권고: "audit/usage
  schema 동시에 손볼 때 같이 정리"). v1.0.11 의 ai_model 백필 debt 청산.
  - 이전 (v1.0.11) row: tool_id IS NULL, ai_model 에 backfill — UI 가
    `tool_id ?? ai_model` fallback 으로 호환 표시.
  - 신규 (v1.0.12) row: tool_id 직접 사용, ai_model 은 비워둠 (또는 cost
    audit 의 model 이 들어감).
  - Index `idx_audit_tool_id` 추가 (tool 별 통계 분석용).

- **새 audit event 종류**:
  - `cost.limit_blocked` — hard limit 도달로 ai/start-stream 차단.
  - `cost.unknown_model_blocked` — unknown 모델 + hard-limit 차단.
  - `cost.alert_threshold` — 임계값 도달 (차단 X, audit 만).
  - capability='NETWORK_AI' (AI 호출과 연관된 비용 결정).
  - target_json 에 limit/mtd/projected USD 직렬화.

### Migration 006

`src/storage/migrations/006_cost_v1_0_12.sql`:
- `usage_events.unknown_pricing INTEGER NOT NULL DEFAULT 0` + partial index.
- `audit_log.tool_id TEXT` + partial index.
- ALTER TABLE ADD COLUMN — SQLite 가 default 로 자동 backfill.

LATEST_SCHEMA_VERSION: 5 → 6.

### Verified

- typecheck clean
- lint: pre-existing 4 issues only (e2e/_drive.spec.ts, App.tsx) — 새 추가 0
- 403/403 unit (24 신규: pricing.cost1 11 + CostGate 13)
- 11/11 spawnSafe
- 47/47 drive e2e (drive1-9 회귀 0 + drive10 4 추가)
  - 35: COST_LIMIT_EXCEEDED 차단 응답 + JSON payload
  - 36: unknown 모델 차단 + audit 'cost.unknown_model_blocked' 영속
  - 37: pricing freshness banner mount (stale=false 정상)
  - 38: alert_threshold 도달 시 audit 'cost.alert_threshold' (차단 X)

### Notes

- COST-2 의 stream 중 차단은 의도적으로 next-turn 차단 — Codex 권고 ("현재
  turn complete 후 다음 turn 차단" 이 사용자 신뢰에 맞음). mid-stream cancel
  은 사용자가 명시 cancel 했을 때만.
- v1.1.x 후속: provider Costs/Admin Usage API 어댑터 (사후 reconcile/import
  용도) — admin key 필요 + freshness 지연 때문에 실시간 차단 단일 기준엔
  부적합 (Codex 결론).
- v1.3.x 후속: audit_log 의 `ai_model` 컬럼 deprecate 검토 — v1.0.11 백필
  데이터가 충분히 zero-out 되면 column drop 가능.

## [1.0.11] — 2026-05-04

**SEC-3 + SEC-4 청산 — audit_log 자동 기록 + tool result side_effects 정식 구조.**

`docs/v1.x-roadmap.md` 1.2.1 의 마지막 두 P0 보안 항목. 둘은 의존 관계 (SEC-3
의 target_json 데이터 무결성이 SEC-4 의 정식 구조에 기댐) 라서 묶음. v1.0.10
가 SEC-2 minimal 만 다루어 v1.0.10 슬롯이 의도와 어긋났던 것을 v1.0.11 에서
정정.

### Added (Security / Audit Trail)

- **SEC-4 — `ToolResult.side_effects` 정식 discriminated union**
  - 이전: `side_effects: never[]` placeholder. preload 가 `never[]` 로 노출
    하던 거짓 ABI 였음 (`docs/v1.x-roadmap.md` SEC-4).
  - 이제: `SideEffect = FileSideEffect | ProcessSideEffect | NetworkSideEffect`
    discriminated union. `op` enum 별로 식별자 (path / pid / url / cmd /
    exit_code) 구조화.
  - `ExecutionContext.record_side_effect(effect)` 가 Tool 의 정식 emit API.
    Queue 가 sink 콜백으로 buffer → `ToolResult.side_effects` 에 누적.
  - 보안 민감 payload (파일 내용, request body) 는 의도적 X — meta 만 기록.
  - `ShellRunTool` 가 첫 emit 사례: spawn 직후 `process.spawn` (cmd
    truncate 200 자, pid), close 시 `process.exit` (exit_code, signal).

- **SEC-3 — `audit_log` 자동 기록**
  - 이전: 001_init.sql 에 audit_log 테이블만 존재, 코드 어디서도 INSERT X.
  - 이제: 모든 `tool_use` 결정과 permission grant/denial 이 자동 영속.
  - 새 `src/storage/AuditLogStore.ts`:
    - `recordEvent(input)` — append-only INSERT.
    - `getRecent(limit, filter?)` — timestamp DESC, id DESC tiebreak.
    - `getBySession(sessionId, limit?)` — timestamp ASC.
    - `count(filter?)` — UI 페이지네이션용.
  - `ToolQueue` 의 새 옵션 `audit_sink: (event: ToolAuditEvent) => void` —
    main 의 closure 가 AuditLogStore 로 변환. Tools 모듈은 storage 직접
    의존 X (양방향 의존 회피).
  - 발행되는 event:
    - `tool_use.success` / `failed` / `cancelled` / `timeout` — 모든 결과.
      `target_json = JSON.stringify(side_effects)`.
    - `permission.denied` — Queue.checkPermissions 가 차단 시. capability +
      ResolvedTarget JSON.
    - `permission.granted` — `SessionStore.insertGrants` 가 새 grant 영속 시.
      `granted_by` / `scope` / `expires_at` / `reason` 보존.

- **`audit/*` IPC 채널** (read-only):
  - `audit/recent` — `{ limit?, session_id?, capability?, event_prefix?, from?, to? }` →
    `AuditEvent[]`. limit max 1000.
  - `audit/by-session` — `{ session_id, limit? }` → `AuditEvent[]` ASC.
  - preload 의 `dreampia.audit.recent()` / `dreampia.audit.bySession()`.

- **Settings > 진단 → 감사 로그 viewer**
  - `DiagnoseSettings.tsx` 에 `AuditLogSection` 추가 — 최근 50건 table.
  - 컬럼: 시각 / 이벤트 / 권한 / 결과 / 대상 (target_json truncate).
  - 결과 색상: success/granted = emerald, failed/denied = red,
    cancelled/timeout = yellow.
  - i18n ko/en 모두 추가 (`settings.diagnose.audit.*`).
  - testid `settings-diagnose-audit` / `settings-diagnose-audit-table` /
    `settings-diagnose-audit-row-{id}` / `settings-diagnose-audit-empty` /
    `settings-diagnose-audit-refresh`.

### Changed

- `ToolQueue.checkPermissions` signature 가 `call: ToolCall` 도 받음 —
  permission denial 시 audit event 의 session_id / turn_id / tool_id 를
  채우기 위해.
- `ExecutionContext.record_side_effect` 와 createContext 의 `sideEffectSink`
  arg 가 v1.0.11 에서 정식 wire-up. 이전 v1.0.10 까지 type 만 있었지만
  Queue 가 sink 를 createContext 에 전달하지 않아 placeholder 였음.
- `buildSuccessResult` / `buildFailedResult` 가 `side_effects?: SideEffect[]`
  param 받음 — 이전엔 항상 `[]` 반환.
- `SessionStore` 에 `setPermissionGrantAuditSink(sink)` 메서드 추가. main
  process 가 wire-up. 미설정 시 audit 미기록 (테스트 격리 호환).

### Added (Tests)

- `tests/storage/AuditLogStore.test.ts` — record + getRecent ordering +
  getBySession + filter (session_id / capability / event_prefix / from / to)
  + count + clamp + 빈 입력 방어 (12 시나리오).
- `tests/tools/Queue.audit.test.ts` — side_effects propagation (success +
  failed + 빈 배열) + audit_sink invocation (success/failed/TOOL_NOT_FOUND/
  permission denied 더블-emit) + sink throw 격리 (8 시나리오).
- `e2e/_drive9.spec.ts` — Round 9 drive harness:
  - 32: shell.run 이 process.spawn + process.exit side_effects 발행.
  - 33: audit/recent 가 tool_use.success entry 노출 (ai_model = 'shell.run').
  - 34: Settings > 진단 → 감사 로그 section + table row 확인 + screenshot.

### Verified

- typecheck clean
- 11/11 spawnSafe unit
- 새 unit 20+ 시나리오 (위 테스트들)
- e2e drive9 3/3
- 기존 e2e drive1-8 회귀 0

### Schema / ABI

- 기존 audit_log 테이블 (001_init.sql 124-142) 그대로 사용 — 새 migration X.
- `tool_id` 는 ai_model 컬럼에 임시 backfill (architectural debt B-2 의 일부).
  v1.3.x 에서 audit_log 컬럼 promote 권장 (별도 tool_id 컬럼 + index).

### Notes

- v1.0.10 의 SEC-2 minimal i18n 정정은 그대로 유효. 승인 modal + grant 추가/
  취소 UI 본격 구현 (full SEC-2) 은 여전히 v1.1.0 예정. SEC-3 의
  permission.granted 이벤트는 v1.1.0 의 grant API 가 들어오면 자동으로
  새 grant 도 audit 에 누적.
- COST-1 / COST-2 (pricing + hard limit) 가 v1.0.12 / v1.0.13 으로 한 슬롯씩
  미뤄짐. 로드맵 자체는 v1.x-roadmap.md 다음 갱신 시 정리.

## [1.0.10] — 2026-05-04

**SEC-2 minimal scope — 권한 i18n 정직성 + v1.1.0 deferred 명시.**

Codex 검토 (`docs/v1.x-roadmap.md` 1.2.1 SEC-2) 에서 발견된 권한 i18n 거짓말
정정. 승인 modal + grant 추가/취소 UI 본격 구현은 큰 작업 (Queue async
refactor + IPC 채널 + DB 흐름) 이라 v1.1.0 으로 분리. v1.0.10 은 사용자
기대 mismatch 만이라도 즉시 해소.

### Fixed (Honesty)

- **SEC-2 (minimal)**: 사용자에게 거짓말하던 권한 hint 정정
  - `settings.permission.hint.read_only`:
    - Before: "쓰기/실행은 매번 사용자 승인" (실제로는 즉시 deny — Queue 의
      `requires_user_confirmation` 처리)
    - After: "쓰기/실행은 차단 (승인 modal 은 v1.1.0 예정)"
  - `settings.permission.hint.custom`:
    - Before: "사용자 grant 로 직접 구성 (v0.13.0 에서 UI 추가 예정)" — v0.13.0
      이 이미 지났는데도 UI 없음
    - After: "사용자 grant 로만 capability 허용. grant 추가 UI 는 v1.1.0
      예정 — 현재는 거의 모든 capability 차단"

### Added

- **SEC-2 status banner**: PermissionPanel 상단에 노란색 banner —
  *"⚠ 권한 승인 modal / Grant 관리 UI 는 v1.1.0 예정. 현재 default level
  이 차단하는 capability 는 즉시 거부됩니다."*
  - testid `settings-permission-grant-status`
  - 사용자가 panel 열자마자 진짜 동작 한눈에 인지

### Verified

- typecheck clean
- e2e drive8: 2/2 PASS (banner visibility + read_only hint 거짓말 사라짐 검증)

### Deferred to v1.1.0 (full SEC-2)

- Queue 의 async pause-resume 흐름 (현재 sync deny → async wait for user)
- IPC 채널: `permission/request-confirmation`, `permission/confirmation-response`
- 승인 modal UI (capability + target + tool 정보 + Allow once / Allow always
  / Deny 버튼)
- `permission_grants` insert 로 grant 영구화
- Settings > 권한 panel 에 grant 목록 + revoke 버튼

## [1.0.9] — 2026-05-04

**SEC-1 청산 — workspace/read-file 의 symlink/junction 우회 보안 hole 수정.**

Codex 외부 검토 (`docs/v1.x-roadmap.md` 1.2.1) 에서 발견된 보안 hole. 이전엔
`path.resolve` prefix 만 검사 → workspace 안에 외부를 가리키는 symlink/
junction 을 두면 그 link 경로로 read-file 호출 시 외부 파일 읽힘.

### Fixed (Security)

- **SEC-1**: `src/main/ipc.ts` 의 `resolveInsideWorkspace` 가 이제 async
  + `fs.realpath` 까지 검증.
  - Step 1: `realpath(workspaceRoot)` — workspace 자체의 정규형 (macOS 의
    `/tmp` → `/private/tmp`, Windows junction alias 도 동일 form).
  - Step 2: `path.resolve(realRoot, relPath)` 후 prefix check (기존 동일).
  - Step 3 (신규): `realpath(target)` 으로 symlink/junction 따라간 후
    realpath 가 root 안인지 다시 확인.
  - 파일 미존재 시 realpath 가 throw → fall-through 하여 다음 stat() 단계의
    "file not found" 로 자연 처리 (false-positive 방지).

### Added

- `e2e/_drive7.spec.ts` — SEC-1 검증 2 시나리오:
  - 28: 외부 폴더의 secret 파일을 workspace 안에 symlink 로 배치 후 read 시도
    → reject 검증 (Windows non-admin 환경은 symlink 생성 불가로 skip,
    Linux / macOS / CI windows admin 에선 실제 trigger).
  - 29: 정상 in-workspace 파일 read positive control.

### Notes

- v1.0.10 (SEC-2): Permission grant UI/IPC/modal 본격 구현 — 별도 작업.
  Settings/i18n 의 "사용자 승인" 라벨이 실제로 동작하도록.
- vitest unit test (`tests/main/ipc.path-guard.test.ts`) 도 작성됐으나
  사용자 local Windows 환경의 better-sqlite3 ABI 한계로 로컬 미실행.
  CI (windows-latest with VS Build Tools) 에선 정상 작동.

### Verified

- typecheck clean
- e2e drive7: 2/2 PASS
- e2e 회귀: 18/18 (전 PASS 추정 — 회귀 결과 추후 갱신)

## [1.0.8] — 2026-05-04

**Panel 토글 시스템 + FAKE-1 청산.**

`browser.panel_visible` 이 schema/state 만 있고 UI/IPC 가 0 이었던 가짜
완성을 진짜 토글로 청산. 사이드바 토글 (Mod+B, v0.10.0) 패턴 그대로 차용.

### Added

- **FAKE-1 청산**: 미리보기 패널 토글 시스템
  - `ThreePanelLayout` 에 `previewVisible` prop (sidebarVisible 패턴 동일)
  - 단축키 `Mod+\\` (`shortcuts.ts` 의 `preview.toggle` action 신규)
  - ChatHeader 우측 [👁 / 👁‍🗨] 토글 버튼 — `aria-pressed` + tooltip
  - hidden 시 chat 패널이 우측까지 확장 (grid template `0px` collapse)
  - i18n 키 4개 (preview_hide_tooltip / preview_show_tooltip / 동 aria, ko/en)
- e2e drive6: 3 시나리오 (button click toggle, Mod+\\ shortcut, sidebar toggle 회귀)

### Changed

- `ThreePanelLayout` 의 grid template 을 Tailwind dynamic class → inline
  style 로 전환 (Tailwind compile 시점 한계 우회). `data-preview-visible`
  attribute 도 추가해 e2e selector 안정화.

### Verified

- 16/16 drive e2e PASS (drive1 + drive2 + drive5 + drive6, 30.3s)
- typecheck clean
- 토글 후 layout 전환 즉시 반영 (CSS class)

### 참조

- 다음 v1.0.9 (P0 가장 큰 묶음): SEC-1 (workspace/read-file symlink guard) +
  SEC-2 (permission grant UI/IPC 본격 구현)

## [1.0.7] — 2026-05-04

**ChatHeader UX 회귀 청산 + drive harness 강화 + version sync.**

v1.0.6 의 drift badge 가 ChatHeader layout 깨뜨린 게 drive harness 에서
통과됐던 사실 (Codex 외부 검토로 발견) 을 즉시 fix. 회귀 detection 자체부터
강화한 후 layout 재설계.

### Fixed

- **UX-REG-1**: ChatHeader 의 모든 자식 요소가 narrow 한 폭에서 wrap 되던
  문제. `flex-shrink-0` + `whitespace-nowrap` + 제목 `min-w-0` + drift
  badge 짧은 형태 (`⚠` icon only + tooltip) + workspace 버튼 `max-w-[160px]
  truncate` 로 안정적인 단일 row 보장.

### Removed

- **FAKE-3**: ChatHeader 의 `···` (more) 장식 span 제거. 핸들러 0 이라
  사용자 기대와 mismatch 였음. 진짜 dropdown menu 는 v1.1.0 작업.

### Strengthened

- **TEST-1**: `e2e/_drive5.spec.ts` 의 시나리오 23 에 ChatHeader layout
  guard 추가. 모든 header 자식의 `getBoundingClientRect().height < 30px`
  + header 전체 `< 60px` (h-12 + 여유) 검증. 이전 v1.0.6 의 깨진 layout
  은 이 guard 부재로 통과됐었음. 이제 회귀 자동 차단.

### Synced

- **META-1**: `package.json` version `1.0.5` → `1.0.7` (v1.0.6 의 commit
  drift 와 함께). 앱 내부 진단 패널의 "앱 버전" 표시도 정합.

### Verified

- drive 회귀 33/33 → 그대로 통과 (TEST-1 강화 후 ChatHeader fix 로 다시
  통과)
- spawnSafe unit 11/11
- typecheck clean

### 참조

- `docs/v1.x-roadmap.md` — Codex 0.125.0 검토로 발견된 9개 gap 통합 본
- 다음 v1.0.8: Panel 토글 시스템

## [1.0.5] — 2026-05-04

**Workspace UX bug bundle — 사용자 직접 검증으로 발견.**

사용자가 v1.0.4 dev 앱에서 [프로젝트] 클릭 → 폴더 변경했지만 sidebar /
ChatHeader 라벨 안 변경 + AI 가 자기 폴더를 junction path 로 응답하는 일관성
문제 발견. 4개 연결된 버그 일괄 fix.

### Fixed

#### Bug #1: 사이드바 [프로젝트] 클릭 비활성
- 증상: 사이드바 좌측 [📁 폴더] 클릭해도 동작 X
- 원인: v1.0.3 SidebarNavItem 자동 disabled 룰 (onClick 없으면) 이 [프로젝트]
  display 항목까지 disable
- Fix: `SidebarProps.onPickWorkspace` 추가 + Sidebar [프로젝트] 항목에 wire-up
  → App.tsx 가 `pickWorkspace` 호출

#### Bug #2: 폴더 변경해도 sidebar/ChatHeader 라벨 안 변경
- 증상: [프로젝트] 클릭 → dialog → 새 폴더 선택했지만 sidebar/ChatHeader 라벨
  옛 폴더 그대로
- 원인: `projectName` / `chatHeaderWorkspaceName` 둘 다 `activeSession.workspace
  .name ?? defaultWorkspace.name` 로 active session 우선 → 폴더 변경해도 active
  session 의 영구화된 workspace 가 그대로
- Fix: 두 라벨 모두 `defaultWorkspace.name` 만 사용. session.workspace 는 DB
  영구화 메타로 유지 (사용자 시각엔 항상 "현재 작업 폴더" 표시)

#### Bug #3: AI 가 자기 폴더를 junction path 로 응답
- 증상: 사용자가 "지금 폴더명 뭐야?" → AI 응답 "dreampia-cwd-99c329a1e5"
  (junction alias) → 사용자 혼란
- 원인 1: streaming 의 `workspaceRoot = activeSession.workspace.root` (옛 한국어
  폴더) → ensureAsciiCwd 가 junction 생성 → AI 의 process.cwd() = junction
- 원인 2: codex CLI 가 `-C/--cd` 옵션을 제공 — spawn cwd 와 별개로 working root
  를 명시 가능
- Fix 1: streaming `workspaceRoot = defaultWorkspace.root ?? session.workspace
  .root` (현재 작업 폴더 우선)
- Fix 2: CodexAdapter args 에 `-C, this.opts.cwd` 추가 — junction 으로 spawn
  되어도 AI 가 인식하는 working root 는 사용자 선택 폴더

#### Bug #4: @ 멘션 후보가 옛 폴더 파일
- 증상: 사용자가 폴더 변경 후 @ 입력 → 옛 폴더의 파일 후보 표시
- 원인: `mentionWorkspaceRoot = activeSession?.workspace.root`
- Fix: `mentionWorkspaceRoot = defaultWorkspace?.root ?? activeSession?.workspace
  .root` (현재 작업 폴더 우선)

### Verified

- 사용자 직접 dev 앱 테스트:
  1. [프로젝트] 클릭 → dialog → 폴더 변경 → sidebar/ChatHeader 즉시 갱신 ✅
  2. AI 에게 "폴더명 뭐야" → 사용자 선택 폴더명 정확히 응답 ✅
- 1430 vitest pass / 0 typecheck / 0 lint

### Files

- `src/renderer/App.tsx` — projectName, chatHeaderWorkspaceName, mentionWorkspaceRoot,
  effectiveWorkspaceRoot 모두 defaultWorkspace 우선 + Sidebar onPickWorkspace prop
- `src/renderer/components/sidebar/Sidebar.tsx` — onPickWorkspace prop + [프로젝트]
  onClick wire-up
- `src/providers/cli/CliProvider.ts` — codex args 에 `-C, cwd` 옵션 추가

## [1.0.4] — 2026-05-04

**3 production bug fix bundle — Windows + 한국어 워크스페이스 (사용자 직접 검증).**

사용자가 v1.0.3 dev 앱에서 직접 사용 후 발견한 3개 critical bug 즉시 fix.
모두 Windows-specific 이거나 한국어 폴더 경로와 관련.

### Fixed

#### Bug #1: 폴더 선택 dialog 안 뜸
- 증상: 온보딩 wizard step 4 [폴더 찾아보기] 클릭, [새 채팅] 시 picker
  호출했지만 OS dialog 가 main window 뒤로 가거나 표시 안 됨
- 원인: `dialog.showOpenDialog(opts)` — parent BrowserWindow 인자 누락 →
  Windows 에서 z-order 문제
- Fix: `BrowserWindow.fromWebContents(event.sender)` 로 parent 추출 후
  `dialog.showOpenDialog(parentWindow, opts)` 형태로 호출

#### Bug #2: codex CLI spawn EINVAL
- 증상: AI 응답 요청 시 "spawn failed: spawn EINVAL"
- 원인: Node.js 18.20.2+ / 20.12.2+ / 22+ 부터 child_process.spawn 으로
  `.cmd` / `.bat` 직접 실행 거부 (CVE-2024-27980 — Windows batch 파일
  argument injection 보안 fix). npm global 의 `codex.cmd` 가 영향.
- Fix: `src/providers/cli/spawnSafe.ts` 신규 — Windows + .cmd / .bat 시
  `cmd.exe /d /s /c` 로 wrapping. .ps1 은 powershell.exe 로 wrapping.
  `where codex` multi-line 결과 (확장자 없는 unix wrapper + .cmd) 중
  `.cmd` / `.exe` / `.bat` 우선 sort.

#### Bug #3: codex 한국어 워크스페이스 → server reject
- 증상: codex 응답 시 "Reconnecting... 2/5 (UTF-8 encoding error: failed to
  convert header to str for header name 'x-codex-turn-metadata' with value
  ...분석... )"
- 원인: Codex CLI 가 cwd 를 `x-codex-turn-metadata` HTTP 헤더에 raw bytes
  로 packing. 한국어 폴더 (`C:\Dev\분석\dreampia-dev`) 의 UTF-8 byte 가
  HTTP 헤더 ASCII 규약 위반 → server (chatgpt.com) reject → 5회 reconnect
  → 최종 실패.
- Fix: `ensureAsciiCwd(cwd)` — Windows 에서 cwd 가 non-ASCII 면:
  1. `cmd.exe for %I in (...) do @echo %~sI` 로 8.3 short path 시도
  2. 부모 폴더 8.3 disabled 면 long path 그대로 → junction fallback
  3. `%TEMP%\dreampia-cwd-<sha1>` 로 PowerShell `New-Item -ItemType
     Junction -Target <한국어 cwd>` 생성 (best-effort)
  4. junction path (ASCII-only) 를 spawn cwd 로 사용 → codex header ASCII
- 캐시: 동일 cwd hash 면 junction 재사용 (재생성 X)
- Fallback: junction 생성 실패해도 원본 cwd 그대로 사용 (silent best-effort)

### Verified

- 사용자 직접 dev 앱에서 codex 응답 받기 성공 (gpt-5.5 모델)
- 1430 vitest pass / 0 typecheck / 0 lint

### Files

- `src/main/ipc.ts` — workspace/pick-folder 에 parent BrowserWindow 추가
- `src/providers/cli/CliProvider.ts` — spawnSafe + ensureAsciiCwd 사용
- `src/providers/cli/detect.ts` — execPathLookup (multi-line where) +
  execLineSafe (.cmd 의 --version)
- `src/providers/cli/spawnSafe.ts` (신규) — spawnSafe / isDirectlySpawnable
  / ensureAsciiCwd / createJunctionAlias

## [1.0.3] — 2026-05-04

**UX Bug Fix — 사이드바 미구현 nav 항목 명시화 (사용자 직접 검증 후).**

사용자가 v1.0.2 release 후 실제 앱에서 좌측 메뉴 클릭 시 작동 안 하는 문제
보고. 진단 결과: `[플러그인]` / `[자동화]` SidebarNavItem 이 의도적
placeholder (Plugin Loader / Automation 은 v1.x 후보) 였지만, hover effect
는 살아있어 사용자에게 클릭 가능한 항목으로 보였던 design oversight.

### Fixed

- `Sidebar.tsx` SidebarNavItem 에 `comingSoon` + `comingSoonHint` prop 추가
  - `disabled` 속성 + `cursor-not-allowed` + `opacity-50` 시각화
  - `aria-disabled` 접근성 속성
  - 우측에 작은 "준비 중" 배지 표시
  - hover tooltip: "준비 중 — v1.x 에서 추가될 예정인 기능입니다"
- `[플러그인]` (TO-8/9/10 Plugin Loader) — comingSoon 적용
- `[자동화]` (Bot Automation) — comingSoon 적용
- onClick 누락된 SidebarNavItem 도 자동 disabled 가드

### i18n keys 추가

- `sidebar.coming_soon` (ko/en)

### Verified

- 1430 vitest pass / 28 e2e pass / 0 typecheck / 0 lint
- 사용자가 직접 dev 앱에서 GUI 클릭 테스트 후 발견 → 즉시 수정

## [1.0.2] — 2026-05-04

**Patch — v1.0.1 잔여 type stub 회수.**

v1.0.1 commit 에 사용자가 거부한 v1.1.0 (Image/PDF mention) type stub
(`src/types/mediaConstants.ts` + `src/types/conversation.ts` 의 ImageReference/
PdfReference Schema) 이 실수로 포함됨. 사용자 의도 ("앱 직접 검증" 만, v1.1
개발 보류) 존중하여 두 변경 모두 revert.

### Reverted

- `src/types/mediaConstants.ts` (삭제)
- `src/types/conversation.ts` 의 `ALLOWED_IMAGE_MIME_VALUES`,
  `ImageReferenceBlockSchema`, `PdfReferenceBlockSchema`, ContentBlockSchema
  union 새 entry 모두 제거

### Verified

- `npm run typecheck` / `lint` — 0 errors
- `npm test` — 1430 vitest pass / 28 e2e pass (이전 그대로)
- behavior 변경 없음 (해당 schema 들이 아직 어디서도 사용되지 않았음)

## [1.0.1] — 2026-05-04

**Patch — Smoke test outdated 수정 (실제 앱 검증 후 발견).**

사용자가 v1.0.0 release 후 "직접 앱 켜서 사용성/기능 테스트" 요청 →
Playwright Electron e2e 28 testcase 중 1 outdated test 발견. 실제 앱 동작은
정상. 테스트만 v0.7.0 변경에 맞춰 갱신.

### Fixed

- `e2e/smoke.spec.ts:35-44` — v0.7.0 (F-026 Chat Search) 에서 사이드바의
  "검색" placeholder button 을 SearchSection `<input>` 으로 의도적 변환했는데,
  smoke test 가 여전히 button 검색 → fail. testid + aria-label 기반으로 갱신.

### Verified

- `npm test` — 1430 vitest pass (변동 없음)
- `npm run test:e2e` — **28/28 pass** (이전 27/28)
- `npm run typecheck` / `lint` — 0 errors

### 사용자가 직접 검증한 항목

- 부팅 / 3-panel layout / IPC bridge / Korean nav (플러그인/자동화/프로젝트/
  채팅/설정/사용량) / SearchSection input / @ 멘션 popover / Slash 명령 popover
  / Settings 모달 / 단축키 모두 정상 동작 확인.

## [1.0.0] — 2026-05-03

**Production Release — feature complete, production-ready 한국어 우선
오픈소스 AI 코딩 데스크톱.**

v0.1.0 부터 v0.14.0 까지 14개 minor release 누적 위에 빌드 된 안정 버전입니다.
일반 사용자 대상 배포 가능. Codex 자체 조언으로 v1.0 정의 = "코드 서명, clean
install/upgrade smoke, packaged app 검증, 릴리스 노트/발표까지 묶는 최종 인증서
릴리스" — 인증서 매입은 사용자 액션 (Phase 5) 으로 분리하고 v1.0.0 자체는
**unsigned production release** 로 발행. 인증서 등록 후 v1.0.1 부터 자동 활성화.

### 핵심 가치 (v0.1.0 → v1.0.0 누적)

#### Phase 1 — Foundation (v0.1.0 ~ v0.1.2)

- Electron 33 + Vite 6 + React 18 + TypeScript 5.6 strict
- SQLite (better-sqlite3 + WAL + FTS5) — 5 migrations
- Multi-window leader election (heartbeat + TTL)
- Provider Adapter (Claude/Codex/Mock streaming)
- Tool Queue + 30+ capability + 4-tier sandbox
- BrowserView + partition isolation
- v0.1.0 — Linux+Win unsigned early adopter
- v0.1.1 — macOS DMG race condition fix (2-stage publish, Issue #1)
- v0.1.2 — ABI 자동 토글 (`predev`/`pretest` hook) + branded icons (SVG → PNG/ICO)

#### Phase 2 — MCP + Onboarding (v0.2.0 ~ v0.3.0)

- v0.2.0 — MCP Bridge MVP (stdio JSON-RPC, ready/disabled/error status)
- v0.3.0 — Onboarding 5-step wizard (welcome / CLI / auth / workspace / first-chat)

#### Phase 3 — Core Features (v0.4.0 ~ v0.7.0)

- v0.4.0 — Usage / Cost Tracking (Claude/Codex/Mock provider 분리)
- v0.5.0 — Slash commands (7 명령 + IME-safe + Cmd+K 팔레트)
- v0.6.0 — `@` 멘션 (file + session reference)
- v0.7.0 — Chat Search (FTS5 인덱싱)

#### Phase 4 — Polish (v0.8.0 ~ v0.14.0)

- v0.8.0 — Settings & Permissions (7 tabs: MCP / 사용량 / Provider / 권한 / 테마 / 단축키 / 온보딩)
- v0.9.0 — Usage CSV 내보내기 + 차트 + 비용 한도 + MCP 자동 discovery
- v0.10.0 — 사용자 지정 키보드 단축키 (Cmd+K/U/, etc)
- v0.11.0 — English i18n (vendor-free `t()` runtime)
- v0.12.0 — Cross-AI Verify/Compare (Claude vs Codex 동시 실행 + diff)
- v0.13.0 — Typed file/session reference blocks (chip 표시 + 백워드 호환)
- v0.14.0 — better-sqlite3 ABI 영구 안정화 + 자가 진단 도구 (`npm run diagnose`)

### v1.0.0 신규 추가 사항

- **Settings → 정보 (About) 탭** (`AboutPanel.tsx`) — 앱 이름 / 버전 / 라이선스 /
  GitHub repo / 코드 서명 status / 자동 업데이트 status. v1.0 사용자가 한 곳에서
  앱 정체성 + signing 상태 확인 가능. i18n ko/en 완전 지원.
- **`docs/code-signing.md`** — Win EV cert + Apple Dev ID 매입부터 GitHub Secrets
  등록까지 한국어 종합 가이드. 비용, 단계별 명령어, 검증 체크리스트, 트러블슈팅
  포함. 사용자가 인증서 매입 후 secrets 만 등록하면 다음 tag push 부터 자동 활성화.
- **`.github/ISSUE_TEMPLATE/smoke-matrix.md` v1.0 강화** — 17 단계 (다운로드 →
  설치 → 첫 실행 → onboarding → 첫 채팅 → 종료/재시작 → 자동 업데이트 → 단축키 →
  슬래시 → 멘션 → compare → 검색 → usage → MCP → BrowserView → i18n → 진단 →
  about → 위험 차단). 사용자 환경 정보 + 발견 이슈 자유 기재 영역.
- **발표 자료 4종** — `docs/announcement/{hackernews,reddit,producthunt,discord-launch}.md`.
  Hacker News (Show HN, 150자 영문), Reddit (r/programming + r/MachineLearning,
  영문/한국 OSS), Product Hunt (영문 + 사진 placeholder), Discord (한국 OSS
  커뮤니티). 각 플랫폼 톤 + 글자수 제약 준수.
- **`electron-builder.yml` 주석 강화** — secrets 미설정 시 unsigned silent skip,
  v1.0+ 인증서 활성화 시 토글할 항목 (identity, notarize, verifyUpdateCodeSignature)
  명확화. Win publisherName + macOS hardened runtime 표기 강화.
- **README v1.0 production banner** — "v0.1.2 Unsigned Early Adopter" → "v1.0.0
  Production Release" 변경. Phase 진척 5단계로 재구성 (Phase 1~4 ✅ 완료, Phase 5
  사용자 액션 대기). 발표 자료 4종 link 섹션 추가.
- **`package.json`** — version 0.14.0 → **1.0.0** ⭐
- **i18n keys (ko/en 각 12개)** — `settings.tab.about` + `settings.about.*` (title,
  description, app_name, version, license, repository, signing.signed/unsigned,
  auto_update.enabled/disabled, build_date 등).

### Tests (~9 new specs)

- **`tests/renderer/AboutPanel.test.tsx` — 9 spec.** 정상 렌더 / 앱 이름 +
  버전 표시 / 라이선스 표시 / GitHub repo link present / 코드 서명 status default
  (unsigned) 표시 / 자동 업데이트 status / 한국어 → 영어 i18n 토글 / panel testid
  안정성 / 빌드 일자 항목 존재.

### Migration / Compatibility

- **DB 스키마 변경 없음.** 5 migrations 그대로 (v0.14.0 와 동일).
- **Settings 탭 추가** — 'about' 탭이 'diagnose' 와 'onboarding' 사이에 삽입.
  기존 사용자의 활성 탭 영향 X.
- **package.json version pin** — `better-sqlite3@12.9.0` (v0.14.0 부터 caret
  제거 유지) — ABI 변동 0.
- **Rollback path:** package.json 0.14.0 으로 되돌리고 AboutPanel import 제거.
  i18n key fallback 으로 안전 (모르는 key 는 key 자체 표시).

### v1.0.0 검증

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors / warnings
- `npm test` — **1430 passed** (1421 baseline + 9 new)
- 5 SQLite migrations applied
- 9 IPC namespace (settings/auth/session/llm/tool/browser/mcp/usage/compare)
- 8 IPC handlers (workspace/list-files/read-file 등)
- production build 성공 (vite + electron-builder, 13 artifacts)
- Code-signing 인프라 검증 (secrets 등록 시 즉시 활성화)

### v1.0.0 알려진 제한

- **Unsigned**: cert 매입 전까지 SmartScreen / Gatekeeper 경고 (v1.0.1 에서 해결)
- **자동 업데이트**: 작동하지만 v1.0 → v1.0.1 (signed) 전환 시 한 번 manual install
  필요할 수 있음 (signature mismatch 우회용)

### 기여 / 발표

- GitHub: https://github.com/eonofpixel/dreampia-dev
- Issue / Discussion 환영
- Apache 2.0 license
- 발표 자료: `docs/announcement/`

## [0.14.0] — 2026-05-03

**Hardening release — A better-sqlite3 ABI 영구 안정화 + 사용자 자가 진단.**

Codex 권고 v0.14.0 (MOST RISKY — v1.0 직전 native module 위험 제거). v0.1.x
부터 사용해 온 `better-sqlite3` (native module) 의 ABI mismatch 가능성을 영구히
중화. `node:sqlite` 는 Electron 33 = Node 20 이라 사용 불가, `sql.js` (WASM)
는 메모리 + WAL 미지원 trade-off 가 사용자 데이터 증가 시 부담 → **better-sqlite3
유지 + 자동 토글 강화 + 자가 진단 도구** 채택. 이미 v0.1.2 부터 도입된 ABI 자동
토글 (`scripts/ensure-abi.cjs`) 위에 캐시 / postinstall / 사용자 진단 GUI / 부팅
무결성 검사 / CI sanity check 다섯 layer 추가. 사용자 마찰 0 + 문제 시 자가 진단.

### Added

- **`scripts/ensure-abi.cjs` 강화** — `.ensure-abi-state.json` 캐시 도입. 캐시
  키 = (target, Electron major, Node major, better-sqlite3 spec, binding mtime).
  매칭 시 child process spawn 까지 skip (~50-100ms 절약). rebuild 실패 시 사용
  자 친화적 진단 가이드 출력 (`npm run diagnose` / `dev:rebuild` / `test:rebuild`
  / node-gyp). package.json 의 Electron major 변동도 자동 invalidate.
- **`scripts/dreampia-diagnose.cjs` (신규)** — `npm run diagnose` 로 호출하는
  사용자 자가 진단 CLI. 검사 항목:
  - Platform / Arch
  - Node version (>= 22 검증)
  - Electron version (devDependencies spec)
  - better-sqlite3 binding 존재 / 경로 / 크기
  - Binding ABI ('node' / 'electron' / 'unknown')
  - Cache 상태
  
  `--json` 플래그로 머신-파싱 출력 (CI 친화). 컬러 TTY 자동 감지. exit 0/1.
- **`src/main/ipc.ts` — `app:diagnose` IPC handler (신규)** — Settings → 진단
  탭이 호출. SessionStore 가 없는 환경에서도 platform / process 정보 반환,
  store 가 있으면 schema_version / table_count / integrity_ok / wal_mode 까지
  채움. 항상 `Result<AppDiagnoseResult>` — 에러도 IPC 경계 안에서 처리.
- **`src/storage/SessionStore.ts` — `diagnose()` 메서드 (신규)** — Read-only
  자가 진단. PRAGMA quick_check (integrity) + PRAGMA journal_mode (WAL) +
  schema_version + table_count. 어떤 검사도 throw 하지 않음 (read-only contract
  보장). 결과는 `SessionStoreDiagnostic` 으로 export. `rewrapNativeLoadError`
  helper — `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION` / dlopen 패턴 catch
  → 사용자 친화적 한국어 메시지로 wrap (DB 경로 + 권장 명령 3종).
- **`src/storage/SessionStore.ts` constructor — native-load guard** — `new
  Database(...)` 가 throw 할 때 `rewrapNativeLoadError` 로 메시지 보강.
- **`src/main/index.ts` — boot-time 무결성 검사** — `app.whenReady` 안에서
  SessionStore 생성 자체를 try/catch (실패 시 `dialog.showErrorBox` + `app.exit`).
  생성 성공 후 `diagnose()` 호출, `integrity_ok=false` 면 packaged build 에서
  사용자 dialog 로 백업 권고 (DB 경로 표시) + 계속 진행 (사용자 export 기회 보장).
- **`src/main/preload.ts` — `app.diagnose()` 메서드 + `app:diagnose` 채널 화이
  트리스트** — renderer 가 안전하게 호출 가능.
- **`src/renderer/components/settings/DiagnoseSettings.tsx` (신규)** — Settings
  모달 [진단] 탭. 환경 (platform, arch, node, electron, app version) + DB
  (db_loaded, schema_version, table_count, integrity, wal_mode) 두 섹션 표시.
  Refresh 버튼으로 재검사. DB 로드 실패 / integrity 실패 / IPC 실패 세 가지
  분기. 명확한 fix 안내 (`npm run diagnose` / `dev:rebuild`). i18n ko/en.
- **`src/renderer/components/settings/SettingsModal.tsx` — 진단 탭 추가** —
  사이드바에 Stethoscope 아이콘 + `settings.tab.diagnose` 라벨 (ko: "진단",
  en: "Diagnose"). `language` 와 `onboarding` 사이에 배치.
- **`package.json` 변화**:
  - `version`: 0.13.0 → 0.14.0
  - `dependencies.better-sqlite3`: `^12.9.0` → `12.9.0` (caret 제거 — 의도 없는
    minor 업데이트로 ABI 변동 방지).
  - `scripts.postinstall`: 신규 — `electron-builder install-app-deps` 가 의존성
    설치 직후 native rebuild 자동 시도. 실패해도 npm install 자체는 success.
  - `scripts.diagnose`: 신규 — `node scripts/dreampia-diagnose.cjs`.
- **`.github/workflows/release.yml` — Verify native module presence step (신규)** —
  vite build 직전 binding 파일 존재 + 크기 검증. 누락이면 build fail (CI 안전망).
- **i18n keys (ko/en 각 25개)** — `settings.tab.diagnose` + `settings.diagnose.*`
  (title, description, refresh, loading, section.environment, section.database,
  field.*, value.*, status.*, error.*, hint.*).
- **docs/release.md — better-sqlite3 ABI 안정성 섹션 (v0.14.0 영구 해결)** — 7개
  보호장치 (자동 토글 + postinstall + 자가 진단 + DB 로드 실패 메시지 +
  부팅 무결성 + CI 검증 + version pin) 정리. `node:sqlite` / `sql.js` 검토 결과
  표 포함.
- **README.md — ABI 자동화 안내 + Troubleshooting** — 사용자가 `npm run diagnose`
  / Settings → 진단 탭 / `dev:rebuild` 명령 셋 발견 가능. v0.14.0 영구 해결
  명시 + 기존 "ABI 토글 매번 수동" 한계 ~~취소선~~.

### Tests (~22 new specs)

- **`tests/storage/SessionStore.diagnose.test.ts` — 12 spec.** diagnose() 정상
  반환 / schema_version 일치 / table_count > 0 / 반복 호출 idempotent /
  integrity_message+error 정상 시 미존재 / wal_mode 타입 검증 +
  rewrapNativeLoadError ABI 패턴 감지 (ERR_DLOPEN_FAILED, NODE_MODULE_VERSION,
  non-Error throwable, 일반 에러 통과).
- **`tests/main/ipc.app-diagnose.test.ts` — 5 spec.** 채널 등록 / store 없을
  때 platform 만 반환 / store 있을 때 DB 정보 채움 / arch 필드 / Result wrap
  contract.
- **`tests/scripts/dreampia-diagnose.test.ts` — 4 spec.** --json 모드 valid
  JSON / 핵심 check 이름 노출 / Node version 검사 통과 / plain text 출력.
- **`tests/renderer/DiagnoseSettings.test.tsx` — 6 spec.** 정상 렌더 / 새로
  고침 버튼 IPC 재호출 / db_loaded=false 분기 / integrity_message 표시 / IPC
  실패 시 error 블록 / panel testid 안정성.
- **`tests/setup.ts` — diagnose mock 추가** — `mockStore.diagnose` (정상
  default) + `mockStore.diagnoseError` (실패 트리거). beforeEach 에서 reset +
  vi.fn 의 mockClear 등록.

### Why this approach (vs. WASM / node:sqlite)

| 후보 | 결과 |
|------|------|
| `node:sqlite` (Node 22+ 내장) | Electron 33 = Node 20 → 사용 불가 |
| `sql.js` (WASM) | 동기 사용 시 전체 DB 메모리 로드 + WAL 미지원 → 사용자 데이터 늘면 부담 |
| `better-sqlite3` 유지 + 자동 토글 + 자가 진단 | ★ 채택 — 이미 v0.1.x ~ v0.13.x 안정 작동 |

새 native dep 추가 X, WASM 도입 X, 사용자 마찰 0 (이미 자동 토글) + 문제 시
자가 진단 도구 + 부팅 시 무결성 + CI sanity check.

## [0.13.0] — 2026-05-03

**Feature release — J Typed file/session reference blocks: chip 표시 + 백워드 호환.**

Codex 권고 v0.13.0 (HIGH RISK — schema migration). v0.6.0 의 `@` 멘션은 plain-text
prepend (`--- 컨텍스트 ---`) 방식이었는데, v0.13.0 부터는 `Turn.content` 의 `file_reference`
/ `session_reference` 를 typed block 으로 승격해 UI 가 chip 으로 표현하고, provider
가 정해진 fenced/quote 형식으로 재구성한다. **마이그레이션은 ADDITIVE 만** — 기존
TextBlock / MentionBlock / EmbeddedCardBlock 은 변경 X, 기존 v0.6 ~ v0.12 plain-text
멘션 turn 들은 그대로 read/round-trip 된다 (백워드 호환). 새 mention 부터 typed block
사용. v0.6 plain-text "--- 컨텍스트 ---" 섹션은 deprecated 되지만 caller (App.tsx) 가
`onSubmitBlocks` 콜백을 wire 하지 않은 환경 (e.g. legacy 통합 테스트) 에서는 fallback.

### Added

- **`src/types/conversation.ts`** — `FileReferenceBlockSchema` /
  `SessionReferenceBlockSchema` 두 신규 variant 가 `ContentBlockSchema` discriminated
  union 에 추가. file_reference 는 `path` (min 1) / `snippet` / `line_count`
  (nonneg int) / `truncated` 필수 + optional `language`. session_reference 는
  `session_id` (min 1) / `title` / `context_text` / `turn_count` (nonneg int) 필수.
  기존 variant 는 그대로 두어 backward compat.
- **`src/renderer/mentions/resolver.ts` — `resolveMentionsToTypedBlocks(resolved)`** —
  ResolvedMention[] 을 typed `ContentBlock[]` 으로 직렬화. file → file_reference,
  session → session_reference, error → inline `text` block (사용자에게 보이는
  "[오류]" 메시지). `stripMentionTokens(text, mentions)` 가 사용자 텍스트에서
  멘션 토큰 (`@<value>`) 을 제거하면서 양옆 공백을 정규화 (인접 공백 한 칸
  흡수). resolveSession 이 `session_title` + `session_turn_count` 를 함께 캡처
  하도록 ResolvedMention 확장 (additive 필드 — 기존 caller 는 영향 X).
- **`src/renderer/components/chat/FileReferenceChip.tsx`** — 신규 component.
  Collapsed: ChevronRight + FileText icon + path + line count + (optional)
  truncated badge. Expanded: snippet 의 `<pre>` 영역 (whitespace-pre-wrap +
  break-all + max-h-64 overflow-auto). `inverse` prop 으로 user-turn 흰 배경 /
  assistant-turn 회색 배경 두 색상 모드 분기. `data-language` attribute 로
  expanded 영역에 lang 힌트 노출.
- **`src/renderer/components/chat/SessionReferenceChip.tsx`** — 신규 component.
  Collapsed: ChevronRight + MessageCircle icon + title (없으면 sessionId
  fallback) + turn count. Expanded: context_text `<pre>` 영역. 별도 ExternalLink
  버튼 — `onPick` 미지정 시 disabled, 지정 시 클릭하면 부모로 sessionId 위임.
- **`src/renderer/components/chat/ChatPanel.tsx` — 새 props `onSubmitBlocks` /
  `onPickSession`** — TurnDisplay 가 `file_reference` / `session_reference` block
  을 만나면 chip 컴포넌트로 렌더. 마지막 text block index 를 미리 계산해 streaming
  cursor 가 chip 자리에 잘못 붙지 않도록 보호.
- **`src/renderer/components/chat/ChatInput.tsx` — `onSubmitBlocks?` prop** —
  지정되면 멘션 submit 시 (text, blocks) 형태로 호출 (text 는 멘션 토큰
  strip, blocks 는 file_reference / session_reference / 실패시 text(error)).
  미지정 시 v0.6 plain-text 경로 (onSubmit) 로 fallback — 기존 통합 테스트와의
  호환성.
- **`src/renderer/App.tsx` — `handleSubmitMessage(text, extraBlocks?)`** — 두 번째
  optional 인자가 typed block 배열. text 가 비면 `[text]` block 자체를 skip 해서
  user turn 을 chip-only 로 만든다. ChatPanel 에 `onSubmitBlocks` 와
  `onPickSession` (sidebar 의 sessions 안에 있을 때만 setActiveSessionId) 두
  콜백 wiring.
- **`src/providers/cli/CliProvider.ts` — `static renderTurnAsPrompt(turn)`** — user
  turn 의 ContentBlock[] 을 CLI prompt arg 로 직렬화. file_reference →
  `[파일] {path} (line 1-{n}[truncated])\n\`\`\`{lang}\n{snippet}\n\`\`\``,
  session_reference → `[세션] {title} ({n}턴)\n> {context_text 줄별}`. text /
  mention / image / file / embedded_card 도 동일 helper 에서 처리. 기존 stream
  메서드의 prompt 빌딩이 이 helper 를 사용하도록 변경 — 모든 turn 에 대해
  결정성 있는 직렬화 단일 출처.
- **`src/providers/ClaudeAdapter.ts` / `src/providers/CodexAdapter.ts`** —
  toClaudeContent / blockToText / fallbackBlockToText / toOpenAIContentPart 가
  새 두 variant 처리. 두 adapter 모두 동일한 fenced/quote 형식 반환 — CLI 와
  HTTP 양쪽 경로에서 model 이 일관된 prompt 를 받는다. CodexAdapter 는 static
  helper `formatFileReferenceText` / `formatSessionReferenceText` 로 직렬화 통합.
- **`src/storage/turnText.ts`** — `extractTurnText` 가 file_reference 의 path +
  snippet, session_reference 의 title + context_text 를 FTS5 인덱싱 대상에 포함
  (검색 결과에 chip 의 metadata 가 노출되도록).
- **i18n keys (ko/en 각 8개)** — `chat.file_reference.aria_label` /
  `.line_count` / `.truncated` / `.expand` / `.collapse` /
  `chat.session_reference.aria_label` / `.turn_count` / `.open_aria` / `.empty`.

### Tests (51 new specs)

- **`tests/types/conversation.typed-blocks.test.ts` — 16 spec.** ContentBlockSchema
  parses 신규 variants, optional language round-trip, empty path / negative
  line_count / non-boolean truncated reject, session_reference 빈 turn_count=0
  허용 / empty session_id reject, legacy text/mention/embedded_card 변경 없이
  parse, 알 수 없는 type reject (forward-compat 의도적 strict), Turn.content 에
  text + file_reference + session_reference 혼합 OK, 기존 plain-text "--- 컨텍스트
  ---" 단일 text block turn 도 round-trip.
- **`tests/renderer/mentions/resolver.typed.test.ts` — 10 spec.** empty input,
  file → file_reference 변환, session → session_reference (title +
  turn_count 캡처), error → inline text, mixed kind 순서 보존, resolveMentions
  end-to-end 로 session title 검증, stripMentionTokens (no mentions / single /
  trailing / multiple / 입력 순서 무관).
- **`tests/renderer/FileReferenceChip.test.tsx` — 6 spec.** path/line count
  collapsed, truncated badge 분기, expand/collapse toggle, inverse 클래스 적용,
  data-language attribute.
- **`tests/renderer/SessionReferenceChip.test.tsx` — 5 spec.** title +
  turn count, sessionId fallback, expand context_text, onPick 미지정 → disabled,
  onPick callback 호출.
- **`tests/providers/cli/CliProvider.blocks.test.ts` — 7 spec.** text-only,
  file_reference fenced code (header + 코드 블록, truncated 분기, language
  hint), session_reference quote block + sessionId fallback, mixed 순서 보존.
- **`tests/storage/SessionStore.legacy-blocks.test.ts` — 4 spec.** v0.6
  plain-text turn round-trip 그대로, v0.13 file_reference round-trip,
  session_reference round-trip, mixed turn round-trip — DB 마이그레이션 X 로도
  새 schema 가 동작.
- **`tests/renderer/ChatInput.typed-blocks.test.tsx` — 3 spec.**
  onSubmitBlocks 호출 시 text 가 strip 되고 blocks 에 file_reference 포함,
  미지정 시 v0.6 plain-text fallback, mention 없으면 typed 경로 활성이어도
  onSubmit(text) 사용.

### Migration / Compatibility

- **DB 스키마 변경 없음.** SessionStore 는 turn content_json 을 그대로 들고
  있고, 새 variant 는 ContentBlockSchema 의 추가 분기일 뿐. 기존 row 는
  parse 시 그대로 통과.
- **Legacy mention turn 들은 plain-text 형태로 보존된다** — UI 도 단일 text
  block 그대로 렌더 (chip X). 새로 입력하는 mention 부터 typed block.
- **TurnSchema strict mode 유지** — 알 수 없는 block type 은 reject. forward
  compat 보다는 안전성 우선.
- **Rollback path:** package.json 을 0.12.0 으로 되돌리고 ChatInput 의
  `onSubmitBlocks` 미주입 상태로 두면 v0.6 plain-text 경로만 활성. SessionStore
  의 round-trip 은 file_reference / session_reference block 도 보존하지만 UI
  는 그것을 무시 (모르는 type 으로 처리). 단, schema 자체에는 신규 variant 가
  남으므로 0.12 client 가 이미 0.13 형식의 turn 을 본다면 strict parse 로
  거부될 수 있다 — full rollback 시 typed-block turn 을 가진 row 는 제거
  필요.

### Verification

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors / warnings
- `npm test` — **1394 passed** (1343 baseline + 51 new)

## [0.12.0] — 2026-05-03

**Feature release — I Cross-AI Verify/Compare MVP: Claude vs Codex 동일 prompt 동시 비교.**

Codex 권고 v0.12.0. v1.0 차별화 기능. 사용자가 `/compare <prompt>` 슬래시
명령으로 같은 prompt 를 Claude / Codex 양쪽으로 동시에 실행하고 응답을
side-by-side 또는 line-by-line diff 로 비교한다. Codex 권고대로 MVP 범위:
(1) 동일 prompt 양쪽 실행, (2) 결과 영속, (3) 좌우 columns + 단순 diff,
(4) 실패 격리 — 한쪽이 detect / stream 실패해도 다른 쪽은 계속한다. 결과는
"이 응답 채택" 클릭 시 active session 에 user/assistant turn pair 로 inject.

### Added

- **`src/storage/migrations/005_compare_runs.sql`** — `compare_runs` 테이블 +
  `idx_compare_runs_session` / `idx_compare_runs_created` 두 인덱스.
  한 row 가 양쪽 (claude / codex) 의 status / model / 누적 text / error / start
  / finish timestamp 를 함께 보유. usage_events 와 동일하게 sessions 와 FK 는
  의도적으로 두지 않는다 (dangling reference 허용 — cross-process 안전성).
- **`src/storage/CompareStore.ts`** — `createRun` / `updateSide` /
  `finalizeRun` / `getRun` / `listBySession` / `deleteRun`. side patch 는
  REPLACE 시맨틱 (orchestrator 가 자체 누적 버퍼를 들고 매 delta 마다 통째로
  저장). `finalizeRun` 의 overall status 결정 규칙: 한쪽이라도 done 이면
  'completed' (실패 격리), 둘 다 error/skipped 면 'failed', 그 외엔 'running'.
- **`src/main/compare/orchestrator.ts`** — `runCompare` 가 양쪽 provider 를
  `Promise.allSettled` 로 병렬 실행. `pumpSide` 가 한쪽 stream 의 모든 yield
  단계를 try/catch 로 wrapping 하여 한쪽 throw 가 다른 쪽 abort 시키지 않는다.
  parent abortSignal 은 양쪽 sub-controller 로 forward.
- **신규 IPC channel `compare/run` / `compare/get` / `compare/list` /
  `compare/cancel`** — main 측 zod schema (`CompareRunArgsSchema` 등) 가
  payload 검증. prompt 길이 1~4000자, model 이름 1~120자 한정. orchestrator 가
  background 에서 stream 진행, 매 이벤트는 `compare/stream-event` 채널로 emit.
  `CompareHandlerConfig` 의 store / factory / runCompare override 로 test 에서
  child process 없이 검증 가능.
- **`src/main/index.ts`** — `CompareStore` 인스턴스 + `getDefaultProvider` 를
  wrap 한 `compareFactory` 주입. `before-quit` 에서 `shutdownCompareHandlers()`
  호출하여 활성 run 모두 abort.
- **`src/renderer/hooks/useCompare.ts`** — renderer-side state. `start` 가
  optimistic placeholder 를 setState 한 뒤 `compare/run` IPC 호출, 그 후
  `compare/stream-event` 를 구독하여 양쪽 누적 텍스트와 status 를 갱신. cancel
  / reset 은 idempotent. compare_complete 는 main 의 final row 를 그대로 채택
  (live accumulator 와 row 가 다를 수 있어 authoritative 가 우선).
- **`src/renderer/components/chat/CompareModal.tsx`** — fixed inset-0 모달.
  좌우 두 컬럼 (Claude | Codex), 각각 monospace + scrollable. 상단 header:
  prompt 요약 + 양쪽 model + status badge. 토글 버튼: "diff 표시" / "응답 표시".
  Diff 는 Codex 권고대로 LCS 같은 deep algorithm 없이 단순 line-by-line.
  하단: 각 side 별 "이 응답 채택" 버튼 (status='done' 일 때만 enable). Esc 도
  close (running 중이면 cancel 도 함께).
- **`/compare <프롬프트>` 슬래시 명령** — `SLASH_COMMANDS` 에 추가. argHint
  `<프롬프트>`. arg 가 비어 있으면 SlashHelpModal 로 안내. App.tsx 의
  commandHandlers 가 `compareHook.start({...})` 호출 + 모달 open. 양쪽 model 은
  MVP 에선 hard-coded (claude-3-5-sonnet-20241022 / gpt-5.5) — 향후 settings
  default 모델 pair 추가 예정.
- **응답 채택 (handleAcceptCompare)** — 사용자가 한쪽 응답을 채택하면 active
  session 에 user turn (원본 prompt) + assistant turn (채택된 텍스트, model
  metadata 보존) 을 append + persist. 모달 close + hook reset.
- **`compare.*` i18n keys (ko/en 양쪽 17개)** — title, prompt empty, side
  labels, status labels (pending/streaming/done/error/skipped), text waiting,
  diff toggle, accept/cancel/close 버튼.
- **`tests/storage/CompareStore.test.ts`** — 20 spec. migration / createRun
  pending 초기화 / updateSide REPLACE 시맨틱 / finalizeRun 의 4가지 상태 derivation
  / listBySession DESC + limit / deleteRun idempotent 검증.
- **`tests/main/compare/orchestrator.test.ts`** — 8 spec. happy path,
  failure isolation (one stream throws / one factory rejects), 양쪽 fail,
  abortSignal forwarded, persisted row matches, empty prompt rejection,
  message_start 이벤트로 model 갱신 검증.
- **`tests/main/ipc.compare.test.ts`** — 11 spec. Result.ok, zod rejection
  (empty / 4001자 prompt), stream events on `compare/stream-event` 채널,
  failure isolation visible via IPC events, get/list/cancel 동작, malformed
  payload 거절.
- **`tests/renderer/CompareModal.test.tsx`** — 9 spec. open=false → null,
  side panels render, status badge, accept disabled while streaming + enabled
  on done, accept callback args, diff toggle 양방향 + line classification,
  cancel 가시성, close 버튼, Esc 키 → onCancel + onClose, error 메시지 표시.
- **`tests/renderer/useCompare.test.ts`** — 8 spec. initial state, start
  optimistic seed, delta accumulator, compare_complete authoritative override,
  cancel forwards run_id, start failure → onError + isRunning false, reset
  clears state, unrelated run_id events ignored.
- **`tests/setup.ts`** — `compare` namespace mock + `compareRuns` /
  `compareEventListeners` / `compareCancelled` / `compareNextRunId` /
  `compareRunBehavior` 상태 + `__emitCompareEvent` test helper.

### Changed

- **`SLASH_COMMANDS`** — `compare` 항목 추가. `SlashCommandId` union 도 확장.
- **`src/storage/migrate.ts` + `LATEST_SCHEMA_VERSION`** — 4 → 5. migration
  V5 (compare_runs) 등록.
- **`tests/storage/SessionStore.test.ts`** — 두 곳의 `toBe(4)` 를 `toBe(5)` 로
  업데이트 (LATEST_SCHEMA_VERSION 변경 추적).

### Notes

- compare 는 실패 격리가 핵심 가치. orchestrator 의 `pumpSide` 가 자체
  try/catch 로 never-throws 라 한쪽 reject 가 절대 다른 쪽을 abort 하지 않는다.
  `Promise.allSettled` 도 추가 보호막 역할.
- diff 는 Codex 권고대로 단순 line-by-line. 두 array 를 같은 index 까지 비교
  하며 다른 줄은 양쪽 표시, 길이 차이는 짧은 쪽 끝까지 채운 후 긴 쪽 나머지를
  한쪽 only 로. LCS / Myers diff 같은 advanced algorithm 은 P1+ 검토.
- accept 시 active session 에 user turn 의 timestamp 가 새로 발급된다 — 즉
  compare 시점이 아닌 채택 시점이다. compare 가 chat history 의 일부가 아닌
  별도 영속 (compare_runs 테이블) 으로 다뤄지므로 자연스러운 UX.
- v0.13.0 후보 (Codex 권고): compare 결과의 비용 통합 비교, smart routing
  learning (사용자가 어느 쪽을 자주 채택하는지 통계), 자동 라우팅, 음성 비교.

## [0.11.0] — 2026-05-03

**Feature release — B2 영문 i18n: 핵심 화면 영어 opt-in.**

Codex 권고 v0.11.0. 한국어 default 를 그대로 유지하면서, 사용자가 Settings →
[언어] 탭에서 'English' 를 선택하면 chat / search / usage / settings / error
핵심 화면이 즉시 영문으로 전환된다. 외부 라이브러리 (react-intl / i18next)
도입 없이 ~7KB 의 vendor-free 자체 구현 (`src/renderer/i18n/`) 으로 처리해
bundle bloat 0. 누락된 키는 자동으로 한국어 fallback 되어 점진적 영문화에
안전. locale 변경 시 페이지 reload 불필요 — `useT` 훅이 subscriber pattern 으로
모든 mounted 컴포넌트를 reactive 하게 re-render 한다.

### Added

- **`src/renderer/i18n/index.ts`** — vendor-free i18n runtime. `setLocale` /
  `getLocale` / `subscribeLocale` / `t` / `useT` / `isLocale` 제공. 모든 메시지는
  build-time 에 JSON 으로 inline (Vite 가 처리). lookup 순서: 현재 locale →
  default ('ko') → key string 자체. `{name}` 형태 placeholder 보간 지원.
- **`src/renderer/i18n/messages.ko.json`** + **`messages.en.json`** — 사이드바 /
  검색 / 채팅 입력 / 채팅 환영 / 설정 / 권한 / 사용량 / 온보딩 welcome / IPC
  banner 등 ~110 key 분량의 메시지. JSON 양쪽 모두 동일 키 set 을 갖는다.
- **`src/renderer/components/settings/LanguageSettings.tsx`** — Settings 모달
  [언어] 탭. 한국어 / English 라디오 그룹. 변경 즉시 module-level
  `setLocale` 호출 + IPC `app:set-language` 로 영속. 변경 후 패널 헤더 자체가
  영문으로 전환되는 것을 확인할 수 있도록 reactive.
- **`src/renderer/components/settings/permissionLabels.ts`** — locale-aware
  PermissionLevel 라벨 resolver. 기존 `PERMISSION_LEVEL_LABELS_KO` (한국어 전용)
  를 보완해 ko/en 양쪽 모두 처리. 호출 패턴: `localizedPermissionLabel(t, level)`.
- **`AppSettings.language` 필드** — `'ko' | 'en'` 영속. 알 수 없는 값은 silent
  drop (corrupt-tolerant 패턴 유지). 미지정 시 'ko' fallback.
- **신규 IPC channel `app:get-language` / `app:set-language`** — main 의 enum
  검증 후 `settings.json` 에 영속. preload 의 whitelist 에도 추가.
- **App.tsx boot-time locale init** — 부팅 시 `app:get-language` 한 번 fetch
  후 `setLocale` 호출. 사용자가 LanguageSettings 에서 변경하면 거기서도 직접
  `setLocale` + IPC persist.
- **`SettingsModal` 의 [언어] 탭** — 단축키 ↔ 온보딩 사이에 신규 탭 (Languages
  icon). 기존 testid 호환 (`settings-tab-language` / `settings-panel-language`).
- **`tests/renderer/i18n/index.test.ts`** — 13 spec. `t` 의 fallback / 보간 /
  타입가드 / subscriber notification / 동일 locale 호출 시 no-op 까지 검증.
- **`tests/renderer/LanguageSettings.test.tsx`** — 6 spec. 라디오 변경 시
  IPC + setLocale + reactive re-render 모두 검증.
- **`tests/renderer/i18n/i18n.smoke.test.tsx`** — 6 spec. Sidebar / ChatInput
  이 locale 변경 시 한국어 ↔ 영어 라벨로 즉시 flip 되는지 smoke.

### Changed

- **`Sidebar.tsx` + `SearchSection.tsx`** — 모든 표시 라벨 (새 채팅 / 플러그인 /
  자동화 / 프로젝트 / 채팅 / 사용량 / 설정 / 온보딩 다시 보기 / 검색 placeholder
  등) 을 `useT` 로 변환. MCP status indicator 의 동적 라벨 ("3 준비" / "5 (2 오류)")
  도 i18n 키 + 보간으로 처리.
- **`ChatInput.tsx`** — placeholder / aria-label / 전송 버튼 / 키보드 힌트 라인
  (Enter 전송 · Shift+Enter 줄바꿈 · / 명령어 · @ 멘션) 영문화. 호출자가 명시
  placeholder prop 을 넘기면 그것이 우선 (override 가능).
- **`ChatPanel.tsx`** — IPC banner / WelcomeMessage (👋 안녕하세요 + 추천 prompt
  3개) / EmptyState / ChatHeader workspace 변경 버튼 / streaming cursor / 중지
  버튼 / 더보기 aria-label 모두 영문화. 추천 prompt 는 `WELCOME_SUGGESTION_KEYS`
  로 i18n 키 배열 export — caller 가 `t(key)` 로 resolve. 기존 `WELCOME_SUGGESTIONS`
  (raw 한국어 배열) 는 backward compat 용으로 deprecated 상태로 유지.
- **`SettingsModal.tsx`** — 7개 탭 라벨 + 모달 제목 + 닫기 버튼 + Provider /
  Permission / Theme / Onboarding 패널의 헤더 / 설명 / "불러오는 중..." / 권장
  뱃지 / "포함된 권한" 헤딩 등 모든 visible 문자열 영문화. tab 정의가
  `{id, labelKey, icon}` 으로 변경되어 t() 로 라벨 resolve.
- **`UsageSettings.tsx`** — 기간 preset (오늘 / 7일 / 30일) / CSV 내보내기 버튼 /
  비용 한도 헤더 / 한도 상태 (미설정 / 안전 / 경고 / 한도 초과) 영문화. 차트
  / 일별 표 / detail row 같은 secondary 영역은 한국어 유지 (점진적 확장 예정).
- **`PermissionDropdown.tsx`** — 4개 preset 라벨 + 툴팁 + aria-label 모두 영문/
  한국어 토글. `PERMISSION_LEVEL_LABELS_KO` 를 직접 사용하지 않고
  `localizedPermissionLabel(t, level)` helper 로 resolve.
- **`OnboardingWizard.tsx`** — Step 1 (Welcome) 의 제목 + [시작하기] 버튼 +
  footer nav 버튼 (이전 / 다음 / 건너뛰기) 영문화. Step 2~5 와 detail 안내는
  v0.11.1 에 추가 예정 (Codex 권고: chat/search/settings 핵심 화면 우선).
- **`tests/setup.ts`** — `__mockStore.language` (default 'ko') + 매 테스트마다
  `setLocale('ko')` reset. `getLanguage` / `setLanguage` mock 도 추가.

### Notes

- 외부 i18n 라이브러리 (react-intl / i18next / format-message 등) 는 도입하지
  않는다. ~7KB 의 자체 구현이 충분하며, ko/en 두 locale 만 지원하는 현 시점에
  `IntlMessageFormat` 의 plural / select / 시간/숫자 format 같은 기능까지는
  필요 없다. 추후 ja / zh 추가가 결정되면 재평가.
- 영문화 범위는 사용자가 가장 자주 보는 chat / search / settings / usage 핵심
  화면에 한정. detail 안내 (provider hint 의 일부 / onboarding step 2~5 / MCP
  설정 form 본문 등) 는 기존 한국어 그대로 — 점진적으로 확장한다.
- CHANGELOG / README / 코드 주석은 한국어 톤 유지 — 본 변경은 제품 UI 코드만
  i18n 처리.

## [0.10.0] — 2026-05-03

**Feature release — G (F-025 키보드 단축키): power-user UX 완성.**

Codex 권고 v0.10.0. v0.7.0 FTS 검색 / v0.9.0 사용량 가시성을 토대로 Cmd+K /
Cmd+U / Esc 등 핵심 단축키를 얹어 마우스 없는 navigation 을 가능하게 했다.
한글 IME composition 중 단축키 충돌은 `e.isComposing` + keyCode 229 이중
가드로 차단, macOS Cmd / Windows Ctrl 매핑은 "Mod" 토큰을 platform 별로
auto-resolve 해 같은 정의 한 벌로 양쪽 OS 를 커버한다. 사용자는 Settings
모달의 [단축키] 탭에서 모든 액션의 매핑을 자유롭게 변경할 수 있고, 충돌
검출 + 기본값 복원 + 전체 초기화까지 지원한다.

### Added

- **`src/renderer/keyboard/shortcuts.ts`** — 단축키 시스템의 single-source-of-
  truth. 8개 액션 (`search.focus`, `sidebar.toggle`, `settings.open`,
  `usage.open`, `chat.new`, `help.open`, `modal.close`, `chat.cancel`) 의
  default + 라벨 + 설명 + 카테고리 정의. `parseShortcut` / `matchesShortcut`
  / `formatShortcut` / `canonicalizeKeyEvent` / `shortcutsEqual` /
  `isMacOS` 함수 제공. "Mod" 토큰은 macOS 에서 ⌘ (Meta), 그 외엔 Ctrl 로
  resolve. macOS 표시는 ⌃ ⌥ ⇧ ⌘ 기호 (Apple HIG 순서), 그 외는
  "Ctrl+Shift+K" 형태.
- **`src/renderer/hooks/useKeyboardShortcuts.ts`** — 전역 keydown listener
  hook. App.tsx 에서 한 번만 mount 되어 SHORTCUT_DEFS 의 정의를 기반으로
  매 키 이벤트를 매칭. **IME 안전**: `e.isComposing` 또는 `e.keyCode === 229`
  검출 시 즉시 무시. **Editable element 가드**: input/textarea/contentEditable
  안에서는 Mod 가 없는 단순 글자키는 무시 (텍스트 입력 충돌 방지),
  단 Escape 와 Mod 조합은 항상 통과. `enabled=false` 로 wizard 활성 중에는
  전체 비활성. `overrides` 가 default 를 override.
- **`src/renderer/hooks/useKeyboardOverrides.ts`** — 사용자 지정 매핑을
  IPC 로 fetch + save. preload 미지원 시 빈 object → 모든 단축키 default
  사용 (graceful degrade).
- **`src/renderer/components/settings/KeyboardSettings.tsx`** — Settings
  모달 [단축키] 탭의 활성 패널. 카테고리별 (탐색 / 설정 / 채팅 / 모달)
  그룹핑 + 각 행의 [편집] / [기본값 복원] / [전체 초기화] 버튼. [편집]
  클릭 시 inline capture 모드 — 다음 keydown 이벤트를 캡처해 영속.
  충돌 검출 (다른 액션의 매핑과 같으면 reject + 한국어 error 메시지).
  default 와 같은 값을 입력하면 override 자체를 저장 안 함 (minimal 영속).
  헬프 라인: "Mod = ⌘ Cmd (macOS) / Ctrl (Windows / Linux)".
- **`AppSettings.keyboard_shortcut_overrides` 필드** — `Record<string,string>`
  영속. 알 수 없는 / 비-string / 빈 값 / 64자 초과 키/값은 silent drop
  (corrupt-tolerant 패턴 유지).
- **신규 IPC channel `app:get-keyboard-shortcuts` / `app:set-keyboard-shortcuts`**
  — plain object 검증, 빈 object 로 reset 지원.
- **App.tsx 의 단축키 wiring** — `keyboardHandlers` map 에서 `search.focus`
  (sidebar 검색 input focus + 사이드바 collapse 시 자동 펼침), `settings.open` /
  `usage.open` (SettingsModal 의 해당 탭으로 진입), `chat.new`, `sidebar.toggle`
  (Mod+B), `help.open`, `modal.close` (priority chain: slash help > settings >
  streaming cancel) handler 정의. `useKeyboardShortcuts` 가 wizard 비활성 중
  에만 enabled.
- **ThreePanelLayout `sidebarVisible` prop** — Mod+B 단축키로 사이드바 자리를
  0px 로 collapse, chat 이 그 자리를 차지. `data-sidebar-visible` attribute
  로 e2e 검증 가능.
- **SlashHelpModal — "키보드 단축키" 섹션** — 슬래시 명령 표 아래에 모든
  SHORTCUT_DEFS 를 platform-specific 형태로 표시. 사용자 override 가 있으면
  그 값을 우선 표시.
- **`tests/renderer/keyboard/shortcuts.test.ts`** — 31 tests. parseShortcut /
  matchesShortcut (macOS Mod=Meta, 그 외 Mod=Ctrl) / formatShortcut (⌘K vs
  Ctrl+K) / canonicalizeKeyEvent / shortcutsEqual / isMacOS / SHORTCUT_DEFS
  shape.
- **`tests/renderer/hooks/useKeyboardShortcuts.test.tsx`** — 11 tests. Mod+K
  fires / IME 가드 (isComposing + keyCode 229) / textarea 안 가드 / Escape
  always fires / overrides 적용 / enabled=false 무시 / first-match-wins
  (modal.close 가 chat.cancel 보다 우선).
- **`tests/renderer/KeyboardSettings.test.tsx`** — 8 tests. 8 행 표시 /
  default 표시 (Ctrl+K) / overrides 반영 / [편집] capture 모드 / 캡처된
  combo IPC 영속 / [전체 초기화] / [개별 reset] / 충돌 검출.
- **`tests/renderer/App.shortcuts.test.tsx`** — 8 tests. Mod+K → search
  focus / Mod+, → settings (mcp) / Mod+U → settings (usage) / Mod+/ →
  slash help / Esc → 모달 닫기 / Mod+B → sidebar toggle / IME 가드 /
  사용자 override 반영.
- **`tests/main/settings.keyboard.test.ts`** — 7 tests. 미설정 default /
  valid round-trip / non-string drop / 빈 값 drop / 잘못된 root (array /
  null) drop / 다른 settings 와 coexistence.
- **`tests/main/ipc.keyboard-shortcuts.test.ts`** — 10 tests. 채널 등록 /
  빈 default / round-trip / array / null reject / non-string silent drop /
  빈 string drop / 빈 object reset / 길이 상한 / 다중 write 일관성.
- **e2e `chat.spec.ts` keyboard tests** — 3 tests. Mod+K focuses 검색
  input / Mod+, opens settings (mcp) / Esc closes settings.

### Changed

- **`src/main/preload.ts`** — `app:get-keyboard-shortcuts` /
  `app:set-keyboard-shortcuts` whitelist + `app.getKeyboardShortcuts()` /
  `app.setKeyboardShortcuts()` 메서드 노출.
- **`src/main/settings.ts`** — `keyboard_shortcut_overrides` 필드 + read /
  write validation (key/value 둘 다 non-empty string + 64자 이하).
- **`src/main/ipc.ts`** — 두 신규 keyboard handler 등록.
- **`src/renderer/components/settings/SettingsModal.tsx`** — [단축키] 탭의
  placeholder `KeyboardPanel` 을 `KeyboardSettings` 컴포넌트로 교체. `KEY_PREVIEW`
  상수와 placeholder 텍스트 제거.
- **`src/renderer/components/chat/SlashHelpModal.tsx`** — 모달 제목을
  "슬래시 명령" → "슬래시 명령 & 단축키" 로 확장. 키보드 단축키 표 추가
  + IPC 로 사용자 override fetch (open 시).
- **`src/renderer/components/layout/ThreePanelLayout.tsx`** — `sidebarVisible`
  prop 추가, false 시 grid-cols 의 사이드바 자리를 0px 로 collapse +
  `aria-hidden`.
- **`src/renderer/App.tsx`** — `useKeyboardShortcuts` + `useKeyboardOverrides`
  wiring. `sidebarVisible` state + Mod+B 토글. SHORTCUT_DEFS 순서로
  modal.close 가 chat.cancel 보다 먼저 dispatch — Escape 의 priority chain
  (slash help > settings modal > streaming cancel) 을 modal.close handler
  안에서 단일 화 처리.
- **`tests/setup.ts`** — `mockStore.keyboardShortcuts` 추가, `app.getKeyboardShortcuts`
  / `app.setKeyboardShortcuts` mock 노출 + reset.
- **`tests/renderer/SettingsModal.test.tsx`** — Keyboard panel placeholder
  expectation 을 KeyboardSettings 의 row 검증으로 교체 (회귀 fix).

### Fixed

- **단축키 default 충돌 해결** — `modal.close` 와 `chat.cancel` 모두 Escape
  를 default 로 갖지만, SHORTCUT_DEFS 안에서 modal.close 를 먼저 등록해
  first-match-wins 정책 하에 modal.close 가 항상 dispatch 되도록. modal.close
  handler 가 priority chain (slash help > settings > streaming cancel) 을
  단일 화 처리.

### Compatibility

- 기존 v0.9.0 까지의 settings.json 은 `keyboard_shortcut_overrides` 가
  없는 상태로 그대로 호환 — 모든 단축키가 default 로 동작.
- preload IPC 미존재 (옛 빌드) 환경에서도 단축키는 default 로 동작 —
  사용자 지정만 silently no-op.

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
