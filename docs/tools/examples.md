---
title: Tool Orchestration — Examples & Test Scenarios
parent: ./_index.md
related:
  - ./queue.md
  - ./interface.md
status: draft
last_updated: 2026-05-02
---

# Examples & Test Scenarios

> **한 줄 요약**: 실제 시나리오 + 단위/통합 테스트 템플릿.

---

## 시나리오 1: 테스트 통과시키기

```
[사용자]: "테스트 통과시켜줘"
   ↓
[AI 호출 1]: GPT-5.5
  - 시스템 분석
  - 도구 정보 받음 (등록된 모든 tools)
  - tool_calls: [shell.run("npm test")]
   ↓
[큐]: shell.run 실행 요청 도착
   ↓
[Permission]: LOCAL_EXECUTE 권한 체크
  - workspace_write level → 자동 허용
   ↓
[Queue]: max_concurrent_per_session=1 OK → 즉시 실행
   ↓
[실행]: spawn child_process('npm test', { cwd })
  - signal 등록 (취소 가능)
  - log: "Started npm test"
   ↓
[결과]: exit code 1, stderr: "5 tests failed"
  - 결과 → ToolResult { status: 'failed', error: {...} }
   ↓
[AI 호출 2]: 이전 응답 + tool_result
  - 분석: "5개 테스트 실패. 원인 보자"
  - tool_calls: [fs.read("tests/foo.test.ts")]
   ↓
... (반복)
   ↓
[AI 호출 N]: 응답 완료
   ↓
[UI 업데이트]:
  - Trace timeline 표시
  - 변경된 파일들 diff 표시
  - 최종 결과: "✓ 모든 테스트 통과"
```

---

## 시나리오 2: 외부 데이터 송신 (권한 모달)

```
[사용자]: "이 데이터 acme.com/api 에 POST 해줘"
   ↓
[AI tool_calls]: [http.post("acme.com/api", { ... })]
   ↓
[Permission 체크]:
  - NETWORK_REMOTE.upload 필요
  - 현재 grants: 없음
  - default level: workspace_write → ★ block
   ↓
[UI 모달]:
  ┌────────────────────────────────────┐
  │ ⚠ 외부 서버로 데이터 전송           │
  │ 대상: https://acme.com/api          │
  │ 크기: 2.3 KB                        │
  │ AI 이유: "주문 데이터 동기화"       │
  │ [거부] [한 번만] [영구 허용]         │
  └────────────────────────────────────┘
   ↓
[사용자]: "한 번만" 클릭
   ↓
[Grant 저장]: scope='one_time'
   ↓
[큐]: 재시도 (이번엔 권한 통과)
   ↓
[실행]: HTTP POST
   ↓
[결과]: 200 OK
   ↓
[Audit Log]: "NETWORK_REMOTE.upload to acme.com/api - granted, succeeded"
```

---

## 시나리오 3: 백그라운드 빌드

```
[사용자]: "프로덕션 빌드 만들어줘"
   ↓
[AI tool_calls]: [shell.spawn("npm run build:prod")]
   ↓
[큐]: shell.spawn 은 background → BackgroundJobRunner 로 위임
   ↓
[즉시 응답]: ToolResult { 
  status: 'success', 
  output: { job_id: 'job-001', message: '백그라운드에서 시작됨' }
}
   ↓
[UI]: 사이드 패널 에 job 표시 (진행 중)
   ↓
[AI 다음 응답]: "빌드 백그라운드 시작. 완료되면 알려드립니다"
   ↓
[3분 후]: Job 완료
   ↓
[알림]: OS toast "빌드 완료 (3:24 분 소요)"
   ↓
[다음 사용자 turn 시작 시]: AI 에 자동 컨텍스트 추가
  "[백그라운드 작업 완료]
   npm run build:prod
   결과: 성공 (203초)"
   ↓
[AI]: "빌드 완료됐어요. dist/ 에 생성됐습니다"
```

---

## 시나리오 4: MCP 서버 도구 사용

```
[설정]: 사용자가 'filesystem-mcp' 서버 등록
   ↓
[McpServer.connect]:
  - spawn `node /path/to/fs-mcp-server.mjs`
  - handshake (initialize)
  - tools/list → ['list_files', 'read_file', 'write_file']
  - 각 tool 을 McpToolBridge 로 wrapping → registry.register
   ↓
[AI]: "프로젝트 구조 분석해줘"
   ↓
[AI tool_calls]: [mcp.filesystem-mcp.list_files({ path: "src/" })]
   ↓
[큐]: McpToolBridge.execute
  - server.callTool('list_files', { path: 'src/' })
  - JSON-RPC 메시지 전송
   ↓
[MCP 서버 응답]: ['src/main.ts', 'src/utils.ts', ...]
   ↓
[큐]: ToolResult 반환
   ↓
[AI]: 결과 분석 후 응답
```

---

## 시나리오 5: 플러그인 스킬 호출

