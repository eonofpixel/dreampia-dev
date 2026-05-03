---
title: Discord / 한국 OSS 커뮤니티 발표 초안
status: draft
last_updated: 2026-05-03
---

# Discord / Slack / 한국 OSS 커뮤니티 발표

여러 채널 (Anthropic Discord, OpenAI Codex Discord, 한국 OSS Slack/Discord
모임, Build in Korea 등) 별 톤 분리.

---

## Anthropic Discord (#showcase 또는 #community)

```
Hey everyone — I just released v1.0.0 of Dreampia-Dev, an open source
desktop GUI that combines Claude Code and OpenAI Codex into a single
Electron app.

The Claude Code integration uses subprocess + JSONL stream parsing
(translated from Claude's streaming events to a unified ContentBlock
schema). MCP servers configured once, mirrored to both Claude and Codex.

Notable Claude-specific features:
- Multi-tab sidebar UX inspired by Claude Desktop
- Session-based ContentBlock with file_reference / session_reference
  rendered as chips, indexed by FTS5 chat search
- Cross-AI compare: same prompt to Claude and Codex side-by-side with
  failure isolation (Promise.allSettled)
- Korean IME-safe input (compositionStart/End handling)

GitHub: https://github.com/eonofpixel/dreampia-dev
License: Apache 2.0
Stack: Electron 33 + TypeScript strict + better-sqlite3 + WAL/FTS5

Looking for feedback specifically on:
1. Whether the JSONL stream translation drops anything important from
   Claude's streaming events
2. MCP integration patterns
3. Korean vs English UX (currently Korean-default, English opt-in)

Honest disclosure: v1.0.0 is unsigned (cert purchase pending). v1.0.1+ will
be signed.
```

---

## OpenAI Codex Discord (#showcase or #user-projects)

```
Hi all — releasing v1.0.0 of Dreampia-Dev today, an open source Electron
app combining Claude Code and OpenAI Codex into one GUI.

The Codex integration uses CLI subprocess with JSONL output parsed into a
unified ContentBlock schema. Codex's function_call events are translated
to tool_use blocks. The 4-tier sandbox model (read-only / workspace-write /
full-access / custom) is heavily inspired by Codex's own approach.

Codex-specific touches:
- Codex's simple modal UX inspired the chat input design
- Codex 3-tier sandbox concept extended to 4-tier with 30+ capabilities
- Cross-AI compare puts Codex side-by-side with Claude on the same prompt
- MCP servers configured once mirror to both providers

GitHub: https://github.com/eonofpixel/dreampia-dev
License: Apache 2.0

I read Codex's own self-advice docs (the project's /docs/findings includes
my notes from those) — the 5 key areas (session state, permission, tools,
performance, i18n) shaped the entire architecture. Thanks to whoever wrote
those.

Looking for feedback on:
1. Codex JSONL output translation accuracy (function_call mapping is
   best-effort, would love validation on real tool calls)
2. Sandbox capability set — anything missing?
3. UX comparison with Codex Desktop directly

v1.0.0 is unsigned (cert purchase pending), v1.0.1 will be signed.
```

---

## 한국 OSS 커뮤니티 (Slack / Discord, 한국어 친근하게)

```
안녕하세요. 주말 이틀 (5시간 + 14 minor release) 동안 작업한 Dreampia-Dev
v1.0.0 production release 발표합니다.

뭐 하는 도구냐:
- Claude Code (Anthropic) + OpenAI Codex 두 CLI 를 하나의 Electron 데스크톱
  앱으로 감싸요
- 같은 prompt 를 양쪽 AI 로 동시에 보내고 좌우로 비교 (cross-AI compare)
- MCP 설정을 한 번만 하면 양쪽에 자동 동기화
- 한국어 우선 (IME 안전 입력 — 한글 변환 확정 시 Enter 가 잘못 보내지지 않게)
- 영어 i18n 도 한 클릭으로 전환

기술 스택:
- Electron 33 + TypeScript strict + better-sqlite3 (WAL + FTS5)
- 1430+ vitest + 28+ Playwright E2E
- Apache 2.0

특이한 점:
- /docs 폴더에 ~50,000줄 spec 이 한국어로 정리돼 있어요 (session/permission/
  tools/ux/design/performance/ia/i18n 영역별 위키 분리)
- Codex 자체가 자기에 대해 조언한 5개 영역 (session state, permission, tools,
  performance, i18n) 을 실제 구현 가이드로 사용
- 동일 prompt 에 대한 Claude vs Codex 응답 차이를 시각적으로 비교 가능

알려진 한계:
- v1.0.0 은 unsigned (코드 서명 인증서 매입은 사용자 액션 대기 — Win EV cert
  $300/년 + Apple Dev $99/년)
- v1.0.1 부터 자동으로 signed release 활성화 (코드 인프라는 v0.1.0 부터 다 됨)
- Mock 응답은 echo (실제 답변은 Claude/Codex CLI 인증 필요)

GitHub: https://github.com/eonofpixel/dreampia-dev
Releases (Win/macOS/Linux): 위 링크 의 Releases 페이지

피드백 주시면 감사하겠습니다. 특히:
- 한국어 IME 환경에서 시각 검증 (어떤 시나리오가 안 깨지는지)
- Cross-AI 비교 UX (좌우가 적절한지, 좁은 화면에선 어떨지)
- 한국어 vs 영어 명령어 (`/clear` 가 좋은지 `/지우기` 가 좋은지)
- Korean-first + English 두 가지를 동시에 잘 만드는 패턴이 있는지

Issue / Discussion / PR 환영합니다. Apache 2.0 라이선스라 fork 자유롭게.
```

---

## 발표 체크리스트

각 채널 post 전:

- [ ] GitHub release 발행 완료 (gh release view 로 확인)
- [ ] Win/macOS/Linux 5종 artifact 업로드 검증
- [ ] README v1.0 banner 적용 확인
- [ ] 첫 user 피드백을 받기 위한 시간 (최소 2시간) 확보
- [ ] 각 채널 별 글자수 / 톤 확인
- [ ] 댓글 + DM 응답 가능한 시간대

post 후:

- [ ] 첫 1시간 동안 댓글 모니터링
- [ ] 부정적 피드백 발견 시 방어적 X / 객관적 답변
- [ ] 이슈 발견 시 GitHub Issue 로 이동 권장
- [ ] 좋은 피드백은 한국 OSS 커뮤니티 + Codex/Claude 채널 양쪽에서 reciprocal 보답
