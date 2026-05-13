# Code Quality Cleanup Audit — 2026-05-14

Scope: repo-wide code-quality scan with a bounded cleanup pass in the renderer code-mode surface.

## Baseline

| Check | Result |
| --- | --- |
| Git state before pass | `main...origin/main [ahead 2]` |
| Source/test/e2e files scanned | 527 |
| `npm run typecheck` baseline | pass, exit 0 |
| `npm run lint` baseline | pass, exit 0 |

Largest complexity hot spots by line count:

| File | Lines | Assessment |
| --- | ---: | --- |
| `src/main/ipc.ts` | 4352 | Broad IPC registry. High-risk to refactor without a dedicated IPC contract test plan. |
| `src/storage/SessionStore.ts` | 2304 | Storage boundary with many migration/fallback compatibility paths. Needs migration-focused cleanup only. |
| `src/renderer/App.tsx` | 1903 | App composition and wiring are dense. Candidate for future state/handler extraction. |
| `src/main/preload.ts` | 1903 | Bridge surface is large but contract-sensitive. Split only with preload API snapshots. |
| `src/renderer/components/chat/ChatPanel.tsx` | 1408 | UI surface is functional but dense. Future pass should extract header/status subcomponents. |

## Cleanup Plan

1. Lock behavior with existing focused tests around code mode storage preferences, recent files, quick open, and code panel.
2. Remove repeated localStorage try/catch wrappers in code-mode files.
3. Preserve explicit fail-safe behavior: storage failures remain non-fatal UI preference/cache misses.
4. Add a narrow unit test for storage exception handling.
5. Remove redundant pre-sorting in file-tree node building; keep the final single sort as the source of visible order.
6. Re-run targeted tests, then full static/unit/e2e verification.

## Fallback Review

| Finding | Classification | Action |
| --- | --- | --- |
| Code mode last-opened file, outline visibility, tree width, recents each had separate try/catch wrappers | Grounded UI preference fallback, but duplicated | Consolidated into `safeStorage` so failure semantics are explicit and tested once. |
| Corrupt recent-files JSON returned an empty list | Grounded compatibility/fail-safe fallback | Preserved and covered via existing `recentFiles` tests plus new `safeStorage` JSON test. |
| Large storage/provider/main fallback references elsewhere | Mixed; many are security or migration boundaries | Deferred. They need feature-specific tests before refactor. |

## Changes Applied

| File | Change |
| --- | --- |
| `src/renderer/utils/safeStorage.ts` | Added renderer-safe localStorage read/write/remove/JSON helpers. |
| `src/renderer/components/code/CodePanel.tsx` | Replaced repeated last-file/outline localStorage try/catch wrappers with safeStorage calls. |
| `src/renderer/components/code/FileTree.tsx` | Replaced width storage wrappers and removed redundant folder/file pre-sorts before final node sort. |
| `src/renderer/components/code/recentFiles.ts` | Reused safeStorage JSON parsing and write helper while preserving dedup/cap behavior. |
| `tests/renderer/safeStorage.test.ts` | Added regression coverage for storage success, corrupt JSON, and storage exceptions. |

## Remaining Findings

No P0/P1 spaghetti issue was found in the touched path after the cleanup pass. The remaining high-complexity files are real architectural hot spots, but they are contract-heavy and should be handled as separate goals:

- Split `src/main/ipc.ts` by domain after adding IPC handler contract snapshots.
- Extract `App.tsx` session/workspace/provider wiring into dedicated hooks after current e2e smoke is preserved.
- Split `ChatPanel.tsx` header/provider/status sections only after renderer snapshot tests cover each state.
- Review migration fallbacks in `SessionStore.ts` in migration-number order; do not remove compatibility paths without fixture coverage.

## Verification Evidence

| Check | Result |
| --- | --- |
| `npx prettier --write ...` on changed files | pass; all files unchanged |
| `npm test -- safeStorage recentFiles CodePanel QuickOpenModal` | pass, exit 0; 4 files / 55 tests |
| `npm run typecheck` | pass, exit 0 |
| `npm run lint` | pass, exit 0 |
| `npm test` | pass, exit 0; 230 files passed, 1 skipped; 2602 tests passed, 2 skipped |
| `npm run test:e2e -- e2e/_drive6.spec.ts e2e/golden-path-coding-loop.spec.ts e2e/_drive18_axe.spec.ts` | pass, exit 0; 11 passed |

Known non-blocking output:

- Security and permission negative-path tests still print expected fail-closed diagnostic logs.
- PDF.js extraction tests still print parser/font diagnostics.
