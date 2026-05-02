---
title: Performance — Production Monitoring
parent: ./_index.md
related:
  - profiling.md
status: draft
last_updated: 2026-05-02
---

# Production Monitoring

> **한 줄 요약**: Sentry + Datadog + 자체 metric. 사용자 opt-in. 익명화.

---

## 모니터링 stack

```
[Sentry]
  - Crash reporting
  - Performance (LCP, FCP, INP)
  - Error tracking

[Datadog (옵션)]
  - Custom metrics
  - Logs (structured)
  - APM

[자체 metric server (Phase 2)]
  - User behavior
  - Cost tracking (AI 호출)
  - 프라이버시 우선

→ Codex 가 sentry + datadog 사용 (라운드 5 발견).
```

---

## Sentry 설정

```typescript
import * as Sentry from '@sentry/electron';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  environment: process.env.NODE_ENV,
  release: app.getVersion(),
  
  // 샘플링 (비용 절약)
  tracesSampleRate: 0.1,           // 10% transactions
  replaysSessionSampleRate: 0,     // 0% (privacy)
  replaysOnErrorSampleRate: 1.0,   // 에러 시는 100%
  
  // 사용자 정보 (PII)
  beforeSend(event) {
    // 민감 정보 제거
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    
    // Path 정규화 (사용자 폴더명 노출 X)
    if (event.exception) {
      event.exception.values.forEach(ex => {
        ex.stacktrace?.frames?.forEach(frame => {
          frame.filename = frame.filename?.replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\<REDACTED>');
        });
      });
    }
    
    return event;
  },
  
  // Breadcrumb 필터
  beforeBreadcrumb(breadcrumb) {
    // 민감 fetch 필터
    if (breadcrumb.category === 'fetch') {
      const url = breadcrumb.data?.url;
      if (url?.includes('api.anthropic.com') || url?.includes('api.openai.com')) {
        // AI 호출 = 메시지 본문 제거
        delete breadcrumb.data.body;
      }
    }
    return breadcrumb;
  },
});
```

---

## 사용자 opt-in

```tsx
// 첫 실행 시
function PrivacyDialog() {
  return (
    <Modal>
      <h2>익명 사용 데이터 공유</h2>
      <p>
        Dreampia 의 안정성 향상을 위해 익명 사용 데이터를 공유하시겠어요?
      </p>
      
      <ul>
        <li>✓ 크래시 리포트 (개인정보 X)</li>
        <li>✓ 성능 메트릭 (페이지 로딩 시간 등)</li>
        <li>✗ 채팅 내용 (절대 X)</li>
        <li>✗ 파일 경로 / 내용 (절대 X)</li>
      </ul>
      
      <ModalFooter>
        <Button variant="secondary" onClick={optOut}>거부</Button>
        <Button variant="primary" onClick={optIn}>허용</Button>
      </ModalFooter>
    </Modal>
  );
}
```

→ 거부 시 Sentry 비활성.

---

## Custom metrics

```typescript
// metrics.ts
class Metrics {
  private buffer: Metric[] = [];
  private flushInterval: NodeJS.Timer;
  
  constructor() {
    this.flushInterval = setInterval(() => this.flush(), 60_000);
  }
  
  histogram(name: string, value: number, tags?: object) {
    this.buffer.push({ type: 'histogram', name, value, tags, ts: Date.now() });
  }
  
  counter(name: string, value: number, tags?: object) {
    this.buffer.push({ type: 'counter', name, value, tags, ts: Date.now() });
  }
  
  gauge(name: string, value: number, tags?: object) {
    this.buffer.push({ type: 'gauge', name, value, tags, ts: Date.now() });
  }
  
  async flush() {
    if (!userOptedIn || this.buffer.length === 0) return;
    
    const batch = this.buffer.splice(0);
    try {
      await fetch('https://metrics.dreampia.dev/v1/ingest', {
        method: 'POST',
        body: JSON.stringify(batch),
      });
    } catch (err) {
      // Silent (metrics 실패 = 사용자 영향 X)
      this.buffer.unshift(...batch);   // 재시도 위해 복원
    }
  }
}

export const metrics = new Metrics();
```

