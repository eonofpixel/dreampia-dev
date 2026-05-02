---
title: F-019 — @ 멘션 팔레트
parent: ../_index.md
priority: P0
phase: Phase 1
status: complete
---

# F-019: @ 멘션 팔레트

> **한 줄 요약**: 메시지 안에 `@` 입력 → 에이전트 + 파일 검색.

---

## UI

```
사용자 입력: @
            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 에이전트                                                          │
│   Analyst         Requirements clarity, acceptance criteria...   │
│   Api Reviewer    API contracts, versioning, backward compat... │
│   Architect       System design, boundaries, interfaces...       │
│   Build Fixer     Build/toolchain/type failures resolution       │
│   Code Reviewer   Comprehensive review across all concerns       │
│   Code Simplifier Simplifies recently modified code...           │
│   Critic          Plan/design critical challenge and review      │
│   Debugger        Root-cause analysis, regression isolation...   │
│                                                                  │
│ 파일                                                             │
│   파일을 검색하려면 입력하세요.                                  │
└─────────────────────────────────────────────────────────────────┘
```

## / 와의 차이

```
/ (슬래쉬):                     @ (멘션):
  - prompts:lowercase            - Title Case
  - 단일 명령 실행               - 인라인 사용 가능 (메시지 안)
  - Description 더 상세          - Description 더 짧음
  - 모델 명시                    - 섹션 구분 (에이전트/파일)
  - 메시지 시작에서만             - 어디든 사용
```

## 인라인 마크

```
사용자 입력: "이 코드 @Analyst 에게 검토 요청"
                  ↓ 변환
표시: "이 코드 [@Analyst] 에게 검토 요청"
        (배지 형태로 강조)
```

## 파일 검색

```
@<keyword> 입력 시:
  - 활성 workspace 의 파일 fuzzy search
  - 결과 없음 = "검색 결과 없음" 표시
  - 한국어 IME 충돌 (Codex 알려진 이슈)
```

## 구현

```tsx
function MentionPalette({ position }: Props) {
  const [filter, setFilter] = useState('');
  const agents = useAgents();
  const files = useFiles(filter);
  
  const filteredAgents = fuzzyFilter(agents, filter);
  
  return (
    <Popover open={visible} position={position}>
      <Section title="에이전트">
        {filteredAgents.map(a => <MentionItem agent={a} />)}
      </Section>
      
      <Section title="파일">
        {files.length === 0 
          ? <Empty>검색 결과 없음</Empty>
          : files.map(f => <MentionItem file={f} />)
        }
      </Section>
    </Popover>
  );
}
```

## 관련

- [F-018](./F-018-slash-commands.md) — / 슬래쉬 (비슷한 패턴)
- [docs/findings/round3-slash-mention.md](../../findings/round3-slash-mention.md)
