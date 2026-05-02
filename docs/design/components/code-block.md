---
title: Components — Code Block
parent: ./_index.md
related:
  - ../tokens/typography.md
status: draft
last_updated: 2026-05-02
---

# CodeBlock

> **한 줄 요약**: Syntax highlight + copy + line numbers + collapse.

---

## Variants

```
[Default]    회색 배경
[Error]      빨간 tint (stderr)
[Output]     ANSI escape 처리 (terminal output)
[Diff]       +/- 표시 (간단한 diff)
[Inline]     `code` 인라인 (작게)
```

---

## Visual

```
[Block with header]
┌──────────────────────────────────────────┐
│ TypeScript                    📋 ↗      │  ← 언어 + copy + open
├──────────────────────────────────────────┤
│ 1  function greet(name: string) {       │  ← line numbers
│ 2    return `안녕 ${name}!`;            │
│ 3  }                                    │
└──────────────────────────────────────────┘

[Output]
┌──────────────────────────────────────────┐
│ Output                            📋    │
├──────────────────────────────────────────┤
│ Listening on port 3000                  │
│ Server ready in 1.2s                    │
└──────────────────────────────────────────┘

[Inline] `npm install` 같이 사용
```

---

## 구현

```tsx
import { Highlight, themes } from 'prism-react-renderer';

export function CodeBlock({ value, language = 'plaintext', variant = 'default', showLineNumbers = true }) {
  const theme = useTheme() === 'dark' ? themes.vsDark : themes.vsLight;
  
  return (
    <div className={cn(
      'relative group rounded-md overflow-hidden',
      'font-mono text-sm',
      variantBg[variant]
    )}>
      {language !== 'plaintext' && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary text-xs">
          <span className="text-text-secondary">{language}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton value={value} />
            <OpenInEditorButton value={value} language={language} />
          </div>
        </div>
      )}
      
      <Highlight code={value} language={language} theme={theme}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="overflow-x-auto p-3">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {showLineNumbers && (
                  <span className="select-none text-text-tertiary mr-3 inline-block w-6 text-right">
                    {i + 1}
                  </span>
                )}
                {line.map((token, j) => (
                  <span key={j} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

const variantBg = {
  default: 'bg-bg-secondary',
  error: 'bg-danger-50/30',
  output: 'bg-bg-tertiary',
  diff: 'bg-bg-secondary',
};
```

---

## CopyButton

```tsx
function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <TooltipTrigger content={copied ? '복사됨!' : '복사'}>
      <button
        onClick={handleCopy}
        className="p-1 hover:bg-bg-tertiary rounded"
        aria-label="코드 복사"
      >
        {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      </button>
    </TooltipTrigger>
  );
}
```

---

## ANSI escape 처리 (terminal output)

```tsx
import Anser from 'anser';

function AnsiCodeBlock({ value }) {
  const html = Anser.ansiToHtml(value, { use_classes: true });
  
  return (
    <pre 
      className="font-mono text-sm whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

```css
/* ANSI color classes */
.ansi-red { color: var(--color-danger); }
.ansi-green { color: var(--color-success); }
.ansi-yellow { color: var(--color-warning); }
.ansi-blue { color: var(--color-accent); }
/* ... */
```

---

## Long output (collapsing)

```tsx
function CollapsibleCodeBlock({ value, language, maxLines = 20 }) {
  const lines = value.split('\n');
  const [expanded, setExpanded] = useState(false);
  
  if (lines.length <= maxLines) {
    return <CodeBlock value={value} language={language} />;
  }
  
  const shown = expanded ? value : lines.slice(0, maxLines).join('\n');
  
  return (
    <div>
      <CodeBlock value={shown} language={language} />
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-sm text-accent hover:underline"
        >
          {lines.length - maxLines}줄 더 보기
        </button>
      )}
    </div>
  );
}
```

---

## 사용 예시

```tsx
// 단순
<CodeBlock value="npm install" language="bash" />

// AI 응답 안에서 (markdown)
<ReactMarkdown
  components={{
    code({ inline, className, children }) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match?.[1];
      
      if (inline) {
        return <code className="px-1 bg-bg-tertiary rounded font-mono text-sm">{children}</code>;
      }
      
      return <CodeBlock value={String(children)} language={language} />;
    },
  }}
/>

// stdout
<CodeBlock value={result.stdout} language="plaintext" />

// stderr (error variant)
<CodeBlock value={result.stderr} variant="error" />
```

---

## Accessibility

```
✓ <pre> 시맨틱
✓ aria-label="코드 블록 (TypeScript)"
✓ Copy 버튼 키보드 접근 가능
✓ Line numbers 는 select 안 됨 (user-select: none)
✓ Long output 은 사용자 명시 expand
```

---

## 관련

- [../tokens/typography.md](../tokens/typography.md) — Mono 폰트
- [diff-viewer.md](./diff-viewer.md) — Diff 비교
- [terminal-view.md](./terminal-view.md) — 터미널 출력
