---
title: Session State — Conversation 서브 스키마
parent: ./_index.md
related:
  - ./schema.md
  - ./browser.md
  - ../../TOOL_ORCHESTRATION.md
status: draft
last_updated: 2026-05-02
---

# Conversation Sub-schema

> **한 줄 요약**: 대화 turn 의 시간순 기록 + 메시지마다 모델/효력 변경 + 주석 모드 통합.

---

## Conversation 인터페이스

```typescript
interface Conversation {
  turns: Turn[];                       // append-only
  pending_input?: PendingInput;        // 미전송 입력 (탭 전환 보존)
  current_model: ModelId;              // 메시지마다 변경 가능
  current_effort: EffortLevel;         // 5.5 매우 높음 / 높음 / 중간 / 낮음
  current_mode: ChatMode;              // standard / plan / speed / custom
}
```

## Turn

```typescript
interface Turn {
  id: TurnId;                          // 시간순 보장
  role: 'user' | 'assistant' | 'system' | 'tool';
  timestamp: ISO8601;
  status: TurnStatus;
  
  content: ContentBlock[];             // 텍스트 + 이미지 + 첨부
  
  tool_calls?: ToolCall[];             // assistant 턴만
  tool_results?: ToolResult[];         // tool 턴만
  
  // Per-turn settings (override session default)
  model?: ModelId;
  effort?: EffortLevel;
  
  edited?: TurnEdit[];                 // 편집 history
  reactions?: Reaction[];              // 👍 👎
  annotations?: Annotation[];          // ★ 주석 모드 결과
}
```

### TurnStatus

```typescript
type TurnStatus = 
  | 'pending'        // 전송 중
  | 'streaming'      // 응답 받는 중
  | 'completed'      // 정상 종료
  | 'cancelled'      // 사용자 취소
  | 'failed';        // 오류
```

### ChatMode

```typescript
type ChatMode = 
  | 'standard'       // 일반
  | 'plan'           // /플랜 모드 (⊟ 🌐) — read-only 강제
  | 'speed'          // /속도형 (⚡) — effort 자동 낮음
  | 'custom';        // 자체 정의
```

### EffortLevel

```typescript
type EffortLevel = 'minimum' | 'low' | 'medium' | 'high' | 'maximum';

// UI 표시 매핑
const EFFORT_DISPLAY: Record<EffortLevel, string> = {
  minimum: '최소',
  low: '낮음',
  medium: '중간',
  high: '높음',
  maximum: '매우 높음',  // Codex 의 "5.5 매우 높음"
};
```

---

## ContentBlock

```typescript
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; data: Base64 | Uri; alt?: string }
  | { type: 'file'; mime: string; uri: Uri; size_bytes: number; name: string }
  | { type: 'mention'; ref: MentionRef }       // @agent / @file
  | { type: 'embedded_card'; card: EmbeddedCard };
```

### MentionRef (@ 멘션)

```typescript
interface MentionRef {
  kind: 'agent' | 'file' | 'skill';
  id: string;                          // "Analyst", "src/foo.ts", "browser-use"
  display: string;                     // 표시명
}
```

**예시**:
```json
{ "type": "mention", "ref": { "kind": "agent", "id": "Analyst", "display": "Analyst" } }
{ "type": "mention", "ref": { "kind": "file", "id": "src/foo.ts", "display": "foo.ts" } }
```

### EmbeddedCard (임베디드 카드)

```typescript
interface EmbeddedCard {
  kind: 'web_preview' | 'image' | 'pdf' | 'chart';
  title: string;
  url?: Uri;                           // [열기] 버튼 동작
  thumbnail?: Uri;
  meta?: Record<string, unknown>;
}
```

**Codex 의 임베디드 카드 패턴 (DEEP_EXPLORATION_FINDINGS K-6-5)**:
```json
{
  "type": "embedded_card",
  "card": {
    "kind": "web_preview",
    "title": "웹 미리보기",
    "url": "http://127.0.0.1:3000/dashboard",
    "thumbnail": "data:image/png;base64,..."
  }
}
```

---

## Annotation (주석 모드 — DOM Inspector)

```typescript
interface Annotation {
  id: string;
  marker_index: number;                // ① ② ③
  
  // 위치 정보 (★ DOM Inspector 결과)
  selector: string;                    // CSS selector
  bounding_box: { x: number; y: number; w: number; h: number };
  screenshot_uri: Uri;                 // 부분 스크린샷
  
  // DOM 메타 (자동 추출)
  dom_meta: {
    tag: string;                       // "div", "button"
    color?: string;                    // foreground
    bg_color?: string;
    font?: string;
    dimensions?: string;
  };
  
  // 사용자 입력
  comment: string;
  comment_audio_uri?: Uri;             // 음성 입력 시
  
  // 컨텍스트
  page_url: string;
  created_at: ISO8601;
}
```