```
[설정]: browser-use 플러그인 활성화됨
   ↓
[등록된 tools]: ["skill.browser-use.browser", ...]
   ↓
[AI]: "localhost:3000 페이지 테스트해줘"
   ↓
[AI tool_calls]: [skill.browser-use.browser({ task: "..." })]
   ↓
[SkillTool.execute]:
  1. SKILL.md 전체 로드 (lazy)
  2. AI sub-conversation 시작 (skill 내용 + task)
  3. AI 가 SKILL.md 의 지침 따라 실행:
     - browser-client.mjs 로드
     - tab 생성 + navigate
     - 스크린샷 캡처
     - 검증
  4. 결과 반환
   ↓
[ToolResult]: { 
  status: 'success', 
  output: { screenshots: [...], dom_snapshot: ..., issues: [] }
}
   ↓
[메인 AI]: skill 결과 받아서 종합
```

---

## 단위 테스트

### Tool 인터페이스

```typescript
import { ToolRegistry, FsReadTool } from '../src/tools';

describe('Tool Registry', () => {
  let registry: ToolRegistry;
  
  beforeEach(() => {
    registry = new ToolRegistry();
  });
  
  it('registers a tool', () => {
    registry.register(FsReadTool);
    expect(registry.get('fs.read')).toBe(FsReadTool);
  });
  
  it('throws on duplicate id', () => {
    registry.register(FsReadTool);
    expect(() => registry.register(FsReadTool)).toThrow('already registered');
  });
  
  it('lists by source', () => {
    registry.register(FsReadTool);
    expect(registry.list({ source: 'builtin' })).toContain(FsReadTool);
  });
  
  it('describes for AI', () => {
    registry.register(FsReadTool);
    const desc = registry.describeForAI();
    expect(desc[0]).toMatchObject({
      id: 'fs.read',
      input_schema: expect.any(Object),
    });
  });
});
```

### Execution Queue

```typescript
describe('ExecutionQueue', () => {
  it('queues calls when at max_concurrent', async () => {
    const queue = new ExecutionQueue({ max_concurrent: 1 });
    
    const slowTool = makeSlowTool(500);  // 500ms 걸리는 도구
    
    const p1 = queue.enqueue(makeCall('slow.run'));
    const p2 = queue.enqueue(makeCall('slow.run'));
    
    expect(queue.active.size).toBe(1);
    expect(queue.pending.length).toBe(1);
    
    await Promise.all([p1, p2]);
    expect(queue.active.size).toBe(0);
  });
  
  it('respects max_concurrent_per_session', async () => {
    const queue = new ExecutionQueue({ 
      max_concurrent: 10,
      max_concurrent_per_session: 1,
    });
    
    const p1 = queue.enqueue(makeCall('slow.run', { session_id: 'a' }));
    const p2 = queue.enqueue(makeCall('slow.run', { session_id: 'a' }));
    const p3 = queue.enqueue(makeCall('slow.run', { session_id: 'b' }));
    
    // session a 는 1개만, session b 는 즉시
    expect(queue.active.size).toBe(2);  // a + b
    expect(queue.pending.length).toBe(1);  // a 의 두 번째
    
    await Promise.all([p1, p2, p3]);
  });
  
  it('cancels pending calls when turn cancelled', async () => {
    const queue = new ExecutionQueue();
    
    queue.enqueue(makeCall('slow.run', { turn_id: 'turn-1' }));
    queue.enqueue(makeCall('slow.run', { turn_id: 'turn-1' }));
    
    queue.cancelTurn('turn-1');
    
    expect(queue.pending.length).toBe(0);
    
    // active 도 abort 신호
    for (const exec of queue.active.values()) {
      expect(exec.abort_controller.signal.aborted).toBe(true);
    }
  });
});
```

### Tool Execution

```typescript
describe('Tool execution', () => {
  it('checks permissions before execution', async () => {
    const session = createTestSession({ default_level: 'read_only' });
    
    const result = await queue.enqueue({
      tool_id: 'shell.run',
      input: { cmd: 'npm install' },
      session_id: session.id,
      turn_id: 'turn-1',
      origin: 'ai',
      created_at: new Date().toISOString(),
      id: 'call-001',
    });
    
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });
  
  it('logs all lifecycle events', async () => {
    const logs: LogEntry[] = [];
    Logger.subscribe(entry => logs.push(entry));
    
    await queue.enqueue(makeCall('fs.read', { path: '/foo' }));
    
    const categories = logs.map(l => l.category);
    expect(categories).toContain('queue.enqueue');
    expect(categories).toContain('tool.lifecycle');
  });
  
  it('honors timeout', async () => {
    const tool = {
      id: 'test.slow',
      execute: () => new Promise(r => setTimeout(r, 5000)),
      timeout_ms: 1000,
      // ...
    };
    
    registry.register(tool);
    
    const result = await queue.enqueue(makeCall('test.slow'));
    
    expect(result.status).toBe('timeout');
  });
  
  it('retries on retryable errors', async () => {
    let attempts = 0;
    const tool = {
      id: 'test.flaky',
      idempotent: true,
      retry: { max_attempts: 3, retry_on: [{ kind: 'network_error' }], backoff: { kind: 'constant', delay_ms: 10 } },
      execute: async () => {
        attempts++;
        if (attempts < 3) throw new Error('ECONNREFUSED');
        return 'ok';
      },
    };
    
    registry.register(tool);
    
    const result = await queue.enqueue(makeCall('test.flaky'));
    
    expect(result.status).toBe('success');
    expect(result.attempt_count).toBe(3);
  });
  
  it('does not retry non-retryable errors', async () => {
    let attempts = 0;
    const tool = {
      id: 'test.failed',
      idempotent: true,
      retry: { max_attempts: 3, retry_on: [{ kind: 'network_error' }], backoff: { kind: 'constant', delay_ms: 10 } },
      execute: async () => {
        attempts++;
        throw new Error('Not network');  // network_error 아님
      },
    };
    
    registry.register(tool);
    
    const result = await queue.enqueue(makeCall('test.failed'));
    
    expect(result.status).toBe('failed');
    expect(attempts).toBe(1);  // retry X
  });
  
  it('cleans up via cancel() on abort', async () => {
    let cancelled = false;
    const tool = {
      id: 'test.cleanup',
      execute: () => new Promise(r => setTimeout(r, 5000)),
      cancel: async () => { cancelled = true; },
      // ...
    };
    
    const promise = queue.enqueue(makeCall('test.cleanup'));
    
    setTimeout(() => queue.cancelTurn('turn-1'), 100);
    
    const result = await promise;
    
    expect(result.status).toBe('cancelled');
    expect(cancelled).toBe(true);
  });
});
```

