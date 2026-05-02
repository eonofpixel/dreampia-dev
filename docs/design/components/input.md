---
title: Components — Input / Textarea
parent: ./_index.md
related:
  - ../tokens/colors.md
  - ../states/error.md
status: draft
last_updated: 2026-05-02
---

# Input / Textarea

> **한 줄 요약**: 폼 입력의 기본. 한국어 IME 친화 + 검증 통합.

---

## Variants

```
[Standard]      일반 입력
[Search]        ⌕ 아이콘 + 빠른 clear
[Code]          monospace + 검은 배경
[Chat]          큰 textarea + 자동 grow + 첨부 버튼
```

## Sizes

```
[sm]   32px height,  text-sm,   px-3
[md]   40px height,  text-sm,   px-3.5    ★ 기본
[lg]   48px height,  text-base, px-4
```

## States

```
[default]    회색 border
[focus]      파란 border + ring
[hover]      약간 진한 border
[disabled]   회색 배경 + cursor not-allowed
[error]      빨간 border + 에러 텍스트
[success]    녹색 border + 체크
[loading]    spinner 우측 (예: 검색 중)
```

---

## Visual Mockup

```
[Standard md default]
┌─────────────────────────────┐
│ 이름을 입력하세요            │   placeholder
└─────────────────────────────┘
  border: 1px solid var(--color-border-primary)
  bg: var(--color-bg-primary)
  
[focus]
┌─────────────────────────────┐
│ 김철수|                      │
└─────────────────────────────┘
  border: 1px solid var(--color-border-focus)
  ring: 2px solid var(--color-accent)/20

[error]
┌─────────────────────────────┐
│ ab                          │
└─────────────────────────────┘
⚠ 최소 3자 이상 입력하세요
  border: var(--color-border-danger)
  + 에러 메시지 (text-danger text-sm mt-1)
  
[Search]
┌─────────────────────────────┐
│ ⌕  검색어 입력         × │
└─────────────────────────────┘
  좌측 ⌕ 아이콘 + 우측 × clear (입력 시만)
```

---

## Props 인터페이스

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'standard' | 'search' | 'code';
  size?: 'sm' | 'md' | 'lg';
  
  // Decorations
  icon?: React.ReactNode;          // 좌측 (예: 검색)
  iconRight?: React.ReactNode;     // 우측 (예: 단위)
  
  // States
  error?: string | boolean;        // 에러 메시지 또는 단순 표시
  loading?: boolean;
  
  // Helper
  label?: string;
  hint?: string;
  required?: boolean;
  
  // Standard
  type?: 'text' | 'password' | 'email' | 'url' | 'tel' | 'search' | 'number';
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}
```

---

## 구현

```tsx
import { forwardRef, useState } from 'react';
import { cva } from 'class-variance-authority';

