---
title: Product Hunt Launch Draft
status: draft
last_updated: 2026-05-03
---

# Product Hunt Launch — Dreampia-Dev v1.0.0

## Tagline (60 chars max)

```
Two AI coding CLIs, one Korean-first Electron desktop app
```

Alternatives:
```
Open source GUI for Claude Code + Codex (with cross-AI compare)
One MCP setup, two AI providers, full Electron desktop UX
```

## Description (260 chars max)

```
Dreampia-Dev wraps Claude Code and OpenAI Codex into one Electron app.
Run the same prompt on both AIs side-by-side with diff. Korean-first UX
with English i18n. Apache 2.0. Subprocess-only — bring your own keys.
```

## What is it?

```
Dreampia-Dev v1.0.0 is an open source desktop app that combines two leading
AI coding CLIs — Claude Code (Anthropic) and OpenAI Codex — into a single
GUI. After 5 hours of focused work and 14 minor releases, v1.0.0 ships
feature-complete.

Built for developers who want to compare AI responses, share MCP setups
between providers, and have a Korean-first interface with English support.
Apache 2.0. Subprocess only — your API keys / CLI auth, never stored
remotely.
```

## Key features

```
- Cross-AI Compare — Run the same prompt on Claude and Codex side-by-side
  with line-by-line diff. Failure isolation: one side dying doesn't kill
  the other.
- Slash Commands & Keyboard Shortcuts — /clear, /model, /compare, etc.
  with Cmd+K palette and user-customizable shortcuts.
- Typed @ Mentions — Reference files and other sessions as chips. Indexed
  by FTS5 for instant chat search.
- MCP Bridge with Auto-Discovery — Configure once, mirrored to both AIs.
  Reads existing Claude/Codex configs.
- Usage & Cost Tracking — Per-provider token counts, CSV export, alert
  thresholds.
- Self-Diagnostics — Settings → 진단 (Diagnose) tab + npm run diagnose for
  ABI / DB integrity checks.
- Multi-Window Leader Election — Heartbeat + TTL via SQLite, no race
  conditions.
- 4-Tier Sandbox — read-only / workspace-write / full-access / custom with
  30+ capability flags.
- Korean-First with English i18n — Vendor-free t() runtime, instant locale
  switch.
```

## Why I built this

```
I'm a Korean developer who uses both Claude Code and OpenAI Codex daily.
Switching between Claude Desktop and the Codex CLI was friction, and there
was no way to compare responses on the same prompt without manually
copy-pasting.

Dreampia-Dev solves this:
- One desktop app, two AI providers
- Same MCP setup mirrors to both
- Cross-AI compare with diff view
- Korean-first UX (IME-safe input, Pretendard font, ko/en i18n)
- Open source under Apache 2.0

I'm not building this to compete with Anthropic's Claude Desktop or OpenAI's
ChatGPT desktop — those apps are great for their own products. Dreampia-Dev
is for developers who use both and want them in one place, with no model
hosting, no API resale, no telemetry.
```

## Target audience

```
- Developers using Claude Code and/or Codex CLI daily
- Teams evaluating AI providers (compare same prompt, pick the better answer)
- Korean developers wanting native Korean UX
- Open source enthusiasts (Apache 2.0, contributions welcome)
- Power users who want MCP servers shared across providers
```

## What makes it different

```
- Both AIs in one app (no commercial alternative does this for Claude+Codex)
- Cross-AI compare with diff (genuinely novel feature for prompt evaluation)
- Korean-first (most AI tools treat Korean as afterthought)
- Subprocess only — no API hosting, no token storage
- 1430+ tests, 28+ E2E, 0 typecheck/lint errors
- Apache 2.0 with ~50K lines of public design spec
```

## Limitations (honest)

```
- v1.0.0 is unsigned — SmartScreen / Gatekeeper warnings on Win/macOS
  (cert purchase is the v1.0.1 blocker)
- Mock provider returns echo responses — real answers need authenticated
  Claude or Codex CLI
- macOS hardened runtime is wired up but Apple Developer ID purchase pending
```

## Pricing

```
Free and open source. Apache 2.0. No paid tiers.
```

## Maker comment (first comment after launch)

```
Hi Product Hunt! Maker here.

Dreampia-Dev v1.0.0 is the result of 14 minor releases over a focused
weekend. The core insight: developers using multiple AI providers shouldn't
have to context-switch between desktop apps and copy-paste between them.

Some things I'd love feedback on:
1. Cross-AI compare UX — currently left/right columns. Would tabs be
   better? Stacked? What about for reading on smaller screens?
2. MCP one-config-mirrors-to-both vs per-provider — currently one config,
   easier to maintain. But could imagine per-provider customization being
   useful for advanced cases.
3. Korean vs English default — currently Korean-first because that's where
   the project started. English is a one-click toggle in Settings.

Apache 2.0, GitHub link in profile. Issues and PRs welcome.

Tech details: Electron 33 + TypeScript strict + better-sqlite3 + FTS5,
multi-window leader election, 4-tier sandbox, vendor-free i18n. The /docs
folder has ~50K lines of design spec covering session state, permissions,
tools, UX patterns, performance, and i18n.

Limitations I'm aware of and working on:
- Code signing (Win EV cert + Apple Dev ID) — purchase pending, v1.0.1+
  will be signed
- Linux code signing has no good story (sigstore is the future maybe?)
- More i18n languages (Japanese, Chinese — infrastructure ready, just needs
  translations)

Thanks for checking it out!
```

## Tags / Categories

```
- Developer Tools
- Open Source
- Productivity
- Artificial Intelligence
- Desktop App
```

## Screenshots / Gallery (placeholder)

Need before launch:
- 1280x800 main view (sidebar + chat with streaming response)
- 1280x800 cross-AI compare modal (Claude left, Codex right)
- 1280x800 Settings → MCP tab
- 1280x800 chat search with FTS5 highlights
- 1280x800 onboarding step 4 (recommended prompts)
- Logo: 240x240 PNG (build/icon.png 1024 → resize)
- Cover: 1600x1080 hero shot

## Launch timing

- Tuesday or Wednesday, 12:01 AM PT (peak vote window)
- Korean midnight = US morning, expect Korean voters first 6 hours,
  US voters last 18 hours

## Don't do

- Don't ask for upvotes directly (PH rule violation)
- Don't compare unfavorably to other launches that day
- Don't auto-DM voters (PH rule violation)
- Don't post Korean-only screenshots (use English UI for screenshots, mention
  Korean is available via Settings)
