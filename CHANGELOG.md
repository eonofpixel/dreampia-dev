# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식. [SemVer](https://semver.org/lang/ko/).

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
