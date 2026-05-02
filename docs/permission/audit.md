---
title: Permission Model — 감사 로그 (Audit)
parent: ./_index.md
related:
  - ./grants.md
  - ./resolver.md
status: draft
last_updated: 2026-05-02
---

# Audit Log (감사 로그)

> **한 줄 요약**: 모든 권한 결정 영구 기록 + 사용자 검색 가능 UI.

---

## 기록 항목

```typescript
interface AuditEntry {
  id: number;                          // auto-inc
  timestamp: ISO8601;
  
  session_id: SessionId;
  turn_id?: TurnId;
  
  event: AuditEvent;
  capability: Capability;
  target: GrantTarget;
  
  decision_reason: string;             // "user_clicked_allow", "default_policy", etc.
  
  // 컨텍스트
  ai_model?: string;
  ai_reason?: string;                  // AI 가 표시한 이유
  
  // 결과
  outcome?: 'success' | 'failed';
  error?: string;
}

type AuditEvent = 
  | 'grant'           // grant 생성
  | 'deny'            // 거부
  | 'revoke'          // grant 취소
  | 'use'             // grant 사용 (capability 호출)
  | 'expire';         // 자동 만료
```

---

## SQLite 테이블

```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    turn_id TEXT,
    event TEXT NOT NULL,
    capability TEXT NOT NULL,
    target_json TEXT NOT NULL,
    decision_reason TEXT NOT NULL,
    ai_model TEXT,
    ai_reason TEXT,
    outcome TEXT,
    error TEXT,
    -- partition by month
    yyyymm INTEGER GENERATED ALWAYS AS 
        (CAST(strftime('%Y%m', timestamp) AS INTEGER)) STORED
);

CREATE INDEX idx_audit_session ON audit_log(session_id, timestamp DESC);
CREATE INDEX idx_audit_capability ON audit_log(capability, timestamp DESC);
CREATE INDEX idx_audit_yyyymm ON audit_log(yyyymm);
```

---

## 기록 시점

```typescript
class AuditLog {
  log(event: AuditEvent, data: Partial<AuditEntry>) {
    db.prepare(`
      INSERT INTO audit_log 
        (timestamp, session_id, turn_id, event, capability, target_json, 
         decision_reason, ai_model, ai_reason, outcome, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      data.session_id ?? '',
      data.turn_id,
      event,
      data.capability ?? '',
      JSON.stringify(data.target ?? {}),
      data.decision_reason ?? '',
      data.ai_model,
      data.ai_reason,
      data.outcome,
      data.error
    );
  }
}

const audit = new AuditLog();
```

### 호출 예시

```typescript
// Grant 생성 시
audit.log('grant', {
  session_id: sessionId,
  turn_id: currentTurnId,
  capability: 'LOCAL_WRITE',
  target: { kind: 'path', path: 'C:\\Dev\\foo' },
  decision_reason: 'user_clicked_allow_session',
  ai_model: 'gpt-5.5',
  ai_reason: '테스트 코드 수정 필요',
});

// 거부 시
audit.log('deny', {
  session_id: sessionId,
  capability: 'LOCAL_OUTSIDE_CWD.write',
  target: { kind: 'path', path: 'C:\\Windows\\System32' },
  decision_reason: 'dangerous_pattern_match',
  ai_reason: 'hosts 파일 수정',
});

// 사용 시
audit.log('use', {
  session_id: sessionId,
  turn_id: turnId,
  capability: 'LOCAL_EXECUTE',
  target: { kind: 'path', path: 'C:\\Dev\\foo' },
  decision_reason: 'matched_grant_001',
  outcome: 'success',
});
```

---

## 사용자 보기 UI

```
설정 → 보안 → 권한 감사 로그:

