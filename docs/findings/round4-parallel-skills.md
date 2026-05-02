---
title: Round 4 — 병렬 모드 / 스킬 카테고리
parent: ./_index.md
related:
  - ./round3-slash-mention.md
status: complete
last_updated: 2026-05-02
---

# Round 4: 병렬 모드 + 스킬 카테고리

> **방법**: /사이드 + /플랜 + /속도형 동시 활성화
>
> **결과**: 메인 + 사이드 채팅이 다른 모드로 동시 가능 ★

---

## /사이드 (Side fork)

```
사용자: /사이드  → / 메뉴에서 선택
   ↓
효과:
  미리보기 패널 옆에 "사이드 채팅" 탭 추가
  새 탭 클릭 → 두 번째 채팅 입력창 (오른쪽 패널)
  메인 + 사이드 = 동시 2개 채팅
  각각 다른 모드/모델/권한 가능
```

### UI

```
[메인 패널]            [사이드 패널]
┌─────────────┐        ┌──────────────┐
│ 채팅 메시지  │        │ 사이드 채팅  │
│   ...        │        │   메시지     │
│              │        │              │
├─────────────┤        ├──────────────┤
│ 입력창       │        │ 입력창        │
│ + ⚠ 5.5 매우  │        │ + ⊕ 5.5 매우  │
│   높음 🎤 ▶  │        │   높음 ⚡ 🎤 ▶│ ← /속도형
└─────────────┘        └──────────────┘
```

### 사용 시나리오

```
메인: 큰 작업 ("리팩토링 진행 중")
   ↓
중간에 작은 질문 "이 함수가 뭐 하는거야?"
   ↓
사이드 채팅 띄움 → 빠른 질문/답변
   ↓
메인 작업 컨텍스트 보존 + 빠른 사이드 검증
```

---

## /플랜 모드 활성 시 입력창 변화

```
일반 입력창:
[+ ⚠ <텍스트> 5.5 매우 높음 🎤 ▶]
       ──── 권한 dropdown ────

/플랜 모드 활성 후:
[+ ⊟ 🌐 <텍스트>     5.5 매우 높음 🎤 ▶]
   ↑  ↑                ────
   |  └ 브라우저 사용 토글 (Browser tool)
   └─── 체크리스트 (Plan checklist)
   
권한 dropdown 사라짐 (read-only mode)
```

### 핵심 발견

```
1. ⊟ = 체크리스트 토글
2. 🌐 = 브라우저 도구 활성화
3. 권한 dropdown 자동 숨김 (Plan = read-only 강제)
```

상세: [docs/session/plan.md](../session/plan.md).

---

## /속도형 활성 시 변화

```
일반 모델 표시:
[5.5 매우 높음 ▼]

/속도형 활성 후:
[⚡ 5.5 매우 높음 ▼]
 ↑
 번개 아이콘 추가 (속도 우선 표시)

reasoning effort 자동으로 "낮음" 설정 추정
```

---

## ★ 병렬 모드 동작 확인 (가장 큰 발견)

```
실험 결과:
  메인 패널:  /플랜 모드 활성 (⊟ 🌐 표시)
  사이드 패널: /속도형 활성 (⚡ 표시)
  
두 채팅 동시 실행 가능 ✓
서로 다른 모드/모델/권한 가능 ✓
```

### 의의

```
한 윈도우 안에서 다중 컨텍스트 가능:
  - 메인: 깊이 있게 분석 (Plan 모드)
  - 사이드: 빠른 검증 (Speed 모드)
  - 또는 메인은 Claude, 사이드는 Codex (Cross-AI 동시)
```

→ Dreampia-Dev: N개 탭 = 각 다른 모드 가능해야 함.

---

## 스킬 카테고리 (in / 메뉴)

```
/ 메뉴 스크롤 시 새로운 섹션 발견:

스킬 (개인)
├── AI Elements        AI Elements component library
├── AI Gateway         Vercel AI Gateway expert guidance  
└── AI Generation Persistence
                      AI 생성물 영속성 관리
```

### 구조 분리

```
prompts: (에이전트):
  - prompts:analyst
  - prompts:architect
  - ... (작업 실행 도구)

스킬:
  - AI Elements
  - AI Gateway
  - ... (도구/지식 모음)

둘 다 / 메뉴에 통합 표시
```

→ Dreampia-Dev: prompts (agents) + skills 별도 카테고리.

---

## 종합 인사이트

| 항목 | 발견 | 영향력 |
|-----|------|--------|
| /사이드 = 미리보기 패널 안 채팅 탭 | 강 |
| /플랜 활성 시 입력창 ⊟ 🌐 | 중 |
| /속도형 활성 시 ⚡ 추가 | 약 |
| 스킬 카테고리 in / 메뉴 | 강 |
| ★ 병렬 모드 동작 (Plan + Speed 동시) | ★강 |

---

## Dreampia-Dev 차용

```
P0:
  ✓ 사이드 채팅 (parent_session_id 패턴)
  ✓ 멀티 모드 (Plan / Speed / Standard)
  
P1:
  ✓ 다중 탭 = 각 다른 모드 가능
  ✓ Cross-AI (메인 Claude + 사이드 Codex 등)
```

---

## 관련

- [round3-slash-mention.md](./round3-slash-mention.md) — / 명령 시스템
- [docs/session/plan.md](../session/plan.md) — Plan 모드 구현
