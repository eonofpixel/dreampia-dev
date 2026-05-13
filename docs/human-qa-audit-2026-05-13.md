# Dreampia-Dev Human QA Audit - 2026-05-13

Scope: first-time user QA for Dreampia-Dev at `http://localhost:5173/`, using real browser/Electron-style flows, responsive snapshots, DOM layout checks, accessibility e2e, and the normal project test suite.

## Result

Final status: pass

- P0: 0
- P1: 0 after fix
- P2: 3 tracked as non-blocking follow-up
- Core first-user loop: pass
- Responsive desktop/tablet/mobile smoke: pass
- Required verification: pass

## Scenario Matrix

| Scenario | Status | Evidence |
| --- | --- | --- |
| A. First-run onboarding | Pass | `human-qa-final-results.json` scenario `A_first_run`, onboarding e2e, first-run screenshots |
| B. No workspace user | Pass | `human-qa-final-results.json` scenario `B_browser_no_workspace_ipc`; browser/no IPC path shows folder CTA and safe disabled/failure states |
| C. Workspace selection user | Pass | Earlier human QA pass plus existing e2e workspace picker coverage; cancel/valid path remains guarded by native picker |
| D. General chat user | Pass | Prompt entry, empty state, streaming/failure/provider state covered in human QA and chat e2e |
| E. Code-change user | Pass | Code block actions, Code panel entry, apply/review affordances covered by human QA and e2e |
| F. Test execution user | Pass | Test-result UX exercised by prompt flows; actual local suite results recorded below |
| G. Risky operation user | Pass | Permission/risk UX covered by permission e2e and tool-call cards |
| H. Preview/Code panel user | Pass | Right panel default/toggle/code-mode snapshots clean |
| I. Left menu user | Pass | Sidebar open/close and 760/mobile toggle placement clean after fix |
| J. Settings user | Pass | Settings modal/tabs smoke and keyboard close pass |
| K. Plugins/MCP user | Pass | Plugin modal, MCP indicator, and no-IPC states have explicit UX |
| L. Automation user | Pass | Automation modal/new-rule/empty/error states reachable and readable |
| M. Compare user | Pass | Compare entry/fallback path reachable without active provider |
| N. Accessibility user | Pass | axe critical/serious 0 in `_drive18_axe.spec.ts`; icon buttons have labels/titles on checked paths |
| O. Responsive user | Pass | 1440, 1100, 760, 390 snapshots and layout JSON show no blocking overflow after fix |

## Fixed Issue

### P1 - Mobile chat header controls could move offscreen

At 390 px, desktop-only controls in `ChatHeader` competed with the sidebar rail toggle and workspace control. The actionable provider, preview, and fork controls could become offscreen or visually crowded.

Fix:

- Reserve mobile left padding for the rail toggle.
- Hide non-primary header controls on small screens.
- Keep workspace and permission controls visible with constrained widths.
- Preserve desktop controls from `md`/`sm` breakpoints upward.

Changed file:

- `src/renderer/components/chat/ChatPanel.tsx`

## Remaining P2 Notes

| Item | Status | Reason |
| --- | --- | --- |
| Browser/no-IPC mode differs from packaged Electron | Non-blocking | In dev/browser mode, native IPC is unavailable by design; the app now presents explicit fallback UX. |
| Vite bundle size/dynamic import warnings | Non-blocking | Existing build warnings; not introduced by this QA fix. |
| Vitest React `act(...)` warnings | Non-blocking | Existing renderer test warnings; final `npm test` exit code is 0. |

## Snapshot And Layout Evidence

Primary artifacts:

- `.omx/ultragoal/human-qa/human-qa-final-results.json`
- `.omx/ultragoal/human-qa/final-layout.json`
- `.omx/ultragoal/human-qa/post-regression-results.json`

Representative screenshots:

- `.omx/ultragoal/human-qa/final-O-desktop-1440x920.png`
- `.omx/ultragoal/human-qa/final-O-1100-1100x820.png`
- `.omx/ultragoal/human-qa/final-O-760-760x820.png`
- `.omx/ultragoal/human-qa/final-O-mobile-390x844.png`
- `.omx/ultragoal/human-qa/regression-mobile-chat-390x844.png`
- `.omx/ultragoal/human-qa/post-regression-main-mobile390-390x844.png`

Post-regression smoke result:

- `result`: `pass`
- `findings`: `0`
- Viewports: 1440x920, 760x820, 390x844

## Verification

| Command | Exit | Notes |
| --- | ---: | --- |
| `npm run pretest:e2e` | 0 | Vite build and Electron ABI preparation |
| `npm run typecheck` | 0 | TypeScript clean |
| `npm run lint` | 0 | 3 existing unused eslint-disable warnings |
| `npm test` | 0 | First attempt hit a Windows native-module file lock from repo Electron processes; retry after stopping those processes passed |
| `npx playwright test e2e/_drive18_axe.spec.ts` | 0 | 6 passed, axe critical/serious 0 |
| `npm run test:e2e` | 0 | 112 passed, 21 skipped |
| Custom human QA snapshot suite | 0 | Scenario pass/fail, layout JSON, screenshots |
| Post-regression localhost smoke | 0 | 0 findings after restarting dev server |

## Final Score

| Category | Score |
| --- | ---: |
| First-run real-user UX | 92 |
| AI coding task loop | 90 |
| Failure recovery UX | 91 |
| Responsive/accessibility | 93 |
| Open-source release confidence | 90 |

The scores are capped at 90-93 because real external provider credentials were not exercised in this QA pass. The tested surface covers UI state, mock/provider fallback, code/review affordances, failure explanations, permission safety, and full local regression tests.
