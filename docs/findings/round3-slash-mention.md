---
title: Round 3 — / 슬래쉬 + @ 멘션 시스템
parent: ./_index.md
related:
  - ./rounds-1-2-live-ui.md
  - ./round3-creators.md
status: complete
last_updated: 2026-05-02
---

# Round 3: / 슬래쉬 + @ 멘션 (44+ 명령, 30+ 에이전트)

> **방법**: / 와 @ 입력 후 풀 메뉴 캡처 + 스크롤
>
> **결과**: Codex 의 명령/멘션 시스템 전체 매핑

---

## / 슬래쉬 명령 (44+)

### 카테고리

```
🤖 Agents (prompts:*)
  prompts:analyst, prompts:architect, prompts:critic,
  prompts:debugger, prompts:executor, prompts:planner,
  prompts:researcher, prompts:tdd-guide, prompts:writer,
  prompts:code-reviewer, prompts:code-simplifier,
  prompts:designer, prompts:dependency-expert,
  prompts:qa-tester, prompts:scientist, prompts:security-reviewer,
  prompts:vision, prompts:visualizer
  ... (약 18개)

🔧 Tools / Modes
  /사이드 (Side fork - 임시 별도 채팅)
  /속도형 (Speed mode - effort 낮춤)
  /플랜 모드 (Plan mode - read-only + 체크리스트)
  /압축 (Context compression)
  /자동 검토 (Auto-approve permissions)
  /포크 (채팅 → 새 워크트리)
  /상태 (/status - 사용량 표시)

📦 Skills (개인)
  AI Elements
  AI Gateway
  AI Generation Persistence
  ... (사용자 등록 추가)

⚙ 기타
  /기타 모델 (다른 모델 선택)
```

### UI

```
사용자 입력: /
            ↓
┌─────────────────────────────────────────────────────────────────┐
│ prompts:analyst              Pre-planning consultant ... (Opus)  │
│ prompts:api-reviewer         API contracts, backward compat...  │
│ prompts:architect            Strategic Architecture ... (Opus)   │
│ prompts:build-fixer          Build and compilation error ...    │
│ prompts:code-reviewer        Expert code review ...              │
│ prompts:code-simplifier ★    Simplifies and refines code ...    │
│ prompts:critic               Work plan review (Opus)             │
│ prompts:debugger             Root-cause analysis ...             │
│ prompts:dependency-expert    Dependency Expert ...               │
│ prompts:designer             UI/UX Designer (Sonnet)             │
│ prompts:executor             Autonomous deep executor (Sonnet)   │
└─────────────────────────────────────────────────────────────────┘

특징:
  - prompts:<name> 형식
  - Description (1줄) + 모델 명시 (Opus / Sonnet)
  - 제약 표시 (READ-ONLY)
  - Fuzzy search
  - 키보드 ↑↓ + Enter
```

---

## @ 멘션 (30+ 에이전트 + 파일)

### 구조

```
사용자 입력: @
            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 에이전트                                                          │
│   Analyst         Requirements clarity, acceptance criteria...   │
│   Api Reviewer    API contracts, versioning, backward compat... │
│   Architect       System design, boundaries, interfaces...       │
│   Build Fixer     Build/toolchain/type failures resolution       │
│   Code Reviewer   Comprehensive review across all concerns       │
│   Code Simplifier Simplifies recently modified code...           │
│   Critic          Plan/design critical challenge and review      │
│   Debugger        Root-cause analysis, regression isolation...   │
│   ...                                                            │
│                                                                  │
│ 파일                                                             │
│   파일을 검색하려면 입력하세요.                                  │
└─────────────────────────────────────────────────────────────────┘
```

### / 와의 차이

```
/ (슬래쉬):
  prompts:lowercase 형식
  단일 명령 실행 (메시지 전체)
  Description 더 상세 + 모델 명시

@ (멘션):
  Title Case (사람 이름 스타일)
  메시지 안 어디든 인라인 사용
  인라인 마크 (@Analyst 처럼)
  파일 섹션 별도 추가
```

---

## 30+ 에이전트 (확인된)

```
Analyst              Api Reviewer        Architect
Build Fixer          Code Reviewer       Code Simplifier
Critic               Debugger            Dependency Expert
Designer             Executor            Planner
QA Tester            Researcher          Scientist
Security Reviewer    TDD Guide           Vision
Writer               Visualizer          ...

(20+ 더 있음, 사용자 정의 가능)
```

---

## 파일 검색 (Phase 4 라운드 4 발견)

```
@<검색어> 입력 시:

매칭되는 파일 없으면:
  검색 결과 없음

★ 한국어 IME 가 영문 입력 차단 (Codex 의 알려진 이슈)
```

---

## Dreampia-Dev 차용

### F-006: / 슬래쉬 명령 시스템

```typescript
// docs/ux/patterns/F-006-slash-commands.md (별도)
interface SlashCommand {
  id: string;
  category: 'agent' | 'mode' | 'skill' | 'utility';
  description: string;
  model_hint?: string;
  
  // 실행 시
  invoke(): SlashAction;
}

type SlashAction = 
  | { kind: 'send_message'; prompt_template: string; agent: string }
  | { kind: 'set_mode'; mode: ChatMode }
  | { kind: 'utility'; action: () => void };
```

### F-007: @ 멘션 시스템

```typescript
interface Mention {
  kind: 'agent' | 'file' | 'skill';
  id: string;
  display: string;
}

// 메시지 안 인라인 표시
function parseMentions(text: string): { mentions: Mention[]; rendered: ReactNode } {
  // ...
}
```

---

## 관련

- [round3-creators.md](./round3-creators.md) — 자동화 / MCP / Plugin Creator
- [docs/ux/patterns/](../ux/patterns/) — F-006, F-007 상세
