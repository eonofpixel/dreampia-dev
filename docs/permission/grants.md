---
title: Permission Model — Grant 데이터 모델
parent: ./_index.md
related:
  - ./capabilities.md
  - ./resolver.md
status: draft
last_updated: 2026-05-02
---

# Permission Grant 데이터 모델

> **한 줄 요약**: 누가 / 어디에 / 무엇을 / 언제까지 = 4 차원 grant 표현.

---

## PermissionGrant 인터페이스

```typescript
interface PermissionGrant {
  id: string;                          // UUID
  session_id: SessionId;               // 어느 세션
  
  capability: Capability;              // 무엇을 (capabilities.md)
  target: GrantTarget;                 // 어디에
  scope: GrantScope;                   // 적용 범위
  
  granted_at: ISO8601;
  granted_by: 'user' | 'auto' | 'automation';
  expires_at?: ISO8601;                // NULL = 영구
  revoked_at?: ISO8601;
  
  reason?: string;                     // 사용자 메모
}
```

---

## GrantTarget

```typescript
interface GrantTarget {
  kind: 'path' | 'url' | 'domain' | 'global';
  
  // kind=path
  path?: AbsolutePath;
  recursive?: boolean;
  
  // kind=url
  url?: string;
  
  // kind=domain
  domain?: string;                     // *.example.com
  
  // kind=global
  // (target = 모든 곳)
}
```

### 예시

```json
// 특정 디렉토리
{ "kind": "path", "path": "C:\\Dev\\foo", "recursive": true }

// 특정 URL
{ "kind": "url", "url": "https://api.acme.com/v1/sync" }

// 도메인 와일드카드
{ "kind": "domain", "domain": "*.github.com" }

// 전역 (capability 한정)
{ "kind": "global" }
```

---

## GrantScope

```typescript
type GrantScope = 
  | 'one_time'           // 단 1회 (1회 use 후 자동 revoke)
  | 'turn'               // 현재 턴 (turn 종료 시 revoke)
  | 'session'            // 세션 종료까지
  | 'persistent';        // 영구 (사용자 명시 취소까지)
```

### scope 별 동작

```
one_time:
  granted_at   에 grant
  use 1회 후   자동 revoke (use 시점에 revoked_at 설정)

turn:
  현재 turn 에 부여
  turn.status = completed/failed/cancelled 시 revoke

session:
  세션 archived 또는 deleted 시 revoke
  세션 다시 열어도 grant 유지

persistent:
  영구
  사용자가 명시적으로 revoke 하기 전까지 유효
  expires_at 설정 시 만료 시점에 revoke
```

---

## SQLite 테이블

```sql
CREATE TABLE permission_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    target_json TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    granted_by TEXT NOT NULL CHECK(granted_by IN ('user','auto','automation')),
    expires_at TEXT,                         -- NULL = 영구
    revoked_at TEXT,                         -- 취소된 경우
    reason TEXT,
    scope TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_grants_session ON permission_grants(session_id, capability);
CREATE INDEX idx_grants_active ON permission_grants(capability, expires_at) 
    WHERE revoked_at IS NULL;
```

---

## Grant 생성 흐름

```typescript
async function createGrant(
  sessionId: SessionId,
  capability: Capability,
  target: GrantTarget,
  scope: GrantScope,
  grantedBy: 'user' | 'auto' | 'automation',
  options?: {
    expires_at?: ISO8601;
    reason?: string;
  }
): Promise<PermissionGrant> {
  const grant: PermissionGrant = {
    id: uuidv7(),
    session_id: sessionId,
    capability,
    target,
    scope,
    granted_at: new Date().toISOString(),
    granted_by: grantedBy,
    expires_at: options?.expires_at,
    reason: options?.reason,
  };
  
  // DB insert
  db.prepare(`
    INSERT INTO permission_grants 
      (id, session_id, capability, target_json, scope, granted_at, granted_by, expires_at, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    grant.id, grant.session_id, grant.capability,
    JSON.stringify(grant.target), grant.scope,
    grant.granted_at, grant.granted_by, grant.expires_at, grant.reason
  );
  
  // 감사 로그
  audit.log('grant', grant);
  
  return grant;
}
```

---

## Target 매칭 알고리즘

```typescript
interface ResolvedTarget {
  kind: 'path' | 'url' | 'domain' | 'global';
  value: string;       // 실제 경로 / URL
}

