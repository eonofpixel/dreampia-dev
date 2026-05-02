---
title: Permission Model — 자동화 권한
parent: ./_index.md
related:
  - ./grants.md
  - ./resolver.md
status: draft
last_updated: 2026-05-02
---

# Automation Permission

> **한 줄 요약**: 사용자 부재 중 실행되는 자동화 (cron, hooks) 의 엄격한 권한 모델.

---

## 자동화의 특수성

```
일반 사용 vs 자동화:

[일반 사용]
  사용자가 화면 보고 있음
  AI 가 권한 요청 → 모달 표시 → 사용자 응답
  → 정상 흐름

[자동화 (cron)]
  사용자 부재 중 실행
  권한 요청 모달 띄워봐야 응답 X
  → 자동화는 명시적 grant 만 사용
```

---

## AutomationPermission 인터페이스

```typescript
interface AutomationPermission {
  automation_id: string;
  
  // 자동화는 명시적 grant 만 사용 (default_level 무시)
  explicit_grants: PermissionGrant[];
  
  // 외부 트리거 인증
  trigger_verified: boolean;           // sentry 변수 검증
  
  // 실행 시간 제한
  max_runtime_seconds: number;
  
  // 결과 통지
  notify_on_failure: boolean;
  notify_on_success: boolean;
}
```

---

## 자동화 정의 시 권한 명시

자동화 만들 때 사용자가 직접 권한 선택:

```
설정 → 자동화 → 새 자동화:

┌───────────────────────────────────────────────────────┐
│ 새 자동화                                             │
├───────────────────────────────────────────────────────┤
│ 이름: [매일 09:00 - 코드 리뷰              ]         │
│                                                       │
│ 트리거:                                               │
│   ◉ 시간 (cron): [0 9 * * 1-5]                       │
│   ○ 이벤트: [선택...]                                │
│                                                       │
│ 사용할 세션 템플릿: [코드 리뷰 (Claude)        ▼]   │
│                                                       │
│ 명시적 권한:                                          │
│   ☑ LOCAL_READ           워크스페이스 안              │
│   ☑ NETWORK_REMOTE.read  허용 도메인:                │
│                          [github.com]                 │
│   ☐ LOCAL_WRITE                                      │
│   ☐ LOCAL_EXECUTE                                    │
│   ☐ NETWORK_REMOTE.upload                            │
│                                                       │
│ 최대 실행 시간: [5] 분                               │
│                                                       │
│ 알림:                                                 │
│   ☑ 실패 시 알림                                      │
│   ☐ 성공 시 알림                                      │
│                                                       │
│ ⚠ 외부 트리거 인증 (HTTP webhook 등):                 │
│   토큰: $sentry (자동 생성)                          │
│                                                       │
│ [취소] [저장]                                         │
└───────────────────────────────────────────────────────┘
```

---

## 자동화 권한 UI (목록)

```
설정 → 자동화:

┌───────────────────────────────────────────────────────┐
│ 매일 09:00 - 코드 리뷰                    [⚙] [⏸] [×]│
├───────────────────────────────────────────────────────┤
│ 권한 (명시적):                                        │
│   ✓ LOCAL_READ                                        │
│   ✓ NETWORK_REMOTE (github.com)                       │
│   ✗ LOCAL_WRITE                                       │
│   ✗ LOCAL_EXECUTE                                     │
│                                                       │
│ 트리거: cron "0 9 * * 1-5"                            │
│ 최대 실행 시간: 5분                                   │
│ 실패 시 알림: ✓                                       │
│ 마지막 실행: 2026-05-01 09:00 (성공, 4분 12초)        │
└───────────────────────────────────────────────────────┘
```

---

## 자동화 실행 흐름

```typescript
async function runAutomation(automation: Automation) {
  // 1. 트리거 검증
  if (automation.requires_trigger_token) {
    if (!verifyTriggerToken(automation, requestedToken)) {
      audit.log('automation_blocked', {
        reason: 'invalid_trigger_token',
        automation_id: automation.id,
      });
      return;
    }
  }
  
  // 2. 격리된 세션 생성 (다른 세션 영향 X)
  const session = await createSession({
    title: `[자동화] ${automation.name}`,
    workspace_id: automation.workspace_id,
    metadata: { automation_id: automation.id },
  });
  
  // 3. 명시적 grants 만 부여 (default_level 무시)
  for (const grantSpec of automation.explicit_grants) {
    await createGrant(session.id, grantSpec, 'session', 'automation');
  }
  
  // 4. Resolver 에 자동화 모드 전달
  const resolverContext = {
    is_automation: true,                    // ★ 핵심 플래그
    no_interactive_prompts: true,           // 모달 띄움 X (자동 deny)
  };
  
  // 5. AI 실행
  const startedAt = Date.now();
  try {
    await runAIWithTimeout({
      session,
      prompt: automation.prompt_template,
      timeout_ms: automation.max_runtime_seconds * 1000,
      resolver_context: resolverContext,
    });
    
    audit.log('automation_completed', { automation_id: automation.id });
    
    if (automation.notify_on_success) {
      sendNotification({
        title: `자동화 완료: ${automation.name}`,
        body: `소요: ${(Date.now() - startedAt) / 1000}초`,
      });
    }
    
  } catch (err) {
    audit.log('automation_failed', { 
      automation_id: automation.id, 
      error: err.message,
    });
    
    if (automation.notify_on_failure) {
      sendNotification({
        title: `자동화 실패: ${automation.name}`,
        body: err.message,
        action: 'view_log',
      });
    }
  }
}
```

