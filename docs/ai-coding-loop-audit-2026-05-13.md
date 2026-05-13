# AI Coding Loop Baseline Audit - 2026-05-13

Scope: actual first-user coding loop in Dreampia-Dev, compared against OpenHands, Aider, Roo Code, and Continue style expectations.

## Baseline Findings

| Area | Status | Severity | Evidence |
| --- | --- | --- | --- |
| Normal chat code apply | Failed before fix | P1 | `MessagesArea` forwarded `onApplyToFile` only in the virtualized path. Typical sessions under 100 turns hid "파일에 적용". |
| Structured AI response | Partial | P1 | Assistant messages were plain text/code blocks. Users had to infer plan, files, tests, risk, and next action. |
| Provider/CLI missing recovery | Partial | P1 | Header badge showed Mock/CLI state, but the center workflow did not explain Direct API fallback or settings recovery. |
| Diff/review/apply safety | Mostly present | P2 | `ApplyToFileModal` had diff and explicit accept, but no concise safety checklist. |
| Test-result loop | Partial | P2 | Tests could be discussed, but mock/dry-run responses did not clearly separate suggested commands from real execution. |

## Fix Direction

- Keep existing Code panel, `ApplyToFileModal`, and `DiffViewer`.
- Add a task-loop card that extracts and displays plan, candidate files, diff/review, tests, result, risk, and next action.
- Make Mock/dry-run responses transparent: they guide the workflow but do not claim real file edits or command execution.
- Add provider recovery CTA for Provider and Direct API settings.
- Add e2e coverage for README -> workflow card -> apply modal -> explicit apply.

## Baseline Score

- AI coding task loop before this pass: 62/100.
- Main blocker: users could not reliably enter the file apply flow from ordinary chat sessions.
- Target after this pass: 90+/100 with README golden path, provider recovery, diff/review/apply, and tests documented.
