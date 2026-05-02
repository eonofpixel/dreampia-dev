---
title: Rounds 1-2 — Live UI (메뉴 / 패널 / 팝오버)
parent: ./_index.md
related:
  - ./round3-slash-mention.md
status: complete
last_updated: 2026-05-02
---

# Rounds 1-2: 라이브 UI 1차 (12 → 28 패턴)

> **방법**: 사용자 라이브 시연 + 단계별 캡처 + 분석
>
> **결과**: 정적 분석에서 누락된 UX 패턴 12개 → 28개로 확장

---

## 1라운드 핵심 발견 (12개)

```
1. 3-패널 레이아웃 (사이드바 + 채팅 + 미리보기)
2. 전체화면 토글 ⛶
3. Floating 채팅 overlay (전체화면 시)
4. "최근 메시지 ›" expand 패턴
5. 미리보기 멀티탭 + 브라우저 컨트롤
6. / 슬래쉬 명령 팔레트
7. @ 멘션 팔레트
8. /status 사용량 투명성
9. ★ 주석 달기 모드 (annotation mode)
10. 임베디드 미리보기 카드
11. 메시지마다 모델 + 효력 강도 선택
12. 좋아요/싫어요/공유 인라인 액션
```

상세: [docs/ux/_index.md](../ux/_index.md) (28개 패턴 별도 문서화).

---

## 2라운드 추가 발견 (11개)

```
13. 채팅 → floating overlay 전환
14. "마지막 턴" diff 모드 (AI 변경 자동 추적)
15. AI 작업 시간 expand
16. 미리보기 패널 닫고 펼치기
17. 인스펙터 기능 (DOM, Console, Network 같은)
18. 하단 터미널 패널 + 추가 / 닫기
19. 사이드바 ≡ 토글
20. 메인 윈도우 사이즈 조정
21. 마우스 hover 인터랙션 (메시지 위)
22. 키보드 단축키 (Ctrl+1~9)
23. 검토 (review) 패널 = git diff viewer
```

상세: 각 패턴 → [docs/ux/patterns/F-013](../ux/patterns/) ~ [F-024](../ux/patterns/).

---

## 핵심 통찰

### 1. 시각 우선
```
미리보기 영역이 가장 넓음 (1054px 정도)
  > 사이드바 (286px) + 채팅 (750px)
```

### 2. Floating Overlay 패턴
```
전체화면 모드 → 채팅이 사라지지 X
하단 floating overlay 로 변환
"최근 메시지 ›" expand 시 채팅 위로 펼침
```

### 3. 단축 명령 (/, @)
```
/  → 슬래쉬 명령 (prompts:*, 모드, 명령)
@  → 멘션 (에이전트, 파일)
모두 fuzzy search + 키보드 ↑↓
```

### 4. 투명성 (/status)
```
세션 ID, 컨텍스트 사용량, 5시간 한도, 7일 한도 모두 노출
사용자가 매 시점 자기 상태 인지 가능
```

### 5. 정확한 컨텍스트 (주석 모드)
```
미리보기 요소 호버 → 자동 outline
클릭 → 마커 + 입력창
DOM selector + 부분 screenshot 자동 첨부
→ AI 가 "이 부분" 정확히 알 수 있음
```

---

## 캡처 파일

```
C:\Dev\분석\captures\
├── explore_00 ~ 48          (라운드 1)
├── deep_00 ~ 34             (라운드 2)
└── (라운드 3+ 별도)
```

---

## 관련

- [docs/ux/_index.md](../ux/_index.md) — F-013~F-024 상세
- [round3-slash-mention.md](./round3-slash-mention.md) — 다음 라운드
