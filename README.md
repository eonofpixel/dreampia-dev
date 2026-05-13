# Dreampia-Dev

> **Open source AI coding desktop wrapper. Codex의 단순함 + Claude의 멀티탭 사이드바.**
> **두 AI를 한 번 셋업으로 사용. 한국어 우선, Windows-first.**

[![CI](https://github.com/eonofpixel/dreampia-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/eonofpixel/dreampia-dev/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Version](https://img.shields.io/badge/version-2.10.0-brightgreen.svg)](./CHANGELOG.md)

---

## v2.10.0 - Current Status (2026-05-14)

**Dreampia-Dev는 한국어 우선 로컬 AI 코딩 워크벤치입니다.** Claude Code와
OpenAI Codex 스타일의 채팅, 프로젝트 선택, Code 모드, diff/apply, 권한 표시,
MCP/플러그인/자동화 진입점을 Electron 데스크톱 안에 묶습니다.

OpenHands, Aider, Continue, Roo Code와 같은 오픈소스 AI 코딩 도구와 비교할 때
평가 기준은 단순 화면이 아니라 **새 사용자가 실제 저장소에서 작업 요청, 코드
검토, 적용, 테스트 확인까지 이어갈 수 있는가**입니다.

### 지금 바로 확인할 것

```bash
npm install
npm run dev
```

검증 명령:

```bash
npm run typecheck
npm run lint
npm test
npm run pretest:e2e
npm run test:e2e
```

### 차별점

- 한국어-first UX와 영어 i18n을 함께 유지합니다.
- Claude/Codex CLI, Mock provider, MCP, Code 모드, Compare, Plugin, Automation
  표면을 한 앱에서 다룹니다.
- 권한/위험 작업, IPC 실패, 적용 후보, 테스트 결과를 사용자가 이해할 수 있는
  흐름으로 노출하는 것을 목표로 합니다.
- OpenHands처럼 완전한 클라우드/샌드박스 자율 에이전트를 대체하기보다는,
  로컬 데스크톱에서 검토 가능한 코딩 루프를 강화합니다.

### 현재 지원과 제한

- 지원: 프로젝트 폴더 선택, 새 채팅, 빠른 시작 프롬프트, Claude/Codex/Mock
  provider 상태, Code 패널, 파일 적용 후보, 설정, MCP, Compare, Plugin,
  Automation 진입점.
- 지원: local repo coding loop v1. 작업 패널에서 repo context, 근거 파일,
  테스트 후보, safe test commands, git status, Lore Commit Protocol 커밋 후보
  안내를 확인할 수 있습니다.
- 제한: live AI 작업은 provider CLI와 preload/IPC 연결 상태에 의존합니다.
  브라우저-only renderer에서는 IPC 미연결 상태가 표시되고 입력/빠른 시작이
  비활성화됩니다.
- 제한: safe command runner는 `npm run typecheck`, `npm run lint`, `npm test`
  만 허용합니다. 삭제, 임의 shell, git push는 자동 실행하지 않습니다.
- 제한: 코드 서명은 배포 환경에 따라 다르며 자세한 내용은
  [docs/code-signing.md](./docs/code-signing.md)를 확인하세요.
- 공개/기여자 기준 문서:
  [docs/open-source-readiness.md](./docs/open-source-readiness.md)

---

## 🎯 한 줄 요약

**Claude Code (`claude`) + Codex (`codex`) 두 CLI를 단일 Electron desktop GUI로 감싸는 오픈소스 도구.**

---

## 🚀 개발 시작

```bash
# 의존성 설치
npm install

# 개발 모드 (Electron 창 자동 열림 — ABI 자동 토글)
npm run dev

# 테스트 (ABI 자동 토글)
npm test

# E2E (Playwright Electron)
npm run pretest:e2e   # vite build + ABI 자동
npm run test:e2e

# 타입 체크 / 린트 / 빌드
npm run typecheck
npm run lint
npm run build
```

> 🤖 **ABI 토글 자동화 (v0.1.2~) + 영구 안정화 (v0.14.0)**: `npm run dev` /
> `npm test` / `pretest:e2e` 가 better-sqlite3 native module 의 ABI 를 자동
> 보장합니다 (smart skip + cache → 이미 일치하면 ~50ms). `npm install` 직후
> `electron-builder install-app-deps` 가 자동 native rebuild. 사용자가 수동
> rebuild 호출 X.
>
> **트러블슈팅**:
> - `npm run diagnose` — 환경 / Node-Electron 버전 / binding 상태 출력
> - 앱 안에서: **Settings → 진단** 탭 (DB 무결성 + 스키마 버전 + WAL 모드)
> - `npm run dev:rebuild` — Electron ABI 수동 rebuild
> - `npm run test:rebuild` — Node ABI 수동 rebuild

### E2E 테스트 (Playwright Electron)

Vitest 684개는 mocked I/O 단위 테스트. 실제 Electron 부팅 + 사용자 클릭 흐름 검증은
Playwright `_electron` 으로 자동화됨 (`e2e/`).

```bash
# 사전 빌드 + ABI 토글 (Electron ABI 로 better-sqlite3 컴파일)
npm run pretest:e2e

# 모든 e2e 시나리오 실행 (smoke + chat + sidebar + browser-view)
npm run test:e2e

# GUI 보면서 디버깅
npm run test:e2e:headed

# Playwright Inspector (step-by-step)
npm run test:e2e:debug

# 마지막 실행 HTML 리포트 열기
npm run test:e2e:report
```

E2E 테스트 후 Vitest 로 돌아가려면 ABI 를 다시 토글:

```bash
npm run test:rebuild
npm test
```

**알려진 한계:**

- ~~ABI 토글 매번 수동 (V6 영구 해결 후 자동화 예정).~~ → v0.14.0 에서 자동화 + 캐시 + 자가진단 도구로 영구 해결.
- `tool-call.spec.ts` / `permission.spec.ts` 는 dev-only injection 이 필요해
  현재 `.skip` 상태 (P2-B 에서 `src/renderer/devTestHooks.ts` 추가 후 활성화).
- `browser-view.spec.ts` 는 https://example.com 네트워크 필요.
  네트워크 없는 환경에선 `PLAYWRIGHT_SKIP_NETWORK=1 npm run test:e2e`.
- 단일 instance lock (`requestSingleInstanceLock`) 로 인해 e2e 는
  serial 실행 (workers: 1).

### 요구사항

```
Node.js  >= 22.0
npm      >= 10.0
OS       Windows 10+ / macOS 12+ / Linux (Ubuntu 22+)
```

### 진행 상황 (요약)

```
✅ Phase 1 — Foundation (v0.1.0 ~ v0.1.2)
   Electron 33 + Vite 6 + React 18 + TypeScript 5.6 strict
   SQLite (better-sqlite3 + WAL + FTS5) — 5 migrations
   Multi-window leader election (heartbeat + TTL)
   Provider Adapter (Claude/Codex/Mock streaming)
   Tool Queue + 30+ capability + 4-tier sandbox
   BrowserView + partition isolation
   v0.1.0 Linux+Win unsigned early adopter
   v0.1.1 macOS DMG race fix (Issue #1)
   v0.1.2 ABI 자동 토글 + branded icons

✅ Phase 2 — MCP + Onboarding (v0.2.0 ~ v0.3.0)
   v0.2.0 MCP Bridge MVP (stdio JSON-RPC)
   v0.3.0 Onboarding 5-step wizard

✅ Phase 3 — Features (v0.4.0 ~ v0.7.0)
   v0.4.0 Usage/Cost Tracking
   v0.5.0 Slash commands (7 명령 + IME-safe)
   v0.6.0 @ 멘션 (file + session)
   v0.7.0 Chat Search (FTS5)

✅ Phase 4 — Polish (v0.8.0 ~ v0.14.0)
   v0.8.0 Settings & Permissions (7 tabs)
   v0.9.0 Usage CSV/charts/limits + MCP discovery
   v0.10.0 Keyboard shortcuts (Cmd+K/U/, etc)
   v0.11.0 English i18n
   v0.12.0 Cross-AI Verify/Compare
   v0.13.0 Typed file references
   v0.14.0 ABI hardening + 자가 진단

⏳ Phase 5 — Code Signing — 사용자 액션 대기
   ⏳ Win EV Code Signing Cert ($300-400/년) 매입 + secrets 등록
   ⏳ Apple Developer Program ($99/년) 가입 + secrets 등록
   ⏳ secrets 등록 후 다음 tag push 부터 자동 활성화
   세부: docs/code-signing.md
```

### 검증 현황 (문서화된 기준)

```
1421+ tests pass (vitest, mocked I/O)
28+ Playwright E2E (실제 Electron 부팅)
0 typecheck errors / 0 lint errors
5 SQLite migrations applied
9 IPC namespace (settings/auth/session/llm/tool/browser/mcp/usage/compare)
production build 성공 (vite + electron-builder, 13 artifacts)
Code-signing 인프라 검증 (secrets 등록 시 즉시 활성화)
```

### 현재 알려진 제한

```
1. Unsigned build — SmartScreen / Gatekeeper 경고 표시.
   → cert 등록 후 해결 (사용자 액션 대기).
   세부: docs/code-signing.md

2. Mock 응답 = "Mock response. You said: ..." (echo).
   진짜 응답은 CLI 인증 (claude /login, codex login) 후 사용 가능.

3. CLI translate 의 Codex function_call 매핑은 best-effort.
   실제 tool 호출 응답이 캡처되면 보정 필요.

4. BrowserView 의 ResizeObserver setBounds 는 실제 click 검증 안 됨.
   tests/main/BrowserManager.test.ts 는 Electron 모킹 기반.

5. Multi-window leader election: 같은 db 의 두 LeaderElection 인스턴스로
   단위 테스트. 진짜 두 Electron 윈도우는 검증 안 됨.
```

다음 후보 (v1.0.1+):
  - 코드 서명 인증서 등록 (Win EV cert + Apple Dev ID) → signed release
  - 다국어 확장 (일본어, 중국어 — i18n 인프라 v0.11.0 에 이미 준비)
  - Plugin Loader (현재는 MCP Bridge 만)
  - DOM Inspector / Annotation 모드 (BrowserView P2)
  - Linux 코드 서명 (sigstore / GPG)

핵심 spec: [docs/session/_index.md](./docs/session/_index.md), [CODEX_SELF_ADVICE.md](./CODEX_SELF_ADVICE.md).

---

## ✅ 결정사항 (Source of Truth)

**모든 결정은 [DECISIONS.md](./DECISIONS.md) 참고.**

핵심 요약:

| 항목 | 결정 |
|------|------|
| 이름 | **Dreampia-Dev** |
| GUI | **Electron** (Win 우선, macOS 향후) |
| AI | **Claude + Codex 2개만** |
| UI | **사이드바 + 멀티탭** (Claude 스타일 + Codex 단순함) |
| 권한 | **Codex 3-tier sandbox** |
| 인증 | **하이브리드** (CLI 위임 + API 키) |
| CLI 제공 | ❌ (GUI만) |
| 첫 실행 | 단순 로그인 → 채팅 |
| 언어 | **한국어 먼저** |
| 배포 | MSIX (Phase 1) + DMG (Phase 2) |

---

## 📑 문서 인덱스 (위키 구조)

### 최상위 결정 + 가이드

| 문서 | 내용 | 상태 |
|------|------|------|
| **[DECISIONS.md](./DECISIONS.md)** | **모든 결정 (canonical)** | ✅ 최신 |
| [PRD.md](./PRD.md) | 제품 요구사항 | ⚠️ 일반 spec |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 6-레이어 기술 아키텍처 | ⚠️ 일반 spec |
| [CLI_INTEGRATION.md](./CLI_INTEGRATION.md) | claude / codex CLI 매핑 | ✅ 기술적 정확 |
| [ROADMAP.md](./ROADMAP.md) | Phase 1/2/3 일정 | ⚠️ 재계산 필요 |
| [TECH_STACK.md](./TECH_STACK.md) | 기술 선택 | ✅ 기술적 정확 |
| **[CODEX_SELF_ADVICE.md](./CODEX_SELF_ADVICE.md)** | **Codex 자체 조언 (5대 영역)** | ✅ 핵심 근거 |

### ★ Contracts (Codex 자체 조언 기반)

각 영역은 위키로 분리됨. 큰 한 파일 X. 평균 200줄 자체 완결 페이지.

| 영역 | 위키 진입점 | 파일 수 | 핵심 내용 |
|------|-------------|---------|-----------|
| **Session State** | [docs/session/_index.md](./docs/session/_index.md) | 13 | 대화·워크스페이스·터미널·브라우저·플랜·권한 통합 + SQLite + 멀티 윈도우 + Cross-AI |
| **Permission** | [docs/permission/_index.md](./docs/permission/_index.md) | 12 | 30+ capability, 4단계 level, grant 모델, 감사 로그, 위험 패턴 차단 |
| **Tools** | [docs/tools/_index.md](./docs/tools/_index.md) | 16 | Tool 인터페이스, Queue, Retry, MCP Bridge, Plugin Loader, Trace UI |
| **UX Patterns** | [docs/ux/_index.md](./docs/ux/_index.md) | 29 | 28개 UX 패턴 (F-013 ~ F-040) 각각 별도 |
| **Findings** | [docs/findings/_index.md](./docs/findings/_index.md) | 13 | 라운드 0~5 분석 결과 + Codex 자체 조언 |

### ★ Design + UX 상세 (최고 사용성 우선)

| 영역 | 위키 진입점 | 파일 수 | 핵심 내용 |
|------|-------------|---------|-----------|
| **Design System** | [docs/design/_index.md](./docs/design/_index.md) | 66 | Tokens (color/typo/spacing/motion/elevation/radius), Components (~30), States, Interaction, Layout, Theme, A11y |
| **Performance** | [docs/performance/_index.md](./docs/performance/_index.md) | 14 | Targets (1초 TTI, 60fps), Startup, Memory, Rendering, Bundle, SQLite tuning, Electron tuning, Monitoring |
| **Information Architecture** | [docs/ia/_index.md](./docs/ia/_index.md) | 9 | Sidebar, Chat flow, Preview panel, Settings (12 카테고리), Onboarding (5-step), Empty states |
| **i18n** | [docs/i18n/_index.md](./docs/i18n/_index.md) | 9 | Korean-first, Locale strategy, IME 처리, Datetime/Numbers, Keyboard shortcuts (한글 모드), Pluralization |

### 위키 stub (진입점)

위키로 분리된 후 stub 만 남은 진입점:
- [SESSION_STATE.md](./SESSION_STATE.md) → docs/session/
- [PERMISSION_MODEL.md](./PERMISSION_MODEL.md) → docs/permission/
- [TOOL_ORCHESTRATION.md](./TOOL_ORCHESTRATION.md) → docs/tools/
- [DEEP_EXPLORATION_FINDINGS.md](./DEEP_EXPLORATION_FINDINGS.md) → docs/findings/
- [UX_PATTERNS.md](./UX_PATTERNS.md) → docs/ux/

> **주의**:
> - ⚠️ 표시 문서는 일반 spec 초안. **결정 충돌 시 [DECISIONS.md](./DECISIONS.md) 우선**.
> - ★ Contract 위키들은 Codex 자체 조언 기반. 구현 시작 전 필수 검토.

---

## 🏗 아키텍처 한눈에

```
사용자 → Dreampia-Dev (Electron Desktop)
         ↓
   ┌──────────────────────────┐
   │ 사이드바 + 멀티탭 UI       │
   │ - 프로젝트/세션 리스트       │
   │ - 메시지마다 모델 선택       │
   │ - Codex 3-tier sandbox    │
   │ - Codex 스타일 MCP/skill  │
   └──────┬───────────────────┘
          ↓
   ┌──────────────────────┐
   │ Subprocess Wrapper    │
   └──────┬───────────────┘
          ↓
       ┌──┴──┐
       ↓     ↓
   claude  codex
       ↓     ↓
   Anthropic OpenAI
   API     API
```

세부: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 🚀 사용자 경험 (목표)

### 첫 실행

```
[설치 → 첫 실행]
  ↓
"Claude CLI 감지됨 ✓"
"Codex CLI 감지됨 ✓"
[로그인] (이미 둘 다 로그인된 경우 자동 통과)
  ↓
빈 채팅 화면
  ↓
사용자 입력 → 모델 선택 (드롭다운) → AI 응답 → 파일 수정 (sandbox 권한)
```

### 일상 사용

```
1. Dreampia-Dev 열기
2. 사이드바에서 프로젝트 선택 (또는 새로 생성)
3. "+ 새 탭" 으로 대화 시작
4. 메시지 입력 시 상단에서 Claude/Codex 선택
5. AI가 코드 수정 (sandbox 권한 따라)
6. 다른 탭에서 동시 작업 가능
```

### MCP 한 번 셋업

```
1. 설정 → MCP → "추가" 클릭
2. 폼 입력 (이름, 명령어, 인자, 환경변수)
3. "양쪽 AI에 등록" 체크 (기본값)
4. 저장 → claude + codex 자동 동기화
5. 모든 대화에서 MCP 사용 가능
```

---

## 🎁 Dreampia-Dev 가 제공하는 것

| 기능 | claude 단독 | codex 단독 | **Dreampia-Dev** |
|------|------------|-----------|------------------|
| GUI | Claude Desktop (Anthropic) | Codex Desktop (OpenAI) | **자체 통합 GUI** |
| 두 AI 모두 사용 | ❌ | ❌ | **✅** |
| MCP 한 번 설정 | claude 전용 | codex 전용 | **양쪽 자동 동기화** |
| 사이드바 멀티탭 | ✅ | ❌ | **✅ (모든 AI)** |
| Codex 단순 모달 | ❌ | ✅ | **✅ (Codex 스타일 차용)** |
| 한국어 UI | 번역 부분 | 번역 부분 | **한국어 우선** |
| 오픈소스 | ❌ | ❌ | **✅** |

---

## 🚫 비목표

다음은 **하지 않음**:

- ❌ 자체 AI 모델 호스팅
- ❌ Hyper-V VM 통합 (Claude Cowork)
- ❌ Browser extension
- ❌ Office Add-in
- ❌ CLI 도구 (GUI만)
- ❌ Anthropic / OpenAI 공식 후원

세부: [DECISIONS.md § 비목표](./DECISIONS.md)

---

## 📅 로드맵 요약

```
Phase 1 (MVP)        4-6주    Windows MSIX, 한국어, 두 CLI 통합 GUI
Phase 2 (v1)         8-10주   macOS DMG, 영어, 비용 추적, cross-AI 비교
Phase 3 (v2)         12주     Plugin 시스템, 추가 AI, Linux
```

세부: [ROADMAP.md](./ROADMAP.md)

---

## 🔗 분석 결과 활용

본 프로젝트의 기술 결정은 다음 분석 결과 기반:

- [../codex/](../codex/) — OpenAI Codex 분석 (4,002줄)
- [../claude/](../claude/) — Anthropic Claude 분석 (4,830줄)
- [../COMPARISON.md](../COMPARISON.md) — 두 앱 비교
- [../FINAL_REPORT.md](../FINAL_REPORT.md) — 분석 종합

특히 직접 차용:
- **Electron 41.3 + Vite 6 + React 18 + Tailwind 3.4** (Claude 동일)
- **OXC 도구체인** (oxlint + oxfmt) — 두 회사 모두 채택
- **Codex 3-tier sandbox** (read-only / workspace-write / full-access)
- **Claude 멀티탭 사이드바** UX 패턴
- **react-intl + 한국어 우선** (12 locale 패턴)

---

## 📦 Release

`v0.1.0` 같은 git tag push 시 GitHub Actions 가 Win/macOS/Linux 3종 artifact 를 자동 빌드해
GitHub Release 로 발행합니다. Code signing (Win/macOS) 과 macOS notarization 은 secrets 가
설정된 환경에서 자동 동작 (없으면 unsigned 빌드). 자동 업데이트는 `electron-updater` 가
GitHub Releases 채널 폴링. 자세한 절차 (secrets, 아이콘, 버전 bump) 는
[docs/release.md](./docs/release.md) 참고.

---

## 라이선스 / 법적

- **라이선스**: [Apache 2.0](./LICENSE) (확정)
- **subprocess 호출만** → 두 회사 라이선스 위반 X
- **코드 서명**: 현재 unsigned 가능성 있음 (인프라 준비 완료). cert 등록 후 signed
  ([docs/code-signing.md](./docs/code-signing.md))
- **사용자 자체 API 키 / CLI 인증 사용** — 토큰 저장 X

---

## 공개 / 발표 자료

공개 release 시 OSS community 에 공유:

- [docs/announcement/hackernews.md](./docs/announcement/hackernews.md) — Show HN 포스트 초안
- [docs/announcement/reddit.md](./docs/announcement/reddit.md) — r/programming + r/MachineLearning
- [docs/announcement/producthunt.md](./docs/announcement/producthunt.md) — Product Hunt 등록
- [docs/announcement/discord-launch.md](./docs/announcement/discord-launch.md) — Discord / 한국 OSS 커뮤니티

기여 / 피드백:
- GitHub: https://github.com/eonofpixel/dreampia-dev
- Issue / Discussion 환영
- Apache 2.0 license

---

## 📊 현재 작업 통계 (2026-05-03)

```
위키 구조 (dreampia-dev/docs/):

[Phase 0 - Contracts]
  ├─ session/        13 파일  ~ 4,130줄
  ├─ permission/     12 파일  ~ 3,445줄
  ├─ tools/          16 파일  ~ 5,211줄
  ├─ findings/       13 파일  ~ 2,311줄
  └─ ux/patterns/    29 파일  ~ 2,390줄

[Phase A - Design System]
  └─ design/         66 파일  ~14,775줄
     (tokens/components/states/interaction/layout/typography/theme/a11y)

[Phase B - Performance]
  └─ performance/    14 파일  ~ 3,996줄

[Phase C - Information Architecture]
  └─ ia/              9 파일  ~ 2,132줄

[Phase D - Internationalization]
  └─ i18n/            9 파일  ~ 2,169줄
                    ───────────────────
                    181 파일   ~40,559줄

원본 (dreampia-dev/):
  ├─ DECISIONS.md, PRD.md, ARCHITECTURE.md 등
  └─ CODEX_SELF_ADVICE.md (294줄)
  └─ Stub 5개 (위키 redirect)

소스 분석 (codex/, claude/):
  ├─ codex-spec.md:        4,002줄
  ├─ claude-spec.md:       2,372줄
  └─ 기타                 ~3,000줄

총합: ~50,000줄 + 169 PNG 캡처
```

### 분량 의미

```
이전:  4개 큰 파일, 평균 1,000줄
       AI 가 한 주제 찾으려고 전체 로드

이후:  181개 작은 파일, 평균 224줄
       AI 가 정확한 페이지만 로드 (3~5K tokens)
       → 4~5배 token 효율
       
설계 분량:
  - 이전 contract 3개 (~2,900줄)
  - 신규 위키 합계 (~40,500줄)
  → 14배 디테일 ★
```

### 새 영역 (사용자 우선순위 — 최고 성능 + 디자인 사용성)

```
Design System (66 파일):
  → Tokens (7), Components (~30), States (5), 
     Interaction (5), Layout (3), Typography (3), 
     Theme (3), A11y (5)
  → 모든 컴포넌트 spec + WCAG AA 준수 + 한글 우선

Performance (14 파일):
  → 1초 TTI, 60fps, 200MB budget
  → SQLite tuning, Electron tuning, Monitoring

Information Architecture (9 파일):
  → 사이드바 / 채팅 / 미리보기 / 설정 / 온보딩 상세

i18n (9 파일):
  → 한국어 우선 + IME 안전 + 다국어 strategy
```

---

**End of README.**
