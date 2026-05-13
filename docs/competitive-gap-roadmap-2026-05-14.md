# Dreampia-Dev Competitive Gap Roadmap

작성일: 2026-05-14 KST
범위: Dreampia-Dev를 오픈소스 AI 코딩 도구와 경쟁 서비스 기준으로 비교하고, 90점 이상 제품 경쟁력에 필요한 고도화 방향을 정의한다.

## 결론

Dreampia-Dev는 단순 UI 데모는 넘었다. Electron 데스크톱 앱, 한국어-first UX, Claude/Codex provider 표면, Mock provider, 코드 패널, diff/apply 모달, 권한/위험 작업 UX, human QA/e2e 문서가 있다.

그러나 OpenHands, Aider, Cline, Roo Code, Continue, Cursor, Windsurf, GitHub Copilot coding agent, Claude Code와 비교하면 아직 "검증된 AI 코딩 에이전트"라기보다 "Claude/Codex CLI를 안전하게 감싸는 로컬 GUI 워크벤치"에 가깝다.

가장 큰 전략은 OpenHands처럼 full cloud/sandbox agent platform을 바로 따라가는 것이 아니다. Dreampia-Dev는 **한국어-first local AI coding control tower**로 포지셔닝하고, 로컬 repo에서 context, plan, diff, tests, risk, git handoff를 가장 안전하고 읽기 쉽게 만드는 쪽이 현실적이다.

## 현재 점수

| 항목 | 현재 점수 | 90점 대비 부족한 부분 |
| --- | ---: | --- |
| UI/UX 골격 | 84 | agent task timeline, terminal/test 상태, git 상태가 제품 중심축이 아님 |
| 실제 AI 코딩 루프 | 68 | mock/e2e는 있으나 real provider + repo context + test/run/apply/commit 완주 경험이 약함 |
| repo intelligence | 50 | repo map, semantic index, symbol graph, relevance ranking 부족 |
| diff/review/apply 안전성 | 82 | hunk-level accept, checkpoint, undo history 부족 |
| 테스트/터미널 루프 | 58 | 앱 내부 persistent job, exit code history, failure parser 부족 |
| git/PR 루프 | 45 | git status/diff/branch/commit/PR 후보 UI 부족 |
| plugin/MCP/automation | 62 | real-world recipe, credential UX, failure recovery 부족 |
| 오픈소스 공개 신뢰도 | 60 | `private: true`, signing 제한, 실제 provider smoke 기본 비활성 |
| 종합 경쟁 준비도 | 64 | 사용 가능과 추천 가능 사이의 검증 격차가 큼 |

## 경쟁 제품 기준

| 제품 | 강점 | Dreampia-Dev의 격차 |
| --- | --- | --- |
| OpenHands | CLI/Web GUI/SDK, sandbox runtime, self-hosting, model-agnostic agent platform | sandboxed execution, durable lifecycle, pipeline automation 부족 |
| Aider | terminal-first, git repo 직접 편집, repo map, lint/test 자동 루프 | repo map과 git/test 루프가 1급 기능이 아님 |
| Cline | IDE/terminal에서 파일 읽기/쓰기, 명령 실행, 브라우저 사용, 승인 기반 action, checkpoint | checkpoint와 terminal feedback loop 부족 |
| Roo Code | role-specific modes, model-agnostic, auto-approval, orchestrator, semantic search | 작업 모드/skill/provider 선택이 제품 루프로 명확히 묶이지 않음 |
| Continue | IDE chat/edit/autocomplete/agent, context providers, model roles | inline IDE 편집, autocomplete, LSP context 부족 |
| Cursor | semantic codebase search, terminal, diff review, background agents, branch handoff | background task, semantic search, branch/PR handoff 부족 |
| Windsurf Cascade | Code/Chat mode, todo plan, queued messages, terminal/tools, checkpoints/reverts, linter integration | long-running plan/todo, queued follow-up, real-time linter/problem feed 부족 |
| GitHub Copilot coding agent | issue 할당 -> agent session -> branch/PR 생성 -> progress monitoring | issue-to-PR/remote handoff 없음 |
| Claude Code | terminal에서 plan/edit/run tests/commit/MCP/CI scriptability | 단순 wrapper면 가치가 약하므로 관찰/안전/한국어 UX가 차별점이어야 함 |

참고한 공식 문서:

