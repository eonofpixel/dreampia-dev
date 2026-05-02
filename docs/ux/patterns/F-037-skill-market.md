---
title: F-037 — 스킬 마켓 + 사용자 정의
parent: ../_index.md
priority: P2
phase: Phase 3
---

# F-037: 스킬 마켓 + 사용자 정의

> **한 줄 요약**: SKILL.md 단독 공유. 가벼운 스킬 마켓.

---

## Plugin 과의 차이

```
Plugin:
  - 코드 + 매니페스트 (.codex-plugin/plugin.json)
  - 자체 binary 가능 (예: tectonic.exe)
  - 여러 skill 묶음

Skill:
  - 단일 .md 파일 (SKILL.md)
  - AI 가 읽고 행동 (코드 실행 X)
  - 더 가벼움
  - 빠른 공유 가능
```

## UI

```
설정 → 스킬 → 마켓:

┌─────────────────────────────────────────────┐
│ 스킬 마켓                                   │
├─────────────────────────────────────────────┤
│ AI Elements           Vercel                │
│   AI Elements 컴포넌트 라이브러리 가이드     │
│   📄 SKILL.md (8 KB)                        │
│   [설치]                                    │
├─────────────────────────────────────────────┤
│ AI Gateway            Vercel                │
│   Vercel AI Gateway 전문가 가이드           │
│   📄 SKILL.md (12 KB)                       │
│   [설치]                                    │
├─────────────────────────────────────────────┤
│ AI Generation Persistence                   │
│   AI 생성물 영속성 관리                     │
│   📄 SKILL.md (5 KB)                        │
│   [설치]                                    │
└─────────────────────────────────────────────┘
```

## 사용자 정의 스킬

```
설정 → 스킬 → 새 스킬 만들기:

→ AI 채팅 시작 (Skill Creator)
  "어떤 스킬을 만드시겠어요?"
  
→ 사용자 인터뷰
  "코드 리뷰 스킬을 만들고 싶어요"
  "어떤 언어/프레임워크?"
  "체크해야 할 항목?"
  
→ AI 가 SKILL.md 자동 작성:
  ---
  name: code-review-react
  description: React 코드 리뷰...
  ---
  
  # Code Review for React
  
  When reviewing code:
  1. ...
  2. ...
  
→ 사용자 review → 저장
```

## 공유

```
사용자가 만든 스킬 → 공유 옵션:
  1. 마켓 등록 (publish)
  2. GitHub Gist 공유
  3. 로컬 .skill 파일 export
```

## 출처

- [docs/findings/round4-parallel-skills.md](../../findings/round4-parallel-skills.md)
- [docs/findings/round5-plugins-skills-spec.md](../../findings/round5-plugins-skills-spec.md)