**핵심**: Codex 의 주석 모드 → DOM 자동 인식 → AI 가 정확한 selector + 스크린샷 컨텍스트 보유.

---

## Reaction (👍 👎)

```typescript
interface Reaction {
  kind: 'thumbs_up' | 'thumbs_down' | 'shared';
  timestamp: ISO8601;
  comment?: string;                    // optional 사용자 메모
}
```

**UI**: AI 응답 하단 inline `👍 👎 ↪` (Codex 패턴).

---

## TurnEdit (편집 history)

```typescript
interface TurnEdit {
  edited_at: ISO8601;
  prev_content: ContentBlock[];        // 편집 전
  reason?: string;                     // "오타 수정"
}
```

**규칙**: 사용자 turn 만 편집 가능 (assistant turn 은 immutable). 편집 시 prev_content 저장 + 새 content 적용.

---

## PendingInput (미전송 보존)

```typescript
interface PendingInput {
  content: ContentBlock[];             // 작성 중인 내용
  draft_at: ISO8601;
  
  // Per-turn override
  model?: ModelId;
  effort?: EffortLevel;
  mode?: ChatMode;
}
```

**이유**: 사용자가 입력 중 다른 탭으로 이동해도 돌아왔을 때 입력 유지.

---

## ToolCall / ToolResult

상세는 [TOOL_ORCHESTRATION.md](../../TOOL_ORCHESTRATION.md) 참고. 여기는 conversation 안 저장 형식만:

```typescript
// turn.tool_calls (assistant 턴)
interface ToolCallRef {
  id: ToolCallId;
  tool_id: ToolId;
  input: unknown;
  // 실제 결과는 별도 turn (role='tool') 의 tool_results 에
}

// turn.tool_results (tool 턴)
interface ToolResultRef {
  call_id: ToolCallId;
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  output?: unknown;
  error?: { code: string; message: string };
  duration_ms: number;
}
```

---

## 검증 (Invariants)

```
INV-1: turns 는 append-only (id 는 시간 순 UUIDv7)
INV-2: pending/streaming 턴 은 세션당 최대 1개
INV-3: tool_calls 가 있는 턴 다음엔 반드시 role='tool' 턴
INV-4: 같은 turn.id 는 conversation 내 unique
INV-5: turn.timestamp 는 monotonically increasing
INV-6: turn.role='user' 만 edited 허용
INV-7: turn.annotations 는 page_url 일관성 (같은 URL 이어야)
```

---

## 예시: 짧은 대화

```json
{
  "turns": [
    {
      "id": "01a-user-001",
      "role": "user",
      "timestamp": "2026-05-02T01:54:00.000Z",
      "status": "completed",
      "content": [
        { "type": "text", "text": "테스트 통과시켜줘" }
      ]
    },
    {
      "id": "01a-asst-002",
      "role": "assistant",
      "timestamp": "2026-05-02T01:54:01.000Z",
      "status": "completed",
      "content": [
        { "type": "text", "text": "npm test 실행하겠습니다." }
      ],
      "tool_calls": [
        { "id": "tc-001", "tool_id": "shell.run", "input": { "cmd": "npm test" } }
      ],
      "model": "gpt-5.5",
      "effort": "high"
    },
    {
      "id": "01a-tool-003",
      "role": "tool",
      "timestamp": "2026-05-02T01:54:09.000Z",
      "status": "completed",
      "content": [],
      "tool_results": [
        {
          "call_id": "tc-001",
          "status": "failed",
          "error": { "code": "EXIT_NONZERO", "message": "exit code 1" },
          "duration_ms": 8200
        }
      ]
    },
    {
      "id": "01a-asst-004",
      "role": "assistant",
      "timestamp": "2026-05-02T01:54:10.000Z",
      "status": "completed",
      "content": [
        { "type": "text", "text": "5개 테스트 실패. 분석 중..." }
      ]
    }
  ],
  "current_model": "gpt-5.5",
  "current_effort": "high",
  "current_mode": "standard"
}
```

---

## 관련

- [schema.md](./schema.md) — Session 안에서 conversation 의 위치
- [browser.md](./browser.md) — Annotation 의 page_url 출처
- [TOOL_ORCHESTRATION.md](../../TOOL_ORCHESTRATION.md) — ToolCall/ToolResult 상세
- [examples.md](./examples.md) — 더 긴 예시
