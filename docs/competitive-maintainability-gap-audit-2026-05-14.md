# Competitive And Maintainability Gap Audit - 2026-05-14

Scope: Dreampia-Dev `main`, version `2.10.0`, compared against current AI coding tools and open-source references. This is an audit and planning artifact, not an implementation patch.

## Executive Verdict

Dreampia-Dev is now a credible Korean-first local desktop workbench, but it is not yet a 90+ competitor against OpenHands, Aider, Cline, Cursor/Windsurf, Claude Code, or the current Continue direction.

The strongest current assets are:

- Korean-first desktop UX with English i18n.
- Explicit review/apply surfaces.
- Visible permission and risk model.
- Local repo coding loop v1 with repo context, safe commands, and git handoff.
- Broad test suite and recent UI/e2e evidence.

The biggest competitive gaps are:

- Real agent execution is not proven by default CI or public smoke evidence.
- Repo intelligence is metadata-based, not semantic or task-aware.
- Test/terminal loop is a safe mini-runner, not a terminal/job/workflow system.
- Git handoff is advisory, without patch lineage or hunk-level accept/reject history.
- Code quality risk is concentrated in a few large orchestration files.
- Release trust is weakened by unsigned builds, `private: true`, Electron upgrade debt, and audit findings in dev/build dependencies.

Cold score against 2026 competitive expectations:

| Area | Current | 90+ Target | Verdict |
| --- | ---: | ---: | --- |
| UI/UX workbench shell | 86 | 90 | Close, but not yet as native as editor-integrated tools. |
| Actual AI coding loop | 72 | 90 | V1 loop exists, but real provider/CLI completion is opt-in and not benchmarked. |
| Repo intelligence | 62 | 90 | File metadata and scripts only; no semantic graph, symbol ranking, dependency awareness, or task memory. |
| Test/terminal loop | 70 | 90 | Allowlisted `typecheck/lint/test` runner is useful but narrow. |
| Git/patch handoff | 58 | 90 | Commit candidate exists; patch lineage, hunk decisions, and PR workflow do not. |
| Failure recovery UX | 82 | 90 | Better than before, but provider/CLI setup still too manual for first users. |
| Open-source adoption trust | 66 | 90 | Docs exist, but release/security/proven-real-provider gaps remain. |
| Code maintainability | 66 | 90 | Tests are strong, but orchestration files are too large and contract-heavy. |
| Overall competitive readiness | 72 | 90 | Good internal tool, not yet public category leader. |

## Competitor Baseline

Evidence from official docs and official repositories:

