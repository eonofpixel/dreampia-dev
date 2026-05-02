---
title: Components — Terminal View
parent: ./_index.md
related:
  - code-block.md
status: draft
last_updated: 2026-05-02
---

# TerminalView

> **한 줄 요약**: xterm.js 기반 터미널. F-030 통합 터미널의 시각.

---

## 사용 라이브러리

```
xterm.js           - 터미널 emulator (VS Code 도 사용)
xterm-addon-fit    - 자동 사이즈 조정
xterm-addon-search - 검색 기능
node-pty           - PTY (메인 process 에서)
```

---

## Visual

```
┌──────────────────────────────────────────────────┐
│ [bash 1] [npm run dev] [+]                  [×] │  ← tabs
├──────────────────────────────────────────────────┤
│ $ npm run dev                                    │
│                                                  │
│ > server@1.0.0 dev                               │
│ > vite                                           │
│                                                  │
│ Listening on http://localhost:3000               │
│ Ready in 1.2s                                    │
│ |                                                │  ← cursor blink
└──────────────────────────────────────────────────┘
   배경: #131517 (다크) / #FFFFFF (라이트)
   글꼴: D2Coding Ligature, JetBrains Mono
   라인 높이: 1.4
```

---

## 구현 (스켈레톤)

```tsx
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';

function TerminalView({ paneId, shell, cwd }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const term = new Terminal({
      fontFamily: 'D2Coding Ligature, JetBrains Mono, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      theme: getTerminalTheme(),
      cursorBlink: true,
      scrollback: 5000,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    
    term.open(containerRef.current);
    fitAddon.fit();
    
    // PTY 연결 (IPC)
    const ptyChannel = window.electron.terminal.create({ paneId, shell, cwd });
    
    term.onData((data) => ptyChannel.send(data));
    ptyChannel.onData((data) => term.write(data));
    
    termRef.current = term;
    
    // Resize 자동
    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
      ptyChannel.close();
      term.dispose();
    };
  }, [paneId]);
  
  return <div ref={containerRef} className="w-full h-full" />;
}
```

---

## Theme 통합

```typescript
function getTerminalTheme(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    return {
      background: '#131517',
      foreground: '#F4F5F7',
      cursor: '#339CFF',
      
      // ANSI colors
      black: '#000000',
      red: '#FF6E6E',
      green: '#69FF94',
      yellow: '#FFFFA5',
      blue: '#62B6FF',
      magenta: '#FF92DF',
      cyan: '#A4FFFF',
      white: '#F4F5F7',
      // ...
    };
  }
  
  return {
    background: '#FFFFFF',
    foreground: '#1A1C1F',
    // ... light colors
  };
}
```

---

## Pane 관리

```tsx
function TerminalPanel() {
  const [panes, setPanes] = useState<TerminalPane[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  return (
    <div className="flex flex-col h-full">
      <BrowserTabs
        tabs={panes}
        activeId={activeId}
        onActivate={setActiveId}
        onClose={(id) => closePane(id)}
        onAdd={() => addPane()}
      />
      
      <div className="flex-1 relative">
        {panes.map(pane => (
          <div
            key={pane.id}
            className={cn(
              'absolute inset-0',
              activeId !== pane.id && 'invisible'
            )}
          >
            <TerminalView 
              paneId={pane.id}
              shell={pane.shell}
              cwd={pane.cwd}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

→ Pane 들 모두 mount 유지 (재진입 시 빠름).

---

## AI 가 띄운 프로세스 표시

```tsx
function PaneTab({ pane, active, onActivate, onClose }) {
  return (
    <div className={cn(/* tab 스타일 */)}>
      {pane.spawned_by_ai && (
        <Badge variant="primary" size="xs">AI</Badge>
      )}
      <span>{pane.title}</span>
      {pane.status === 'running' && (
        <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
      )}
      <button onClick={onClose}><X /></button>
    </div>
  );
}
```

---

## 키보드

```
Ctrl+J         터미널 panel 토글
Ctrl+Shift+T   새 pane
Ctrl+W         pane 닫기
Ctrl+Tab       다음 pane
Ctrl+Shift+F   검색 (terminal 안)
Ctrl+L         clear

Linux/macOS:
Ctrl+C         interrupt
Ctrl+D         EOF
```

---

## 검색 (xterm-addon-search)

```tsx
function TerminalSearch({ term, searchAddon }) {
  const [query, setQuery] = useState('');
  
  useHotkey('Ctrl+Shift+F', () => {
    // 검색 popover 열기
  });
  
  const handleSearch = (q: string) => {
    searchAddon.findNext(q, {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    });
  };
  
  return (
    <Popover>
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); handleSearch(e.target.value); }}
        placeholder="검색"
      />
    </Popover>
  );
}
```

---

## Accessibility

```
✓ aria-label="Terminal pane: bash 1"
✓ Focus management (탭 활성 시 자동 포커스)
✓ Screen reader 모드 (옵션):
  xterm.js 의 screenReaderMode = true
```

---

## 관련

- [code-block.md](./code-block.md) — 일회성 출력
- [../../ux/patterns/F-030-terminal.md](../../ux/patterns/F-030-terminal.md)
- [../../session/terminal.md](../../session/terminal.md) — TerminalState 데이터