---

## 측정 항목

### 핵심 지표

```typescript
// 시작 시간
metrics.histogram('app.startup_ms', tti);

// 채팅 전환
metrics.histogram('chat.switch_ms', duration);

// AI 호출
metrics.histogram('ai.ttft_ms', ttft);                // first token
metrics.histogram('ai.duration_ms', total);
metrics.counter('ai.calls', 1, { provider, model });
metrics.histogram('ai.tokens', tokens, { provider });

// 메모리
metrics.gauge('memory.heap_mb', heap);
metrics.gauge('memory.rss_mb', rss);

// 에러
metrics.counter('error', 1, { code });

// 사용자 액션
metrics.counter('user.action', 1, { type: 'send_message' });
```

### 대시보드 KPI

```
사용자 만족도:
  - p50 chat switch < 200ms
  - p99 startup < 2초
  - error rate < 1%

기술 지표:
  - p95 memory < 600MB
  - p99 long task < 100ms
  - cache hit rate > 80%

비즈니스:
  - DAU
  - 메시지 / 사용자 / 일
  - AI 호출 비용
```

---

## App state heartbeat (Codex 패턴)

```typescript
// 매 분 사용 패턴 보고
setInterval(() => {
  const state = {
    schema_version: 1,
    snapshot_reason: 'heartbeat',
    session_age_ms: Date.now() - appStartTime,
    
    thread_count_total: sessions.length,
    thread_count_active: activeSessions.length,
    
    turn_count_total_loaded: totalTurns,
    item_count_total_loaded: totalItems,
    
    max_turns_in_single_thread: maxTurns,
    max_items_in_single_turn: maxItems,
  };
  
  metrics.histogram('app_state_snapshot', 1, state);
}, 60_000);
```

→ Codex 의 패턴 차용 ([라운드 5 발견](../findings/round5-ipc-telemetry.md)).

---

## 알림 (Alerts)

```yaml
# Datadog / Sentry alerts
- name: High error rate
  condition: error_rate > 5% in 5 minutes
  notify: slack-#alerts

- name: Slow startup
  condition: p95(app.startup_ms) > 3000 in 10 minutes
  notify: slack-#alerts

- name: Memory leak
  condition: avg(memory.heap_mb) > 1000 in 30 minutes
  notify: slack-#alerts

- name: AI cost spike
  condition: sum(ai.calls) > 10000 in 1 hour
  notify: slack-#cost
```

---

## 프라이버시 (★ 매우 중요)

```
원칙: 사용자 데이터 절대 보내지 X.

수집 X:
  - 채팅 내용
  - 파일 경로 / 내용
  - 사용자 식별 (이메일, IP)
  - API 키
  - workspace 이름 (옵션)

수집 OK:
  - 익명 device ID (UUIDv4 random)
  - OS, version, locale
  - 성능 메트릭 (시간, 메모리)
  - 에러 type / count
  - 사용 횟수 (anonymized)

전송 전 검증:
  function sanitize(data) {
    // 개인정보 제거
    delete data.email;
    delete data.username;
    
    // 경로 정규화
    if (data.path) {
      data.path = data.path.replace(/C:\\Users\\[^\\]+/, '<USER_DIR>');
    }
    
    return data;
  }
```

---

## GDPR / 한국 PIPA 준수

```
사용자 권리:
  ✓ Opt-in (default = 비활성)
  ✓ Opt-out 언제든 (즉시 적용)
  ✓ 데이터 삭제 요청 (request)
  ✓ 데이터 export 요청

UI:
  설정 → 프라이버시:
    ☐ 익명 사용 데이터 공유
    [내 데이터 삭제 요청]
    [내 데이터 export]
```

---

## 관련

- [profiling.md](./profiling.md) — 개발 시
- [../findings/round5-ipc-telemetry.md](../findings/round5-ipc-telemetry.md) — Codex 의 telemetry 패턴
