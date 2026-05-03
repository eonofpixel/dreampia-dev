---
title: Reddit Announcement Drafts
status: draft
last_updated: 2026-05-03
---

# Reddit Announcement Drafts

세 가지 subreddit 별 톤 + 길이 + 스타일 분리. 각각 개별 post 가 아니라 같은
release 의 다른 채널.

---

## r/programming (English, technical)

### Title

```
Dreampia-Dev v1.0.0 — Open source Electron GUI wrapping Claude Code + OpenAI
Codex CLIs (Korean-first, Apache 2.0)
```

### Body

```
After 5 hours and 14 minor releases on a single weekend, I'm releasing v1.0.0
of Dreampia-Dev — a desktop wrapper that puts Claude Code (Anthropic) and
OpenAI Codex into a single Electron GUI.

The angle: I wanted Claude's multi-tab sidebar UX and Codex's simple modal
in the same app, with **one MCP server setup that mirrors to both AIs**. No
model hosting, no API resale — subprocess-only, you bring your own keys or
CLI auth.

**Tech stack:**
- Electron 33 + Vite 6 + React 18 + TypeScript 5.6 strict
- better-sqlite3 (WAL + FTS5) with auto-toggling dual-ABI build
- Multi-window leader election (heartbeat + TTL)
- 4-tier sandbox (read-only / workspace-write / full-access / custom) with
  30+ capabilities
- MCP Bridge (stdio JSON-RPC) with auto-discovery from existing
  Claude/Codex configs
- Korean-first with English i18n (vendor-free t() runtime, ~7KB bundle)

**Notable features:**
- **Cross-AI compare**: Run the same prompt on Claude and Codex
  simultaneously, side-by-side with diff view. Failure isolation via
  Promise.allSettled — one side dying doesn't kill the other.
- **Typed @ mentions**: File and session references render as chips in
  chat, indexed by FTS5, with the same schema serialized to both Claude
  Code and Codex prompts.
- **Slash commands** (/clear, /model, /compare, etc.) with Cmd+K palette
- **Self-diagnostic** — `npm run diagnose` and Settings → 진단 (Diagnose)
  tab for native module ABI / DB integrity issues.
- **Usage tracking** with CSV export and cost limits.

**Verification:**
- 1430+ vitest tests, 28+ Playwright E2E tests
- 0 typecheck errors / 0 lint errors
- Production build verified on Win/macOS/Linux

**Honest limitations:**
- v1.0.0 is *unsigned* — Win SmartScreen and macOS Gatekeeper will warn.
  Cert purchase ($300+/year for Win EV, $99/year for Apple Dev) is the
  v1.0.1 blocker. Code path is wired up, just waiting on secrets.
- Mock provider returns echo responses — real responses need authenticated
  Claude or Codex CLI.

Repo + releases (Win/macOS/Linux installers):
https://github.com/eonofpixel/dreampia-dev

License: Apache 2.0. Issues + discussions welcome. The /docs folder has
~50K lines of design spec covering session state, permission, tools,
UX patterns, performance budgets, and i18n strategy — open for review.
```

### Engagement plan

- Reply to questions about ABI/native module strategy (sql.js vs node:sqlite
  comparison is documented).
- Share `/docs/findings` for people curious about how design decisions were
  made.
- Don't downvote critical comments. Common critique to expect:
  - "Why not use node:sqlite?" — Electron 33 = Node 20, not available.
  - "Why Electron not Tauri?" — Claude/Codex desktop both Electron, fewer
    surprises in CLI subprocess + IPC patterns.
  - "Yet another wrapper" — Dreampia-Dev wraps **two CLIs simultaneously**
    with shared MCP setup; Cursor / Cline / Open WebUI don't do this.

---

## r/MachineLearning (English, research-leaning)

### Title

```
[P] Dreampia-Dev: Open source desktop UI for running Claude Code and OpenAI
Codex side-by-side (cross-AI compare with diff view)
```

### Body

