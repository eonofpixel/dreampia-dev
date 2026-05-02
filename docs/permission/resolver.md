---
title: Permission Model — isAllowed() 알고리즘
parent: ./_index.md
related:
  - ./grants.md
  - ./levels.md
  - ./danger-patterns.md
status: draft
last_updated: 2026-05-02
---

# isAllowed() 알고리즘 (Permission Resolver)

> **한 줄 요약**: capability + target → allow/deny/ask 결정 로직.

---

## 핵심 함수

```typescript
function isAllowed(
  capability: Capability,
  target: ResolvedTarget,
  session: Session
): GrantDecision {
  // 5단계 검사 (우선순위 순)
  
  // 1. 명시적 deny 체크 (highest priority)
  const denied = findDeny(capability, target, session);
  if (denied) {
    return { allowed: false, reason: 'explicitly_denied', deny_grant: denied };
  }
  
  // 2. 위험 패턴 체크 (danger-patterns.md)
  const danger = checkDangerousPattern(capability, target);
  if (danger) {
    return { 
      allowed: false, 
      reason: 'dangerous_pattern',
      action: danger.action,  // 'deny_silent' | 'require_modal' | 'warn'
    };
  }
  
  // 3. Plan 모드 체크
  if (session.plan.active) {
    if (isReadOnly(capability)) {
      // OK 진행
    } else {
      return { allowed: false, reason: 'plan_mode_active' };
    }
  }
  
  // 4. Grant 검색
  const matches = findActiveGrants(capability, target, session);
  
  if (matches.length > 0) {
    const grant = mostSpecific(matches);
    return { allowed: true, grant };
  }
  
  // 5. Default policy (level 따라)
  return defaultLevelDecides(capability, target, session.permission.default_level);
}
```

---

## GrantDecision 타입

```typescript
interface GrantDecision {
  allowed: boolean;
  reason: DecisionReason;
  
  // 추가 정보
  grant?: PermissionGrant;        // 매칭된 grant (allowed=true)
  deny_grant?: PermissionGrant;   // 차단한 grant (explicitly_denied)
  action?: 'deny_silent' | 'require_modal' | 'warn' | 'ask';
  hint?: string;                  // 사용자 표시용
}

type DecisionReason = 
  | 'allowed_by_grant'
  | 'allowed_by_default_level'
  | 'auto_grant'
  | 'explicitly_denied'
  | 'dangerous_pattern'
  | 'plan_mode_active'
  | 'level_does_not_allow'
  | 'requires_user_confirmation';
```

---

## findActiveGrants

```typescript
function findActiveGrants(
  capability: Capability,
  target: ResolvedTarget,
  session: Session
): PermissionGrant[] {
  return session.permission.grants
    // 1. Active 만 (revoked / expired 제외)
    .filter(g => !isExpired(g))
    
    // 2. Capability 매칭
    .filter(g => 
      g.capability === capability ||                    // 정확
      isParentCapability(g.capability, capability)      // 부모 grant
    )
    
    // 3. Target 매칭
    .filter(g => matchesTarget(g.target, target));
}
```

---

## defaultLevelDecides

```typescript
function defaultLevelDecides(
  capability: Capability,
  target: ResolvedTarget,
  level: PermissionLevel
): GrantDecision {
  const allowedSet = LEVEL_CAPABILITIES[level];
  
  // Sub-capability 도 부모 통해 허용
  const allowed = 
    allowedSet.has(capability) ||
    Array.from(allowedSet).some(parent => isParentCapability(parent, capability));
  
  if (allowed) {
    // workspace_write level 은 추가 검증
    if (level === 'workspace_write' && capability.startsWith('LOCAL_')) {
      if (target.kind === 'path' && isOutsideWorkspace(target.value)) {
        return { 
          allowed: false, 
          reason: 'level_does_not_allow',
          hint: '작업 디렉토리 외부 접근은 추가 권한 필요',
        };
      }
    }
    
    return { 
      allowed: true, 
      reason: 'allowed_by_default_level',
    };
  }
  
  // Level 이 허용 안 함 → 사용자 ask 필요
  return { 
    allowed: false, 
    reason: 'requires_user_confirmation',
    action: 'ask',
    hint: `현재 level (${level}) 은 ${capability} 미포함. 권한 요청 필요.`,
  };
}
```

---

## findDeny (명시적 거부)

사용자가 일부 capability 를 명시적으로 deny 할 수 있음 (Level 4 custom 에서 흔함):

```typescript
function findDeny(
  capability: Capability,
  target: ResolvedTarget,
  session: Session
): PermissionGrant | null {
  // grants 중 "deny" 타입 grant
  // 우리 모델에선 deny grant 도 같은 PermissionGrant 사용 (capability_deny prefix)
  
  return session.permission.grants
    .filter(g => !isExpired(g))
    .find(g => 
      g.capability === `__deny__:${capability}` &&
      matchesTarget(g.target, target)
    ) ?? null;
}
```

