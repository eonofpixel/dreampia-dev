---
title: Round 5 — IPC Schema + Telemetry
parent: ./_index.md
related:
  - ./round5-msix-paths.md
  - ./round5-bugs.md
status: complete
last_updated: 2026-05-02
---

# Round 5: IPC 메시지 + Telemetry

> **방법**: Codex 의 logs (codex-desktop-*.log) + sentry/scope_v3.json 직접 읽기
>
> **결과**: AppServerConnection 의 IPC schema + Datadog 엔드포인트

---

## IPC 메시지 스키마 (★ 가장 가치 있는 발견)

Codex 내부 IPC 는 `AppServerConnection` 으로 라우팅:

```
형식: {namespace}/{action}

발견된 메서드:
  config/read              ← 설정 읽기
  model/list               ← 모델 목록
  thread/list              ← 채팅 스레드 목록
  app/list                 ← 앱 목록
  plugin/list              ← 플러그인 목록
  Skills/list              ← Skills 목록 (cwdsCount, forceReload 파라미터)
  mcpServerStatus/list     ← MCP 서버 상태
  experimentalFeature/list ← 실험 기능 목록
  externalAgentConfig/detect ← Claude Code 등 외부 에이전트 감지
  turn/started             ← 턴 시작 이벤트
```

### 로그 형식

```
[AppServerConnection] response_routed
  broadcastFallback=false
  conversationId=null
  durationMs=24
  errorCode=null
  hadInternalHandler=false
  hadPending=true
  method=Skills/list
  originWebcontentsId=1
  requestId={uuid}
  targetDestroyed=false
```

### 기술 인사이트

```
1. IPC = renderer ↔ main process JSON-RPC 스타일
2. hadInternalHandler = 내부 핸들러 vs 외부 위임
3. broadcastFallback = 다중 윈도우 fallback 메커니즘
4. targetDestroyed = window 닫힐 때 응답 폐기 보호
5. originWebcontentsId = 어느 webview 가 요청했는지 추적
```

→ **Dreampia-Dev: 이 IPC 패턴 그대로 차용 가능.**

---

## 발견된 IPC handler 들

### Renderer → Main 요청

```typescript
// Codex 가 사용하는 IPC 메서드들
type CodexIpcMethod =
  | 'config/read'                      // 설정 읽기
  | 'config/write'                     // 설정 쓰기 (추정)
  | 'model/list'                       // 사용 가능 모델
  | 'thread/list'                      // 채팅 목록
  | 'thread/create'                    // 새 채팅
  | 'thread/delete'                    
  | 'thread/archive'
  | 'app/list'                         // 앱 (= 외부 통합)
  | 'plugin/list'                      // 플러그인
  | 'plugin/install'
  | 'plugin/enable'
  | 'plugin/disable'
  | 'Skills/list'                      // 대문자 (구버전 호환?)
  | 'mcpServerStatus/list'             // MCP 서버 상태
  | 'mcpServer/start'
  | 'mcpServer/stop'
  | 'experimentalFeature/list'
  | 'externalAgentConfig/detect'       // Claude Code 등 감지
  | 'turn/started'                     // 이벤트 (main → renderer)
  | 'turn/completed'
  | 'codex-home'                       // 페이지 라우팅
  ;
```

### Main → Renderer 이벤트

```
[electron-message-handler] Skills/list missing short_description count
  affectedCwdsCount=1
  missingShortDescriptionCount=95
```

→ Skills 의 품질 추적 (description 없으면 경고).

---

## externalAgentConfig/detect 의의

```
이 IPC 메서드는 Claude Code 등 외부 에이전트 감지:

추정:
  - ~/.claude/ 존재 → Claude Code 설치됨
  - ~/.continue/ 존재 → Continue 설치됨
  - 자동으로 import / 통합 옵션 표시

→ Dreampia-Dev: 같은 패턴으로 사용자 환경 감지 후 onboarding.
```

---

## Telemetry 엔드포인트

Sentry breadcrumb 에서 추출:

```
chatgpt.com/backend-api/wham/accounts/check    ← 계정 검증
chatgpt.com/backend-api/wham/usage             ← 사용량
chat.openai.com/ces/v1/telemetry/intake        ← Datadog telemetry forwarding
```

### Datadog 발견

```
?ddforward=...
?dd-source=browser&dd-api-key=dummy-token

= OpenAI 가 chat.openai.com 을 Datadog CES (Customer Experience System) 로 사용
```

### App state heartbeat metrics

```json
{
  "event": "app_state_snapshot",
  "schema_version": 1,
  "snapshot_reason": "heartbeat",
  "session_age_ms": 74357974,
  "thread_count_total": 18,
  "thread_count_loaded_recent": 17,
  "thread_count_active": 2,
  "thread_count_with_inflight_turn": 0,
  "turn_count_total_loaded": 20,
  "item_count_total_loaded": 89,
  "max_turns_in_single_thread": 4,
  "max_items_in_single_turn": 35
}
```

→ 매우 상세한 사용 패턴 추적. Codex 가 사용자 행동 분석에 진심.

---

## Sentry 통합

```
경로: %APPDATA%\Codex\sentry\
  ├── queue\          ← 보낼 이벤트 대기열
  ├── scope_v3.json   ← 컨텍스트 (breadcrumbs)
  └── session.json    ← 세션 메타
```

### Sentry breadcrumbs (수집되는 이벤트)

```
- electron lifecycle: window.hide, renderer.dom-ready
- HTTP requests: electron.net 카테고리
- Console logs: console 카테고리 (앱 내부 로그)
- App state snapshots: heartbeat 마다
```

---

## Build 도구 확인

asar 안 path 에서 발견:

```
app.asar
└── .vite\build\
    ├── workspace-root-drop-handler-D_UHIXp9.js  ← Vite 빌드 결과
    └── ...
```

→ **확정: Codex Desktop = Vite 빌드** (Claude Desktop 과 동일 패턴).

→ Dreampia-Dev: Vite + Electron + Tailwind 안전한 선택.

---

## Dreampia-Dev 차용

### P0 (Phase 1)
```
✓ IPC 패턴 ({namespace}/{action})
✓ AppServerConnection 같은 라우팅 레이어
✓ externalAgentConfig/detect (CLI 감지)
✓ Sentry 통합
```

### P1 (Phase 2)
```
✓ Datadog telemetry (또는 사용자 명시 opt-in)
✓ App state heartbeat metrics
✓ Pre-emptive Skills 품질 검증 (missing short_description)
```

### P2 (Phase 3)
```
✓ broadcastFallback 메커니즘 (다중 윈도우)
✓ originWebcontentsId 추적 (디버깅용)
```

---

## 관련

- [round5-msix-paths.md](./round5-msix-paths.md) — 파일 위치
- [round5-bugs.md](./round5-bugs.md) — IPC 관련 버그
- [docs/tools/_index.md](../tools/_index.md) — Tool IPC 적용