```
I built an open source Electron app that wraps the Claude Code (Anthropic)
and OpenAI Codex CLIs into a single GUI. v1.0.0 just shipped after 14 minor
releases.

**For ML/AI researchers, the interesting parts:**

1. **Cross-AI compare**: Same prompt runs on Claude and Codex in parallel
   (Promise.allSettled for failure isolation). Side-by-side stream display
   with simple line-by-line diff. Persisted to compare_runs SQLite table for
   later analysis. Useful for prompt sensitivity studies — same prompt, two
   different model providers, immediate visual diff.

2. **MCP Bridge**: Both Claude Code and OpenAI Codex support MCP (Model
   Context Protocol). Dreampia-Dev runs one MCP server config and exposes it
   to both. Useful if you're testing MCP servers across providers and don't
   want config drift.

3. **Typed prompt blocks**: ContentBlock discriminated union with file and
   session reference blocks, serialized to both Claude (XML-ish) and Codex
   (JSON content_part array) deterministically. Single source of truth for
   what gets sent to each model.

4. **Usage telemetry**: Token counts (input, output, cache_creation,
   cache_read, reasoning) per turn per provider, CSV exportable.

**Stack**: Electron 33, TypeScript strict, better-sqlite3 with FTS5 for chat
search, vendor-free i18n. Apache 2.0.

**Limitations**:
- Mock provider for offline/test (echo responses).
- v1.0.0 unsigned — Win SmartScreen + macOS Gatekeeper warnings until
  v1.0.1 (cert purchase pending).
- Tested on Korean and English — IME-safe input (compositionStart/End handling)
  for CJK users.

Repo: https://github.com/eonofpixel/dreampia-dev

Looking for feedback on:
- Whether the compare diff view is useful for prompt research workflows
- MCP integration patterns (one-config-mirrors-to-both vs per-provider)
- Naming consistency between provider adapters

Constructive criticism welcome — especially on the IPC schema and the
zod-validation-at-boundary approach.
```

---

## r/Korea (한국어 OSS 커뮤니티)

### Title

```
[OSS] Dreampia-Dev v1.0.0 — Claude Code + OpenAI Codex 통합 데스크톱 앱 (한국어 우선, Apache 2.0)
```

### Body

```
주말 5시간 동안 14개 minor release 누적해서 v1.0.0 production release 발행했어요.

**Dreampia-Dev** — Anthropic 의 Claude Code 와 OpenAI 의 Codex CLI 두 개를
하나의 Electron 데스크톱 앱으로 감싸는 오픈소스 도구입니다. 한국어 우선, 영어
i18n 도 지원.

### 왜 만들었나

- Claude 의 멀티탭 사이드바 UX + Codex 의 단순한 모달 — 둘 다 좋은데 따로따로 써야
  하는 게 불편했음
- MCP 설정을 한 번만 하고 양쪽에 자동 동기화하고 싶었음
- 한국어 IME 안전 입력 (compositionStart/End — Enter 가 한글 변환 확정으로 잘못
  보내지 않도록)

### v1.0.0 핵심 기능

- **Cross-AI 비교**: 같은 prompt 를 Claude / Codex 양쪽으로 동시에 실행, 좌우로
  비교. 한쪽 실패해도 다른 쪽은 계속 (Promise.allSettled)
- **슬래시 명령** + Cmd+K 팔레트 + 사용자 지정 단축키
- **`@` 멘션** — 파일/세션 reference, chip 으로 표시, FTS5 인덱싱
- **채팅 검색** — 모든 세션 turns FTS5 풀텍스트 검색
- **사용량 추적** — Claude/Codex/Mock provider 별 분리, CSV 내보내기, 비용 한도
- **MCP Bridge** — 자동 discovery (기존 claude/codex 설정에서 import)
- **자가 진단** — `npm run diagnose` + Settings → 진단 탭

### 기술 스택

- Electron 33 + Vite 6 + React 18 + TypeScript 5.6 strict
- better-sqlite3 (WAL + FTS5) + ABI 자동 토글
- Multi-window leader election (heartbeat + TTL)
- 4-tier sandbox 권한 + 30+ capability

### 검증

- 1430+ vitest + 28+ Playwright E2E
- 0 typecheck / 0 lint errors

### 알려진 한계

- v1.0.0 unsigned — SmartScreen / Gatekeeper 경고 (인증서 매입은 사용자 액션
  대기, v1.0.1 부터 signed)
- Mock 응답은 echo (실제 답변은 Claude/Codex CLI 인증 필요)

### Repo

https://github.com/eonofpixel/dreampia-dev

Apache 2.0. Issue / Discussion / PR 환영합니다. 한국어 우선이라 docs 폴더 안에
~50,000줄 spec 도 한국어로 정리돼 있어요 (session/permission/tools/ux/design
각 위키 분리).

### 제안 주실 만한 영역

- 한글 IME 환경에서 시각 검증 (어떤 입력 시나리오가 안 깨지는지)
- Cross-AI 비교의 UX (좌우 vs 위아래 vs 탭)
- Korean-first 명령어 vs 영어 명령어 (`/clear` vs `/지우기`)

피드백 감사합니다.
```

### 톤 차이 메모

- r/programming: 영문, 기술 스택 + 검증 + 솔직한 limitations
- r/MachineLearning: 영문, 학술적 톤, "interesting parts" 강조
- r/Korea: 한국어, 한국 OSS 커뮤니티 톤, 친근하게
