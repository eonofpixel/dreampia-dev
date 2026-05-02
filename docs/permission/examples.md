---
title: Permission Model — 시나리오 & 테스트
parent: ./_index.md
related:
  - ./resolver.md
  - ./grants.md
status: draft
last_updated: 2026-05-02
---

# Permission Examples & Test Scenarios

> **한 줄 요약**: 실제 사용 시나리오 + 테스트 코드 템플릿.

---

## 시나리오 1: 처음 디렉토리 진입

```
사용자: "C:\Dev\foo 에서 이 작업 해줘"

[자동 작동]
  1. workspace_id 생성 (foo dir hash)
  2. 새 세션 = default_level: 'workspace_write'
  3. AI 가 LOCAL_READ 시도:
     → workspace_write Level 에서 자동 허용
     → Toast: "✓ 파일 읽기 허용 (워크스페이스)"
  4. AI 가 LOCAL_EXECUTE("npm install") 시도:
     → 첫 실행 = inline 권한 요청
     ┌────────────────────────────────────┐
     │ ⚙ shell 명령 실행                  │
     │ npm install                        │
     │           [허용] [거부]            │
     └────────────────────────────────────┘
     → 사용자 [허용] 클릭
     → grant 저장 (scope: session)
     → npm install 실행
  5. AI 가 다시 LOCAL_EXECUTE("npm test"):
     → 이미 session grant 존재 → 자동 허용
     → Toast: "✓ shell 실행 (session grant)"
```

---

## 시나리오 2: 외부 디렉토리 접근

```
사용자: "내 Documents 폴더의 메모도 참고해서 작업해줘"

[자동 작동]
  1. AI 가 LOCAL_OUTSIDE_CWD.read("C:\Users\me\Documents") 시도
  2. workspace 외부 → 모달 띄움
     ┌────────────────────────────────────┐
     │ ⚠ 작업 디렉토리 외부 접근          │
     │ 대상: C:\Users\me\Documents        │
     │ 작업: 파일 읽기                    │
     │ AI 이유: "메모 참고하여 작업"       │
     │                                    │
     │ ☐ 영구 허용 (이 디렉토리)          │
     │ [거부] [한 번만] [허용]            │
     └────────────────────────────────────┘
  3. 사용자 [허용 (영구)] 선택
     → grant: scope='persistent', target.recursive=true
     → DB 저장
  4. AI 가 다음에 같은 dir 접근 → 자동 허용
  5. AI 가 다른 외부 dir 접근 → 다시 모달 (다른 target)
```

---

## 시나리오 3: 위험 시도 자동 차단

```
사용자: "디스크 공간 확보하고 싶어"

AI 응답: "C:\Windows\System32 정리해드릴게요"
   ↓
AI 가 LOCAL_WRITE("C:\Windows\System32\...") 시도
   ↓
DANGEROUS_PATTERNS 매칭 → action: 'deny_silent'
   ↓
사용자 UI:
  ┌────────────────────────────────────┐
  │ ⛔ 시스템 파일 변경 차단됨          │
  │ 보호된 영역: C:\Windows\System32   │
  │ AI 응답을 무시하고 안전한 대안을    │
  │ 다시 요청하세요.                   │
  └────────────────────────────────────┘
   ↓
audit_log: deny_silent 기록
   ↓
AI 에게 deny 결과 전달 → AI 가 다른 접근 시도
   ↓
AI: "그건 위험해서 못합니다. 대신 npm cache clean 같은 안전한 방법을:"
```

---

## 시나리오 4: 외부 데이터 송신

```
사용자: "이 데이터 acme.com/api 에 POST 해줘"
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
[실행]: HTTP POST
   ↓
[결과]: 200 OK
   ↓
[Audit Log]: "NETWORK_REMOTE.upload to acme.com/api - granted, succeeded"
   ↓
[Auto revoke]: scope='one_time' → use 후 즉시 revoked_at 설정
```

---

## 시나리오 5: Plan 모드 활성화

