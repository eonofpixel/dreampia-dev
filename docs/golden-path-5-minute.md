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

Run the recommended checks:

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
- Dangerous actions such as deletion and git mutation must stop at an approval point.
- `npm run build` is release pipeline scope and is not required for this golden path.
