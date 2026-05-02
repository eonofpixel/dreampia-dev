---
title: Permission Model — UI Flow (Inline / Modal / Toast)
parent: ./_index.md
related:
  - ./resolver.md
  - ./capabilities.md
status: draft
last_updated: 2026-05-02
---

# Permission UI Flow

> **한 줄 요약**: 위험도 따라 inline / modal / toast 3가지 UI 변형. friction 최소화 + 보안 보장.

---

## 3가지 UI 변형

| UI | 위험도 | 차단성 | 사용 케이스 |
|----|--------|--------|------------|
| **Inline** | 중 | Soft (메시지 안 표시) | LOCAL_WRITE, NETWORK_REMOTE.read |
| **Modal** | 높음 | Hard (전체 화면) | LOCAL_OUTSIDE_CWD, ELEVATED, UPLOAD |
| **Toast** | 낮음 | None (알림만) | Auto-grant 사후 보고 |

---

## Inline (lowest friction)

```
간단한 요청 (자주 발생):

[AI 메시지]
이 파일을 읽어볼게요:
  📄 src/foo.ts                  [허용] [거부]
                                  ↑
                                  클릭 = grant + retry
```

### 컴포넌트

```tsx
function InlinePermissionRequest({
  capability,
  target,
  aiReason,
  onAllow,
  onDeny,
}: Props) {
  return (
    <div className="permission-inline rounded border border-yellow-300 p-2 my-1">
      <div className="flex items-center gap-2">
        <CapabilityIcon capability={capability} />
        <div className="flex-1">
          <div className="text-sm font-medium">
            {capabilityLabel(capability)}
          </div>
          <div className="text-xs text-muted">
            대상: {formatTarget(target)}
          </div>
          {aiReason && (
            <div className="text-xs italic">"{aiReason}"</div>
          )}
        </div>
        <button onClick={onAllow}>허용</button>
        <button onClick={onDeny}>거부</button>
      </div>
    </div>
  );
}
```

### 사용 시나리오

```
사용 케이스:
  - LOCAL_WRITE.modify (workspace 내)
  - NETWORK_REMOTE.read (특정 도메인)
  - SYSTEM_CLIPBOARD.read

표시 위치:
  - AI 응답 메시지 내
  - 응답 stream 중 즉시 표시
  
응답 시:
  - 허용: 즉시 grant 생성 (scope: session) + AI tool 재시도
  - 거부: AI 에게 deny 결과 전달 → AI 가 다른 접근 시도
```

---

## Modal (high stakes)

```
중요한 요청 (LOCAL_OUTSIDE_CWD, ELEVATED 등):

┌────────────────────────────────────────────────┐
│ ⚠ 권한 요청                                    │
├────────────────────────────────────────────────┤
│                                                │
│ Codex 가 다음을 수행하려 합니다:               │
│                                                │
│   작업: 시스템 파일 수정                       │
│   대상: C:\Windows\System32\drivers\hosts      │
│                                                │
│ ⚠ 작업 디렉토리 외부입니다.                    │
│                                                │
│ 이유 (AI 답변):                                │
│ > "도메인 차단을 위해 hosts 파일에 항목 추가"  │
│                                                │
├────────────────────────────────────────────────┤
│ ☐ 이 세션 동안 다시 묻지 않기                  │
│ ☐ 영구 허용 (이 디렉토리)                      │
│                                                │
│            [거부]  [한 번만 허용]  [허용]      │
└────────────────────────────────────────────────┘
```

### 컴포넌트

```tsx
function PermissionModal({
  capability,
  target,
  aiReason,
  onResponse,
}: Props) {
  const [scope, setScope] = useState<GrantScope>('one_time');
  
  return (
    <Modal>
      <ModalHeader>
        <Icon name="warning" />
        권한 요청
      </ModalHeader>
      
      <ModalBody>
        <p>{providerName} 가 다음을 수행하려 합니다:</p>
        
        <div className="permission-details">
          <Field label="작업">{capabilityLabel(capability)}</Field>
          <Field label="대상">{formatTarget(target)}</Field>
        </div>
        
        {isOutsideCwd(target) && (
          <Warning>⚠ 작업 디렉토리 외부입니다.</Warning>
        )}
        
        {capability.includes('elevated') && (
          <Warning>⚠ 관리자 권한 필요.</Warning>
        )}
        
        {aiReason && (
          <Quote>"{aiReason}"</Quote>
        )}
        
        <Divider />
        
        <Checkbox 
          checked={scope === 'session'}
          onChange={() => setScope('session')}
        >
          이 세션 동안 다시 묻지 않기
        </Checkbox>
        
        <Checkbox 
          checked={scope === 'persistent'}
          onChange={() => setScope('persistent')}
        >
          영구 허용 (이 대상)
        </Checkbox>
      </ModalBody>
      
      <ModalFooter>
        <Button onClick={() => onResponse({ kind: 'deny' })}>거부</Button>
        <Button onClick={() => onResponse({ kind: 'allow', scope: 'one_time' })}>
          한 번만 허용
        </Button>
        <Button primary onClick={() => onResponse({ kind: 'allow', scope })}>
          허용
        </Button>
      </ModalFooter>
    </Modal>
  );
}
```