const inputVariants = cva(
  'w-full rounded ' +
  'bg-bg-primary text-text-primary placeholder:text-text-tertiary ' +
  'border transition-colors duration-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-border-focus ' +
  'disabled:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        standard: '',
        search: 'pl-9',
        code: 'font-mono bg-bg-secondary',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-3.5 text-sm',
        lg: 'h-12 px-4 text-base',
      },
      hasError: {
        true: 'border-border-danger focus:ring-danger/20 focus:border-border-danger',
        false: 'border-border-primary hover:border-border-secondary',
      },
    },
    defaultVariants: {
      variant: 'standard',
      size: 'md',
      hasError: false,
    },
  }
);

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ variant, size, error, loading, icon, iconRight, label, hint, required, className, ...props }, ref) => {
    const inputId = useId();
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium mb-1.5">
            {label}
            {required && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}
        
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {icon}
            </div>
          )}
          
          <input
            ref={ref}
            id={inputId}
            className={cn(
              inputVariants({ variant, size, hasError: !!error }),
              icon && 'pl-9',
              iconRight && 'pr-9',
              className
            )}
            aria-invalid={!!error}
            aria-describedby={cn(error && errorId, hint && hintId)}
            aria-required={required}
            {...props}
          />
          
          {iconRight && !loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {iconRight}
            </div>
          )}
          
          {loading && (
            <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />
          )}
        </div>
        
        {error && (
          <p id={errorId} className="text-sm text-danger mt-1">
            {typeof error === 'string' ? error : '오류가 발생했습니다.'}
          </p>
        )}
        
        {hint && !error && (
          <p id={hintId} className="text-sm text-text-secondary mt-1">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
```

---

## 한국어 IME 처리

```tsx
// IME composition 중에는 onChange 이벤트 제어
function ChatInput() {
  const [value, setValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // ★ IME 조합 중이면 Enter 무시 (한글 자모 결합 중)
      if (isComposing) return;
      
      e.preventDefault();
      submit();
    }
  };
  
  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onKeyDown={handleKeyDown}
    />
  );
}
```

→ Codex 의 알려진 IME 이슈 해결.

상세: [../../i18n/ime.md](../../i18n/ime.md).

---

## Textarea (auto-grow)

```tsx
function AutoGrowTextarea({ value, onChange, ...props }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Auto resize
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;  // max 300px
  }, [value]);
  
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      className="resize-none min-h-[40px] max-h-[300px]"
      {...props}
    />
  );
}
```

---

## Search Input (clear button)

```tsx
function SearchInput({ value, onChange, onClear }) {
  return (
    <Input
      variant="search"
      icon={<Search className="w-4 h-4" />}
      iconRight={
        value && (
          <button onClick={onClear} aria-label="검색어 지우기">
            <X className="w-4 h-4" />
          </button>
        )
      }
      placeholder="검색"
      value={value}
      onChange={onChange}
    />
  );
}
```

---

## 사용 예시

### 기본

```tsx
<Input 
  label="이름"
  placeholder="홍길동"
  value={name}
  onChange={(e) => setName(e.target.value)}
/>
```

### 검증 + 에러

```tsx
<Input
  label="이메일"
  type="email"
  required
  error={errors.email}
  hint="회사 이메일을 사용하세요"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
```

### 비밀번호 (toggle 표시)

```tsx
function PasswordInput() {
  const [show, setShow] = useState(false);
  
  return (
    <Input
      label="비밀번호"
      type={show ? 'text' : 'password'}
      iconRight={
        <button onClick={() => setShow(!show)} aria-label={show ? '숨기기' : '표시'}>
          {show ? <EyeOff /> : <Eye />}
        </button>
      }
    />
  );
}
```

### 검색

```tsx
<SearchInput
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  onClear={() => setQuery('')}
/>
```

### Code input (monospace)

```tsx
<Input
  variant="code"
  placeholder="$ npm install"
  value={cmd}
/>
```

---

## Accessibility

```
✓ Label 연결 (htmlFor + id)
✓ Required 표시 (aria-required + 시각)
✓ Error 메시지 aria-describedby
✓ Error 시 aria-invalid="true"
✓ Placeholder ≠ label (스크린리더 안 읽음)
✓ Type=email/tel/url 등 모바일 키보드 최적화
✓ autocomplete 적절히 ('username', 'current-password', 'one-time-code', etc)
```

### 잘못된 패턴

```tsx
// ✗ Placeholder 만 사용 (label 없음)
<Input placeholder="이름" />

// ✓ Label + placeholder 조합
<Input label="이름" placeholder="홍길동" />
```

---

## 검증 통합 (Zod)

```tsx
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '8자 이상 입력하세요'),
});

function Form() {
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  
  const handleSubmit = () => {
    const result = schema.safeParse(data);
    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors);
    } else {
      submit(result.data);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <Input
        label="이메일"
        error={errors.email}
        value={data.email}
        onChange={(e) => setData({ ...data, email: e.target.value })}
      />
      {/* ... */}
    </form>
  );
}
```

---

## 관련

- [../tokens/colors.md](../tokens/colors.md) — 색
- [../states/error.md](../states/error.md) — 에러 상태
- [../../i18n/ime.md](../../i18n/ime.md) — IME 처리
- [button.md](./button.md) — Form 안 버튼
