---
title: F-029 — 빈 채팅 Welcome + 추천 프롬프트
parent: ../_index.md
priority: P0
phase: Phase 1
---

# F-029: 빈 채팅 Welcome + 추천 프롬프트

> **한 줄 요약**: 새 채팅 시 환영 + 워크스페이스 기반 추천 프롬프트.

---

## UI

```
┌─────────────────────────────────────────────────┐
│                                                 │
│           👋 안녕하세요                         │
│                                                 │
│   pyeongtaek-munhwa-portal 작업 시작            │
│                                                 │
│   [추천]                                         │
│   • 이 프로젝트 구조 분석해줘                   │
│   • 최근 변경 사항 리뷰                         │
│   • 테스트 통과시키기                           │
│   • 프론트엔드 빌드 만들기                      │
│                                                 │
│   또는 직접 입력하세요...                       │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 추천 프롬프트 출처

```
1. 이 workspace 의 최근 작업 (git log)
   → "최근 PR 검토해줘"

2. 프로젝트 type 추론 (package.json / tsconfig 등)
   → "TypeScript 코드 검토" / "Python 의존성 정리"

3. 활성 플러그인 의 defaultPrompt
   → browser-use: "Test my checkout flow on localhost"

4. 사용자 자주 쓰는 패턴 (학습)
   → "모든 코드 한국어 주석 추가"
```

## Plugin defaultPrompt 통합

```typescript
function getRecommendedPrompts(workspace: Workspace): string[] {
  const prompts: string[] = [];
  
  // 1. Workspace 기반
  if (workspace.git_state) {
    prompts.push('최근 변경 사항 리뷰');
  }
  
  // 2. 활성 플러그인
  for (const plugin of activePlugins) {
    prompts.push(...(plugin.manifest.interface.defaultPrompt ?? []));
  }
  
  // 3. 사용 학습 (Phase 2+)
  prompts.push(...getUserLearnedPrompts(workspace));
  
  return uniqueAndShuffle(prompts).slice(0, 6);
}
```

## 사용자 인사

```
처음 사용자: "환영합니다! 시작해보세요."
복귀 사용자: "다시 만났어요. {workspace} 에서 계속할까요?"
오랜만:     "오랜만이네요! 마지막 작업: {last_session.title}"
```

## 출처

- [docs/findings/round4-parallel-skills.md](../../findings/round4-parallel-skills.md)