┌────────────────────────────────────────────────────────┐
│ 권한 감사 로그              [필터▼] [내보내기]         │
├────────────────────────────────────────────────────────┤
│ 2026-05-02 02:00  ✓ grant   LOCAL_WRITE                │
│   대상: C:\Dev\foo                                     │
│   세션: "서버 열고 미리보기 확인"                      │
│   사유: 사용자 허용 (모달)                             │
│                                                        │
│ 2026-05-02 01:55  ✗ deny    LOCAL_OUTSIDE_CWD          │
│   대상: C:\Windows\System32\drivers\hosts              │
│   세션: "..."                                          │
│   사유: Plan 모드 활성                                 │
│                                                        │
│ 2026-05-02 01:50  use       LOCAL_EXECUTE              │
│   대상: C:\Dev\foo (npm test)                          │
│   세션: "..."                                          │
│   결과: 성공 (12.4초)                                  │
│ ...                                                    │
└────────────────────────────────────────────────────────┘
```

### 필터

```
[필터▼]:
  날짜 범위:    [2026-05-01] ~ [2026-05-02]
  Event:        ☑ grant ☑ deny ☑ revoke ☑ use ☐ expire
  Capability:   [LOCAL_WRITE          ▼]
  Session:      [(전체)               ▼]
  결과:         ☑ success ☑ failed
```

### 내보내기

```
[내보내기]:
  형식: CSV / JSON / PDF
  범위: 필터 적용 결과 / 전체
```

---

## Cleanup 정책

```typescript
// 매일 1회 (앱 시작 시 체크)
async function cleanupAuditLog() {
  const config = await loadConfig();
  const retentionDays = config.audit_retention_days ?? 90;
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  
  const result = db.prepare(`
    DELETE FROM audit_log 
    WHERE timestamp < ?
  `).run(cutoff.toISOString());
  
  console.log(`Cleaned up ${result.changes} audit entries older than ${retentionDays} days`);
}
```

**기본 보관**: 90일.
**사용자 변경 가능**: 30일 ~ 영구.

---

## 익명화 옵션 (Phase 2+)

규제 산업 (금융, 의료) 사용자를 위한 익명화:

```typescript
interface AnonymizedAuditEntry {
  // 위험 정보 hash 처리
  session_id_hash: string;           // SHA256(session_id)
  target_hash: string;
  
  // 메타데이터만 보존
  capability: Capability;
  event: AuditEvent;
  timestamp: ISO8601;
}

// 익명화 export
async function exportAnonymized(): Promise<AnonymizedAuditEntry[]> {
  const entries = db.prepare(`SELECT * FROM audit_log`).all();
  return entries.map(anonymize);
}
```

---

## 통계 view (대시보드)

```sql
-- 자주 쓰는 capability
CREATE VIEW audit_top_capabilities AS
SELECT 
  capability,
  COUNT(*) AS use_count,
  SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS fail_count
FROM audit_log
WHERE event = 'use' AND timestamp > datetime('now', '-7 days')
GROUP BY capability
ORDER BY use_count DESC;

-- Deny 빈도
CREATE VIEW audit_deny_summary AS
SELECT 
  capability,
  COUNT(*) AS deny_count,
  decision_reason
FROM audit_log
WHERE event = 'deny' AND timestamp > datetime('now', '-30 days')
GROUP BY capability, decision_reason
ORDER BY deny_count DESC;
```

UI dashboard:
```
┌─────────────────────────────────────────────┐
│ 보안 대시보드 (최근 7일)                    │
├─────────────────────────────────────────────┤
│ 가장 자주 사용된 권한:                      │
│   1. LOCAL_READ          234 회             │
│   2. LOCAL_EXECUTE        87 회             │
│   3. NETWORK_LOCAL        45 회             │
│                                             │
│ 거부된 요청 (Top):                          │
│   1. LOCAL_OUTSIDE_CWD    12 회             │
│   2. LOCAL_EXECUTE.elevated 5 회            │
│                                             │
│ [전체 로그 보기]                            │
└─────────────────────────────────────────────┘
```

---

## 검증 (Invariants)

```
INV-1: 모든 grant/deny/revoke 는 audit_log 기록
INV-2: audit_log 는 append-only (UPDATE/DELETE 는 cleanup 만)
INV-3: timestamp 는 monotonic (ID 순서와 일치)
INV-4: 90일 이상된 entry 는 자동 삭제 (옵션 변경 가능)
INV-5: cleanup 은 트랜잭션 안 (부분 실패 X)
```

---

## 관련

- [resolver.md](./resolver.md) — audit 호출 시점
- [grants.md](./grants.md) — grant 의 lifecycle 추적
- [docs/session/persistence.md](../session/persistence.md) — audit_log 테이블 위치
