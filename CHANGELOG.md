# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식. [SemVer](https://semver.org/lang/ko/).

## [0.1.0] — 2026-05-03

첫 공식 릴리스. Phase 1 + Phase 2 완료 (Codex audit GO 판정).

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

[0.1.0]: https://github.com/dreampia-org/dreampia-dev/releases/tag/v0.1.0