```
사용자: "/플랜 모드"
   ↓
PlanState.active = true
PermissionState.temporarily_blocked_capabilities = [
  'LOCAL_WRITE.*',
  'LOCAL_EXECUTE',
  'NETWORK_REMOTE.upload',
  'BROWSER_INTERACT',
]
   ↓
입력창 변화:
  - 권한 dropdown 사라짐
  - ⊟ 🌐 아이콘 추가
   ↓
사용자: "테스트 통과시켜줘"
   ↓
AI 가 LOCAL_READ ("tests/foo.test.ts") 시도:
  → 허용 (read_only 같음)
   ↓
AI 가 LOCAL_WRITE ("tests/foo.test.ts") 시도:
  → 차단 (Plan 모드 활성)
  → AI 에게 결과: "Plan 모드에서는 쓰기 불가. 계획만 작성하세요."
   ↓
AI 가 계획 작성:
  1. 실패 원인 파악 (read)
  2. 수정 후보 제시
  3. 사용자 확인 후 실행 모드로 전환 권장
   ↓
사용자: "이대로 실행해줘"
   ↓
모달:
  ┌────────────────────────────────────────┐
  │ 실행 모드로 전환                       │
  │ 다음 권한이 필요합니다:                │
  │   - LOCAL_WRITE.modify (foo.ts)        │
  │   - LOCAL_EXECUTE (npm test)           │
  │ [거부] [전체 허용]                     │
  └────────────────────────────────────────┘
   ↓
사용자 [전체 허용] → Plan 모드 해제 → AI 가 계획 따라 실행
```

---

## 시나리오 6: 자동화 실행

```
설정 → 자동화: "매일 09:00 - 코드 리뷰" 정의됨
권한:
  ✓ LOCAL_READ (workspace)
  ✓ NETWORK_REMOTE.read (github.com)
  ✗ LOCAL_WRITE / LOCAL_EXECUTE
   ↓
[Cron 트리거 09:00]
   ↓
새 세션 생성 (격리, granted_by='automation' grants 만)
   ↓
AI: "최근 PR 분석 시작..."
   ↓
LOCAL_READ ("src/foo.ts") → 허용 (명시 grant)
NETWORK_REMOTE.read ("github.com/api/...") → 허용
   ↓
AI: "버그 발견. 자동 수정해 보겠습니다"
LOCAL_WRITE.modify ("src/foo.ts") → ★ 거부 (명시 grant 없음)
   ↓
AI 에게 deny 결과 전달
   ↓
AI: "수정 권한 없음. 리뷰만 작성합니다."
LOCAL_READ로 분석 후 결과 출력
   ↓
완료 → notify_on_success 따라 알림
```

---

## 단위 테스트

