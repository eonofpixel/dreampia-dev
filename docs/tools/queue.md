---
title: Tool Orchestration — Execution Queue
parent: ./_index.md
related:
  - ./interface.md
  - ./retry.md
status: draft
last_updated: 2026-05-02
---

# Execution Queue

> **한 줄 요약**: 모든 tool 실행의 single queue. 동시 실행 제한 + cancellation.

---

## ExecutionQueue 구조

```typescript
interface ExecutionQueue {
  // 현재 실행 중
  active: Map<ToolCallId, ActiveExecution>;
  
  // 대기 중 (선입선출)
  pending: ToolCall[];
  
  // 완료된 (메모리 기준 N개)
  recent: CompletedExecution[];
  
  // 동시 실행 제한
  max_concurrent: number;              // default 3
  max_concurrent_per_session: number;  // default 1
}

interface ActiveExecution {
  call: ToolCall;
  tool: Tool;
  context: ExecutionContext;
  started_at: ISO8601;
  abort_controller: AbortController;
  log: LogEntry[];
}
```

---

## 큐잉 정책

```
새 ToolCall 도착 →
  1. Permission 체크
     deny → reject 즉시
     ask  → 사용자 응답 대기
     allow → 다음 단계
  
  2. 현재 실행 중인 작업 수 확인
     < max_concurrent → 즉시 실행
     ≥ max_concurrent → pending 큐에 추가
  
  3. 같은 세션 동시 실행 제한
     이미 실행 중 → 직렬화 (이전 작업 끝날 때까지 대기)
  
  4. 실행 시작 → ActiveExecution 등록
```

### enqueue 알고리즘

```typescript
async function enqueue(call: ToolCall): Promise<ToolResult> {
  // 1. Permission 체크
  const tool = registry.get(call.tool_id);
  if (!tool) throw new Error(`Unknown tool: ${call.tool_id}`);
  
  const session = await loadSession(call.session_id);
  const requiredCaps = tool.required_capabilities(call.input);
  
  for (const cap of requiredCaps) {
    const target = extractTarget(call.input, cap);
    const decision = await isAllowed(cap, target, session);
    
    if (!decision.allowed) {
      // 거부 즉시 응답
      return {
        call_id: call.id,
        tool_id: call.tool_id,
        status: 'failed',
        error: {
          code: 'PERMISSION_DENIED',
          message: decision.reason,
          retryable: false,
        },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        attempt_count: 0,
        log_tail: [],
      };
    }
  }
  
  // 2. 동시 실행 제한 체크
  await waitForCapacity(call);
  
  // 3. 실행
  return await execute(call, tool);
}

async function waitForCapacity(call: ToolCall) {
  while (true) {
    if (queue.active.size >= queue.max_concurrent) {
      // 전역 한도 초과
      await waitForAnySlotFree();
      continue;
    }
    
    const sessionActive = countActiveBySession(call.session_id);
    if (sessionActive >= queue.max_concurrent_per_session) {
      // 세션 한도 초과
      await waitForSessionSlotFree(call.session_id);
      continue;
    }
    
    return;  // 여유 있음
  }
}
```

---

## 실행 흐름

```typescript
async function execute(call: ToolCall, tool: Tool): Promise<ToolResult> {
  const startedAt = new Date();
  const abortController = new AbortController();
  
  const ctx: ExecutionContext = {
    session_id: call.session_id,
    turn_id: call.turn_id,
    call_id: call.id,
    signal: abortController.signal,
    permissions: createPermissionResolver(call.session_id),
    workspace: await loadWorkspace(call.session_id),
    cwd: workspace.root,
    log: createLogger(call.id),
    progress: createProgressReporter(call.id),
    fs: createFsAdapter(call.session_id),
    net: createNetAdapter(call.session_id),
    shell: createShellAdapter(call.session_id),
    parent_call_id: call.parent_call_id,
  };
  
  // ActiveExecution 등록
  const active: ActiveExecution = {
    call, tool, context: ctx,
    started_at: startedAt.toISOString(),
    abort_controller: abortController,
    log: [],
  };
  queue.active.set(call.id, active);
  
  try {
    // Input 검증
    validateToolInput(tool, call.input);
    
    // Timeout 설정
    const timeoutMs = call.timeout_ms ?? tool.timeout_ms ?? 30_000;
    const timeoutHandle = setTimeout(() => {
      abortController.abort('timeout');
    }, timeoutMs);
    
    // 실제 실행 (with retry)
    const output = await executeWithRetry(tool, call.input, ctx);
    
    clearTimeout(timeoutHandle);
    
    // Output 검증
    validateToolOutput(tool, output);
    
    return {
      call_id: call.id,
      tool_id: call.tool_id,
      status: 'success',
      output,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      attempt_count: 1,  // executeWithRetry 가 갱신
      side_effects: extractSideEffects(ctx),
      log_tail: active.log.slice(-50),
    };
    
  } catch (err) {
    return errorResult(call, err, startedAt, active);
  } finally {
    // ActiveExecution 제거
    queue.active.delete(call.id);
    
    // 다음 pending 작업 시작
    notifySlotFree();
  }
}
```

