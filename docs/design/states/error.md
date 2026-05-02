---
title: States — Error
parent: ../_index.md
related:
  - ../components/toast.md
  - ../components/modal.md
status: draft
last_updated: 2026-05-02
---

# Error State

> **한 줄 요약**: P7 우아한 실패. "다음 어떻게 할지" 명시.

---

## 분류

| 종류 | 표시 방법 | 차단성 |
|------|----------|--------|
| **Inline error** | 입력 필드 옆 빨간 텍스트 | None |
| **Toast** | 우측 하단 4초 | None |
| **Banner** | 페이지 상단 띠 | None (dismissible) |
| **Modal** | 화면 중앙 차단 | High (사용자 응답 필요) |
| **Page error** | 전체 페이지 차단 | Critical |

---

## 시나리오 별 선택

```
폼 검증:        Inline (입력 필드 옆)
저장 실패:      Toast (재시도 버튼)
권한 거부:      Modal (사용자 결정)
네트워크 끊김:  Banner (계속 표시)
세션 손상:      Page error (recovery 필요)
```

---

## Inline Error

```tsx
<Input
  label="이메일"
  error="유효한 이메일을 입력하세요"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
```

```
┌─────────────────────────────┐
│ test@                       │
└─────────────────────────────┘
⚠ 유효한 이메일을 입력하세요
```

---

## Toast Error

```tsx
toast.error('저장 실패', {
  description: '네트워크 연결 확인하세요',
  action: { label: '재시도', onClick: retry },
});
```

```
┌──────────────────────────────┐
│ ✗ 저장 실패                  │
│   네트워크 연결 확인하세요   │
│              [재시도]        │
└──────────────────────────────┘
```

---

## Banner

연결 문제 같은 지속 상태:

```tsx
function ConnectionBanner() {
  const { online } = useNetworkStatus();
  
  if (online) return null;
  
  return (
    <div className="bg-warning-50 dark:bg-warning-700/20 border-b border-warning text-sm px-4 py-2 flex items-center gap-2">
      <WifiOff className="w-4 h-4" />
      <span>인터넷 연결 없음. 일부 기능 제한.</span>
      <button onClick={retry} className="ml-auto text-accent">재연결</button>
    </div>
  );
}
```

---

## Modal Error

위험 액션 차단:

```tsx
<Modal
  open={open}
  title="권한 거부됨"
  description="이 작업을 수행하려면 추가 권한이 필요합니다."
>
  <div className="space-y-3">
    <p>요청한 액션: <code>LOCAL_OUTSIDE_CWD.write</code></p>
    <p>대상: <code>C:\Windows\System32\drivers\hosts</code></p>
    <p className="text-text-secondary">시스템 파일 보호로 자동 차단됨.</p>
  </div>
  
  <ModalFooter>
    <Button variant="secondary" onClick={() => setOpen(false)}>
      이해했어요
    </Button>
    <Button variant="primary" onClick={openSettings}>
      설정에서 허용
    </Button>
  </ModalFooter>
</Modal>
```

---

## Page Error (Error Boundary)

```tsx
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    Sentry.captureException(error, { extra: errorInfo });
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorPage error={this.state.error} reset={() => this.setState({ hasError: false })} />;
    }
    
    return this.props.children;
  }
}

function ErrorPage({ error, reset }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen p-8 text-center max-w-md mx-auto">
      <div className="text-6xl mb-4">😵</div>
      
      <h1 className="text-2xl font-semibold mb-2">앗, 문제가 발생했어요</h1>
      
      <p className="text-text-secondary mb-6">
        예상치 못한 오류가 발생했어요. 다음을 시도해보세요:
      </p>
      
      <div className="space-y-2 w-full">
        <Button fullWidth onClick={reset}>다시 시도</Button>
        <Button fullWidth variant="secondary" onClick={() => location.reload()}>
          앱 재시작
        </Button>
        <Button fullWidth variant="ghost" onClick={openLogs}>
          로그 보기
        </Button>
      </div>
      
      {/* 개발 환경에서만 stack trace */}
      {import.meta.env.DEV && (
        <details className="mt-8 w-full text-left">
          <summary className="cursor-pointer text-sm text-text-tertiary">개발자 정보</summary>
          <pre className="text-xs bg-bg-secondary p-3 rounded mt-2 overflow-x-auto">
            {error?.stack}
          </pre>
        </details>
      )}
    </div>
  );
}
```

---

## Failure Reason Card (Tool 결과)

```
┌──────────────────────────────────────────┐
│ ✗ npm test 실패                          │
├──────────────────────────────────────────┤
│ 어디서: tests/foo.test.ts:15             │
│ 무엇이: assertion error                  │
│   expected: "hello"                      │
│   actual:   "hi"                         │
│                                          │
│ AI 의 다음 행동:                          │
│   foo.ts 의 greeting 함수 수정 시도      │
│                                          │
│ [전체 로그] [관련 파일] [수동 디버그]    │
└──────────────────────────────────────────┘
```

→ 상세는 [../../tools/observability.md](../../tools/observability.md).

---

## 메시지 작성 가이드

### 좋은 예 (P7)
```
✓ "파일을 찾을 수 없어요 (login.tsx)"
  + "src/ 안 검색" 액션
  + "수동 경로 입력" 액션
  
✓ "권한 거부됨"
  + 어떤 권한인지 명시
  + 설정 열기 액션
  
✓ "네트워크 시간 초과"
  + 재시도 버튼 + 자동 재시도 진행도
```

### 나쁜 예
```
✗ "Error: ENOENT" (사용자 모름)
✗ "Internal Server Error" (어쩌라고)
✗ "Something went wrong" (정보 없음)
✗ Stack trace 만 (개발자만 이해)
```

---

## 한국어 톤

```
정중 + 명확:
  "파일을 찾을 수 없어요" (정중)
  ✗ "파일 없음" (너무 짧음)
  ✗ "FILE NOT FOUND" (영어)

해결 방법 우선:
  "다음을 시도해보세요:" + 액션 리스트
  ✗ "Error occurred" + 끝
```

---

## Accessibility

```
✓ Inline error: aria-invalid + aria-describedby
✓ Toast error: role="alert" (즉시 읽음)
✓ Modal: focus trap + Esc 닫기
✓ Page error: 명확한 heading + 액션
✓ 색만으로 X (✗ 아이콘 함께)
```

---

## 관련

- [../components/toast.md](../components/toast.md)
- [../components/modal.md](../components/modal.md)
- [../../tools/observability.md](../../tools/observability.md) — Failure card