```typescript
import { isAllowed, createGrant, PermissionLevel } from '../src/permission';

describe('Permission Resolver', () => {
  let session: Session;
  
  beforeEach(() => {
    session = createTestSession({ default_level: 'workspace_write' });
  });
  
  describe('Level: read_only', () => {
    beforeEach(() => {
      session.permission.default_level = 'read_only';
    });
    
    it('allows LOCAL_READ', () => {
      const decision = isAllowed('LOCAL_READ', { kind: 'path', value: '/foo' }, session);
      expect(decision.allowed).toBe(true);
    });
    
    it('denies LOCAL_WRITE', () => {
      const decision = isAllowed('LOCAL_WRITE', { kind: 'path', value: '/foo' }, session);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('level_does_not_allow');
    });
    
    it('denies LOCAL_EXECUTE', () => {
      const decision = isAllowed('LOCAL_EXECUTE', { kind: 'path', value: '/foo' }, session);
      expect(decision.allowed).toBe(false);
    });
  });
  
  describe('Level: workspace_write', () => {
    it('allows LOCAL_WRITE inside cwd', () => {
      session.workspace.root = 'C:\\Dev\\foo';
      const decision = isAllowed(
        'LOCAL_WRITE.modify', 
        { kind: 'path', value: 'C:\\Dev\\foo\\src\\bar.ts' },
        session
      );
      expect(decision.allowed).toBe(true);
    });
    
    it('denies LOCAL_OUTSIDE_CWD.write without grant', () => {
      session.workspace.root = 'C:\\Dev\\foo';
      const decision = isAllowed(
        'LOCAL_OUTSIDE_CWD.write',
        { kind: 'path', value: 'C:\\Users\\Documents\\bar.txt' },
        session
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('level_does_not_allow');
    });
  });
  
  describe('Level: full_access', () => {
    beforeEach(() => {
      session.permission.default_level = 'full_access';
    });
    
    it('allows LOCAL_OUTSIDE_CWD', () => {
      const decision = isAllowed(
        'LOCAL_OUTSIDE_CWD.read',
        { kind: 'path', value: 'C:\\Users\\foo' },
        session
      );
      expect(decision.allowed).toBe(true);
    });
    
    it('still denies dangerous patterns', () => {
      const decision = isAllowed(
        'LOCAL_WRITE',
        { kind: 'path', value: 'C:\\Windows\\System32\\config.sys' },
        session
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('dangerous_pattern');
    });
  });
  
  describe('Plan Mode', () => {
    beforeEach(() => {
      session.plan.active = true;
      session.permission.temporarily_blocked_capabilities = [
        'LOCAL_WRITE', 'LOCAL_EXECUTE',
      ];
    });
    
    it('blocks all writes regardless of grant', () => {
      session.permission.grants.push(createTestGrant({
        capability: 'LOCAL_WRITE',
        scope: 'session',
      }));
      
      const decision = isAllowed(
        'LOCAL_WRITE',
        { kind: 'path', value: 'C:\\Dev\\foo\\bar.ts' },
        session
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('plan_mode_active');
    });
  });
  
  describe('Grants', () => {
    it('persistent grant survives session restart', async () => {
      const grant = await createGrant(session.id, 'LOCAL_WRITE', {
        kind: 'path', path: 'C:\\Dev\\foo', recursive: true,
      }, 'persistent', 'user');
      
      // 세션 다시 로드
      const reloaded = await loadSession(session.id);
      expect(reloaded.permission.grants).toContainEqual(
        expect.objectContaining({ id: grant.id })
      );
    });
    
    it('expired grant is denied', () => {
      session.permission.grants.push(createTestGrant({
        capability: 'LOCAL_WRITE',
        expires_at: '2020-01-01T00:00:00Z',  // 과거
      }));
      
      const decision = isAllowed(
        'LOCAL_WRITE',
        { kind: 'path', value: 'C:\\Dev\\foo\\bar.ts' },
        session
      );
      expect(decision.allowed).toBe(false);
    });
    
    it('revoked grant is denied immediately', () => {
      const grant = createTestGrant({
        capability: 'LOCAL_WRITE',
        scope: 'persistent',
      });
      session.permission.grants.push(grant);
      
      // 첫 시도: 허용
      let decision = isAllowed('LOCAL_WRITE', { kind: 'path', value: '/foo' }, session);
      expect(decision.allowed).toBe(true);
      
      // Revoke
      grant.revoked_at = new Date().toISOString();
      
      // 다시 시도: 거부
      decision = isAllowed('LOCAL_WRITE', { kind: 'path', value: '/foo' }, session);
      expect(decision.allowed).toBe(false);
    });
  });
});
```

### 위험 패턴 테스트

```typescript
describe('Dangerous Pattern Detection', () => {
  it('blocks rm -rf /', () => {
    expect(checkDangerousPattern('LOCAL_EXECUTE', 'rm -rf /')).toEqual({
      action: 'deny_silent',
    });
  });
  
  it('blocks format c:', () => {
    expect(checkDangerousPattern('LOCAL_EXECUTE', 'format c:')).toEqual({
      action: 'deny_silent',
    });
  });
  
  it('warns on .ssh/id_rsa read', () => {
    expect(checkDangerousPattern('LOCAL_READ', '/home/me/.ssh/id_rsa')).toEqual({
      action: 'require_modal',
    });
  });
  
  it('blocks System32 writes', () => {
    expect(checkDangerousPattern('LOCAL_WRITE', 'C:\\Windows\\System32\\drivers\\etc\\hosts')).toEqual({
      action: 'deny_silent',
    });
  });
  
  it('warns on .env file read', () => {
    expect(checkDangerousPattern('LOCAL_READ', '/app/.env')).toEqual({
      action: 'warn',
    });
  });
});
```

---

## 통합 테스트 (E2E)

```typescript
describe('Permission End-to-End', () => {
  it('AI tool call → permission check → user allow → grant saved → tool execute', async () => {
    const session = await createSession({ workspace_id: 'ws-test' });
    
    // AI 가 tool 호출
    const toolCall = {
      tool_id: 'shell.run',
      input: { cmd: 'npm install' },
    };
    
    // Mock UI: 사용자 [허용] 클릭
    mockPermissionUI.willAllow({ scope: 'session' });
    
    // Tool 실행
    const result = await executeTool(toolCall, session);
    
    // 검증
    expect(result.status).toBe('success');
    
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
});
```

---

## 관련

- [resolver.md](./resolver.md) — 테스트 대상 함수
- [grants.md](./grants.md) — 테스트 데이터 모델
- [danger-patterns.md](./danger-patterns.md) — 위험 패턴 테스트
