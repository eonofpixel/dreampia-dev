---
title: Components — Checkbox / Radio
parent: ./_index.md
related:
  - switch.md
status: draft
last_updated: 2026-05-02
---

# Checkbox / Radio

> **한 줄 요약**: Radix UI 위. 키보드 + a11y 보장.

---

## Checkbox vs Radio vs Switch

```
Checkbox: 0~N개 선택 가능 (다중)
Radio:    1개만 선택 (단일, 그룹)
Switch:   2-state 토글 (즉시 효과)
```

---

## Visual

```
[ ] 체크 안 됨
[✓] 체크됨
[—] 부분 (indeterminate)
[ ] disabled

⦿ 라디오 선택됨
○ 라디오 선택 안됨
```

---

## Checkbox 구현

```tsx
import * as Checkbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

export function CheckboxField({ label, hint, ...props }) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox.Root
        className={cn(
          'h-4 w-4 rounded border border-border-primary',
          'flex items-center justify-center',
          'data-[state=checked]:bg-accent data-[state=checked]:border-accent',
          'data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent',
          'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-accent/30'
        )}
        {...props}
      >
        <Checkbox.Indicator>
          {props.checked === 'indeterminate' 
            ? <Minus className="w-3 h-3 text-accent-text" />
            : <Check className="w-3 h-3 text-accent-text" />
          }
        </Checkbox.Indicator>
      </Checkbox.Root>
      
      {label && (
        <div className="flex-1">
          <label className="text-sm cursor-pointer">{label}</label>
          {hint && <p className="text-xs text-text-secondary mt-0.5">{hint}</p>}
        </div>
      )}
    </div>
  );
}
```

---

## Radio Group 구현

```tsx
import * as RadioGroup from '@radix-ui/react-radio-group';

export function RadioGroupField({ value, onChange, options, label }) {
  return (
    <fieldset>
      {label && <legend className="text-sm font-medium mb-2">{label}</legend>}
      
      <RadioGroup.Root value={value} onValueChange={onChange} className="space-y-2">
        {options.map(opt => (
          <div key={opt.value} className="flex items-start gap-2">
            <RadioGroup.Item
              value={opt.value}
              id={opt.value}
              className={cn(
                'h-4 w-4 rounded-full border border-border-primary',
                'data-[state=checked]:border-accent',
                'flex items-center justify-center',
                'focus:outline-none focus:ring-2 focus:ring-accent/30'
              )}
            >
              <RadioGroup.Indicator className="w-2 h-2 rounded-full bg-accent" />
            </RadioGroup.Item>
            
            <div className="flex-1">
              <label htmlFor={opt.value} className="text-sm cursor-pointer">
                {opt.label}
              </label>
              {opt.hint && <p className="text-xs text-text-secondary">{opt.hint}</p>}
            </div>
          </div>
        ))}
      </RadioGroup.Root>
    </fieldset>
  );
}
```

---

## 사용 예시

### Checkbox

```tsx
// 단순
<CheckboxField label="이용 약관 동의" />

// Indeterminate (parent of children)
<CheckboxField 
  checked={allChecked ? true : someChecked ? 'indeterminate' : false}
  onCheckedChange={toggleAll}
  label="모두 선택"
/>

// 권한 그룹 (settings 자동화)
<div className="space-y-2">
  <CheckboxField label="LOCAL_READ" hint="작업 디렉토리 안" />
  <CheckboxField label="LOCAL_WRITE" hint="기본값 차단" />
  <CheckboxField label="LOCAL_EXECUTE" hint="shell 명령" />
</div>
```

### Radio

```tsx
// 작업 모드 선택 (F-034 일반 설정)
<RadioGroupField
  label="작업 모드"
  value={mode}
  onChange={setMode}
  options={[
    { value: 'coding', label: '코딩용', hint: '더 기술적인 응답과 제어' },
    { value: 'daily', label: '일상 작업용', hint: '성능은 같고, 기술적인 세부 사항은 더 적습니다' },
  ]}
/>

// 응답 스타일 (F-035 personality)
<RadioGroupField
  label="응답 스타일"
  options={[
    { value: 'concise', label: '간결' },
    { value: 'balanced', label: '균형' },
    { value: 'detailed', label: '자세함' },
  ]}
/>
```

---

## Accessibility

```
✓ Label 연결 (htmlFor + id)
✓ Tab 으로 포커스
✓ Space 로 toggle
✓ Group: ←→ 또는 ↑↓ 로 이동 (radio)
✓ Group: Tab 으로 다음 group
✓ aria-describedby (hint)
```

---

## Tap 영역

```css
/* 작은 컴포넌트지만 클릭 영역은 넓게 */
.checkbox-wrapper {
  padding: 8px;          /* 클릭 영역 확장 */
  margin: -8px;          /* 시각 위치 유지 */
}
```

→ 모바일/터치 시 44px 영역 보장.

---

## 관련

- [switch.md](./switch.md) — Switch (즉시 효과)
- [../states/disabled.md](../states/disabled.md) — Disabled 상태
