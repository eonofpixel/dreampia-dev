# Dreampia-Dev

> **Open source AI coding desktop wrapper. Codex의 단순함 + Claude의 멀티탭 사이드바.**
> **두 AI를 한 번 셋업으로 사용. 한국어 우선, Windows-first.**

[![CI](https://github.com/dreampia-org/dreampia-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/dreampia-org/dreampia-dev/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

---

## 🎯 한 줄 요약

**Claude Code (`claude`) + Codex (`codex`) 두 CLI를 단일 Electron desktop GUI로 감싸는 오픈소스 도구.**

---

## 🚀 개발 시작

```bash
# 의존성 설치
npm install

# === 환경 토글 (better-sqlite3 native ABI) ===
# Electron 실행 전:  Electron ABI 로 native module 컴파일
npm run dev:rebuild

# 개발 모드 (Electron 창 자동 열림)
npm run dev

# === 테스트 / 빌드 ===
# 테스트 실행 전:    Node ABI 로 native module 복원 (dev:rebuild 후 토글 필요)
npm run test:rebuild
npm test

# 타입 체크 / 린트 / 빌드
npm run typecheck
npm run lint
npm run build
```

> ⚠ **better-sqlite3 ABI 토글**: Electron 33 의 V8 ABI (NODE_MODULE_VERSION 130) 와
> Node 22 의 ABI (127) 가 다릅니다. native module 은 환경마다 재컴파일 필요.
> dev ↔ test 전환 시 위 rebuild 명령을 호출하세요. 영구 해결 (sql.js WASM 또는
> node:sqlite 마이그레이션) 은 P2-V6 으로 추적 중.

### 요구사항

```
Node.js  >= 22.0
npm      >= 10.0
OS       Windows 10+ / macOS 12+ / Linux (Ubuntu 22+)
```

### 진행 상황

```
✅ Day 1-7: scaffold + UI 토대 + IPC + IME-safe 입력
   Electron 33 + Vite 6 + React 18 + TypeScript 5.6 strict
   Tailwind 3.4 + Pretendard (한국어 우선)
   3-패널 layout + ChatInput (compositionStart/End 안전)
   181 spec docs (session/permission/tools/ux/design/...)

✅ Phase 1 P0: 백엔드 토대
   ✓ PM-3 Permission resolver (5단계 우선순위) + PM-9 위험 패턴   6a687a3
   ✓ SS-4 SessionStore (better-sqlite3 + WAL + 마이그레이션)        62e2722
   ✓ SS-6 Provider Adapter (Claude/Codex/Mock streaming)           3b2c832
   ✓ TO-4 Tool Queue + shell.run + permission 통합                 33978d0
   ✓ ChatPanel streaming (▋ 펄싱 + char-by-char + auto-scroll)     8557c17

✅ Phase 1 P1: production 와이어업
   ✓ P1-1 Sidebar branded SessionId fix                            168727c
   ✓ P1-2 SessionStore main process IPC 통합                       d4bb7f0
   ✓ P1-3 Tool result inline display (ToolCallCard)                efc084e
   ✓ P1-6 SS-5 Multi-window leader election (heartbeat + TTL)      bd16169
   ✓ P1-5 BrowserView (WebContentsView + partition isolation)      4e77430
   ✓ P1-4 real CLI subprocess (Claude/Codex spawn + JSONL)         49f2a4a

✅ Phase 2 V1+V5: 검증 phase
   ✓ V1 production build 가능 + Electron 실행 검증 (3 build 버그)   7bf1911
   ✓ V5 real CLI JSONL 형식 보정 (P1-4 추측 → 검증된 형식)          5369f66

⏳ Phase 2 진행 중 (수동 검증 권장):
   ⏳ V2 E2E 첫 채팅 흐름 — npm run dev 후 사용자 직접 클릭 검증
   ⏳ V3 Tool call 실제 실행 — 사용자 직접 prompt 입력 검증
   ⏳ V4 BrowserView example.com 로드 — 사용자 직접 URL 입력 검증
   ⏳ V6 ABI 토글 영구 해결 (sql.js WASM 또는 node:sqlite migration)
```

### 검증 현황

```
588 tests pass (vitest, mocked I/O)
0 typecheck errors
production build 성공 (vite + electron-builder)
Electron 창 실제 부팅 확인 (V1 commit 에서 검증)
Claude CLI v2.1.123 + Codex CLI v0.125.0 출력 캡처 → translate 보정 (V5)
```

### 알려진 한계

```
1. Mock 응답 = "Mock response. You said: ..." (echo).
   진짜 응답은 CLI 인증 (claude /login, codex login) 후 사용 가능.

2. better-sqlite3 dual-ABI 토글 필요 (위 rebuild 명령).

3. CLI translate 의 Codex function_call 매핑은 best-effort.
   실제 tool 호출 응답이 캡처되면 보정 필요.

4. BrowserView 의 ResizeObserver setBounds 는 실제 click 검증 안 됨.
   tests/main/BrowserManager.test.ts 는 Electron 모킹 기반.

5. Multi-window leader election: 같은 db 의 두 LeaderElection 인스턴스로
   단위 테스트. 진짜 두 Electron 윈도우는 검증 안 됨.
```

🚀 다음 후보 (Phase 2 + Phase 3):
  - V2-V4 수동 시각 검증 (사용자 환경에서 npm run dev:rebuild && npm run dev)
  - V6 sql.js WASM 또는 node:sqlite 마이그레이션 (dual-ABI 영구 해결)
  - DOM Inspector / Annotation 모드 (BrowserView P2 기능)
  - Onboarding 5-step UI (CLI 감지 + 설치 안내 → first-chat)
  - Plugin / MCP Bridge / Skill Loader (TO-8/9/10)

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

## ⚖️ 라이선스 / 법적

- **라이선스**: TBD (Apache 2.0 또는 MIT 권장)
- **subprocess 호출만** → 두 회사 라이선스 위반 X
- **자체 EV cert** 또는 GitHub Actions OIDC 서명
- **사용자 자체 API 키 / CLI 인증 사용** — 토큰 저장 X

---

## ❓ 다음 단계 (사용자 결정)

### 분석 완료 (라운드 1~5)
- ✅ 정적 분석 (codex-spec.md 4,002줄, claude-spec.md 2,372줄)
- ✅ 라이브 UX 탐색 (28 패턴, 169 캡처)
- ✅ 디스크 forensics (MSIX, plugin.json, IPC schema 등)
- ✅ Codex 자체 조언 받음
- ✅ 3개 핵심 contract 작성 (2,885줄)

### 현재 시점에서 결정할 것

1. **GitHub repo 생성** (`<username>/dreampia-dev` 또는 `dreampia-org/dev`)
2. **라이선스 선택** (Apache 2.0 vs MIT)
3. **Phase 1 시작 시점**
4. **Dreampia 기존 프로젝트와의 통합 수준**
5. **첫 작업 선택지**:
   - **A. Contract 검토** — Critic agent 에게 SESSION_STATE/PERMISSION/TOOL contract 비판적 검토 요청
   - **B. 5개 영역 추가 spec** — Codex 가 권한 5개 중 남은 2개 (플러그인 생명주기, 관찰 가능성 UX)
   - **C. UI/UX 5개 spec** — 1500+ 줄 분량 별도 산출
   - **D. Phase 1 구현 시작** — 스캐폴드 + SS-1~5 구현
   - **E. asar 추출** (Codex 비추천이지만 reference 용도)

---

## 📊 현재 작업 통계 (2026-05-02)

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