---

## Resolver 의 자동화 모드

```typescript
function isAllowedInAutomation(
  capability: Capability,
  target: ResolvedTarget,
  session: Session
): GrantDecision {
  // 자동화는 명시적 grants 만 사용
  const explicitGrants = session.permission.grants
    .filter(g => g.granted_by === 'automation')
    .filter(g => !isExpired(g));
  
  const matches = explicitGrants
    .filter(g => g.capability === capability || isParentCapability(g.capability, capability))
    .filter(g => matchesTarget(g.target, target));
  
  if (matches.length > 0) {
    return { allowed: true, reason: 'automation_explicit_grant', grant: matches[0] };
  }
  
  // Default level / 사용자 grant 무시
  return { allowed: false, reason: 'automation_no_explicit_grant' };
}
```

---

## $sentry 변수 (외부 트리거 인증)

자동화가 HTTP webhook 으로 트리거 가능하면 인증 필요:

```typescript
interface TriggerToken {
  automation_id: string;
  token: string;                       // 무작위 32자
  issued_at: ISO8601;
  expires_at?: ISO8601;
}

// 자동화 정의 시 자동 생성
function generateTriggerToken(automation_id: string): TriggerToken {
  return {
    automation_id,
    token: randomBytes(24).toString('base64url'),
    issued_at: new Date().toISOString(),
  };
}

// 자동화 prompt 안에 $sentry 사용
const promptTemplate = `
이 자동화는 GitHub Webhook 으로 트리거됨.
Webhook 토큰: $sentry  ← 자동 치환됨
`;

// HTTP 트리거 endpoint
function handleTrigger(req: Request) {
  const automation_id = req.params.id;
  const provided_token = req.headers['x-trigger-token'];
  
  const stored = db.prepare(`
    SELECT token FROM automation_triggers WHERE automation_id = ?
  `).get(automation_id);
  
  if (!stored || provided_token !== stored.token) {
    return res.status(401).json({ error: 'invalid_token' });
  }
  
  runAutomation(automation_id);
  res.json({ status: 'triggered' });
}
```

---

## 자동화 격리 정책

```
원칙:
  - 각 자동화 = 새 세션
  - 자동화 세션은 다른 세션과 분리 (parent X)
  - 자동화 결과는 archived 로 저장 (검토 가능)
  - 사용자 직접 자동화 세션 ↔ 일반 세션 전환 가능
```

---

## 위험 자동화 패턴 차단

```typescript
const DANGEROUS_AUTOMATION_PATTERNS = [
  // 자동화로 시스템 변경
  { capability: 'LOCAL_EXECUTE.elevated', action: 'block' },
  
  // 자동화로 외부 데이터 송신 (반복적 leak 위험)
  { capability: 'NETWORK_REMOTE.upload', action: 'require_extra_confirmation' },
  
  // 자동화로 LOCAL_OUTSIDE_CWD
  { capability: 'LOCAL_OUTSIDE_CWD', action: 'require_extra_confirmation' },
];

// require_extra_confirmation:
//   자동화 정의 시점에 별도 확인 단계 (창 띄우고 사용자 명시적 OK)
```

---

## 검증 (Invariants)

```
INV-1: 자동화 실행 중 모달 X (no_interactive_prompts=true)
INV-2: 자동화는 default_level 무시
INV-3: 자동화 grants 는 granted_by='automation'
INV-4: 자동화 trigger 는 token 검증 필요
INV-5: 자동화 실패 시 자동 retry X (사용자 명시 설정 시만)
INV-6: 자동화 max_runtime 초과 시 강제 종료
```

---

## 관련

- [grants.md](./grants.md) — granted_by='automation' 의미
- [resolver.md](./resolver.md) — 자동화 모드 처리
- [audit.md](./audit.md) — 자동화 실행 로그
- [DEEP_EXPLORATION_FINDINGS.md](../../DEEP_EXPLORATION_FINDINGS.md) — Codex 의 자동화 폼 발견 ($sentry 등)
