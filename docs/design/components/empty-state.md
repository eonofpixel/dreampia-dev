---
title: Components — Empty State
parent: ./_index.md
related:
  - ../../ux/patterns/F-029-empty-state.md
  - ../states/empty.md
status: draft
last_updated: 2026-05-02
---

# EmptyState

> **한 줄 요약**: 비어있는 영역에 표시. 환영 + 추천 액션.

---

## Variants

```
[Welcome]    첫 채팅 (F-029) - 환영 + 추천 프롬프트
[NoResults]  검색 결과 없음
[NoData]     데이터 없음 (생성 권유)
[Error]      에러로 인한 빈 상태
```

---

## Visual

```
[Welcome - F-029]
┌─────────────────────────────────────────────┐
│                                             │
│           👋 안녕하세요                     │
│                                             │
│   pyeongtaek-portal 작업 시작                │
│                                             │
│   [추천]                                     │
│   • 이 프로젝트 구조 분석해줘               │
│   • 최근 변경 사항 리뷰                     │
│   • 테스트 통과시키기                       │
│   • 프론트엔드 빌드 만들기                  │
│                                             │
│   또는 직접 입력하세요...                   │
│                                             │
└─────────────────────────────────────────────┘

[NoResults]
┌─────────────────────────────────────────────┐
│                  🔍                         │
│            검색 결과 없음                   │
│   "Codex 자동화" 와 일치하는 항목 없음      │
│           [검색어 변경] [전체 보기]         │
└─────────────────────────────────────────────┘

[NoData]
┌─────────────────────────────────────────────┐
│                  📭                         │
│           아직 자동화가 없어요               │
│                                             │
│   매일 09시 자동 코드 리뷰부터 시작해보세요  │
│                                             │
│             [+ 새 자동화]                    │
└─────────────────────────────────────────────┘
```

---

## 구현

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;          // 큰 아이콘 또는 emoji
  title: string;
  description?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }>;
  suggestions?: string[];          // 클릭 가능 prompts (Welcome 용)
}

export function EmptyState({ icon, title, description, actions, suggestions }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center max-w-lg mx-auto">
      {icon && (
        <div className="text-5xl mb-4">{icon}</div>
      )}
      
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      
      {description && (
        <p className="text-text-secondary mb-6">{description}</p>
      )}
      
      {suggestions && suggestions.length > 0 && (
        <div className="w-full space-y-2 mb-6">
          <h4 className="text-sm font-medium text-text-secondary text-left">추천</h4>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s)}
              className="w-full text-left px-4 py-3 rounded-md bg-bg-secondary hover:bg-bg-tertiary text-sm"
            >
              • {s}
            </button>
          ))}
        </div>
      )}
      
      {actions && (
        <div className="flex gap-2">
          {actions.map((a, i) => (
            <Button key={i} variant={a.variant} onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 사용 예시

### Welcome (F-029)

```tsx
function WelcomeChat({ workspace }) {
  const suggestions = useRecommendedPrompts(workspace);
  
  return (
    <EmptyState
      icon="👋"
      title="안녕하세요"
      description={`${workspace.name} 작업 시작`}
      suggestions={suggestions}
    />
  );
}
```

### No results

```tsx
<EmptyState
  icon="🔍"
  title="검색 결과 없음"
  description={`"${query}" 와 일치하는 항목 없음`}
  actions={[
    { label: '검색어 변경', variant: 'primary', onClick: () => focusSearchInput() },
    { label: '전체 보기', variant: 'secondary', onClick: () => clearFilter() },
  ]}
/>
```

### No data

```tsx
<EmptyState
  icon="📭"
  title="아직 자동화가 없어요"
  description="매일 09시 자동 코드 리뷰부터 시작해보세요"
  actions={[
    { label: '+ 새 자동화', variant: 'primary', onClick: () => createAutomation() },
  ]}
/>
```

---

## 일러스트레이션 (Phase 2)

```tsx
// 단순 emoji → SVG 일러스트로 격상
<EmptyState
  icon={<EmptyIllustration />}    // <svg> 컴포넌트
  title="..."
/>
```

---

## 한국어 톤

```
✓ "안녕하세요" (정중)
✓ "시작해보세요" (부드러운 권유)
✗ "Hello" (기본 영어)
✗ "Get started" (영어식)
```

---

## Accessibility

```
✓ <h3> 타이틀
✓ Suggestion = button
✓ Description = 일반 text (screen reader 자동 읽음)
✓ Icon = aria-hidden (장식)
```

---

## 관련

- [../../ux/patterns/F-029-empty-state.md](../../ux/patterns/F-029-empty-state.md)
- [../states/empty.md](../states/empty.md)