- OpenHands product: https://hub.openhands.dev/product
- Aider docs: https://aider.chat/docs/
- Cline overview: https://docs.cline.bot/cline-overview
- Roo Code: https://roocode.com/ and https://docs.roocode.com/
- Continue docs: https://docs.continue.dev/getting-started/overview and https://docs.continue.dev/ide-extensions/chat/how-it-works
- Cursor docs: https://docs.cursor.com/en/agent/review and https://docs.cursor.com/background-agents
- Windsurf Cascade: https://docs.windsurf.com/windsurf/cascade/cascade
- GitHub Copilot coding agent: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/start-copilot-sessions
- Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview and https://docs.anthropic.com/en/docs/claude-code/mcp

## repo 근거

강점:

- `README.md`는 Dreampia-Dev를 Claude Code + OpenAI Codex 통합 GUI로 정의하고, project folder, chat, quick prompts, providers, code panel, compare, plugin, automation을 설명한다.
- `docs/golden-path-5-minute.md`는 프로젝트 선택, 첫 작업 요청, code panel, apply modal, validation commands를 golden path로 정리했다.
- `e2e/golden-path-coding-loop.spec.ts`는 workspace 선택, README 변경 요청, structured plan, code candidate, diff review, explicit apply 경로를 검증한다.
- `ApplyToFileModal`은 safety checklist, diff preview, cancel/apply 분기를 갖고 있다.
- `CodePanel`은 save/revert, diff toggle, mtime conflict polling을 제공한다.
- `CliProvider`는 Claude/Codex CLI adapter, permission level, suspicious stderr handling, sandbox flag를 갖고 있다.

약점:

- `package.json`의 `private: true`는 오픈소스 채택 신뢰와 배포 방향에 모순 신호를 준다.
- 실 provider 테스트는 opt-in 중심이라 기본 green이 실제 Claude/Codex 완주를 뜻하지 않는다.
- AI 응답 구조화는 task state machine보다는 텍스트 섹션 추출에 가깝다.
- 파일 탐색은 `workspace.listFiles` 기반이 많고 semantic repo map/LSP symbol graph가 중심 기능이 아니다.
- automation/plugin/MCP는 표면은 있지만 처음 설치한 사용자가 5분 안에 성공할 recipe가 부족하다.

## 핵심 고도화 방향

### 1. Repo intelligence

문제: 큰 저장소에서 AI가 왜 특정 파일을 봤고 어떤 context를 썼는지 설명하기 어렵다.

개선:

- `RepoIndex`를 1급 도메인으로 만든다.
- gitignore-aware scan, language stats, package scripts, test file mapping, import graph, recent changes, git diff를 저장한다.
- prompt 전송 전 context preview를 보여준다.
- 응답에는 "근거 파일/라인/선택 이유"를 표시한다.

90점 기준:

- "이 저장소 구조 설명해줘" 요청에 핵심 파일, 테스트/빌드 명령, 위험 영역을 근거와 함께 답한다.
- 1만 파일 이상 repo에서도 indexing status, excluded files, context budget을 설명한다.

### 2. CodingTask state machine

문제: agent 작업이 내부 상태가 아니라 채팅 텍스트에 묻힌다.

개선:

- `CodingTask` 상태를 도입한다: `draft -> context_ready -> planned -> editing -> review_ready -> testing -> applied -> failed`.
- provider streaming event, apply modal, code panel save, test run, git diff를 같은 task id로 연결한다.
- task panel에서 plan, context, files, diff, tests, risk, next action을 보여준다.

90점 기준:

- 사용자는 채팅 본문을 읽지 않아도 현재 작업 단계와 다음 행동을 알 수 있다.
- workspace 없음, provider 없음, file conflict, test failure가 모두 복구 가능한 task 상태로 남는다.

### 3. Test/terminal loop

문제: Aider/Claude Code/Cursor/Windsurf류 제품의 핵심인 run test -> read failure -> fix -> rerun 루프가 앱 중심 기능이 아니다.

개선:

- `CommandRun` 모델을 추가한다: command, cwd, status, exitCode, stdout/stderr tail, relatedTaskId.
- safe allowlist: `npm run typecheck`, `npm run lint`, `npm test`.
- 위험 command는 approval card로만 보여주고 자동 실행하지 않는다.
- TypeScript/ESLint/Vitest/Playwright failure parser를 만든다.

90점 기준:

- README 변경 후 앱에서 typecheck/lint/test를 실행하고 exit code와 실패 요약, rerun CTA를 확인할 수 있다.

### 4. Git review/commit handoff

문제: 오픈소스 사용자에게 가장 중요한 "무엇이 바뀌었고 어떻게 되돌리며 어떻게 커밋할지"가 아직 약하다.

개선:

- Git panel: branch, dirty files, staged/unstaged, AI-created vs user-created change 구분.
- task별 patch set 저장.
- hunk-level accept/reject와 full revert.
- Lore Commit Protocol 기반 commit candidate 생성.
- push는 항상 사용자 결정으로 남긴다.

