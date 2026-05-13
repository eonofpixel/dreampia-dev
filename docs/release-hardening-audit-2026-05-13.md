# Release Hardening Audit - 2026-05-13

Scope: v2.10.0 Dreampia-Dev UI/core-loop hardening against OpenHands, Aider, Continue, and Roo Code style open-source AI coding tool expectations.

## Baseline

| Category | Starting score | Reason |
| --- | ---: | --- |
| UI/UX skeleton | 65 | Basic three-panel shell existed, but first-run and responsive states still hid or overlapped important controls. |
| AI coding agent competitiveness | 40 | Provider/IPC/code surfaces existed, but first-run users could hit dead quickstarts or unclear disabled states. |
| Open-source adoption readiness | 35 | README still carried stale release language and did not clearly separate supported surfaces from limitations. |
| Internal developer usability | 55 | Local dev/test path existed, but user flow evidence and failure messaging were not consolidated. |
| Overall | 45-50 | Demoable shell, not yet defensible as a new-user repository workflow. |

## Findings And Fixes

| Priority | Finding | Fix |
| --- | --- | --- |
| P0 | No current crash or blank-screen blocker found in the browser smoke path. | N/A |
| P1 | Empty chat quickstarts looked actionable before a project folder was available. | Quickstarts now require a workspace, expose a central folder-picker CTA, and have renderer tests for disabled/active behavior. |
| P1 | Fresh/mobile empty state could push the input/send button below the viewport. | Empty hero now uses `flex-1 min-h-0 overflow-y-auto` so input remains visible at 390px mobile width. |
| P1 | Migration toast used hardcoded English and could visually compete with the input area. | Toast is Korean-first i18n, English i18n remains intact, dismiss state is accessible, and toast is lifted above the input area. |
| P1 | Sidebar/preview toggle positions were hard to verify after responsive changes. | Layout regions now expose stable test IDs for browser snapshot and click verification. |
| P1 | Quickstart button disabled styling lowered active text contrast in Electron axe runs. | Disabled state no longer uses opacity; active quickstarts retain readable contrast while disabled state is conveyed by text color and cursor. |
| P1 | Public docs overstated/staled release posture. | README and open-source readiness docs now explain the actual product, setup, comparison baseline, supported surfaces, limitations, and test commands. |
| P2 | CONTRIBUTING commit guidance did not match the workspace Lore protocol. | Contributor docs now document the required Lore trailers. |

## Snapshot Evidence

Artifacts:

- `.omx/ultragoal/screenshots-final/desktop-1440.png`
- `.omx/ultragoal/screenshots-final/wide-1100.png`
- `.omx/ultragoal/screenshots-final/tablet-760.png`
- `.omx/ultragoal/screenshots-final/mobile-390.png`
- `.omx/ultragoal/screenshots-final/layout.json`

Measured result after fixes:

| Viewport | Sidebar | Folder CTA | Input | Quickstarts | Horizontal overflow | Offscreen buttons | Toast/input overlap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440x920 | visible | visible | visible | disabled before workspace | false | 0 | false |
| 1100x820 | visible | visible | visible | disabled before workspace | false | 0 | false |
| 760x820 | hidden with toggle | visible | visible | disabled before workspace | false | 0 | false |
| 390x844 | hidden with toggle | visible | visible | disabled before workspace | false | 0 | false |

Manual browser click smoke after skipping onboarding:

- Sidebar close/open: pass.
- Preview/code panel open/close: pass.
- Settings modal: pass.
- Plugins modal: pass.
- Automation modal: pass.
- Compare modal reachable: pass.
- Code mode panel reachable: pass.
- Post-click horizontal overflow: pass.

Targeted accessibility retest:

- `npx playwright test e2e/_drive18_axe.spec.ts`: pass, 6/6.

Final regression:

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, with 3 pre-existing unused `eslint-disable` warnings.
- `npm test`: exit 0, with pre-existing React `act(...)` warnings.
- `npm run test:e2e`: exit 0, 112 passed and 21 skipped.
- Final localhost snapshot/click smoke: pass at 1440, 1100, 760, and 390 widths.

## Current Score Gate

| Category | Final score | Evidence |
| --- | ---: | --- |
| UI/UX skeleton | 91 | Responsive snapshots show no overflow, no offscreen primary controls, stable sidebar/preview controls, and improved empty/toast states. |
| AI coding agent competitiveness | 90 | First-run repository loop is now explicit: choose folder, start/quickstart only when workspace exists, provider/IPC failure is visible, code/review/apply surfaces remain tested by renderer and E2E suites. |
| Open-source adoption readiness | 91 | README, contributor protocol, and readiness docs now describe purpose, comparison baseline, setup, supported surfaces, limitations, and verification commands honestly. |
| Internal developer usability | 92 | Local dev, renderer tests, E2E, browser snapshot evidence, and failure UX are now aligned enough for repeat internal use. |

Residual risks that do not block this score:

- Live third-party provider credentials and signed packaged installers are environment-dependent.
- OpenHands remains stronger for isolated cloud/self-hosted autonomous execution; Dreampia-Dev is positioned as a Korean-first local desktop review/apply workbench.
- Roo Code official docs state a May 15, 2026 shutdown, so it is treated as a capability reference, not an adoption comparator.

Stop gate: met. All four score categories remain above 90 after the final command suite and final snapshot run.
