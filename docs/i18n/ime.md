---
title: i18n — Korean IME Handling
parent: ./_index.md
related:
  - keyboard-shortcuts.md
  - ../design/interaction/keyboard.md
status: draft
last_updated: 2026-05-02
---

# Korean IME Handling

> **한 줄 요약**: Composition events + event.code. Codex 의 알려진 issue 회피.

---

## 문제 (Codex 알려진 이슈)

```
한글 입력 모드에서:
  "/" 누름 → 한글 변환 시도 → 슬래쉬 명령 X
  "@" 누름 → 한글 변환 → 멘션 X
  Ctrl+K   → 한글 'ㅎ' 트리거 X (key 가 'ㅎ' 으로 인식)

→ 사용자가 영어 모드로 전환해야 함 (불편).
```

---

## 해결책

### 1. event.code 사용 (key 대신)

```typescript
// ✗ event.key (한글 변환됨)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'k') {     // 한글 모드: 'ㅎ'
    openCommandPalette();                // 동작 X
  }
});

// ✓ event.code (물리 위치)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'KeyK') {  // 한글이든 영문이든 OK
    openCommandPalette();
  }
});
```

### 2. Composition events 처리

```typescript
function ChatInput() {
  const [isComposing, setIsComposing] = useState(false);
  
  return (
    <textarea
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onKeyDown={(e) => {
        if (isComposing) return;          // ★ IME 조합 중 무시
        
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      }}
    />
  );
}
```

→ 한글 자모 조합 중 (`ㅇ` → `안` → `안녕`) Enter 누름 = 자모 확정만.

---

## 슬래쉬 / 멘션 트리거

```tsx
function ChatInput() {
  const [showSlash, setShowSlash] = useState(false);
  const [showMention, setShowMention] = useState(false);
  
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    // 직전 글자 확인
    const charBefore = value[cursorPos - 1];
    
    // 슬래쉬 (line 시작 또는 공백 후)
    if (charBefore === '/' && (cursorPos === 1 || value[cursorPos - 2] === ' ' || value[cursorPos - 2] === '\n')) {
      setShowSlash(true);
    }
    
    // 멘션
    if (charBefore === '@') {
      setShowMention(true);
    }
  };
}
```

→ React onChange 의 value 는 IME 변환 후 결과. `/`, `@` 인식 OK.

---

## 키보드 라이브러리

```typescript
// react-hotkeys-hook
import { useHotkeys } from 'react-hotkeys-hook';

useHotkeys('ctrl+k', () => openCommandPalette(), {
  // Default: event.key 사용 (한글 모드 X)
  
  // ★ 옵션: event.code 사용
  splitKey: '+',
  // useHotkeys 가 내부적으로 처리:
  //   ctrl+k → expects e.code === 'KeyK'
});
```

→ 라이브러리 별 차이. 직접 구현 권장.

### 직접 구현

```typescript
function useHotkeyByCode(combo: string, callback: () => void) {
  useEffect(() => {
    const parts = combo.toLowerCase().split('+');
    const expectedCode = parts.pop();
    const expectedModifiers = {
      ctrl: parts.includes('ctrl'),
      shift: parts.includes('shift'),
      alt: parts.includes('alt'),
      meta: parts.includes('meta'),
    };
    
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey !== expectedModifiers.ctrl) return;
      if (e.shiftKey !== expectedModifiers.shift) return;
      if (e.altKey !== expectedModifiers.alt) return;
      if (e.metaKey !== expectedModifiers.meta) return;
      
      // ★ Code (key 위치) 비교
      if (e.code.toLowerCase() === `key${expectedCode}` ||
          e.code.toLowerCase() === expectedCode) {
        e.preventDefault();
        callback();
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [combo, callback]);
}

// 사용
useHotkeyByCode('ctrl+k', openCommandPalette);
useHotkeyByCode('ctrl+1', () => activateChat(0));
useHotkeyByCode('ctrl+alt+p', pinChat);
```

---

## composition 중 검사 helper

```typescript
function useComposition() {
  const [isComposing, setIsComposing] = useState(false);
  
  return {
    composition: {
      onCompositionStart: () => setIsComposing(true),
      onCompositionEnd: () => setIsComposing(false),
    },
    isComposing,
  };
}

// 사용
function Input() {
  const { composition, isComposing } = useComposition();
  
  return (
    <input
      {...composition}
      onKeyDown={(e) => {
        if (isComposing) return;
        // ... handle key
      }}
    />
  );
}
```

---

## 검색 / 자동완성

```tsx
// @ 멘션 검색 (한글 OK)
function MentionInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 100);
  
  // composition 끝나면 search (조합 중간에 fetch X)
  const search = useMemo(() => {
    return fuzzySearch(items, debouncedQuery);
  }, [debouncedQuery]);
  
  return (
    <Input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onCompositionEnd={(e) => {
        // 한글 조합 끝 → search 실행 보장
        setQuery((e.target as HTMLInputElement).value);
      }}
    />
  );
}
```

---

## 한국어 자모 정규화

```typescript
// 검색 / 비교 시 NFC normalize
const koreanText = "안녕하세요".normalize('NFC');

// macOS 파일명 (NFD): "ㅇㅏㄴㄴㅕㅇ"
// → NFC normalize 필수
```

---

## 디버깅

```typescript
// 모든 키 입력 로그 (개발 시)
window.addEventListener('keydown', (e) => {
  console.log({
    key: e.key,         // 한글 변환 후 ('ㅎ')
    code: e.code,       // 물리 위치 ('KeyK')
    modifiers: {
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
    },
    isComposing: e.isComposing,
  });
});
```

---

## 테스트

```typescript
// IME 시뮬레이션
test('Slash command works in Korean IME mode', async () => {
  const { input } = render(<ChatInput />);
  
  // composition start
  fireEvent.compositionStart(input);
  
  // 한글 typing (ㅇ → 안 → 안녕)
  fireEvent.input(input, { target: { value: '안녕' } });
  
  // composition end
  fireEvent.compositionEnd(input, { data: '안녕' });
  
  // 그 후 / 입력
  fireEvent.input(input, { target: { value: '안녕 /' } });
  
  // 슬래쉬 팔레트 열림 확인
  expect(screen.getByText('prompts:analyst')).toBeInTheDocument();
});
```

---

## 관련

- [keyboard-shortcuts.md](./keyboard-shortcuts.md)
- [../design/interaction/keyboard.md](../design/interaction/keyboard.md)
- [../findings/round3-slash-mention.md](../findings/round3-slash-mention.md) — Codex IME 이슈