---

## Plan 모드 통합

```typescript
function isReadOnly(capability: Capability): boolean {
  return capability === 'LOCAL_READ' ||
         capability === 'NETWORK_LOCAL' ||
         capability === 'BROWSER_NAVIGATE' ||
         capability === 'BROWSER_DOM_READ' ||
         capability === 'BROWSER_SCREENSHOT' ||
         capability === 'NETWORK_AI' ||
         capability === 'SYSTEM_NOTIFICATION';
}

// Plan 모드 활성 시 추가 차단 set
const PLAN_BLOCKED: Capability[] = [
  'LOCAL_WRITE',
  'LOCAL_WRITE.create',
  'LOCAL_WRITE.modify',
  'LOCAL_WRITE.delete',
  'LOCAL_EXECUTE',
  'NETWORK_REMOTE.upload',
  'BROWSER_INTERACT',
  'SYSTEM_AUTOMATION',
];
```

상세: [plan.md](../session/plan.md).

---

## 사용자 confirmation 흐름

`isAllowed` 가 `requires_user_confirmation` 반환 시:

```typescript
async function requestPermission(
  capability: Capability,
  target: ResolvedTarget,
  ctx: { aiReason?: string; turnId?: TurnId }
): Promise<PermissionGrant | null> {
  // 1. 위험도 따라 UI 선택
  const ui = pickUiVariant(capability);  // inline | modal | toast
  
  // 2. 사용자에게 표시
  const response = await ui.ask({
    capability,
    target,
    ai_reason: ctx.aiReason,
    options: ['거부', '한 번만 허용', '세션 동안 허용', '영구 허용'],
  });
  
  // 3. 응답 처리
  if (response === '거부') {
    audit.log('deny', { capability, target, reason: 'user_denied' });
    return null;
  }
  
  const scope: GrantScope = 
    response === '한 번만 허용' ? 'one_time' :
    response === '세션 동안 허용' ? 'session' :
    'persistent';
  
  return await createGrant(
    ctx.sessionId,
    capability,
    grantTargetFromResolved(target),
    scope,
    'user'
  );
}
```

---

## 캐싱

자주 호출되는 함수 → 캐시 필요:

```typescript
class PermissionCache {
  private cache = new Map<string, CachedDecision>();
  private ttl_ms = 60_000;  // 1분
  
  get(capability: Capability, target: ResolvedTarget): GrantDecision | null {
    const key = `${capability}|${targetKey(target)}`;
    const cached = this.cache.get(key);
    
    if (!cached || cached.expires_at < Date.now()) {
      return null;
    }
    
    return cached.decision;
  }
  
  set(capability: Capability, target: ResolvedTarget, decision: GrantDecision) {
    const key = `${capability}|${targetKey(target)}`;
    this.cache.set(key, {
      decision,
      expires_at: Date.now() + this.ttl_ms,
    });
  }
  
  invalidate() {
    this.cache.clear();  // grant 변경 시
  }
}
```

---

## 시퀀스 다이어그램

```
[Tool]    [Resolver]    [Cache]    [DB]    [UI]
  │           │           │          │        │
  │── ask ───→│           │          │        │
  │           │── get ───→│          │        │
  │           │←─ miss ───│          │        │
  │           │── load grants ──────→│        │
  │           │←─ grants ──────────  │        │
  │           │── danger check       │        │
  │           │── plan check          │        │
  │           │── target match        │        │
  │           │           │          │        │
  │           │  (no match, ask)     │        │
  │           │── prompt ────────────────────→│
  │           │                                │
  │           │←─ user response ──────────────│
  │           │── createGrant ──────→│        │
  │           │── set cache ─→│      │        │
  │           │                                │
  │←─ allowed ─                                │
```

---

## 검증 (Invariants)

```
INV-1: 같은 입력 → 같은 결정 (deterministic, modulo grants 변경)
INV-2: revoked grant 는 즉시 효력 X (cache invalidate 후)
INV-3: Plan 모드 활성 시 write/execute 거부 (level 무관)
INV-4: dangerous_pattern 은 모든 level / grant 우선
INV-5: explicitly_denied > everything else
```

---

## 관련

- [grants.md](./grants.md) — Grant 데이터 모델
- [levels.md](./levels.md) — defaultLevelDecides 의 base
- [danger-patterns.md](./danger-patterns.md) — checkDangerousPattern
- [ui-flow.md](./ui-flow.md) — requestPermission 의 UI
- [audit.md](./audit.md) — 모든 결정 로그
