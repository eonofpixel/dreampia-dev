---
title: Round 3 — 자동화 / MCP / Plugin Creator 폼
parent: ./_index.md
related:
  - ./round3-slash-mention.md
  - ./round4-mcp-themes.md
status: complete
last_updated: 2026-05-02
---

# Round 3: 자동화 / MCP 폼 / Plugin Creator

> **방법**: 설정 → 자동화 / MCP / 플러그인 메뉴 클릭 + 새 항목 만들기
>
> **결과**: Codex 의 정의 폼 3가지 노출

---

## 자동화 폼

### 구조

```
설정 → 자동화 → 새 자동화:

┌─────────────────────────────────────────────────┐
│ 새 자동화                                       │
├─────────────────────────────────────────────────┤
│ 이름:        [이름 입력]                        │
│                                                 │
│ 트리거:      [선택...]                          │
│   ◉ 시간 (cron)                                 │
│   ○ 이벤트                                       │
│   ○ 외부 (HTTP webhook)                          │
│                                                 │
│ 시간 형식: [0 9 * * 1-5]   ★ cron 직접 입력    │
│ 또는:                                           │
│   ◉ 매일 [09:00]                                │
│   ○ 매주 [월화수목금] [09:00]                   │
│   ○ 매달 [1일] [09:00]                          │
│   ○ 사용자 지정 (cron)                          │
│                                                 │
│ 프롬프트 템플릿:                                │
│ ┌─────────────────────────────────────────┐   │
│ │ 매일 PR 검토:                           │   │
│ │   - GitHub repo: $repo                  │   │
│ │   - Sentry token: $sentry  ← 자동 치환  │   │
│ │   - 환경: $env                          │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ 변수:                                           │
│   $sentry  Trigger 인증 토큰 (자동)             │
│   $repo    Workspace.git_url                    │
│   $env     Workspace.env                        │
│   $custom  사용자 정의 + 추가                    │
│                                                 │
│ 권한 (명시적):                                  │
│   ☑ LOCAL_READ                                  │
│   ☐ LOCAL_WRITE                                 │
│   ☐ LOCAL_EXECUTE                               │
│   ☐ NETWORK_REMOTE.upload                       │
│                                                 │
│ 알림:                                           │
│   ☑ 실패 시                                      │
│   ☐ 성공 시                                      │
│                                                 │
│ [취소] [저장]                                   │
└─────────────────────────────────────────────────┘
```

### 핵심 발견

```
1. $sentry 변수 자동 치환 (HTTP webhook 인증 토큰)
2. cron 직접 입력 가능
3. 5가지 스케줄 옵션 (시간/이벤트/외부)
4. 권한은 자동화 별도 명시 (default level 무시)
```

---

## MCP 서버 폼

### 구조

```
설정 → MCP 서버 → 서버 추가:

┌─────────────────────────────────────────────┐
│ MCP 서버 추가                               │
├─────────────────────────────────────────────┤
│ 이름:        [이름]                         │
│ 유형:        ◉ STDIO   ○ HTTP              │
│                                             │
│ STDIO:                                      │
│   실행 명령:  [node, python, npx 등]        │
│   인자:       [arg1] [arg2] [+ 추가]        │
│   환경 변수:  [KEY] = [VALUE]  [+ 추가]     │
│   환경 변수 패스스루:                        │
│     [PATH] [+ 추가]   ← 시스템 env 통과    │
│   작업 디렉토리: [~/code]                   │
│                                             │
│ HTTP:                                       │
│   URL:        [https://...]                 │
│   헤더:       [Key]:[Value]                 │
│                                             │
│ 양쪽 AI 등록:                                │
│   ☑ Claude   ☑ Codex   ☑ 본체              │
│                                             │
│ [저장]                                      │
└─────────────────────────────────────────────┘
```

### 핵심 발견

```
1. STDIO + HTTP 두 형식 지원
2. ★ "환경 변수 패스스루" — 이름만, 값 X (보안)
3. 작업 디렉토리 기본 ~/code
4. "양쪽 AI 등록" 체크박스 (Codex 자체 패턴)
```

상세: [round4-mcp-themes.md](./round4-mcp-themes.md) (편집 폼).

---

## Plugin Creator (★ 강력)

### 진입

```
설정 → 플러그인 → 새 플러그인 만들기 클릭:

→ AI 채팅 시작 (Plugin 만들기 가이드)
   "어떤 종류의 플러그인을 만드시겠어요?"
   "1. 도구 통합  2. 스킬 모음  3. 자동화  ..."
```

### 흐름

```
1. AI 가 사용자 인터뷰
   - 플러그인 이름?
   - 무슨 일?
   - 어떤 도구가 필요?
   
2. AI 가 plugin.json 자동 생성
   {
     "name": "...",
     "version": "0.1.0",
     "interface": { ... }
   }

3. AI 가 skills/*/SKILL.md 자동 생성
   ---
   name: ...
   description: ...
   ---
   [상세 지침]

4. 사용자 review → install
```

### 의의

```
플러그인 작성 = 코드 X
AI 채팅 = 인터뷰 + 자동 생성
일반 사용자도 플러그인 만들 수 있음 ★ 차별화
```

---

## Skill Creator

```
설정 → 플러그인 → 새 스킬 만들기 클릭:

→ Plugin Creator 와 비슷
→ SKILL.md 생성 (Plugin 안 X, 단독)
```

→ Anthropic Skills 와 비슷한 형식 (Codex 가 자체 구현).

---

## Dreampia-Dev 차용 우선순위

```
P1 (Phase 2):
  ✓ MCP 서버 폼 (STDIO + HTTP + env passthrough)
  ✓ 자동화 시스템 ($sentry 변수)
  ✓ 양쪽 AI 동기화

P2 (Phase 3):
  ✓ Plugin/Skill Creator (AI 가이드)
  ✓ Plugin 마켓플레이스
```

---

## 관련

- [round4-mcp-themes.md](./round4-mcp-themes.md) — 편집 폼
- [docs/permission/automation.md](../permission/automation.md) — 자동화 권한
- [docs/tools/mcp-bridge.md](../tools/mcp-bridge.md) — MCP 등록
