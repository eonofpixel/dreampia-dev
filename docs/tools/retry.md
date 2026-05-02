---
title: Tool Orchestration — Retry Policy
parent: ./_index.md
related:
  - ./interface.md
  - ./queue.md
status: draft
last_updated: 2026-05-02
---

# Retry Policy

> **한 줄 요약**: idempotent 도구의 자동 재시도. backoff + 조건부 재시도.

---

## RetryPolicy 인터페이스

```typescript
interface RetryPolicy {
  max_attempts: number;                // default 1 (no retry)
  
  // 어떤 에러에 재시도?
  retry_on: Array<
    | { kind: 'network_error' }
    | { kind: 'timeout' }
    | { kind: 'http_status'; codes: number[] }      // [503, 429]
    | { kind: 'custom'; matcher: (err: Error) => boolean }
  >;
  
  // Backoff
  backoff: 
    | { kind: 'constant'; delay_ms: number }
    | { kind: 'exponential'; base_ms: number; max_ms: number }
    | { kind: 'fibonacci'; base_ms: number };
}
```

---

## 흔한 정책 예시

### 일반 네트워크 도구

```typescript
const NETWORK_RETRY: RetryPolicy = {
  max_attempts: 3,
  retry_on: [
    { kind: 'network_error' },
    { kind: 'timeout' },
    { kind: 'http_status', codes: [502, 503, 504] },
  ],
  backoff: { kind: 'exponential', base_ms: 500, max_ms: 5000 },
};
// 시도 시간: 0s, 0.5s, 1s, 2s
```

### Rate-limited API

```typescript
const RATE_LIMITED_RETRY: RetryPolicy = {
  max_attempts: 5,
  retry_on: [
    { kind: 'http_status', codes: [429] },          // Too Many Requests
  ],
  backoff: { kind: 'fibonacci', base_ms: 1000 },
};
// 시도 시간: 0s, 1s, 1s, 2s, 3s, 5s
```

### 재시도 안 함

```typescript
const NO_RETRY: RetryPolicy = {
  max_attempts: 1,
  retry_on: [],
  backoff: { kind: 'constant', delay_ms: 0 },
};
```

---

## executeWithRetry 알고리즘

```typescript
async function executeWithRetry<T>(
  tool: Tool<any, T>,
  input: any,
  ctx: ExecutionContext
): Promise<T> {
  const policy = tool.retry ?? NO_RETRY;
  const idempotent = tool.idempotent ?? false;
  
  // Non-idempotent 는 retry X
  const maxAttempts = idempotent ? policy.max_attempts : 1;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      ctx.log('info', `Attempt ${attempt}/${maxAttempts}`);
      
      // 첫 시도 외엔 backoff
      if (attempt > 1) {
        const delay = computeBackoff(policy.backoff, attempt);
        ctx.log('info', `Waiting ${delay}ms before retry`);
        await sleep(delay, ctx.signal);
      }
      
      const result = await tool.execute(input, ctx);
      return result;
      
    } catch (err) {
      lastError = err;
      
      // 재시도 가능?
      if (attempt < maxAttempts && shouldRetry(err, policy.retry_on)) {
        ctx.log('warn', `Retry-able error: ${err.message}`);
        continue;
      }
      
      // 마지막 시도 또는 non-retryable
      throw err;
    }
  }
  
  throw lastError;
}
```

---

## shouldRetry 로직

```typescript
function shouldRetry(err: Error, conditions: RetryCondition[]): boolean {
  for (const cond of conditions) {
    switch (cond.kind) {
      case 'network_error':
        if (isNetworkError(err)) return true;
        break;
      case 'timeout':
        if (err.name === 'TimeoutError' || err.message.includes('timeout')) return true;
        break;
      case 'http_status':
        if (err instanceof HttpError && cond.codes.includes(err.statusCode)) return true;
        break;
      case 'custom':
        if (cond.matcher(err)) return true;
        break;
    }
  }
  return false;
}

function isNetworkError(err: Error): boolean {
  return err instanceof Error && (
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ENOTFOUND') ||
    err.message.includes('ETIMEDOUT') ||
    err.message.includes('socket hang up') ||
    err.name === 'NetworkError'
  );
}
```

---

## Backoff 계산

```typescript
function computeBackoff(strategy: BackoffStrategy, attempt: number): number {
  switch (strategy.kind) {
    case 'constant':
      return strategy.delay_ms;
    
    case 'exponential':
      return Math.min(
        strategy.base_ms * Math.pow(2, attempt - 2),
        strategy.max_ms
      );
    
    case 'fibonacci':
      const fib = fibonacci(attempt - 1);
      return strategy.base_ms * fib;
  }
}

function fibonacci(n: number): number {
  if (n <= 1) return 1;
  let a = 1, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}
```

### Jitter (선택)

```typescript
// Production 에선 jitter 추가 (thundering herd 방지)
function withJitter(delay_ms: number, jitter_pct = 0.1): number {
  const jitter = delay_ms * jitter_pct * (Math.random() - 0.5) * 2;
  return Math.max(0, delay_ms + jitter);
}
```

---

## Cancellable Sleep

```typescript
async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AbortError());
    
    const timeout = setTimeout(resolve, ms);
    
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new AbortError(signal.reason));
    }, { once: true });
  });
}
```

---

## Retry 와 Idempotent

### 왜 idempotent 만 재시도?

```
shell.run("npm install"):
  - 첫 시도 실패 (네트워크)
  - 재시도 → 성공
  → 문제 없음 (npm install 두 번 OK)

http.post("/api/orders", { ... }):
  - 첫 시도 실패 (504)
  - 재시도 → 성공
  → ★ 주문 두 번 생성 가능 (위험)
  
→ POST 같은 side-effect 도구는 idempotent: false
```

### Idempotency-Key 패턴 (Phase 2+)

```typescript
// HTTP POST 도 idempotency-key 사용 시 재시도 가능
async execute({ url, body }, ctx) {
  const idempotencyKey = ctx.call_id;  // unique per call
  
  return await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}
```

→ 서버가 같은 key 의 중복 요청 무시.

---

## attempt_count 기록

```typescript
// ToolResult 에 시도 횟수 포함
interface ToolResult {
  attempt_count: number;  // 1 = 첫 번째 시도 성공, 3 = 3번 만에 성공
}
```

UI 표시:
```
✓ 결과 (3번째 시도에서 성공)
   1번 실패: timeout
   2번 실패: 502 Bad Gateway
   3번 성공
```

---

## 검증 (Invariants)

```
INV-1: max_attempts >= 1
INV-2: idempotent=false → max_attempts = 1 (강제)
INV-3: 재시도는 backoff 후
INV-4: cancellation 시 backoff 도 즉시 중단
INV-5: 모든 시도가 실패하면 마지막 에러 throw
INV-6: 재시도 사이에도 ctx.signal 체크
```

---

## 관련

- [interface.md](./interface.md) — RetryPolicy 정의
- [queue.md](./queue.md) — executeWithRetry 호출
- [logging.md](./logging.md) — 재시도 로그