### 사용 시나리오

```
사용 케이스:
  - LOCAL_OUTSIDE_CWD.write (작업 디렉토리 외부 쓰기)
  - LOCAL_EXECUTE.elevated (sudo / runas)
  - LOCAL_WRITE.delete (파일 삭제 ★ 항상 모달)
  - NETWORK_REMOTE.upload (외부 데이터 송신)
  - PLUGIN_INSTALL (새 플러그인)

표시 방식:
  - 화면 중앙 overlay (다른 작업 차단)
  - Esc 키 = 거부 (보수적)
  - Background dim
```

---

## Toast (informational)

```
자동 grant 또는 즉시 deny:

┌──────────────────────────────┐
│ ✓ npm install 실행 허용       │
│   (워크스페이스 내)           │
└──────────────────────────────┘

┌──────────────────────────────┐
│ ✗ /etc/passwd 읽기 거부        │
│   (워크스페이스 외부)         │
│   [설정에서 허용하기]         │
└──────────────────────────────┘
```

### 컴포넌트

```tsx
function PermissionToast({
  capability,
  target,
  decision,
  onConfigClick,
}: Props) {
  return (
    <Toast variant={decision.allowed ? 'success' : 'error'}>
      <ToastIcon>{decision.allowed ? '✓' : '✗'}</ToastIcon>
      <ToastBody>
        <div>{capabilityLabel(capability)} {decision.allowed ? '허용' : '거부'}</div>
        <small>{formatTarget(target)}</small>
        {!decision.allowed && (
          <button onClick={onConfigClick}>
            설정에서 허용하기
          </button>
        )}
      </ToastBody>
    </Toast>
  );
}
```

### 사용 시나리오

```
사용 케이스:
  - Auto-grant 결과 알림 (LOCAL_READ, NETWORK_LOCAL 등)
  - 자동 deny 결과 알림 (위험 패턴 차단)
  - Grant 만료 알림

표시 방식:
  - 우측 하단 4초간 표시
  - 클릭 시 자세한 정보 모달
  - 알림 panel 에 영구 보관
```

---

## UI 변형 선택 알고리즘

```typescript
function pickUiVariant(capability: Capability): 'inline' | 'modal' | 'toast' {
  // Toast: auto-grant 가능한 capability
  if (AUTO_GRANT_CAPABILITIES.has(capability)) {
    return 'toast';
  }
  
  // Modal: 고위험 capability
  if (HIGH_STAKES_CAPABILITIES.has(capability)) {
    return 'modal';
  }
  
  // Modal: 위험 패턴 매칭 시
  if (matchesDangerousPattern(capability)) {
    return 'modal';
  }
  
  // 기본: inline
  return 'inline';
}

const AUTO_GRANT_CAPABILITIES = new Set([
  'LOCAL_READ',
  'NETWORK_LOCAL',
  'NETWORK_AI',
  'SYSTEM_NOTIFICATION',
]);

const HIGH_STAKES_CAPABILITIES = new Set([
  'LOCAL_OUTSIDE_CWD',
  'LOCAL_OUTSIDE_CWD.write',
  'LOCAL_EXECUTE.elevated',
  'LOCAL_WRITE.delete',
  'NETWORK_REMOTE.upload',
  'PLUGIN_INSTALL',
  'BROWSER_COOKIE_READ',
]);
```

---

## 다국어 지원

```typescript
// 한국어 우선
const CAPABILITY_LABELS_KO: Record<Capability, string> = {
  'LOCAL_READ': '파일 읽기',
  'LOCAL_WRITE': '파일 쓰기',
  'LOCAL_WRITE.delete': '파일 삭제',
  'LOCAL_EXECUTE': 'shell 명령 실행',
  'LOCAL_EXECUTE.elevated': '관리자 권한 명령',
  'NETWORK_REMOTE.upload': '외부 서버로 데이터 전송',
  'BROWSER_INTERACT': '브라우저 조작',
  // ...
};
```

---

## Accessibility

```
- Esc 키 = 거부 (모달)
- Enter = 기본 액션 (대부분 거부, 옵션)
- Tab navigation
- Screen reader: aria-label, aria-describedby
- Focus trap (모달 안)
- Reduced motion 시 애니메이션 X
```

---

## 검증 (Invariants)

```
INV-1: 모든 capability 는 한국어 label 보유
INV-2: 모달은 Esc 로 거부 가능
INV-3: Inline 은 메시지 stream 중에도 표시 가능
INV-4: Toast 는 4초 후 자동 사라짐 (또는 사용자 dismiss)
INV-5: UI 변형은 capability 에 따라 deterministic
```

---

## 관련

- [resolver.md](./resolver.md) — `requestPermission` 호출 흐름
- [capabilities.md](./capabilities.md) — capability 한국어 label
- [danger-patterns.md](./danger-patterns.md) — 자동 차단 시 toast/modal
