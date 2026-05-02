---
title: F-039 — Plugin/Skill Creator
parent: ../_index.md
priority: P2
phase: Phase 3
---

# F-039: Plugin/Skill Creator (★ 강력)

> **한 줄 요약**: AI 가이드 채팅 → plugin.json + SKILL.md 자동 생성.

---

## 진입

```
설정 → 플러그인 → 새 플러그인 만들기:

→ AI 채팅 시작 (특별 시스템 프롬프트)
  "어떤 종류의 플러그인을 만드시겠어요?"
  "1. 도구 통합
   2. 스킬 모음
   3. 자동화
   4. 기타"
```

## 흐름

```
1. AI 인터뷰
   "플러그인 이름?"
   "무슨 일?"
   "어떤 도구가 필요?"
   "외부 API 사용?"
   
2. AI 가 plugin.json 자동 생성
   {
     "name": "...",
     "version": "0.1.0",
     "interface": {
       "displayName": "...",
       "category": "...",
       "capabilities": [...]
     }
   }

3. AI 가 skills/*/SKILL.md 자동 생성
   ---
   name: ...
   description: ...
   ---
   [상세 지침]

4. 추가 파일 (필요 시):
   - scripts/ (Node.js code)
   - assets/ (이미지)
   - bin/ (binary)

5. 사용자 review →
   "이대로 만들어주세요" → 파일 생성
   "이 부분 수정" → AI 가 다시 작성

6. 자동 install + test
```

## Skill Creator (단독)

```
설정 → 스킬 → 새 스킬 만들기:

→ Plugin Creator 와 비슷
→ SKILL.md 만 생성 (.codex-plugin/ 없음)
→ 더 가벼운 단독 스킬
```

## 차별화 가치

```
일반: 플러그인 = 코드 작성 필요 (개발자만)
Codex/Dreampia: AI 가 코드 작성 → 일반 사용자도 가능

→ "AI 로 만든 AI 도구" = 메타 차별화
```

## 검증 단계

```
사용자 review 후 install 전:
  ✓ plugin.json schema 통과
  ✓ SKILL.md frontmatter 정확
  ✓ Capabilities 합리성 (read-only 가 LOCAL_WRITE 요구하면 경고)
  ✓ test run (기본 use case 시뮬레이션)
```

## 출처

- [docs/findings/round3-creators.md](../../findings/round3-creators.md)
- [docs/findings/round5-plugins-skills-spec.md](../../findings/round5-plugins-skills-spec.md)
