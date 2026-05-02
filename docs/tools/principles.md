---
title: Tool Orchestration — 7가지 불변 원칙
parent: ./_index.md
related:
  - ./interface.md
  - ./queue.md
status: draft
last_updated: 2026-05-02
---

# 7가지 불변 원칙

> **한 줄 요약**: 모든 Tool 설계의 헌법.

---

## P1. 모든 도구는 단일 인터페이스 구현

```
Tool<Input, Output>. 예외 없음.
```

shell, browser, MCP 서버, plugin, skill, agent 모두 동일 인터페이스.

→ 큐에서 일관성 있게 처리 가능. 로그·재시도·취소 통합.

---

## P2. 실행은 항상 비동기 + cancellable

```
모든 execute() 는 AbortSignal 받음.
사용자 STOP 버튼 → 즉시 cancel 가능.
```

```typescript
async execute(input: TInput, ctx: ExecutionContext): Promise<TOutput> {
  // ctx.signal 을 항상 체크
  if (ctx.signal.aborted) throw new AbortError();
  // ...
}
```

---

## P3. 결과는 직렬화 가능

```
DOM, 파일 핸들, 콜백 X.
```

ToolResult.output 은 JSON.stringify 통과 필수.
→ DB 저장 + Export + replay 가능.

---

## P4. 권한 체크는 실행 전 (강제)

```
Tool.required_capabilities 명시 필수.
Queue 가 자동으로 isAllowed() 호출.
Tool 코드 안에서 권한 체크 X (큐가 보장).
```

→ Tool 작성자는 권한 모델 몰라도 됨.

---

## P5. 모든 실행은 로그

```
start / progress / end / error 기록.
```

- audit_log: 권한 사용 이력
- execution_log: 도구 실행 상세

→ "무슨 일이 일어났는지 납득 가능" (Codex 조언 5번).

---

## P6. Idempotent 가능한 도구는 재시도 가능

```
Tool.idempotent: true 면 RetryPolicy 적용.
Tool.idempotent: false 면 retry 절대 X (사용자 명시 시만).
```

**Idempotent 예시**:
- ✓ `fs.read` (같은 파일 = 같은 결과)
- ✓ `browser.navigate` (같은 URL)
- ✓ `fs.list` (같은 dir)

**Non-idempotent 예시**:
- ✗ `shell.run` (npm install 두 번 = 다른 결과 가능)
- ✗ `fs.write` (이미 변경된 파일)
- ✗ `http.post` (POST = side effect)

---

## P7. UI 표시는 결과 분리

```
Tool 자체는 UI 모름.
ToolResult 가 렌더링 정보 제공.
ToolResultRenderer 가 React 컴포넌트로 변환.
```

→ Tool 은 headless 로 작동 가능 (자동화, 테스트).

---

## 비목표 (NON-goals)

```
❌ Tool 안에서 다른 Tool 호출 (재귀 X)
   → Workflow layer 별도 (Phase 2+)
   
❌ Tool 실행 시간 > 30분 (long-running 은 background job)
   → background-jobs.md 참고

❌ Plugin sandbox (V8 isolate, WebWorker)
   → Phase 2+
```

---

## 적용 예시

### 좋은 예
```typescript
// P1, P2, P3, P4, P5, P6, P7 모두 만족
class FsReadTool implements Tool<{ path: string }, { content: string; size: number }> {
  id = 'fs.read';
  version = '1.0.0';
  idempotent = true;                                    // P6
  
  required_capabilities(input: { path: string }): Capability[] {
    return ['LOCAL_READ'];                              // P4
  }
  
  async execute(input, ctx): Promise<{ content: string; size: number }> {
    if (ctx.signal.aborted) throw new AbortError();    // P2
    
    ctx.log('info', `Reading ${input.path}`);           // P5
    
    const content = await fs.promises.readFile(input.path, 'utf-8');
    
    return {                                            // P3 (JSON-able)
      content,
      size: content.length,
    };
  }
  
  display = {                                           // P7
    name: '파일 읽기',
    summary: (input) => input.path,
    summary_result: (output) => `${output.size}B`,
  };
}
```

### 나쁜 예
```typescript
// ✗ P1 - 다른 인터페이스
class WeirdTool {
  doStuff(input) { ... }  // execute() 가 아님
}

// ✗ P2 - cancellation 무시
async execute(input, ctx) {
  // ctx.signal 사용 X
  await veryLongOperation();
}

// ✗ P3 - DOM 반환
async execute(input, ctx): Promise<HTMLElement> {
  return document.querySelector(...);  // 직렬화 안 됨
}

// ✗ P4 - 자체 권한 체크
async execute(input, ctx) {
  if (!await checkPermission()) throw new Error('denied');  // 큐가 처리해야 함
}
```

---

## 관련

- [interface.md](./interface.md) — P1 의 실제 인터페이스
- [queue.md](./queue.md) — P2, P4 구현
- [retry.md](./retry.md) — P6 의 정책
- [rendering.md](./rendering.md) — P7 의 분리
