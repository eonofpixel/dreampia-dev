---
title: IA — Preview Panel
parent: ./_index.md
related:
  - chat-flow.md
  - ../session/browser.md
status: draft
last_updated: 2026-05-02
---

# Preview Panel

> **한 줄 요약**: 우측 가장 큰 panel. 멀티탭 (검토 / 페이지 / 사이드 채팅).

---

## 구조

```
┌──────────────────────────────────────────────┐
│ [검토] [page-1] [hr.html] [사이드] [+]      │  ← 탭들
├──────────────────────────────────────────────┤
│ ← → ↻  127.0.0.1:3000/dashboard      ⛶ □   │  ← 컨트롤
├──────────────────────────────────────────────┤
│                                              │
│            [실제 페이지 렌더]                 │
│                                              │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 탭 종류

### 1. URL 페이지 (일반)

```
[페이지 제목 ×]

내용: BrowserView (Electron) 가 실제 URL 렌더
History: 탭 별 ← → 가능
URL 바: 클릭 시 편집
```

### 2. 검토 (Diff Viewer)

```
[검토 ×]

내용: 마지막 턴 또는 git diff 표시
모드: unified / side-by-side
액션: 변경 유지 / 되돌리기
```

상세: [F-032](../ux/patterns/F-032-diff-panel.md).

### 3. 사이드 채팅

```
[사이드 채팅 ×]

내용: 별도 channel 채팅 (parent_session_id 참조)
독립: 메인 채팅과 다른 모델/권한/모드
```

상세: [F-라운드 4 병렬 모드](../findings/round4-parallel-skills.md).

### 4. 임베디드 카드 → 페이지

```
채팅 안 임베디드 카드 [열기] 클릭 →
  미리보기 탭 자동 추가 또는 활성 탭 변경
```

---

## 브라우저 컨트롤

```
[← →]    history navigate
[↻]      reload
URL bar  navigate to URL (편집 가능)
[⛶]      전체화면 토글 (F-014)
[□]      mini window 분리
[··· ]   탭 별 메뉴
```

---

## 멀티탭 동작

### 탭 추가

```
[+] 클릭 →
  ┌─────────────────────────┐
  │ 새 탭                   │
  │                         │
  │ 빈 페이지 (about:blank)  │
  │ 또는 추천 시작 페이지   │
  └─────────────────────────┘
```

### 탭 닫기

```
[× ] 클릭 → 즉시 닫음 (확인 X)
   단, 사이드 채팅 탭 = 확인 모달 (대화 손실 위험)

마지막 탭 = 닫을 수 없음 (회색 처리)
```

### 탭 이동 (Drag)

```
드래그로 reorder
또는 키보드 Ctrl+Shift+←/→
```

상세: [../design/components/tab.md](../design/components/tab.md).

---

## 미리보기 backends

```typescript
type BrowserBackend = 
  | 'iab'              // Electron BrowserView (★ 기본)
  | 'system_default'   // OS 기본 브라우저
  | 'playwright'       // headless (자동화)
  | 'cdp_attach';      // 사용자 Chrome attach
```

상세: [../session/browser.md](../session/browser.md).

---

## 분리 partition

```
각 세션마다 별도 partition (Codex 패턴):

session-1: 
  partition: persist:codex-browser-app-{sessionId-1}
  cookies, localStorage 격리

session-2:
  partition: persist:codex-browser-app-{sessionId-2}
  ...
```

→ 보안 + 다중 로그인 가능.

---

## 주석 모드 (F-021)

```
주석 모드 활성 →
  미리보기 위에 overlay (DOM Inspector)
  
  hover → outline + 메타 표시
  click → 마커 + 입력창
```

상세: [../design/components/annotation-marker.md](../design/components/annotation-marker.md).

---

## 패널 hide / show

```
사용자가 미리보기 panel 숨기기:
  Ctrl+J (또는 X 버튼)
  → 채팅이 자동 확장 (전체 폭)

전체화면 모드 (F-014):
  ⛶ 클릭
  → 채팅 panel 사라짐 + Floating overlay 등장
```

상세: [layout/floating-overlay.md](../design/layout/floating-overlay.md).

---

## URL 바 동작

```
사용자 URL 입력:
  - http://, https:// 자동 추가
  - 프로토콜 없으면 google 검색? (옵션)
  - 입력 중 자동완성 (history)

특수 URL:
  dreampia://session/<id>     → 세션 열기 (사이드 채팅 등)
  dreampia://settings/<page>  → 설정 페이지
  about:blank                 → 빈 페이지
  file:///                    → 로컬 파일
```

---

## DevTools (옵션)

```
사용자가 미리보기 안 DevTools 사용 가능:
  
  [☰] → DevTools 열기
  또는 F12 (활성 탭에서)
```

→ 디버깅용. AI 가 console error 자동 인식.

---

## 키보드

```
Ctrl+Tab           다음 탭
Ctrl+Shift+Tab     이전 탭
Ctrl+1~9           N번째 탭
Ctrl+T             새 탭
Ctrl+W             탭 닫기
Ctrl+Shift+T       닫은 탭 복원
Ctrl+L             URL bar focus
F11                전체화면
```

---

## 관련

- [../session/browser.md](../session/browser.md) — BrowserState 데이터
- [../design/components/tab.md](../design/components/tab.md) — Tab 컴포넌트
- [chat-flow.md](./chat-flow.md) — 채팅과 통합
- [../ux/patterns/F-017-preview-tabs.md](../ux/patterns/F-017-preview-tabs.md)
