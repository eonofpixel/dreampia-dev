---
title: Show HN Announcement Draft
status: draft
last_updated: 2026-05-03
---

# Show HN: Dreampia-Dev — Open source desktop GUI for Claude Code + OpenAI Codex

## Title (suggested 70-80 chars)

```
Show HN: Dreampia-Dev – Open source desktop GUI for Claude Code + Codex CLIs
```

## Body (HN style — short, factual, link-first)

```
Dreampia-Dev is an Electron desktop app that wraps the Claude Code (Anthropic)
and OpenAI Codex CLIs into a single Korean-first GUI. After 5 hours and 14
minor releases on top of v0.1.0, today's v1.0.0 ships feature-complete:

- Slash commands (Cmd+K palette) and @ mentions with typed file references
- Cross-AI compare: run Claude vs Codex on the same prompt with diff view
- FTS5 chat search across all sessions (better-sqlite3 + WAL)
- Multi-window leader election, 4-tier sandbox, 30+ permissions
- MCP Bridge (stdio JSON-RPC) with auto-discovery from existing
  Claude/Codex configs
- Usage tracking with CSV export and cost limits
- Self-diagnostic GUI (npm run diagnose) for native module ABI issues
- Korean-first UX with English i18n switch

It's Apache 2.0, written in TypeScript strict, 1430+ vitest + 28+ Playwright
E2E tests, unsigned for now (cert purchase is the v1.0.1 blocker).

Repo: https://github.com/eonofpixel/dreampia-dev
Releases (Win/macOS/Linux): https://github.com/eonofpixel/dreampia-dev/releases

Background: I wanted Claude's multi-tab sidebar + Codex's simple modal on the
same screen, with one MCP setup that mirrors to both. Subprocess-only, no
bundled API, users bring their own keys/CLI auth. Designed it after reading
Codex's own self-advice on session state, tool orchestration, permissions,
performance, and i18n (~50K lines of internal spec docs in /docs).

Curious to hear how this compares to other "AI desktop wrapper" approaches
(Cursor's chat panel, Open WebUI, etc.) — Dreampia-Dev is intentionally
narrow: just Claude + Codex, no model hosting, no browser extension, GUI only.
```

## Tone notes

- HN penalizes hyperbole: avoid "amazing", "revolutionary", emojis.
- Lead with what it does, then what's interesting (multi-AI compare, FTS5,
  Korean-first UX), then admit the limitation (unsigned).
- Mention Apache 2.0 and "subprocess only, no API hosting" — HN audience
  cares about license + privacy.
- Background paragraph at the end so people who want context can read it,
  but the lead is the link + facts.

## Suggested first comment by author (immediate follow-up)

```
Some details that didn't fit the post:

The interesting technical bits:
1. better-sqlite3 dual-ABI (Node + Electron) is auto-toggled via predev/pretest
   hooks with caching, so contributors don't hit ABI mismatch. Fallback paths
   examined: node:sqlite (Electron 33 = Node 20, can't use), sql.js (WASM, but
   no WAL + full-DB-in-memory). better-sqlite3 won.
2. Cross-AI compare uses Promise.allSettled for failure isolation — one side
   throwing doesn't kill the other. Persisted as compare_runs rows so you can
   review later.
3. Typed file/session reference blocks (v0.13.0) are a discriminated union on
   ContentBlock so chip rendering and CLI prompt serialization share the same
   schema, with strict zod validation.

The boring but important bits:
1. 2-stage publish pipeline (matrix build → single publish job) to avoid the
   GitHub Releases 422 race condition I hit on v0.1.0.
2. Hardened runtime + entitlements pre-wired for macOS notarization, just
   waiting on Apple Developer Program signup.
3. PRAGMA quick_check on boot with a non-blocking dialog warning instead of
   hard-stopping — users get a chance to export before a corrupt DB takes the
   app down.

Apache 2.0, English i18n is opt-in via Settings → Language. Korean is the
default since the project started as a Korean-first tool.
```

## Don't post

- Korean text in title/body (HN audience is English-default; Korean appears
  in screenshots and Settings → Language toggle).
- Roadmap promises beyond what's in v1.0.0.
- Detailed price comparisons with commercial alternatives (against HN spirit).

## Timing

- Tuesday or Wednesday morning ET (Korean evening) — peak HN traffic.
- Don't post when on a flight / sleeping — first 1 hour is critical for
  ranking and you should respond to comments.
