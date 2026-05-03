# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식. [SemVer](https://semver.org/lang/ko/).

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