### MCP Bridge

```typescript
describe('MCP Bridge', () => {
  it('parses line-delimited JSON-RPC', () => {
    const server = new StdioMcpServer({ command: 'echo', args: [] });
    const messages: any[] = [];
    server.onMessage = (m) => messages.push(m);
    
    // 정상 JSON
    server.processLine('{"jsonrpc":"2.0","id":1,"result":"ok"}');
    expect(messages).toHaveLength(1);
    expect(messages[0].result).toBe('ok');
  });
  
  it('handles malformed lines gracefully (Codex bug fix)', () => {
    const server = new StdioMcpServer({ command: 'echo', args: [] });
    const messages: any[] = [];
    server.onMessage = (m) => messages.push(m);
    
    // Windows TASKKILL 출력 (Codex 가 매번 SyntaxError)
    server.processLine('SUCCESS: The process with PID 12345 has been terminated.');
    
    // 우리는 silent skip + valid JSON 만 처리
    expect(messages).toHaveLength(0);
    
    // 그 다음 정상 JSON 도 처리
    server.processLine('{"jsonrpc":"2.0","id":2,"result":"after garbage"}');
    expect(messages).toHaveLength(1);
  });
  
  it('disconnects cleanly on server crash', async () => {
    const server = new StdioMcpServer({ command: 'crash-script' });
    await server.connect();
    
    expect(registry.list({ source: 'mcp' }).length).toBeGreaterThan(0);
    
    // 크래시 시뮬레이션
    server.process.emit('exit', 1);
    
    // Tools 모두 제거
    expect(registry.list({ source: 'mcp' }).length).toBe(0);
  });
});
```

---

## 통합 테스트 (E2E)

```typescript
describe('End-to-end tool flow', () => {
  it('AI -> tool call -> permission -> exec -> result -> UI', async () => {
    const session = await createSession({ workspace_id: 'ws-test' });
    
    // AI 가 tool 호출
    const toolCall: ToolCall = {
      id: 'call-001',
      tool_id: 'shell.run',
      input: { cmd: 'echo hello' },
      session_id: session.id,
      turn_id: 'turn-1',
      origin: 'ai',
      created_at: new Date().toISOString(),
    };
    
    // Mock UI: 사용자 [허용] 클릭
    mockPermissionUI.willAllow({ scope: 'session' });
    
    // Tool 실행
    const result = await queue.enqueue(toolCall);
    
    // 검증
    expect(result.status).toBe('success');
    expect(result.output).toMatchObject({ exit_code: 0 });
    
    // Grant 저장 확인
    const grants = await loadGrants(session.id);
    expect(grants).toContainEqual(expect.objectContaining({
      capability: 'LOCAL_EXECUTE',
      scope: 'session',
    }));
    
    // Audit log 확인
    const auditEntries = await loadAuditLog(session.id);
    expect(auditEntries.map(e => e.event)).toEqual(['grant', 'use']);
  });
  
  it('Multiple parallel tools complete in any order', async () => {
    const calls = [
      makeCall('fs.read', { path: '/a' }),
      makeCall('fs.read', { path: '/b' }),
      makeCall('fs.read', { path: '/c' }),
    ];
    
    const results = await Promise.all(calls.map(c => queue.enqueue(c)));
    
    expect(results.every(r => r.status === 'success')).toBe(true);
  });
  
  it('Failed tool retried per RetryPolicy', async () => {
    const result = await queue.enqueue(makeCall('flaky.tool'));
    expect(result.attempt_count).toBeGreaterThan(1);
  });
});
```

---

## 관련

- [interface.md](./interface.md) — 테스트 대상 타입
- [queue.md](./queue.md) — 테스트 대상 로직
- [retry.md](./retry.md) — RetryPolicy 테스트
