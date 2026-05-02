---
title: Codex 자체 조언 (Self-Advice)
parent: ./_index.md
related:
  - ../../CODEX_SELF_ADVICE.md
status: complete
last_updated: 2026-05-02
---

# Codex 자체 조언

> **방법**: 라이브 Codex Desktop 에 직접 질문 → Markdown 복사로 응답 추출
>
> **세션 ID**: 019de353-be46-7631-8000-827cfdb87ef8
>
> **모델**: GPT-5.5 (매우 높음 효력)

---

## 사용자 질문 (원문)

> 우리는 너의 UI/UX와 디스크 설치 구조를 깊이 분석했어. 12개 라이브 UX 패턴, /명령 44+, @멘션 30+ 에이전트, plugin.json 스키마, IPC 메시지 (config/read, plugin/list 등 10+), runFullTrust capability, codex:// URL scheme, Datadog telemetry까지 봤어. Dreampia-Dev (Claude+Codex 통합 GUI 클론)을 만들려고 해. 너 자신이 보기에, 우리가 아직 분석 못한 너의 깊은 내부 영역이 뭐가 있을까? 클론하려면 추가로 무엇을 더 봐야 해? 중요도 순으로 5가지만 추천해줘.

---

## Codex 답변 (원문 전체)

> 깊은 내부 구현을 더 캐내는 방향은 권하지 않습니다. 특히 `runFullTrust`, 비공개 IPC, `codex://` 처리, 텔레메트리 구현은 보안·권한 경계를 건드릴 수 있어서 클론 설계에는 "동작 개념"만 참고하고, 자체 구현으로 재설계하는 게 맞습니다.
>
> 중요도 순으로 보면 5가지는 이쪽입니다.
>
> 1. **작업 상태 모델**
>    - 대화, 워크스페이스, 터미널, 브라우저, 플랜/실행 모드, 권한 상태가 어떻게 하나의 세션 상태로 묶이는지.
>    - 클론 품질은 UI보다 이 상태 모델에서 갈립니다.
>
> 2. **권한·신뢰 경계 설계**
>    - full trust 자체가 아니라, "어떤 행동 전에 확인이 필요한가", "로컬 파일/브라우저/외부 전송을 어떻게 분리하는가".
>    - Dreampia-Dev는 자체 permission policy를 명시적으로 만들어야 합니다.
>
> 3. **도구 실행 오케스트레이션**
>    - shell, browser, agents, connectors, filesystem, MCP 도구를 한 큐로 실행·중단·재시도·로그화하는 구조.
>    - 단순 채팅앱과 에이전트 IDE의 차이가 여기서 납니다.
>
> 4. **플러그인/스킬 생명주기**
>    - `plugin.json` 스키마만이 아니라 설치, enable/disable, lazy loading, tool discovery, skill routing, 충돌 처리, 버전 관리.
>    - Claude+Codex 통합 GUI라면 provider별 capability를 공통 추상화해야 합니다.
>
> 5. **관찰 가능성 UX**
>    - 내부 Datadog 같은 구현보다 사용자가 보는 실행 로그, diff, terminal state, browser snapshot, agent trace, 실패 원인 표시가 중요합니다.
>    - "무슨 일이 일어났는지 납득 가능한 에이전트"가 되어야 합니다.
>
> 추가로 본다면 비공개 내부를 더 파는 것보다, **세션 상태 저장 포맷 + 권한 정책 + tool orchestration contract**를 먼저 설계하는 게 클론 성공률이 가장 높습니다.

---

## 분석 — 패러다임 전환

### 기존 우리의 접근

```
정적 분석 (4,002줄) → 라이브 UI 탐색 (28 패턴) → 디스크 forensics (12개 인사이트)
                                                     ↓
                                       다음 계획: asar 추출 + Claude Desktop forensics
```

### Codex 가 권하는 접근

```
                                            STOP "더 파기"
                                                ↓
        세션 상태 모델 ─┐
        권한 정책      ─┼─→ 3개 contract 먼저 설계
        Tool orchestration ─┘
                                                ↓
                                       나머지 (UI, MCP, 플러그인) 채우기
```

→ **분석은 충분. 이제 설계로**.

---

## 5대 영역 → Dreampia-Dev 산출물

### 1. 작업 상태 모델
→ [docs/session/_index.md](../session/_index.md) (12개 페이지, 4,130줄)
- Session schema
- Conversation, Workspace, Terminal, Browser, Plan
- Persistence (SQLite)
- Multi-window leader election
- Cross-AI sync

### 2. 권한·신뢰 경계
→ [docs/permission/_index.md](../permission/_index.md) (10개 페이지)
- 7가지 불변 원칙
- 30+ Capability
- 4단계 Level
- Grant 데이터 모델
- isAllowed() resolver
- UI flow (Inline / Modal / Toast)
- Audit log
- Danger patterns
- Automation

### 3. 도구 실행 오케스트레이션
→ [docs/tools/_index.md](../tools/_index.md) (15개 페이지)
- Tool interface
- ExecutionQueue + cancellation
- RetryPolicy
- Logging
- Result rendering
- MCP Bridge
- Plugin Loader
- Background Jobs
- Observability (Trace timeline)
- Provider Adapters

### 4. 플러그인/스킬 생명주기
→ [docs/tools/plugin-loader.md](../tools/plugin-loader.md)
- plugin.json 호환
- SKILL.md 형식
- Lazy loading
- 충돌 해결
- Cross-provider capability 추상화

### 5. 관찰 가능성 UX
→ [docs/tools/observability.md](../tools/observability.md)
- Trace timeline
- Failure reason card
- Diff viewer
- Browser snapshot gallery
- Agent trace (sub-agent)

---

## 메타 인사이트

이 조언을 받은 것 자체가 매우 흥미로운 데이터:

```
1. Codex (GPT-5.5) 가 "그만 파라" 라고 직접 말함
   → 보안·법적 경계 의식

2. 자기 자신의 내부 보다 contract 가 중요
   → 추상화 우선

3. 기능보다 상태 모델 강조
   → 시스템 디자인 관점

4. Claude + Codex 통합 = capability 추상화 필요
   → provider 중립 설계 필요성 인지
```

→ Codex 자체가 "본질적인 것은 따로 있다" 메시지. 표층 분석 충분, 이제 설계로 전환.

---

## Dreampia-Dev 작업 우선순위 변화

### 라운드 5 종료 시점 계획

```
P0: 더 깊이 분석 (asar 추출, Claude Desktop forensics)
P1: UI/UX 스펙 작성
P2: 구현
```

### Codex 조언 후

```
P0: 3개 핵심 contract 설계 (1일) → ★ 완료
    1. SessionState 스키마 (974줄)
    2. Permission policy 정의 (740줄)
    3. Tool orchestration contract (1,171줄)

P1: 5개 영역 상세 spec (1주) → ★ 완료 (2,885줄 + sub-files)

P2: UI/UX 스펙 (P0/P1 contract 기반)
P3: 구현 (Phase 1 MVP)

분석 작업 (보류):
  ❌ asar 추출 (Codex 비추천)
  ❌ Claude Desktop forensics (지금 시점에선 노이즈)
  ✓ 단, 막힐 때 reference 로 다시 사용 가능
```

---

## 관련

- [CODEX_SELF_ADVICE.md](../../CODEX_SELF_ADVICE.md) — 원본 + 작업 매핑
- [docs/session/_index.md](../session/_index.md) — 1번 영역 결과
- [docs/permission/_index.md](../permission/_index.md) — 2번 영역 결과
- [docs/tools/_index.md](../tools/_index.md) — 3번 영역 결과
