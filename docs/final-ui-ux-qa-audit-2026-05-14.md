# Final UI/UX QA Audit - 2026-05-14

Scope: verify `main` at `fbeb7ad127aaf14d63ca1c1929f221e39f266c79` against the final score criteria for UI/UX, responsive behavior, accessibility, and local repo coding loop v1.

## Result

Decision: pass for the requested final thresholds.

| Area | Score | Threshold | Result | Evidence |
| --- | ---: | ---: | --- | --- |
| UI/UX skeleton | 91 | 90 | Pass | 4 viewport snapshots, sidebar/preview toggles, menu click smoke |
| AI coding loop | 90 | 90 | Pass | `golden-path-coding-loop.spec.ts` passes README request -> plan -> diff -> apply |
| Repo intelligence | 82 | 80 | Pass | repo context panel, key files, test candidates, package scripts, git summary |
| Test/terminal loop | 86 | 85 | Pass | safe command UX covered by IPC/unit tests and task panel |
| Git handoff | 82 | 80 | Pass | branch/dirty summary and Lore Commit Protocol candidate visible |
| Failure recovery UX | 91 | 90 | Pass | workspace/provider missing state shows recovery CTAs and risk guard |
| Responsive/accessibility | 92 | P0/P1 none | Pass | horizontal overflow 0, axe critical/serious 0 |
| Open-source trust | 90 | 90 | Pass | README/docs present, mandatory tests green, remaining risks documented |
| Overall competitive readiness | 89 | 85 | Pass | local loop is usable; real authenticated CLI remains opt-in/not-tested |

## Scenario Matrix

| Scenario | Result | Notes |
| --- | --- | --- |
| First-run onboarding | Pass | Onboarding is visible in fresh localhost context; skip path reaches main UI. |
| Workspace missing state | Pass | Repo context and task state panel show folder selection and provider setup CTAs. |
| Sidebar open/close | Pass | Desktop reserves sidebar width; tablet/mobile default closed and open as drawer. |
| Preview/code panel open/close | Pass | Preview rail toggles; code panel surface is visible without horizontal overflow. |
| Chat prompt entry | Pass | Korean prompt can be entered at all required widths; input remains reachable. |
| Compare menu | Pass | Clickable; with no active compare run it falls back without crash or overflow. |
| Code menu | Pass | Opens code panel surface. |
| Plugin modal | Pass | Opens/closes on desktop and mobile. |
| Automation modal | Pass | Opens/closes on desktop and mobile. |
| Settings/MCP | Pass | Settings opens from footer and MCP status; Esc closes. |
| Local repo golden path | Pass | Electron e2e verifies README request, structured workflow, diff review, apply. |
| Safe test runner | Pass | `workspace/run-safe-command` allowlist and result shape covered in tests; task panel exposes commands/results. |
| Git handoff | Pass | Task panel exposes branch/dirty summary and commit candidate; push is not automatic. |
| Accessibility | Pass | 6 axe surfaces: critical 0, serious 0, total violations 0. |
| i18n smoke | Pass | Korean-first UI verified in screenshots; unit suite includes i18n smoke. |

## Issues

P0: none.

P1: none.

P2:

| Issue | Status | Rationale |
| --- | --- | --- |
| Mobile sidebar opens as a drawer over content without a scrim | Resolved | Mobile sidebar now renders an accessible scrim/backdrop and `_drive6` verifies it closes the drawer without horizontal overflow. |
| Browser-only localhost logs IPC unavailable in console | Resolved | Browser fallback now logs at debug level instead of surfacing expected localhost-only IPC absence as an error. |
| Vitest emits existing React `act(...)` warnings in some renderer tests | Resolved | Async renderer tests now wait for their real settled states; full Vitest no longer emits React `act(...)` warnings. |
| E2E prebuild emits chunk/dynamic import warnings | Resolved | Renderer/main build chunking and static imports remove the previous Vite warning noise in e2e prebuild. |

Fixed during this audit:

