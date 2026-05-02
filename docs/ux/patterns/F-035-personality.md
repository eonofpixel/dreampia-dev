---
title: F-035 — 성격 + 지침 + 메모리
parent: ../_index.md
priority: P1
phase: Phase 2
---

# F-035: 성격 + 지침 + 메모리

> **한 줄 요약**: 사용자 정의 system prompt + 영구 메모리.

---

## 성격 (Personality)

```
설정 → 개인 맞춤 설정 → 성격:

┌────────────────────────────────────────────┐
│ 응답 스타일                                │
│   ◉ 간결                                   │
│   ○ 균형                                   │
│   ○ 자세함                                 │
│                                            │
│ 톤                                         │
│   ◉ 전문적                                 │
│   ○ 캐주얼                                 │
│   ○ 친근                                   │
│                                            │
│ 응답 길이                                  │
│   ━●━━━━━━━━ 짧음                         │
└────────────────────────────────────────────┘
```

## 지침 (Custom Instructions)

```
"AI 가 항상 알아야 할 것":
┌────────────────────────────────────────────┐
│ 저는 시니어 풀스택 개발자입니다.           │
│ 한국어로 답해주세요.                       │
│ 코드는 TypeScript 우선.                    │
│ ...                                        │
└────────────────────────────────────────────┘
                                  [최대 2,000자]
```

## 메모리 (Memory)

```
"AI 가 학습한 것":
┌────────────────────────────────────────────┐
│ 사용자는 React 18 사용                  ✏ │
│ 사용자는 Tailwind CSS 선호              ✏ │
│ 사용자는 Vitest 테스트 프레임워크       ✏ │
│ 사용자 프로젝트 path: C:\Dev\foo        ✏ │
│ ...                                        │
│                                            │
│ [모두 지우기] [내보내기]                    │
└────────────────────────────────────────────┘
```

### 메모리 자동 갱신

```typescript
// AI 가 명시적으로 메모리 추가 가능
// "사용자가 X 라고 알려줬다" → 메모리 등록

interface Memory {
  id: string;
  content: string;                     // "사용자는 React 사용"
  source: 'ai_learned' | 'user_explicit';
  added_at: ISO8601;
  expires_at?: ISO8601;                // 유효기간 (옵션)
  
  // 컨텍스트
  workspace_id?: string;               // 특정 workspace 만?
  global: boolean;                     // 모든 세션 적용?
}
```

## 적용 우선순위

```
AI 호출 시 system prompt:

1. 시스템 default
2. + Custom Instructions (사용자 명시)
3. + 활성 메모리 (workspace + global)
4. + Plan 모드 instructions (active 시)
5. + Plugin/Skill 가이드 (mention 시)
```

## 출처

- 정적 분석 + 추론 (Codex 의 비슷한 패턴)