90점 기준:

- AI 변경과 기존 사용자 변경을 분리해서 보여준다.
- 커밋 후보가 files, tests, risk, not-tested와 함께 제안된다.

### 5. Open-source trust

문제: 기능보다 "재현 가능성과 신뢰"가 부족하다.

개선:

- README를 "현재 가능한 것 / provider 필요 / 제한사항 / roadmap"으로 정리한다.
- `private: true` 유지 이유를 설명하거나 제거한다.
- sample repo와 screenshots/gif를 추가한다.
- CONTRIBUTING, SECURITY, release checklist, architecture overview를 추가한다.
- real provider smoke를 opt-in matrix로 문서화한다.

## 실행 로드맵

### Phase 0. 증거/문서 정리 (1-2일)

- README 지원/제한/real provider smoke 문구 정리
- `private: true` 결정
- screenshots/gif 추가
- open-source readiness 문서 갱신

### Phase 1. RepoIndex/context preview (1-2주)

- gitignore-aware scanner
- language/package/test/import/git diff metadata
- context preview drawer
- cited context UI

### Phase 2. CodingTask state machine (1-2주)

- task type/store/event schema
- task panel
- mock provider와 real provider event 통합
- provider 없음/CLI 없음 복구 UX

### Phase 3. Test/terminal runner (1주)

- command allowlist
- run status/exit code/log tail
- failure parser
- rerun/cancel

### Phase 4. Git review/commit candidate (1주)

- branch/status/diff UI
- AI/user change 구분
- hunk accept/reject
- Lore Commit Protocol commit candidate

### Phase 5. MCP/plugin/automation recipes (1주)

- GitHub MCP, docs search MCP, local script automation recipe
- credential/scope/risk/failure recovery UX
- 준비 중 기능과 실제 가능한 기능 분리

### Phase 6. 공개 배포 신뢰도 (1주)

- CONTRIBUTING/SECURITY/release checklist
- install notes
- sample project
- signed build/SmartScreen/codesign 제한 정리

## 다음 sprint 권장 목표

가장 먼저 할 것은 **local repo coding loop v1**이다.

성공 조건:

- RepoIndex/context preview가 실제 workspace 선택 후 동작한다.
- 사용자 요청이 CodingTask state machine으로 추적된다.
- task panel에 context, plan, changed files, diff, tests, risk, next action이 구조화되어 보인다.
- safe test runner가 typecheck/lint/test 실행 상태, exit code, 실패 요약, rerun CTA를 보여준다.
- README 변경 golden path가 mock e2e와 최소 1개 real CLI smoke opt-in으로 검증 가능하다.

이 작업이 끝나야 UI polish, plugin, automation 확장이 실제 경쟁력으로 연결된다.

## 2026-05-14 실행 상태: local repo coding loop v1

이번 sprint의 첫 구현 범위는 full semantic agent가 아니라 **검증 가능한 로컬 작업 루프 표면**이다.

구현된 범위:

- `workspace/inspect` IPC: gitignore/default ignore 기반 파일 스캔, 언어 통계, package scripts, 테스트 후보, key context 파일, git status 요약.
- `workspace/run-safe-command` IPC: `npm run typecheck`, `npm run lint`, `npm test`만 허용하고 command/cwd/status/exitCode/stdout·stderr tail/summary를 반환.
- Chat의 local task panel: Context, Task status, Test/Git handoff를 상시 표시하고 workspace/provider/repo/test 실패를 recoverable state로 노출.
- README golden path e2e 보강: context preview, safe command list, git handoff, commit candidate, structured plan, diff/apply 흐름을 같은 smoke에서 확인.
- 한국어-first i18n + 영어 i18n 키 추가.

아직 다음 sprint로 남는 범위:

- semantic repo map/LSP symbol ranking.
- AI-created change와 user-created dirty file의 정확한 patch lineage.
- hunk-level accept/reject 및 task별 undo/checkpoint.
- persistent terminal job history와 실패 parser 고도화.
- real provider smoke는 인증/환경 opt-in으로 유지.

재평가 기준:

| 항목 | 이전 | v1 후 목표 | 근거 |
| --- | ---: | ---: | --- |
| 실제 AI 코딩 루프 | 68 | 90 | context -> plan -> diff/apply -> safe tests -> git handoff가 한 화면에 연결 |
| Repo intelligence | 50 | 82 | metadata/package/git/test 기반 preview는 완료, semantic ranking은 후속 |
| Test/terminal loop | 58 | 86 | allowlisted safe runner와 result UX는 완료, persistent terminal은 후속 |
| Git handoff | 45 | 82 | branch/dirty/commit candidate는 표시, AI/user change 분리는 후속 |