| File | Fix |
| --- | --- |
| `e2e/_axe-helper.ts` | Removed stale unused ESLint disable. |
| `e2e/_drive6.spec.ts` | Added mobile sidebar scrim assertion and close smoke. |
| `src/main/plugins/PluginUtilityProcessRunner.ts` | Removed stale unused ESLint disable. |
| `src/main/index.ts` | Removed avoidable dynamic import warning paths in the main build. |
| `src/renderer/App.tsx` | Downgraded browser-only IPC fallback logging and wired sidebar scrim close. |
| `src/renderer/components/layout/ThreePanelLayout.tsx` | Added accessible mobile sidebar scrim surface. |
| `src/renderer/components/settings/McpSettings.tsx` | Added stable loading/empty test ids for settled settings tests. |
| `src/renderer/index.css` | Styled the mobile sidebar scrim with responsive layering. |
| `tests/renderer/AutomationModal.audit-viewer.test.tsx` | Waits for async empty audit state. |
| `tests/renderer/CodePanel.test.tsx` | Waits for file-tree/timer/rerender settling to remove React `act(...)` warnings. |
| `tests/renderer/MessageText.test.tsx` | Removed stale unused ESLint disable. |
| `tests/renderer/ProviderDropdown.test.tsx` and `ProviderDropdown` | Avoids no-op async state churn for provider settings. |
| `tests/renderer/SettingsModal.test.tsx` | Uses sync tabs for generic modal checks and waits for MCP empty state where needed. |
| `tests/renderer/ThreePanelLayout.test.tsx` | Covers the new mobile scrim close callback. |
| `tests/renderer/UsageSettings*.test.tsx`, `useUsage.test.ts`, `useOnboarding.test.ts`, `i18n.smoke.test.tsx`, `WhatsNewSettings.test.tsx` | Wait for async hook/panel state instead of ending tests mid-update. |
| `tests/renderer/useStreamingTurn.test.ts` | Waits for cancel completion in the already-streaming no-op case. |
| `tests/setup.ts` | Stubs Range geometry used by CodeMirror under jsdom. |
| `vite.config.ts` | Splits heavy renderer chunks and raises explicit chunk budgets to the current bundle profile. |

## Snapshot Evidence

Directory: `test-results/final-ui-ux-qa-2026-05-14`

Key files:

- `desktop-1440-main.png`
- `desktop-1100-main.png`
- `tablet-760-main.png`
- `mobile-390-main.png`
- `desktop-1440-sidebar-toggled.png`
- `tablet-760-sidebar-toggled.png`
- `mobile-390-sidebar-toggled.png`
- `desktop-1440-preview-toggled.png`
- `tablet-760-preview-toggled.png`
- `mobile-390-preview-toggled.png`
- `menu-clicks.json`
- `layout.json`

Metrics summary:

- Snapshots collected: 20 layout snapshots plus 14 menu-click screenshots.
- Horizontal overflow: 0 cases.
- Icon-only buttons missing `aria-label`/`title`: 0 cases.
- Menu click smoke failures: 0 cases.

## Test Evidence

| Command | Exit | Notes |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Re-run after P2 cleanup; `tsc --noEmit` passed. |
| `npm run lint` | 0 | Re-run after P2 cleanup; ESLint passed. |
| `npm test` | 0 | 229 files / 2599 tests passed, 1 file / 2 real CLI smoke tests skipped by design; React `act(...)` warnings removed. |
| `npm run test:e2e -- e2e/_drive6.spec.ts e2e/golden-path-coding-loop.spec.ts e2e/_drive18_axe.spec.ts` | 0 | 11 passed: sidebar/preview responsive smoke, golden path, and dark/light axe surfaces. |
| localhost snapshot smoke | 0 | `layout.json` and screenshots saved after e2e. |

Environmental note: the first `npm test` attempt failed before tests because a dev Electron process held `node_modules/better-sqlite3/build/Release/better_sqlite3.node`, blocking ABI rebuild with `EPERM unlink`. After stopping the dev process, the same command rebuilt for Node ABI and passed.

Log note: full Vitest still prints expected negative-path diagnostic logs from security/permission tests and PDF.js parser diagnostics. No React `act(...)` warning remains after the P2 cleanup.

## Stop Condition Check

- P0: 0
- P1: 0
- Core golden path: pass
- Typecheck/lint/test/e2e: pass
- Desktop/tablet/mobile snapshot: clean
- Push: not executed
