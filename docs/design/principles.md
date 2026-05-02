---
title: Design Principles — 7가지 불변 원칙
parent: ./_index.md
related:
  - ./tokens/_index.md
  - ./_index.md
status: draft
last_updated: 2026-05-02
---

# Design 7가지 불변 원칙

> **한 줄 요약**: 모든 디자인 결정의 헌법.

---

## P1. 시각 우선 (Visual-first)

```
3-패널 레이아웃에서 미리보기가 가장 큰 영역 (~1054px).
사이드바 286px, 채팅 750px.

이유: 사용자가 결과를 본다. 텍스트는 결과 만들기 위한 도구.
```

→ 모든 패널 비율은 사용자 조정 가능. 하지만 default 는 시각 우선.

## P2. 한국어 우선 (Korean-first)

```
기본 폰트:    Pretendard, "Apple SD Gothic Neo", -apple-system
기본 locale:  ko-KR
기본 timezone: Asia/Seoul
모든 string:  먼저 한국어 → 영어 fallback
```

→ Codex/Claude 가 영어 우선인 것과 차별화.

상세: [typography/korean-first.md](./typography/korean-first.md), [docs/i18n/_index.md](../../i18n/_index.md).

## P3. 키보드 우선 (Keyboard-first)

```
원칙: 모든 기능 키보드만으로 접근 가능.

증명:
  1. 마우스 USB 빼고 사용 가능?
  2. 모든 버튼 Tab 으로 도달 가능?
  3. 모든 modal Esc 로 취소 가능?
```

→ 단축키 시스템 ([F-025](../ux/patterns/F-025-shortcut-system.md)) 필수.

## P4. 다크 우선 (Dark-first)

```
기본 테마: 다크
이유:
  1. 개발자 90%+ 가 다크 모드 사용
  2. 코드 가독성 우수
  3. 눈 피로 감소 (장시간 작업)

라이트는 사용자가 명시적으로 선택.
```

→ 디자인 / mockup 작성 시 다크 먼저.

## P5. 정밀한 권한 표시 (Permission-explicit)

```
AI 가 무엇을 할 수 있는지 항상 명확:
  - 권한 dropdown 항상 보임 ([F-027](../ux/patterns/F-027-permission-dropdown.md))
  - 위험 동작 = 모달 강제 ([docs/permission/danger-patterns.md](../permission/danger-patterns.md))
  - 사용 후 toast 알림 ([docs/permission/ui-flow.md](../permission/ui-flow.md))

→ 사용자가 "AI 가 뭐했지?" 라고 묻지 않게.
```

## P6. 빠른 피드백 (Fast-feedback)

```
응답 시간 budget:
  - 클릭 → UI 변화:     <100ms
  - 키보드 입력 → 표시: <50ms
  - 메시지 전송 → 응답: <200ms (전송 표시까지)
  - 60fps 유지

이유: Doherty Threshold (400ms 미만 = 사용자 만족)
```

→ Phase 1 부터 measure. [docs/performance/_index.md](../../performance/_index.md).

## P7. 우아한 실패 (Graceful failure)

```
에러도 디자인:
  - 에러 메시지 ≠ stack trace
  - "다음 어떻게 할지" 명시
  - 복구 옵션 제공 (재시도 / 다른 경로)
  
나쁜 예: "Error: ENOENT"
좋은 예: "파일을 찾을 수 없어요 (login.tsx). 
         다음을 시도하세요:
         [src/ 안 검색] [수동 경로 입력] [무시]"
```

→ 모든 에러 상태 별도 디자인. [states/error.md](./states/error.md).

---

## 적용 예시

### 좋은 예 (P1 + P5 + P6)

```
사용자가 / 입력:
  - 100ms 이내에 팔레트 표시 (P6)
  - 화면 중앙 위쪽 (P1 — 입력창 가까이)
  - 각 명령마다 권한 영향 표시 (P5)
  - 키보드 ↑↓ Enter 만으로 사용 가능 (P3)
```

### 나쁜 예

```
✗ P1: 사이드바를 미리보기보다 넓게 → 시각 우선 위반
✗ P2: 영어 placeholder ("Type a message...") → 한국어 fallback 없음
✗ P3: 마우스 only 메뉴 (드래그 only)
✗ P5: AI 가 silent 로 파일 변경 → audit 없음
✗ P6: 입력 typing 에 100ms+ 지연
✗ P7: "Internal Server Error" 만 표시 → 사용자 어쩌라고?
```

---

## Tradeoff 결정 가이드

원칙들이 충돌할 때:

```
시각 우선 vs 키보드 우선:
  → 둘 다 만족 (아이콘 + Tab 도달 가능)

다크 우선 vs 한국어 우선:
  → 무관 (양립 가능)

빠른 피드백 vs 권한 명시:
  → 권한 모달이 100ms 넘어도 보안 우선
  → 단, 모달 띄우는 것 자체는 100ms 이내

우아한 실패 vs 빠른 피드백:
  → 에러 발생 시 즉시 표시 (skeleton X)
```

---

## 관련

- [_index.md](./_index.md) — Design system 목차
- [tokens/_index.md](./tokens/_index.md) — 원칙 적용된 토큰
- [docs/ux/_index.md](../../ux/_index.md) — 28 UX 패턴
