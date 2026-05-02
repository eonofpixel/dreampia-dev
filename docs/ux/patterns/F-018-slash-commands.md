---
title: F-018 — / 슬래쉬 명령 팔레트
parent: ../_index.md
priority: P0
phase: Phase 1
status: complete
---

# F-018: / 슬래쉬 명령 팔레트

> **한 줄 요약**: 입력창에 `/` 입력 → 44+ 명령 fuzzy search 팔레트.

---

## UI

```
사용자 입력: /
            ↓
┌─────────────────────────────────────────────────────────────────┐
│ prompts:analyst              Pre-planning consultant ... (Opus)  │
│ prompts:api-reviewer         API contracts, backward compat...  │
│ prompts:architect            Strategic Architecture ... (Opus)   │
│ prompts:build-fixer          Build and compilation error ...    │
│ prompts:code-reviewer        Expert code review ...              │
│ prompts:code-simplifier ★    Simplifies and refines code ...    │
│ prompts:critic               Work plan review (Opus)             │
│ prompts:debugger             Root-cause analysis ...             │
│ prompts:dependency-expert    Dependency Expert ...               │
│ prompts:designer             UI/UX Designer (Sonnet)             │
│ prompts:executor             Autonomous deep executor (Sonnet)   │
└─────────────────────────────────────────────────────────────────┘

특징:
  - prompts:<name> 형식
  - Description (1줄) + 모델 명시 (Opus / Sonnet)
  - 제약 표시 (READ-ONLY)
  - Fuzzy search
  - 키보드 ↑↓ + Enter
```

## 카테고리

```
🤖 Agents (prompts:*)              18+
🔧 Modes (/플랜, /속도형, /사이드)   ~5
📦 Skills (개인)                    동적
⚙ Utility (/status, /압축)         ~5
```

## 동작

```
1. 입력창에서 / 타이핑
2. 팔레트 자동 표시 (popup 위로)
3. 추가 텍스트 = fuzzy 필터
4. ↑↓ 화살표 = 선택
5. Enter = 실행 (또는 자동완성)
6. Esc = 취소
```

## 한국어 IME

```
한글 입력 시 / 트리거 안 됨 (영문 모드 필요)
→ Dreampia-Dev 차별화: 한글 모드에서도 / 인식
```

## 구현

```tsx
function SlashCommandPalette() {
  const [filter, setFilter] = useState('');
  const commands = useSlashCommands();
  const filtered = fuzzyFilter(commands, filter);
  
  return (
    <Popover open={visible}>
      <CommandList>
        {filtered.map(cmd => (
          <CommandItem key={cmd.id}>
            <code>{cmd.id}</code>
            <span className="desc">{cmd.description}</span>
            {cmd.model && <Badge>{cmd.model}</Badge>}
          </CommandItem>
        ))}
      </CommandList>
    </Popover>
  );
}
```

## 관련

- [F-019](./F-019-mention-palette.md) — @ 멘션 (비슷한 패턴)
- [docs/findings/round3-slash-mention.md](../../findings/round3-slash-mention.md)