function matchesTarget(grantTarget: GrantTarget, resolvedTarget: ResolvedTarget): boolean {
  // kind 가 다르면 매칭 X
  if (grantTarget.kind !== resolvedTarget.kind && grantTarget.kind !== 'global') {
    return false;
  }
  
  if (grantTarget.kind === 'global') {
    return true;
  }
  
  switch (grantTarget.kind) {
    case 'path':
      return matchesPath(grantTarget, resolvedTarget.value);
    case 'url':
      return grantTarget.url === resolvedTarget.value;
    case 'domain':
      return matchesDomain(grantTarget.domain!, resolvedTarget.value);
  }
}

function matchesPath(grant: GrantTarget, target: string): boolean {
  const grantPath = path.normalize(grant.path!.toLowerCase());
  const targetPath = path.normalize(target.toLowerCase());
  
  if (!grant.recursive) {
    return grantPath === targetPath;
  }
  
  // recursive: target 이 grantPath 의 하위
  return targetPath === grantPath || targetPath.startsWith(grantPath + path.sep);
}

function matchesDomain(grant: string, target: string): boolean {
  // *.github.com → github.com, www.github.com 모두 매칭
  if (grant.startsWith('*.')) {
    const suffix = grant.slice(2);
    return target === suffix || target.endsWith('.' + suffix);
  }
  return grant === target;
}
```

---

## Most-specific Match

여러 grant 가 매칭되면 가장 specific 한 것 사용:

```typescript
function mostSpecific(grants: PermissionGrant[]): PermissionGrant {
  return grants.reduce((best, current) => {
    return specificity(current) > specificity(best) ? current : best;
  });
}

function specificity(grant: PermissionGrant): number {
  // 더 구체적일수록 높은 점수
  let score = 0;
  
  switch (grant.target.kind) {
    case 'global':  score = 0; break;
    case 'domain':  score = grant.target.domain!.startsWith('*.') ? 10 : 20; break;
    case 'url':     score = 30; break;
    case 'path':    score = grant.target.recursive ? 15 : 25; break;
  }
  
  // sub-capability 가 더 specific
  if (grant.capability.includes('.')) {
    score += 5;
  }
  
  // scope 도 고려 (one_time > turn > session > persistent)
  const scopeScore = { one_time: 4, turn: 3, session: 2, persistent: 1 };
  score += scopeScore[grant.scope];
  
  return score;
}
```

---

## Grant 만료

```typescript
function isExpired(grant: PermissionGrant): boolean {
  if (grant.revoked_at) return true;
  if (grant.expires_at && grant.expires_at < new Date().toISOString()) return true;
  return false;
}

// 정기 cleanup (매 시간)
async function cleanupExpiredGrants() {
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE permission_grants 
    SET revoked_at = expires_at
    WHERE expires_at IS NOT NULL 
      AND expires_at < ?
      AND revoked_at IS NULL
  `).run(now);
}
```

---

## Grant 취소

```typescript
async function revokeGrant(grantId: string, reason?: string) {
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE permission_grants 
    SET revoked_at = ?, reason = COALESCE(reason || '\n', '') || ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(now, `revoked: ${reason ?? 'user request'}`, grantId);
  
  // 감사 로그
  audit.log('revoke', { grantId, reason });
  
  // 진행 중인 작업 invalidate
  invalidatePermissionCache(grantId);
}
```

---

## 검증 (Invariants)

```
INV-1: granted_at <= expires_at (있으면)
INV-2: granted_at <= revoked_at (있으면)
INV-3: revoked_at 이후 isAllowed() = false
INV-4: scope='one_time' 인 grant 는 use 1회 후 즉시 revoke
INV-5: target.kind 와 capability 카테고리 일치 (예: NETWORK_* 는 url/domain target)
INV-6: target.path 는 absolute path
```

---

## 관련

- [capabilities.md](./capabilities.md) — capability 의 정의
- [resolver.md](./resolver.md) — grant 사용 알고리즘
- [audit.md](./audit.md) — 감사 로그 형식
