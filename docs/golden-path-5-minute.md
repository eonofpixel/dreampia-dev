# Dreampia-Dev 5-Minute Golden Path

This path verifies the core AI coding loop: ask for a small change, review the candidate, apply it explicitly, and run validation.

## 1. Install And Run

```bash
npm install
npm run dev
```

For production-style e2e validation:

```bash
npm run test:e2e
```

## 2. Pick A Workspace

Open Dreampia-Dev and select the repository folder you want to work on. The chat header should show the workspace name. If no folder is selected, quickstart actions stay disabled so you do not start a repo task without context.

The local coding task panel should become the first checkpoint:

- **Repo context** shows indexed files, major languages, evidence files, and test candidates.
- **Task status** stays recoverable when the workspace or provider is missing.
- **Test / Git handoff** shows detected safe commands and current git status. If the folder is not a git repository, the app must say so instead of implying a real commit handoff.

## 3. Start A Small Request

Use a narrow first prompt:

```text
README 설치 안내를 더 명확하게 바꿔줘
```

Expected response shape:

- 작업 계획
- 변경 후보 파일
- Diff / Review 안내
- 테스트 명령
- 위험/권한 상태
- 다음 행동

If no CLI is detected, the provider recovery banner should explain that Direct API may still work if configured, and it should link to Provider and Direct API settings. Mock/dry-run responses are guidance only; they do not claim real execution.

## 4. Review The Diff

Open the Code panel, select `README.md`, then use the chat code block's `파일에 적용` action. Dreampia-Dev must show `ApplyToFileModal` before writing:

- Target file path
- Line-count change
- Safety checklist
- Inline diff/review
- Explicit `적용` and `취소`

Cancel leaves the disk untouched. Apply writes only the selected file and uses the current file mtime to detect external-change conflicts.

## 5. Validate

Use the task panel's safe command buttons when they are available. The app only exposes the following allowlisted commands:

```bash
npm run typecheck
npm run lint
npm test
```

Each command result should show the command, workspace, status, exit code or timeout, output tail, and a short next-action summary. If npm or a script is unavailable, the failure must remain visible as a recoverable result.

You can run the same checks from a terminal when validating a release or debugging the app:

```bash
npm run typecheck
npm run lint
npm test
```

For release-grade confidence, also run the related e2e smoke:

```bash
npm run test:e2e -- e2e/golden-path-coding-loop.spec.ts
```

To verify real authenticated provider wiring on a developer machine:

```powershell
$env:DREAMPIA_REAL_CLI_SMOKE = '1'
npm test -- tests/providers/cli/realCliSmoke.test.ts
Remove-Item Env:DREAMPIA_REAL_CLI_SMOKE
```

## Current Limits

- A real provider or configured Direct API is required for true repo reasoning beyond the deterministic Mock provider. The real CLI smoke above is opt-in because it can use authenticated provider quota.
- Dangerous actions such as deletion, arbitrary shell commands, git mutation, and push must stop at an approval point. The local task panel never auto-runs those actions.
- Repo context v1 is metadata-based. It is gitignore-aware and shows key files/package scripts/test candidates, but semantic symbol ranking and hunk-level task patch history remain roadmap items.
- `npm run build` is release pipeline scope and is not required for this golden path.
