---
title: Tool Orchestration — Logging
parent: ./_index.md
related:
  - ./queue.md
  - ./observability.md
status: draft
last_updated: 2026-05-02
---

# Logging

> **한 줄 요약**: Tool 실행의 모든 lifecycle 이벤트 기록 + Trace UI 와 연동.

---

## LogEntry 구조

```typescript
interface LogEntry {
  timestamp: ISO8601;
  level: LogLevel;
  
  // 컨텍스트
  call_id?: ToolCallId;
  session_id?: SessionId;
  turn_id?: TurnId;
  
  // 내용
  message: string;
  data?: object;                       // structured data
  
  // 분류
  category: LogCategory;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogCategory = 
  | 'tool.lifecycle'                   // start/end/cancel
  | 'tool.progress'                    // 진행 상황
  | 'tool.io'                          // I/O 작업
  | 'permission.check'
  | 'permission.grant'
  | 'permission.deny'
  | 'queue.enqueue'
  | 'queue.dequeue'
  | 'mcp.message'
  | 'plugin.loaded'
  | 'error';
```

---

## SQLite 저장

```sql
CREATE TABLE execution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL,
    category TEXT NOT NULL,
    
    call_id TEXT,
    session_id TEXT,
    turn_id TEXT,
    
    message TEXT NOT NULL,
    data_json TEXT,
    
    -- partition by month for cleanup
    yyyymm INTEGER GENERATED ALWAYS AS 
        (CAST(strftime('%Y%m', timestamp) AS INTEGER)) STORED
);

CREATE INDEX idx_log_call ON execution_log(call_id);
CREATE INDEX idx_log_session ON execution_log(session_id, timestamp DESC);
CREATE INDEX idx_log_yyyymm ON execution_log(yyyymm);
```

### Cleanup
```
- 30일 이상 logs: 자동 cleanup (월별 파티션)
- 사용자 변경 가능 (15일 ~ 영구)
```

---

## Log 레벨 정책

```
debug   - 개발 시만 (env=development)
info    - 정상 작동 (DB 저장)
warn    - 비정상이지만 복구됨 (DB 저장 + 사용자 알림 X)
error   - 실패 (DB 저장 + 사용자 알림 + sentry)
```

### 레벨별 sink

```typescript
class Logger {
  log(level: LogLevel, category: LogCategory, message: string, data?: object) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level, category, message, data,
      // ... context
    };
    
    // Console (dev mode)
    if (env.NODE_ENV === 'development' || level !== 'debug') {
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
        `[${category}] ${message}`,
        data ?? ''
      );
    }
    
    // SQLite (info 이상)
    if (level !== 'debug') {
      this.toSqlite(entry);
    }
    
    // Sentry (error)
    if (level === 'error') {
      Sentry.captureException(new Error(message), { extra: data });
    }
  }
}
```

---

## Tool 안에서 로그 사용

```typescript
class ShellRunTool implements Tool {
  async execute(input, ctx) {
    ctx.log('info', `Running: ${input.cmd}`);
    
    const child = spawn(...);
    
    child.stdout.on('data', (chunk) => {
      ctx.log('debug', 'stdout', { chunk: chunk.toString() });
    });
    
    child.stderr.on('data', (chunk) => {
      ctx.log('warn', 'stderr', { chunk: chunk.toString() });
    });
    
    const code = await waitForExit(child);
    
    if (code === 0) {
      ctx.log('info', `Exited with code 0`);
    } else {
      ctx.log('error', `Exited with code ${code}`);
    }
    
    return { exit_code: code, ... };
  }
}
```

---

## ctx.log 구현

```typescript
function createLogger(callId: ToolCallId): ExecutionContext['log'] {
  return (level, message, data) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: 'tool.lifecycle',  // 기본
      call_id: callId,
      message,
      data,
    };
    
    // 1. 로그 시스템에 전달
    Logger.log(level, entry.category, message, data);
    
    // 2. ActiveExecution.log 에 추가 (실시간 UI)
    const exec = queue.active.get(callId);
    if (exec) {
      exec.log.push(entry);
      
      // UI 알림 (subscribe 한 윈도우에)
      broadcastLogUpdate(callId, entry);
    }
  };
}
```

---

## Progress 보고

```typescript
function createProgressReporter(callId: ToolCallId): ExecutionContext['progress'] {
  return (percent, message) => {
    const entry = {
      call_id: callId,
      percent,
      message,
      timestamp: new Date().toISOString(),
    };
    
    // 로그
    Logger.log('info', 'tool.progress', `${percent}% ${message ?? ''}`, entry);
    
    // UI 갱신 (progress bar)
    broadcastProgress(callId, entry);
  };
}

// Tool 안에서:
async execute(input, ctx) {
  ctx.progress(0, '시작');
  // ...
  ctx.progress(50, '절반 완료');
  // ...
  ctx.progress(100, '완료');
}
```

---

## Lifecycle 이벤트 (자동 로그)

큐가 자동으로 기록:

```typescript
// 큐가 자동으로 호출:
function logQueueEvent(event: string, data: object) {
  Logger.log('info', `queue.${event}`, event, data);
}

// 시점:
//   enqueue:           call 추가됨
//   dequeue:           실행 시작
//   permission_check:  권한 확인
//   permission_grant:  권한 부여
//   permission_deny:   권한 거부
//   tool_start:        Tool.execute 호출
//   tool_progress:     ctx.progress 호출
//   tool_end:          정상 완료
//   tool_cancelled:    abort
//   tool_failed:       에러
//   tool_timeout:      timeout
//   retry:             재시도
```

---

## 사용자 보기 (Trace timeline)

상세: [observability.md](./observability.md).

```
[메시지 응답 헤더]
┌──────────────────────────────────────────┐
│ ▼ 5개 도구 실행 (12.3초)                  │
├──────────────────────────────────────────┤
│ ⏱ 0.0s  🤔 모델 추론 시작                │
│ ⏱ 0.8s  ⚙ shell.run("ls")  (0.1s)       │
│ ⏱ 0.9s  ✓ 결과 받음                      │
│ ⏱ 1.0s  ⚙ fs.read("package.json")       │
│ ⏱ 1.0s  ✓ 결과 받음                      │
│ ⏱ 1.1s  ⚙ shell.run("npm test")  (8.2s) │
│ ⏱ 9.3s  ✗ exit code 1                    │
│ ⏱ 9.4s  🤔 분석 중                       │
│ ⏱ 11.0s ⚙ fs.write("test.js") (0.2s)    │
│ ⏱ 11.2s ✓ 저장 완료                      │
│ ⏱ 11.3s ⚙ shell.run("npm test") (1.0s)  │
│ ⏱ 12.3s ✓ exit code 0                    │
│ ⏱ 12.3s ✓ 응답 완료                      │
└──────────────────────────────────────────┘
```

---

## 검증 (Invariants)

```
INV-1: 모든 Tool 실행은 시작/종료 로그 기록
INV-2: error 레벨은 항상 sentry 보고
INV-3: 30일 이상된 log 자동 cleanup
INV-4: log_tail (최근 50개) 는 ToolResult 에 포함
INV-5: ctx.log 는 비동기 (Tool 실행 차단 X)
```

---

## 관련

- [queue.md](./queue.md) — lifecycle 이벤트 발생 위치
- [observability.md](./observability.md) — 사용자 표시
- [interface.md](./interface.md) — ctx.log 인터페이스
