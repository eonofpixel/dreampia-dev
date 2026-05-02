---
title: Permission Model — 7가지 불변 원칙
parent: ./_index.md
related:
  - ./capabilities.md
  - ./grants.md
status: draft
last_updated: 2026-05-02
---

# 7가지 불변 원칙

> **한 줄 요약**: 모든 권한 결정의 헌법.

---

## P1. Default-deny (기본 거부)

```
명시적 grant 없이는 어떤 action 도 수행 X.
```

**이유**: 보안의 기본. "허용된 것만 가능" 원칙.

**예외**: Capability 의 `default_behavior: 'auto-grant'` 인 항목 (LOCAL_READ in workspace 등). 이것도 사실은 명시적으로 정의된 default policy.

---

## P2. Capability 기반 (Action 단위)

```
단일 큰 권한 X. 세분화된 capability.

✗ "관리자 권한"
✓ LOCAL_WRITE.modify, LOCAL_EXECUTE, NETWORK_REMOTE.upload, ...
```

**이유**: 정밀한 grant. AI 가 파일 읽기만 필요한데 모든 권한 줄 이유 X.

**구현**: 30+ sub-capability → [capabilities.md](./capabilities.md).

---

## P3. Scope 명시 (Where + What + Who)

```
"어디에" + "무엇을" + "누가/언제까지" 명확히.

예시:
  capability: LOCAL_WRITE
  target:     C:\Dev\foo (recursive)
  scope:      session
  granted_by: user
  granted_at: 2026-05-02T01:00:00Z
```

**이유**: 권한이 얼마나 광범위한지 사용자가 정확히 알아야 함.

---

## P4. UI 가시성 (Transparency)

```
권한 사용은 사용자가 항상 볼 수 있어야.
```

**구현**:
- 권한 사용 시점에 inline/toast 알림
- 활성 grants 목록 항상 접근 가능 (설정 → 보안)
- 감사 로그 검색 가능 → [audit.md](./audit.md)

---

## P5. Revoke 가능 (Reversible)

```
모든 grant 는 즉시 취소 가능.
```

**구현**:
```typescript
function revokeGrant(grantId: string) {
  db.prepare(`UPDATE permission_grants SET revoked_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), grantId);
  
  // 진행 중인 작업에도 영향
  invalidateCache();
  notifyActiveTools();
}
```

---

## P6. Audit log (감사 추적)

```
모든 grant / deny / revoke / use 영구 기록.
```

**저장**: SQLite `audit_log` 테이블. 90일 자동 cleanup (옵션 조정 가능).

상세: [audit.md](./audit.md).

---

## P7. Session 분리 (Isolation)

```
세션 A 의 권한은 세션 B 에 적용 X.

예외: 사용자 명시 "영구 + 모든 세션" grant.
```

**이유**: 한 세션의 권한 grant 가 다른 세션에 spillover 되면 보안 경계 무너짐.

**예시**:
```
Session A: LOCAL_EXECUTE 허용 (workspace foo)
Session B: 같은 workspace foo 에서 새로 시작
  → Session B 는 새 grant 필요 (자동 상속 X)
```

---

## 비목표 (NON-goals)

```
❌ OS 레벨 권한 (Windows ACL 등) — OS 가 처리
❌ Network firewall — OS 가 처리
❌ 파일 암호화 — Phase 3+
❌ 다중 사용자 권한 격리 — 단일 사용자 가정
```

이런 것들은 별도 영역. 본 contract 는 **앱 내부 액션 권한** 만.

---

## 적용 예시

### 좋은 예
```typescript
// P1 Default-deny + P2 Capability + P3 Scope
const grant: PermissionGrant = {
  capability: 'LOCAL_WRITE',         // P2
  target: { kind: 'path', path: 'C:\\Dev\\foo', recursive: true },  // P3
  scope: 'session',                  // P3
  granted_by: 'user',                // P3
};

// P5 Revoke
function userClickedRevoke(grantId: string) {
  revokeGrant(grantId);              // 즉시 효과
}
```

### 나쁜 예
```typescript
// ✗ P1 - default allow
if (!isExplicitlyDenied(action)) {  // wrong: should be isExplicitlyAllowed
  performAction();
}

// ✗ P2 - 단일 큰 권한
type Permission = 'admin' | 'user';  // 너무 coarse

// ✗ P3 - target 없음
const grant = { capability: 'LOCAL_WRITE' };  // 어디에 쓸 수 있는지 불명
```

---

## 관련

- [capabilities.md](./capabilities.md) — P2 의 실제 capability 목록
- [grants.md](./grants.md) — P3 의 데이터 모델
- [audit.md](./audit.md) — P6 의 저장 형식
- [resolver.md](./resolver.md) — P1 의 알고리즘