---

## Cancellation

### 사용자 STOP 버튼

```typescript
async function cancelTurn(turnId: TurnId) {
  // 1. 같은 턴의 모든 active execution abort
  for (const exec of queue.active.values()) {
    if (exec.call.turn_id === turnId) {
      exec.abort_controller.abort('user_cancelled');
      
      // Tool 의 cancel() 호출 (cleanup)
      if (exec.tool.cancel) {
        try {
          await exec.tool.cancel(exec.context);
        } catch (err) {
          ctx.log('error', `cancel() failed: ${err.message}`);
        }
      }
    }
  }
  
  // 2. 같은 턴의 pending 제거
  queue.pending = queue.pending.filter(c => c.turn_id !== turnId);
  
  // 3. AI 에게 cancellation 알림
  ai.notifyCancelled(turnId);
}
```

### Abort 의 종류

```typescript
type AbortReason = 
  | 'user_cancelled'      // 사용자 STOP
  | 'timeout'             // 시간 초과
  | 'session_archived'    // 세션 닫힘
  | 'app_shutdown'        // 앱 종료
  | 'parent_cancelled';   // 부모 turn 취소
```

### Abort 처리

```typescript
// Tool 안에서:
async execute(input, ctx) {
  while (someCondition) {
    if (ctx.signal.aborted) {
      throw new AbortError(ctx.signal.reason ?? 'aborted');
    }
    await doWork();
  }
}

// 결과:
{
  status: 'cancelled',
  error: {
    code: 'ABORTED',
    message: ctx.signal.reason,
    retryable: false,
  },
}
```

---

## 동시 실행 제한 이유

### max_concurrent (전역 = 3)

```
이유:
  - CPU/메모리 보호
  - Network 등 자원 폭주 방지
  - 사용자 UI 응답성 유지
  
초과 시: pending 큐에 대기
```

### max_concurrent_per_session (세션 = 1)

```
이유:
  - 같은 세션 안 도구는 순차 실행 (인과 관계 보존)
  - 예: "파일 읽기 → 분석 → 수정" 순서 유지
  - 동시 실행 시 race condition 가능
  
초과 시: 같은 세션 작업 직렬화
```

### Override 가능

```typescript
// 사용자가 명시적으로 병렬 처리 요청
{
  tool_id: 'agent.parallel-orchestrator',
  input: {
    tasks: [...],
    max_concurrent: 5,  // 이 agent 가 자체 풀 관리
  }
}
```

---

## Pending Queue 우선순위

```typescript
interface ToolCall {
  priority?: 'high' | 'normal' | 'low';  // default normal
}

// pending 정렬:
//   1. priority: high → normal → low
//   2. 같은 priority 면 created_at 순 (FIFO)

function nextPending(): ToolCall | undefined {
  return queue.pending
    .sort((a, b) => {
      const prioOrder = { high: 0, normal: 1, low: 2 };
      const prioA = prioOrder[a.priority ?? 'normal'];
      const prioB = prioOrder[b.priority ?? 'normal'];
      
      if (prioA !== prioB) return prioA - prioB;
      return a.created_at.localeCompare(b.created_at);
    })
    .shift();
}
```

### Priority 사용 케이스

```
high:
  - 사용자 직접 요청 (STOP 버튼 등)
  - 권한 모달 응답
  
normal:
  - AI 의 일반 tool call
  
low:
  - 백그라운드 인덱싱
  - 자동 자료 수집
```

---

## 큐 통계 / 모니터링

```typescript
interface QueueStats {
  active_count: number;
  pending_count: number;
  recent_count: number;
  
  by_session: Map<SessionId, { active: number; pending: number }>;
  by_tool: Map<ToolId, { count: number; avg_duration_ms: number }>;
  
  total_executed_today: number;
  total_failed_today: number;
}

function getQueueStats(): QueueStats { ... }
```

UI 표시 (개발자 모드):
```
┌─────────────────────────────────────────┐
│ Queue Stats                             │
├─────────────────────────────────────────┤
│ Active:  2 / 3                          │
│ Pending: 1                              │
│ Recent:  12                             │
│                                         │
│ Today: 234 succeeded, 5 failed          │
│ Top tool: shell.run (87 calls)          │
└─────────────────────────────────────────┘
```

---

## 검증 (Invariants)

```
INV-1: queue.active.size <= max_concurrent
INV-2: 같은 session_id 의 active <= max_concurrent_per_session
INV-3: pending 의 모든 ToolCall 은 valid (tool registered, input validated)
INV-4: cancel 후 active 에서 즉시 제거
INV-5: cancel 후 같은 turn 의 pending 도 제거
INV-6: timeout 발생 시 abort_controller.abort('timeout') 호출
```

---

## 관련

- [interface.md](./interface.md) — Tool / ToolCall / ToolResult
- [retry.md](./retry.md) — executeWithRetry 상세
- [logging.md](./logging.md) — log_tail 형식
- [observability.md](./observability.md) — Trace UI
