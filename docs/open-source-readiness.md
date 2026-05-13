# Dreampia-Dev Open Source Readiness

> Current target: v2.10.0, Korean-first desktop AI coding workbench for Claude Code, OpenAI Codex, MCP tools, review, code panel, and local repository workflows.

## What This App Is

Dreampia-Dev is a local Electron app for developers who want a Korean-first AI coding surface over existing CLI and local-tooling workflows. It focuses on repository context, chat, review, file/code preview, permission visibility, MCP/plugin surfaces, and repeatable local testing.

It is not a hosted cloud coding agent. The strongest path is local desktop use with an existing repository, installed provider CLI, and explicit review before applying changes.

## Comparison Baseline

The product should be evaluated against the user loop proven by current official references for tools such as:

- [OpenHands](https://www.openhands.dev/) - agent platform with web GUI, CLI, SDK, cloud/self-hosted workflows, repository automation, and sandboxed runtime positioning.
- [Aider](https://aider.chat/) - terminal pair-programming flow optimized for editing real repositories, codebase maps, git integration, and automatic lint/test loops.
- [Continue](https://docs.continue.dev/) - AI pull-request checks defined from markdown files in `.continue/checks/`, with pass/fail status and suggested fixes.
- [Roo Code](https://docs.roocode.com/) - VS Code/cloud coding-agent workflow with file-system access, terminal control, modes, MCP, and model choice; official docs currently state a May 15, 2026 product shutdown, so it remains a capability benchmark rather than an adoption target.

Dreampia-Dev's differentiator is the Korean-first desktop shell that combines Claude/Codex-style chat, local project selection, code review/apply surfaces, MCP/plugin management, and a visible permission model. Its adoption risk is highest when provider CLI/IPC setup is unclear or when a menu appears before the underlying workflow is usable.

## Install And Run

```bash
npm install
npm run dev
```

The development server opens the Electron app. For browser-only renderer inspection, Vite is available at `http://localhost:5173/` while `npm run dev` is running.

## Core User Loop

1. Select a project folder from the sidebar.
2. Start a new chat or choose a quick-start action from the empty chat screen.
3. Ask for a repository task, review, test fix, or architecture explanation.
4. Watch streaming status, tool calls, and permission state.
5. Send code blocks to Code mode or apply them to an opened file with review.
6. Run tests from the local terminal or provider workflow.
7. Review diff, errors, and next action before committing.

## Supported Surfaces

| Surface | Status | Notes |
| --- | --- | --- |
| Claude/Codex CLI provider path | Supported when CLI and IPC bridge are available | Missing IPC now fails closed with visible disabled state. |
| Mock/provider development mode | Supported | Used for renderer and local dev without live AI credentials. |
| MCP settings | Supported | Server status and settings surfaces are available. |
| Code mode | Supported | File tree, editor, diff, save/revert, and apply-to-file flows exist. |
| Cross-AI compare | Supported where provider IPC is available | Sidebar opens the compare modal. |
| Plugins and automation | Partially supported | UI exists; production-grade adoption requires provider and plugin setup clarity. |
| Full autonomous sandbox agent | Not the primary product shape | OpenHands remains the stronger reference for isolated autonomous execution. |

## Project Structure

```text
src/main/              Electron main process, IPC, persistence, provider bridges
src/renderer/          React UI, i18n, chat, sidebar, settings, code panel
src/types/             Shared TypeScript domain types
tests/renderer/        Vitest renderer and component tests
e2e/                   Playwright Electron smoke and integration tests
docs/                  Product, architecture, UX, testing, and release notes
```

## Verification Commands

```bash
npm run typecheck
npm run lint
npm test
npm run pretest:e2e
npm run test:e2e
```

`npm run build` is intentionally left to the release pipeline for release-prep work unless a change directly touches packaging/build behavior.

## Known Limitations

- Provider CLI and preload/IPC availability determine whether live AI work can run. Browser-only renderer mode shows the disabled IPC state.
- Playwright E2E has a known pre-existing MigrationToast interaction pattern; release CI does not depend on that E2E blocker.
- Code signing is still environment-dependent for packaged desktop releases.
- Plugin and automation flows need real-world provider/plugin setup examples before they should be marketed as fully autonomous.

## Acceptance Bar

Before a public release or push, collect evidence for:

- Desktop, 1100px, 760px, and mobile snapshots with no horizontal overflow or hidden primary controls.
- Sidebar, chat, preview rail, code mode, settings, plugin, automation, and compare entry points opening cleanly.
- Typecheck, lint, renderer/unit tests, and relevant E2E/smoke checks.
- README and docs matching the actual version, setup commands, known limitations, and supported surfaces.
