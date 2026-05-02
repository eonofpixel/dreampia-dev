---
title: IA — Onboarding Flow
parent: ./_index.md
related:
  - first-run.md
  - empty-app-state.md
status: draft
last_updated: 2026-05-02
---

# Onboarding Flow

> **한 줄 요약**: 5-step. 빠르게 첫 채팅 까지. 한국어 우선.

---

## 흐름

```
1. Welcome
2. CLI 감지 / 설치
3. Provider 인증
4. Workspace 선택
5. 첫 채팅 + 추천 prompts

총 시간: 1-2분 (이미 CLI 설치되어 있으면 30초)
```

---

## Step 1: Welcome

```
┌────────────────────────────────────────────────┐
│                                                │
│                  👋                            │
│                                                │
│        Dreampia-Dev 에 오신 걸 환영합니다       │
│                                                │
│   Claude Code 와 OpenAI Codex 를 한 번에       │
│   사용하는 오픈소스 AI 코딩 도구                │
│                                                │
│           [시작하기 →]                          │
│                                                │
│   이미 사용 중인가요? [기존 데이터 가져오기]    │
│                                                │
└────────────────────────────────────────────────┘
```

### 임포트 (옵션)

```
"기존 데이터 가져오기" 클릭 →
  - Codex Desktop 데이터 import
  - Claude Code 채팅 import
  - .dreampia.session 파일
```

---

## Step 2: CLI 감지 / 설치

```
┌────────────────────────────────────────────────┐
│                                                │
│            🔍 CLI 감지 중...                   │
│                                                │
│   ✓ Claude CLI 감지됨 (v0.18.2)                │
│     ~/.claude/                                 │
│                                                │
│   ✓ Codex CLI 감지됨 (v0.125.0)                │
│     ~/.codex/                                  │
│                                                │
│           [다음 →]                              │
│                                                │
└────────────────────────────────────────────────┘
```

### CLI 미감지 시

```
   ✗ Claude CLI 없음
     [설치 방법 보기 →]
   
   ✓ Codex CLI 감지됨
   
   ⚠ Claude 없이도 Codex 만 사용 가능
   
   [Claude 설치 후 다시 시도] [Codex 만 진행]
```

→ Claude CLI 설치: `npm install -g @anthropic-ai/claude-cli`
→ Codex CLI 설치: `npm install -g codex-cli`

---

## Step 3: 인증 확인

```
┌────────────────────────────────────────────────┐
│                                                │
│              🔐 인증 확인                       │
│                                                │
│   Claude CLI:                                  │
│   ✓ 로그인됨 (user@example.com)                │
│                                                │
│   Codex CLI:                                   │
│   ✗ 로그인 필요                                │
│                                                │
│   [Codex CLI 로그인 →]                         │
│                                                │
└────────────────────────────────────────────────┘
```

### 로그인 흐름

```
"Codex CLI 로그인" 클릭 →
  Codex CLI 의 표준 로그인 흐름 위임
  (브라우저 열림, OAuth)
   ↓
완료 후 ✓ 표시
```

---

## Step 4: Workspace 선택

```
┌────────────────────────────────────────────────┐
│                                                │
│         📁 작업할 폴더 선택                     │
│                                                │
│   [폴더 찾아보기]                              │
│                                                │
│   최근 사용:                                   │
│   📁 C:\Dev\pyeongtaek-portal                 │
│   📁 C:\Users\me\projects\my-app              │
│                                                │
│   템플릿:                                      │
│   📦 새 React 앱                              │
│   📦 새 Next.js 앱                            │
│   📦 빈 프로젝트                              │
│                                                │
└────────────────────────────────────────────────┘
```

### 자동 감지

```
선택한 폴더 검사 →
  ✓ Git repo (✓)
  ✓ package.json (Node 프로젝트)
  ✓ tsconfig.json (TypeScript)

→ 적절한 default 추천 prompts 생성
```

---

## Step 5: 첫 채팅

```
┌────────────────────────────────────────────────┐
│                                                │
│           🎉 준비 완료!                         │
│                                                │
│   pyeongtaek-portal 작업 시작                  │
│                                                │
│   [추천] 클릭하여 시작:                        │
│   • 이 프로젝트 구조 분석해줘                  │
│   • 최근 PR 검토                               │
│   • 테스트 통과시키기                          │
│   • 새 기능 구현 가이드                        │
│                                                │
│   또는 직접 입력하세요:                        │
│   ┌─────────────────────────────────┐          │
│   │ 텍스트 입력...                  │          │
│   └─────────────────────────────────┘          │
│                                                │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ★ Step 5/5    │
│                                                │
└────────────────────────────────────────────────┘
```

### 추천 prompts 생성

```typescript
function getInitialRecommendations(workspace: Workspace): string[] {
  const recs: string[] = [];
  
  // 1. Workspace 분석 기반
  if (workspace.git_state) {
    recs.push('이 프로젝트 구조 분석해줘');
    recs.push('최근 PR 검토');
  }
  
  // 2. 활성 plugin 의 defaultPrompt
  for (const plugin of activePlugins) {
    recs.push(...plugin.manifest.interface.defaultPrompt);
  }
  
  // 3. 일반 추천
  recs.push('테스트 통과시키기');
  recs.push('새 기능 구현 가이드');
  
  return recs.slice(0, 4);
}
```

---

## Skip / 빠른 시작

```
모든 step 우측 상단:
  [건너뛰기] (기본값으로 진행)

기본값:
  - Workspace: 현재 dir 또는 ~/code
  - Provider: 자동 감지
  - 첫 prompt: "안녕"
```

---

## 진행 표시

```
각 step 하단:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Step 2/5
  
사용자 자유 navigate:
  [← 이전]            [다음 →]
```

---

## 첫 사용자 vs 복귀

```
첫 사용자: 5-step 풀 onboarding
복귀: 마지막 채팅 자동 복원

설정 → 도움말 → 다시 onboarding 보기
```

---

## 한국어 톤

```
✓ "환영합니다" (정중)
✓ "준비 완료!" (간결)
✓ "추천" / "또는 직접 입력하세요"

✗ "Welcome to Dreampia-Dev!"
✗ "Let's get started"
```

---

## Accessibility

```
✓ 키보드만으로 onboarding 완료 가능
✓ 각 단계 명확한 제목
✓ Screen reader 친화 (heading 위계)
✓ Skip 옵션 항상 표시
```

---

## 완료 후 첫 화면

```
[메인 화면 (3-패널)]
  Sidebar:    Workspace + 빈 채팅
  Chat:       Welcome + 추천 prompts (F-029)
  Preview:    빈 (또는 README.md preview)
```

---

## 관련

- [first-run.md](./first-run.md) — Workspace 첫 진입
- [empty-app-state.md](./empty-app-state.md) — 빈 상태
- [../ux/patterns/F-029-empty-state.md](../ux/patterns/F-029-empty-state.md)
