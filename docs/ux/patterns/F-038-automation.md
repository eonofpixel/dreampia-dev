---
title: F-038 — 자동화 시스템
parent: ../_index.md
priority: P2
phase: Phase 3
---

# F-038: 자동화 시스템

> **한 줄 요약**: cron / event / webhook 트리거 + AI 자동 실행. $sentry 변수.

---

## 자동화 폼

상세는 [docs/findings/round3-creators.md](../../findings/round3-creators.md).

## 트리거 종류

```
1. 시간 (cron)
   "0 9 * * 1-5" = 평일 09:00
   또는 GUI: 매일 / 매주 / 매달 / 사용자 지정
   
2. 이벤트
   세션 시작 / 종료
   파일 변경 (chokidar)
   git push 후
   PR 생성 시
   
3. 외부 (HTTP webhook)
   POST /api/triggers/{automation_id}
   Header: X-Trigger-Token: $sentry
```

## $sentry 변수

```
자동 생성 토큰 (HTTP webhook 인증):

자동화 정의 시 자동 생성됨
prompt 안에 $sentry 사용 시 실제 토큰으로 치환
인증 실패 시 401
```

## 권한 모델

```
자동화는 명시적 grants 만 사용:
  - default_level 무시
  - 자동화 만들 때 권한 명시 필요
  - 실행 중 모달 X (자동 거부)
```

상세: [docs/permission/automation.md](../../permission/automation.md).

## UI 목록

```
설정 → 자동화:

┌─────────────────────────────────────────────┐
│ 매일 09:00 - 코드 리뷰        [⚙] [⏸] [×] │
│   트리거: cron "0 9 * * 1-5"                │
│   마지막: 어제 09:00 (성공, 4분 12초)       │
│   다음:   내일 09:00                        │
├─────────────────────────────────────────────┤
│ git push 후 - 테스트         [⚙] [▶] [×]  │
│   트리거: event git.push                    │
│   마지막: 1시간 전 (성공)                   │
└─────────────────────────────────────────────┘
```

## 알림

```
실패 시:
  - OS toast
  - 사이드바 자동화 항목에 ⚠
  - 다음 사용자 turn 시작 시 컨텍스트 추가
  
성공 시 (옵션):
  - OS toast (조용)
  - 로그만
```

## 출처

- [docs/findings/round3-creators.md](../../findings/round3-creators.md)
- [docs/permission/automation.md](../../permission/automation.md)
