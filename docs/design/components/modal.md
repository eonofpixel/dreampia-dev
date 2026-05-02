---
title: Components — Modal / Dialog
parent: ./_index.md
related:
  - ../tokens/elevation.md
  - ../interaction/keyboard.md
status: draft
last_updated: 2026-05-02
---

# Modal / Dialog

> **한 줄 요약**: Radix UI Dialog 위에. 권한 요청 모달의 기반.

---

## Variants

```
[Standard]   일반 (제목 + body + footer 버튼)
[Confirm]    확인 (위험 액션 전)
[Alert]      경고 (단방향 알림)
[Form]       폼 입력 (큰 modal)
[Drawer]     사이드 슬라이드 (설정 등)
```

## Sizes

```
[sm]   400px wide
[md]   500px wide  ★ 기본
[lg]   700px wide
[xl]   900px wide
[full] 90vw × 90vh
```

---

## Visual Mockup

```
┌──────────────────────────────────────────┐
│ 백그라운드 dim (rgba 0,0,0,0.5)           │
│                                          │
│      ┌────────────────────────────┐      │
│      │ 제목                    × │      │
│      │ 부제목 (선택)              │      │
│      ├────────────────────────────┤      │
│      │                            │      │
│      │ 본문 내용                  │      │
│      │                            │      │
│      ├────────────────────────────┤      │
│      │       [취소]  [확인]       │      │
│      └────────────────────────────┘      │
│                                          │
└──────────────────────────────────────────┘

z-index:    1300 (modal) / 1200 (overlay)
shadow:     xl
radius:     16px
animation:  fade + scale (0.95 → 1)
```

---

## 구현

```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export function Modal({ open, onOpenChange, title, description, size = 'md', children }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[1200] bg-black/50 backdrop-blur-sm"
          />
        </Dialog.Overlay>
        
        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
              'z-[1300]',
              'bg-bg-elevated rounded-xl shadow-xl',
              'p-6',
              SIZES[size]
            )}
          >
            <Dialog.Title className="text-lg font-semibold mb-1">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="text-sm text-text-secondary mb-4">
                {description}
              </Dialog.Description>
            )}
            
            {children}
            
            <Dialog.Close asChild>
              <button 
                className="absolute top-4 right-4 p-1 hover:bg-bg-tertiary rounded"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const SIZES = {
  sm: 'w-[400px]',
  md: 'w-[500px]',
  lg: 'w-[700px]',
  xl: 'w-[900px]',
  full: 'w-[90vw] h-[90vh]',
};
```

---

## 사용 예시

### 기본

```tsx
<Modal
  open={open}
  onOpenChange={setOpen}
  title="저장하시겠어요?"
  description="변경 사항이 영구히 저장됩니다."
>
  <ModalFooter>
    <Button variant="secondary" onClick={() => setOpen(false)}>취소</Button>
    <Button variant="primary" onClick={save}>저장</Button>
  </ModalFooter>
</Modal>
```

### 권한 요청 (F-027 통합)

```tsx
<PermissionModal
  capability="LOCAL_OUTSIDE_CWD.write"
  target={{ path: 'C:\\Windows\\System32\\hosts' }}
  aiReason="hosts 파일 수정"
  onAllow={(scope) => grant(scope)}
  onDeny={() => deny()}
/>
```

### Drawer (사이드)

```tsx
<Modal variant="drawer" position="right">
  <SettingsPage />
</Modal>
```

---

## Accessibility

```
✓ Esc 로 닫기 (Radix 자동)
✓ 외부 클릭으로 닫기 (옵션)
✓ Focus trap (Tab 순환)
✓ aria-labelledby (title 연결)
✓ aria-describedby (description)
✓ Open 시 첫 입력에 자동 focus
✓ 닫힘 시 trigger 로 focus 복귀
```

### 키보드

```
Esc       닫기
Tab       다음 (modal 안만)
Shift+Tab 이전
Enter     primary 버튼 (form context)
```

---

## 안티 패턴

```
✗ 모달 안에서 또 모달 (3단계 X)
✗ Modal 너무 큼 (full screen 필요하면 페이지 X)
✗ Esc 막기 (사용자 출구 차단)
✗ Loading 상태에 Cancel 버튼 없음
```

---

## 관련

- [../tokens/elevation.md](../tokens/elevation.md) — z-index + shadow
- [../interaction/keyboard.md](../interaction/keyboard.md) — Focus trap
- [../../permission/ui-flow.md](../../permission/ui-flow.md) — 권한 모달
