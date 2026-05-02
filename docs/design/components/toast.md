---
title: Components — Toast
parent: ./_index.md
related:
  - ../tokens/elevation.md
status: draft
last_updated: 2026-05-02
---

# Toast

> **한 줄 요약**: 비차단 알림. 4초 자동 사라짐. 우측 하단 stack.

---

## Variants

```
[Success]   ✓ 녹색 (성공)
[Error]     ✗ 빨강 (실패)
[Warning]   ⚠ 주황 (주의)
[Info]      ℹ 파랑 (정보)
[Loading]   ⠋ 진행 중 (자동 사라짐 X)
```

## Position

```
[bottom-right]  기본 (우측 하단)
[bottom-left]   좌측 하단
[top-right]     우측 상단
[top-center]    상단 중앙 (큰 알림)
```

---

## Visual Mockup

```
[Success]
┌──────────────────────────────┐
│ ✓ 저장 완료                  │
│   src/foo.ts 변경됨          │
└──────────────────────────────┘
  bg: success-50 (light) / success-700 (dark)
  border-left: 4px solid success-500

[Error]
┌──────────────────────────────┐
│ ✗ 저장 실패                  │
│   권한 거부됨                │
│              [재시도]        │ ← 액션 버튼
└──────────────────────────────┘

[Loading]
┌──────────────────────────────┐
│ ⠋ npm install 실행 중...     │
│   [백그라운드로]             │
└──────────────────────────────┘
  자동 사라짐 X (수동 닫거나 완료 시)
```

---

## 구현

```tsx
import * as ToastPrimitive from '@radix-ui/react-toast';
import { motion, AnimatePresence } from 'framer-motion';

export function ToastProvider({ children }) {
  return (
    <ToastPrimitive.Provider duration={4000}>
      {children}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[1600] flex flex-col gap-2 max-w-sm" />
    </ToastPrimitive.Provider>
  );
}

export function Toast({ open, onOpenChange, variant = 'info', title, description, action, duration }) {
  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={duration ?? (variant === 'loading' ? Infinity : 4000)}
      asChild
    >
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'flex gap-3 p-4 rounded-md shadow-md',
          'bg-bg-elevated border-l-4',
          VARIANT_BORDERS[variant]
        )}
      >
        <Icon variant={variant} />
        
        <div className="flex-1 min-w-0">
          <ToastPrimitive.Title className="text-sm font-medium">
            {title}
          </ToastPrimitive.Title>
          {description && (
            <ToastPrimitive.Description className="text-sm text-text-secondary mt-0.5">
              {description}
            </ToastPrimitive.Description>
          )}
          {action && (
            <ToastPrimitive.Action altText={action.label} asChild>
              <button onClick={action.onClick} className="text-sm text-accent mt-2 hover:underline">
                {action.label}
              </button>
            </ToastPrimitive.Action>
          )}
        </div>
        
        <ToastPrimitive.Close asChild>
          <button className="p-1 hover:bg-bg-tertiary rounded" aria-label="닫기">
            <X className="w-4 h-4" />
          </button>
        </ToastPrimitive.Close>
      </motion.div>
    </ToastPrimitive.Root>
  );
}

const VARIANT_BORDERS = {
  success: 'border-success-500',
  error: 'border-danger',
  warning: 'border-warning',
  info: 'border-accent',
  loading: 'border-accent',
};
```

---

## 사용 (toast helper)

```typescript
import { toast } from '@/lib/toast';

toast.success('저장 완료', { description: 'src/foo.ts 변경됨' });
toast.error('저장 실패', { 
  description: '권한 거부됨',
  action: { label: '재시도', onClick: retry },
});
toast.loading('설치 중...', { id: 'npm-install' });

// 나중에
toast.dismiss('npm-install');
toast.success('설치 완료', { id: 'npm-install' });   // 같은 id = 교체
```

### Hook 패턴

```tsx
function useToast() {
  const [toasts, setToasts] = useState([]);
  
  return {
    toast: {
      success: (title, opts) => addToast({ ...opts, variant: 'success', title }),
      error: (title, opts) => addToast({ ...opts, variant: 'error', title }),
      // ...
    },
    toasts,
  };
}
```

---

## 권한 사용 알림 (F-027)

```tsx
// 자동 grant 시
toast.success('파일 읽기 허용', {
  description: '워크스페이스 내 (LOCAL_READ)',
  duration: 3000,
});

// 자동 거부 시
toast.error('시스템 파일 변경 차단됨', {
  description: 'C:\\Windows\\System32',
  action: { label: '설정에서 허용', onClick: () => navigate('/settings/security') },
});
```

상세: [../../permission/ui-flow.md](../../permission/ui-flow.md).

---

## Stacking

```
여러 toast 동시:
  ↓ 하단에서 위로 쌓임
  [최신]
  [그 다음]
  [그 다음]
  
최대 5개 (초과 시 가장 오래된 자동 dismiss).
```

---

## Accessibility

```
✓ role="status" (success/info)
✓ role="alert" (error/warning) — 즉시 읽음
✓ aria-live="polite" / "assertive"
✓ Esc 로 닫기
✓ Focus 자동 전환 X (사용자 작업 흐름 방해 X)
✓ Hover 시 자동 사라짐 일시정지
```

---

## 안티 패턴

```
✗ Toast 너무 많이 (5개+) → 노이즈
✗ Toast 로 form 검증 결과 표시 → inline 사용
✗ Critical 에러를 toast 만으로 → modal 사용
✗ Toast 안에 복잡한 UI → 짧은 메시지 + 액션 1개만
```

---

## 관련

- [../tokens/elevation.md](../tokens/elevation.md) — z-index, shadow
- [../states/error.md](../states/error.md) — 에러 상태