| Tool | Current baseline | What matters for Dreampia-Dev |
| --- | --- | --- |
| OpenHands | Local GUI can run via `openhands serve`, Docker, WSL/Docker on Windows, repo mounting, cloud/CLI/headless paths, LLM settings, local LLM and search configuration. Source: [OpenHands local setup](https://docs.openhands.dev/openhands/usage/run-openhands/local-setup). | Competes on full agent runtime, sandbox story, CLI/headless/cloud surfaces, repository automation. Dreampia lacks sandboxed autonomous runtime and headless workflow. |
| Aider | Terminal pair programming in local git repos, in-chat commands, chat modes, repo map, git integration, lint/test loops, IDE/browser options. Source: [Aider docs](https://aider.chat/docs/). | Competes on minimal install, direct repo editing, git-native workflow, benchmark culture. Dreampia has a friendlier GUI but less proven real edit/test throughput. |
| Cline | Editor/terminal agent that reads/writes files, runs commands, uses browser, requires approval, plus SDK/CLI/Kanban/JetBrains paths. Source: [Cline overview](https://docs.cline.bot/cline-overview). | Competes on tool breadth, human-in-the-loop execution, SDK core, multi-agent Kanban. Dreampia lacks SDK/headless/parallel worktree execution. |
| Roo Code | Official docs now say shutdown on May 15, 2026, but capability benchmark remains: local VS Code extension, cloud agents, modes, MCP, file system and terminal control. Source: [Roo Code docs](https://docs.roocode.com/). | Roo is no longer an adoption target, but its modes/checkpoints/orchestrator patterns are still competitive UX references. |
| Continue | Current official repository positions Continue around source-controlled AI checks in CI, markdown checks in `.continue/checks/`, red/green PR status, suggested diffs, and open-source CLI. Source: [Continue GitHub](https://github.com/continuedev/continue). | Dreampia needs source-controlled repeatable checks or review recipes, not only an app-local conversation state. |
| Cursor | Official docs/search results describe agent modes, terminal tools, code edits, MCP, CLI approvals, rules, and custom modes. Sources: [Cursor CLI docs](https://docs.cursor.com/en/cli/using), [Cursor tools docs](https://docs.cursor.com/agent/tools). | Cursor sets the expectation that agent work happens inside the editor with terminals, rules, MCP, and direct diffs. Dreampia must justify being a separate desktop shell. |
| Windsurf | Cascade includes Code/Chat modes, tool calling, voice input, checkpoints/reverts, real-time awareness, linter integration, MCP, terminal, workflows, deploys, context awareness, agent command center, worktrees, and AI commit messages. Sources: [Windsurf Cascade](https://docs.windsurf.com/windsurf/cascade/cascade), [Windsurf llms.txt](https://docs.windsurf.com/llms.txt). | Windsurf is far ahead in integrated IDE context, checkpoints, workflows, linter awareness, and multi-agent/task command center. |
| Claude Code | Official docs cover terminal/IDE/desktop/browser surfaces, agent loop, SDK, skills, hooks, MCP, custom tools, cost tracking, file checkpointing. Source: [Claude Code docs index](https://code.claude.com/docs/llms.txt). | Dreampia wraps Claude/Codex-style workflows but lacks comparable SDK, hooks, cost visibility depth, and checkpointing. |

## Dreampia-Dev Evidence

Local commands and code scan results:

| Evidence | Result |
| --- | --- |
| `git status --short --branch` | `## main...origin/main` before this audit doc was added. |
| `git ls-files` | 815 tracked files. |
| Scanned source/test/e2e/docs/scripts files | 739 files. |
| Total scanned lines | 165,721. |
| Source lines | 60,175. |
| Test/e2e lines | 55,881. |
| `describe/it/test` occurrences | 3,365. |
| TODO/FIXME/HACK/XXX occurrences | 27. |
| `as any` occurrences | 1. |
| `@ts-ignore` / `@ts-expect-error` occurrences | 8. |
| Files over 500 lines | 35. |
| `ipcMain.handle` registrations counted | 132 total; `src/main/ipc.ts` has 117. |
| `ipcRenderer.invoke` calls counted | 123 total; `src/main/preload.ts` has 120. |
| `npm audit --omit=dev --json` | 0 production vulnerabilities. |
| `npm audit --json` | 17 total audit findings: 10 high, 5 moderate, 2 low, mainly Electron/electron-builder/vitest/dev/build chain. |
| `npm outdated --json` | Major upgrade debt in Electron 33 -> 42, electron-builder 25 -> 26, Vitest 2 -> 4, Vite 6 -> 8, React 18 -> 19, Tailwind 3 -> 4, Zod 3 -> 4. |

Current product evidence:

- README declares current `v2.10.0`, Korean-first local AI coding workbench, local repo coding loop v1, safe commands, known limitations, and code signing caveat.
- `docs/open-source-readiness.md` states the product is not a hosted cloud coding agent and is strongest as local desktop use with explicit review before applying changes.
- `docs/golden-path-5-minute.md` documents the install, workspace, small request, diff review, safe validation, and current limits.
- `docs/local-repo-coding-loop-v1-audit-2026-05-14.md` says local repo loop v1 reached 90 for the narrow README golden path but notes semantic repo intelligence, patch lineage, and persistent terminal history as follow-ups.
- `docs/final-ui-ux-qa-audit-2026-05-14.md` documents passing UI/e2e/axe/snapshot evidence for final UI criteria.

Important implementation evidence:

- Before the first code-quality pass, `src/main/ipc.ts` implemented workspace scanning, git summary, safe command execution, app settings, automation, permission, workspace, session, browser, tool, MCP, usage, audit, AI streaming, and compare handlers in one large module.
- After the first code-quality pass, `src/main/workspace/repoContext.ts` owns repo context scanning, git summary, package script detection, safe command allowlisting, and safe command execution; `src/main/ipc.ts` keeps the IPC channel boundary and file read/write guards.
- `src/types/workspace.ts` defines `RepoContextSummary`, `RepoGitSummary`, and `CommandRunResult`.
- `src/renderer/components/chat/CodingTaskPanel.tsx` renders repo context, inferred task state, recovery CTA, safe command buttons, git summary, and commit candidate.
- `CodingTaskPanel` currently infers state from workspace/provider status, command results, streaming flag, and assistant text regex such as `diff|review|변경 후보|파일에 적용|apply`.

## Product Gap List

### P0 - Public Trust And Release Blockers

1. Electron/security upgrade debt blocks a confident public "commercial-grade" claim.
   - Evidence: `npm audit --json` reports high findings for `electron` and the electron-builder toolchain, while `npm audit --omit=dev` is clean.
   - Why it matters: Electron is a packaged runtime dependency in practice even if listed in devDependencies. Public desktop apps are judged by runtime security, not npm category semantics.
   - Fix: Plan and execute Electron major upgrade lane: Electron 33 -> latest supported train, electron-builder 25 -> 26, rebuild ABI, validate BrowserView/preload/security/e2e, update CI packaging matrix.

2. "90점" docs and actual competitive readiness are misaligned.
   - Evidence: prior docs score the narrow local repo loop at 90, but also state real provider smoke is opt-in and semantic intelligence/patch lineage/persistent terminal history are follow-ups.
   - Why it matters: Open-source users will judge the app by real repo success, not mock or deterministic golden path.
   - Fix: Reframe docs as "local repo coding loop v1 is validated; full competitive readiness requires v2 agent loop" until real provider CI/manual evidence exists.

3. Public package posture is contradictory.
   - Evidence: `package.json` has `"private": true` while README positions the project as open-source; code signing remains environment-dependent.
   - Why it matters: New contributors and release automation expect a clear publishing model.
   - Fix: Decide and document one posture: open-source desktop app but not npm-published, or publishable package. Add SECURITY.md/release provenance/signing status to README if not already sufficient.

### P1 - Core Competitive Gaps

4. Real provider/CLI loop is not first-class enough.
   - Evidence: golden path supports mock/dry-run and provider recovery; real authenticated CLI smoke is opt-in.
   - Competitor comparison: Cline, Claude Code, Aider, Cursor, Windsurf center actual file edit/command execution loops.
   - Fix: Add a stable real-provider smoke matrix that can run locally with credentials and writes a redacted artifact: provider detected, prompt sent, tool call parsed, diff produced, command/test observed.

5. Repo intelligence is metadata, not semantic context.
   - Evidence: `RepoContextSummary` stores language counts, key files, test files, scripts, git status; `inspectWorkspaceContext` ranks via path heuristics.
   - Competitor comparison: Windsurf advertises RAG/context engine and fast context; Aider has repo maps; Cursor/Claude Code rely on deep codebase context.
   - Fix: Add semantic index v1: symbol extraction, import graph, test-to-source mapping, recent-change weighting, prompt-to-file ranking, and budget visibility.

6. Task state is inferred, not durable.
   - Evidence: `CodingTaskPanel` uses regex over assistant text for review/test states.
   - Risk: UI state can lie if provider wording changes, localization changes, or agent output is partial.
   - Fix: Create persisted `CodingTask` model with explicit events: `context_ready`, `plan_created`, `patch_proposed`, `diff_reviewed`, `applied`, `test_started`, `test_finished`, `handoff_ready`, `failed_recoverable`.

7. Patch/diff workflow lacks hunk-level lineage.
   - Evidence: Apply modal and CodePanel exist, but git handoff is only summary/candidate.
   - Competitor comparison: modern tools expose accepted/rejected changes, checkpoints, file history, and revert paths.
   - Fix: Track each AI patch with source turn, target file, base mtime/hash, applied hunks, reject reason, resulting file hash, and test result linkage.

8. Test/terminal loop is too narrow.
   - Evidence: safe runner allows only `npm run typecheck`, `npm run lint`, `npm test`, 120s timeout, stdout/stderr tail.
   - Competitor comparison: Cline/Cursor/Windsurf/Claude Code run and monitor arbitrary commands with approval and recovery.
   - Fix: Add approved terminal jobs v1: command proposal, risk classifier, approval, background job output, cancel/rerun, parser adapters for TS/ESLint/Vitest/Playwright, and persistent history.

9. Git handoff is not enough for real open-source workflows.
   - Evidence: task panel shows branch/dirty counts and Lore commit candidate only.
   - Competitor comparison: Cline Kanban mentions auto-commit/worktrees; Windsurf offers AI commit messages and worktrees; Continue runs PR checks.
   - Fix: Add local git handoff v2: changed file ownership, user-vs-agent change separation, staging preview, commit message validation, PR checklist, no-push-by-default guard.

10. Menus and advanced surfaces are broader than proven workflows.
    - Evidence: README says Plugin and Automation are partially supported; many docs exist for future surfaces.
    - Risk: A new user sees breadth but may hit setup gaps.
    - Fix: Product-mode gating: label `Ready`, `Preview`, `Experimental`, `Needs setup`; hide or collapse experimental flows from default first-run path.

### P2 - Maintainability And Code Quality Risks

11. `src/main/ipc.ts` remains the main spaghetti-risk hotspot, but the first extraction has started.
    - Evidence before cleanup: 4,353 lines; 117 `ipcMain.handle`; contained workspace scanning, safe runner, git summary, automation, permission, sessions, browser, tools, MCP, usage, audit, AI, compare.
    - Evidence after cleanup: 3,638 lines in `src/main/ipc.ts`; `src/main/workspace/repoContext.ts` is a 463-line cohesive module for repo context and safe command behavior.
    - Fix: Continue splitting by domain only after contract snapshots: `ipc/app`, `ipc/workspace`, `ipc/session`, `ipc/browser`, `ipc/tools`, `ipc/mcp`, `ipc/ai`, `ipc/compare`, `ipc/automation`, `ipc/audit`.

12. `src/main/preload.ts` is a contract monolith.
    - Evidence: 1,904 lines; 120 `ipcRenderer.invoke` calls.
    - Fix: Generate or snapshot the preload API contract, then split implementation by namespace while preserving one exported `window.dreampia` shape.

13. `src/renderer/App.tsx` owns too much state.
    - Evidence: 1,904 lines; 36 `useState`; 18 `useEffect`.
    - Fix: Extract `useAppBootstrap`, `useSessionController`, `useWorkspaceController`, `useProviderController`, `usePanelLayoutController`, and keep `App.tsx` as composition.

14. `src/renderer/components/chat/ChatPanel.tsx` remains large.
    - Evidence: 1,409 lines with header, input area, landing, provider recovery, message display, turn display.
    - Fix: Extract header/status/recovery/landing/turn list into components with focused tests.

15. `src/storage/SessionStore.ts` is contract-heavy and risky to refactor casually.
    - Evidence: 2,305 lines; migrations and compatibility paths.
    - Fix: Do not split blindly. First add migration fixture matrix and DB contract snapshots; then extract query groups.

16. `tests/setup.ts` is too large.
    - Evidence: 1,827 lines of shared test mock infrastructure.
    - Risk: test behavior becomes implicit and hard to reason about.
    - Fix: Split into `setup/dom`, `setup/ipc`, `setup/workspace`, `setup/provider`, `setup/fixtures` with public helper exports.

17. E2E skip/stub inventory must be explicit.
    - Evidence: skipped preview annotation, malformed MCP manifest, automation timezone, multi-instance manual smoke, real CLI smoke opt-in.
    - Fix: Maintain `docs/test-gap-inventory.md` with owner, blocker, desired assertion, and target release.

18. Dependency upgrade debt is accumulating.
    - Evidence: `npm outdated --json` shows major-version drift for Electron, Vite, Vitest, React, Tailwind, Zod and others.
    - Fix: Create upgrade lanes by blast radius: security/runtime first, test toolchain second, React/Tailwind/Zod last.

19. The repo has good tests, but success criteria need public reproducibility.
    - Evidence: previous docs report thousands of tests and e2e pass, but real provider smoke is not default.
    - Fix: CI matrix should publish a concise verification artifact: typecheck/lint/unit/e2e, snapshot hashes, audit summary, skipped-tests inventory.

### P3 - Differentiation Opportunities

20. Make Korean-first the actual category advantage.
    - Add Korean task templates, Korean error summaries, Korean onboarding for provider setup, and Korean-first docs examples across real repo tasks.

21. Add source-controlled assistant recipes.
    - Inspired by Continue checks and Windsurf workflows: `.dreampia/checks/*.md`, `.dreampia/workflows/*.md`, local run UI, and PR-ready output.

22. Add checkpoint/revert model.
    - Inspired by Claude Code and Windsurf checkpointing: before applying AI changes, snapshot file hashes and allow task-level rollback.

23. Add benchmark harness.
    - Run a small open-source fixture suite: README edit, unit-test fix, accessibility fix, package script fix, migration review. Score pass/fail/time/cost.

24. Add "why this file" context explanations.
    - Each selected context file should show ranking reason, last modified, imports/dependents, test linkage, and omitted alternatives.

25. Add worktree/parallel task lane only after the single-agent loop is reliable.
    - Cline/Windsurf have parallel or command center stories. Dreampia should not copy this until task state, patch lineage, and terminal jobs are durable.

## 90+ Roadmap

### Sprint 1 - Trust And Reality Check

Goal: stop overclaiming and remove public trust blockers.

- Reword README/docs score language from "90 competitive ready" to "v1 golden path validated".
- Add `docs/test-gap-inventory.md`.
- Add real provider smoke artifact template.
- Add `npm audit` policy: prod audit must be 0; Electron runtime advisories tracked separately.
- Start Electron/electron-builder upgrade spike.

Exit criteria:

- Public docs no longer imply unsupported autonomous execution.
- `npm audit --omit=dev` clean.
- Electron upgrade plan has exact target versions and failing tests listed.

### Sprint 2 - Durable CodingTask And Patch Lineage

Goal: make the core coding loop stateful instead of inferred.

- Add `CodingTask` domain type and event log.
- Replace regex-only task state inference with task events.
- Store patch proposals with base file hash/mtime.
- Add hunk-level accept/reject data model.
- Link command results to task and patch id.

Exit criteria:

- README edit golden path proves task events, patch proposal, diff review, apply, test, git handoff.
- UI can show "what happened" without parsing assistant prose.

### Sprint 3 - Semantic Repo Intelligence v1

Goal: make context selection useful on unfamiliar repos.

- Add fast symbol extraction for TS/JS/JSON/Markdown first.
- Build import/reference graph for TS/JS.
- Add source-test pairing heuristics.
- Rank context by prompt terms, recent git changes, package scripts, and symbol graph.
- Show omitted files and budget.

Exit criteria:

- User prompt "이 컴포넌트 접근성 문제 찾아줘" shows relevant component, tests, i18n, and style files with reasons.

### Sprint 4 - Terminal/Test Jobs v1

Goal: compete with agent tools that can run real commands safely.

- Add command proposal object with risk level.
- Add approval UI for non-allowlisted commands.
- Add background job runner with cancel, output streaming, exit code, and parser adapters.
- Keep destructive commands and push blocked by default.

Exit criteria:

- `npm run typecheck`, `npm run lint`, `npm test`, targeted Vitest, and Playwright commands can be proposed, approved, run, summarized, and linked to a task.

### Sprint 5 - Git Handoff v2

Goal: make changes reviewable and committable without losing user work.

- Separate user dirty files from AI-touched files.
- Add staging preview.
- Validate Lore Commit Protocol candidate.
- Add no-push guard with explicit approval.
- Add PR summary/checklist export.

Exit criteria:

- New user can complete a small change and know exactly what to commit, what not to commit, and why push is blocked.

### Sprint 6 - Release Hardening

Goal: make open-source adoption defensible.

- Finish Electron/electron-builder upgrade lane.
- Decide `private: true` policy.
- Add SECURITY.md and release provenance notes if missing.
- Publish snapshot/audit/test artifacts from CI.
- Update README install and troubleshooting for real provider setup.

Exit criteria:

- Security posture, release posture, and first-run provider setup are clear enough for an external contributor.

## Final Recommendation

Do not spend the next cycle on more surface-area UI. The app has enough panels. The next competitive jump comes from making one real coding task impossible to misunderstand:

1. durable task model,
2. semantic context,
3. patch lineage,
4. safe terminal jobs,
5. git handoff,
6. real provider smoke evidence,
7. Electron/release trust cleanup.

If these land, Dreampia-Dev can credibly claim a distinct category: Korean-first local desktop AI coding workbench with explicit review and safety. Without them, it remains a polished wrapper with an optimistic golden path.

## Evidence vs Inference Boundary

Grounded evidence in this audit:

- Official competitor docs and repositories linked in the competitor baseline table.
- Local repository files: `README.md`, `package.json`, `docs/open-source-readiness.md`, `docs/golden-path-5-minute.md`, `docs/local-repo-coding-loop-v1-audit-2026-05-14.md`, `docs/final-ui-ux-qa-audit-2026-05-14.md`.
- Local implementation files: `src/main/ipc.ts`, `src/main/preload.ts`, `src/renderer/App.tsx`, `src/renderer/components/chat/CodingTaskPanel.tsx`, `src/renderer/components/chat/ChatPanel.tsx`, `src/storage/SessionStore.ts`, `tests/setup.ts`, `src/types/workspace.ts`.
- Local command outputs summarized above: git status, tracked file count, source/test line counts, skipped/stub test search, IPC/preload counts, TODO/type suppression counts, `npm audit`, and `npm outdated`.

Interpretations and scoring in this audit:

- The numeric scores are a cold product judgment against current competitor expectations, not a deterministic test result.
- The P0/P1/P2/P3 priority labels combine evidence, competitor comparison, and release risk; they should be re-ranked if the product goal changes from open-source adoption to internal-only use.
- The roadmap sequencing is an engineering recommendation: it assumes the next objective is 90+ competitive credibility for real local repo coding, not just UI polish.

Not verified in this pass:

- Live authenticated provider execution across Claude/Codex/OpenAI/Gemini.
- Fresh browser snapshots or Electron manual UI inspection; this audit reuses the existing final QA audit as prior evidence.
- Full e2e rerun; this pass is an audit and planning artifact.
- Runtime behavior of the listed competitor products beyond their official docs and repositories.
