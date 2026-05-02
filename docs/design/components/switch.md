---
title: Components — Switch (Toggle)
parent: ./_index.md
related:
  - checkbox-radio.md
status: draft
last_updated: 2026-05-02
---

# Switch (Toggle)

> **한 줄 요약**: 2-state 즉시 토글. checkbox 보다 즉시성 강조.

---

## Sizes

```
[sm]   24×14px (h-3.5 w-6)
[md]   28×16px (h-4 w-7)   ★
[lg]   36×20px (h-5 w-9)
```

---

## Visual

```
[OFF]  ━━━━━○      회색 배경 + 흰 thumb 좌측
[ON]   ━━━━━●      파란 배경 + 흰 thumb 우측

애니메이션: thumb 좌우 슬라이드 (200ms ease-out)
```

---

## 구현

```tsx
import * as Switch from '@radix-ui/react-switch';

export function SwitchField({ label, hint, size = 'md', ...props }) {
  const sizes = {
    sm: { root: 'h-3.5 w-6', thumb: 'w-3 h-3', translate: 'translate-x-2.5' },
    md: { root: 'h-4 w-7', thumb: 'w-3 h-3', translate: 'translate-x-3' },
    lg: { root: 'h-5 w-9', thumb: 'w-4 h-4', translate: 'translate-x-4' },
  };
  const s = sizes[size];
  
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1">
        {label && <div className="text-sm font-medium">{label}</div>}
        {hint && <div className="text-xs text-text-secondary">{hint}</div>}
      </div>
      
      <Switch.Root
        className={cn(
          s.root,
          'relative shrink-0 rounded-full',
          'bg-bg-tertiary data-[state=checked]:bg-accent',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-accent/30',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        {...props}
      >
        <Switch.Thumb
          className={cn(
            s.thumb,
            'block rounded-full bg-white shadow-sm',
            `transition-transform duration-200 translate-x-0.5 data-[state=checked]:${s.translate}`
          )}
        />
      </Switch.Root>
    </div>
  );
}
```

---

## 사용 예시

```tsx
// 설정 토글 (F-034)
<SwitchField
  label="자동 저장"
  hint="입력 시 자동으로 저장합니다"
  checked={autoSave}
  onCheckedChange={setAutoSave}
/>

// 권한 토글
<SwitchField
  label="기본 권한"
  hint="기본 설정에서 Codex는 작업 공간에 있는 파일을 읽고 편집할 수 있습니다."
  checked={permissions.basic}
  onCheckedChange={(v) => setPermissions({ ...permissions, basic: v })}
/>

// 반투명 사이드바 (F-034 모양)
<SwitchField
  label="반투명 사이드바"
  checked={translucentSidebar}
  onCheckedChange={setTranslucentSidebar}
/>

// 다크/라이트 (별도 toggle)
<SwitchField
  label="다크 모드"
  checked={theme === 'dark'}
  onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
/>
```

---

## Switch vs Checkbox

```
Switch:
  ✓ 즉시 적용 (저장 버튼 X)
  ✓ 설정 페이지 (다크 모드, 알림 등)
  ✓ ON/OFF 의미 명확

Checkbox:
  ✓ 폼 (저장 시 적용)
  ✓ 다중 선택
  ✓ "동의" / "약관" 같은 confirm
```

---

## Accessibility

```
✓ role="switch" (Radix 자동)
✓ aria-checked (true/false)
✓ Label 연결
✓ Tab + Space 동작
✓ 색만으로 상태 표시 X (위치 변화로도)
```

---

## 관련

- [checkbox-radio.md](./checkbox-radio.md) — Checkbox 와 차이
- [../tokens/motion.md](../tokens/motion.md) — Thumb 애니메이션
