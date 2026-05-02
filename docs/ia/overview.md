---
title: IA — Overview
parent: ./_index.md
related:
  - sidebar.md
  - chat-flow.md
status: draft
last_updated: 2026-05-02
---

# IA Overview

> **한 줄 요약**: 4-layer 정보 위계 + 사용자 mental model 매칭.

---

## 4-Layer 정보 위계

```
[Layer 1: App]
  - 사용자 계정 / 라이센스
  - 전역 설정 (테마, 단축키)
  - Plugin / Skill 마켓
  - 도움말, 업데이트
  - 사용량 (/status)

[Layer 2: Workspace]
  - 프로젝트 (Workspace = 작업 디렉토리)
  - Workspace 별 설정 (MCP, environment)
  - Git 상태
  - 자동화 (workspace 별)

[Layer 3: Session]
  - 채팅 (= Session)
  - 메시지 (Turn)
  - 도구 호출 + 결과
  - 권한 (Session 별)
  - 사이드 채팅 (parent-child)

[Layer 4: Turn]
  - 사용자 메시지
  - AI 응답
  - 도구 결과
  - 주석 (Annotation)
  - 편집 history
```

---

## 화면 매핑

```
App level UI:
  - 메뉴바 (전역 설정, 도움말)
  - 윈도우 컨트롤
  - 사용자 프로필

Workspace level UI:
  - 사이드바 상단: 프로젝트 선택
  - StatusBar: git, workspace 정보
  - 설정 → 프로젝트 별 옵션

Session level UI:
  - 사이드바 채팅 목록
  - 채팅 패널 헤더 (제목, ··· 메뉴)
  - 입력창 (모델, 권한 dropdown)
  - 미리보기 패널 (Browser tabs)

Turn level UI:
  - 메시지 buble
  - Inline actions (👍 👎)
  - Tool result 카드
  - 주석 마커
```

---

## Navigation 흐름

```
App start
  ↓
Welcome / Recent workspaces
  ↓
Workspace 선택 또는 생성
  ↓
Workspace 안 → 채팅 목록 (사이드바)
  ↓
채팅 선택 또는 새 채팅
  ↓
채팅 안 (메시지 + 미리보기)
  ↓
사용자 활동 ...
```

---

## 핵심 원칙

### 1. 진행 흐름 깨지 않음

```
✓ 채팅 중 설정 열기 → 채팅 유지 (modal)
✓ 미리보기 보면서 메시지 입력
✓ 사이드 채팅으로 빠른 검증

✗ 다른 화면 = 채팅 사라짐
✗ 설정 후 채팅 컨텍스트 잃음
```

### 2. 단계 줄임

```
"플러그인 사용" 까지:
  옛날: 설정 → 플러그인 → 검색 → 설치 → 활성화 → 채팅 → @멘션
  
  Dreampia: 채팅 → @멘션 → "추천 플러그인" 표시 → 1-click 설치
            (인라인 install)
```

### 3. 의미적 그룹화

```
설정 카테고리 (12개):
  ✓ 의미 별 묶음 (모양 / 권한 / MCP 등)
  ✗ 알파벳 순 (개발자 시각)
  
사이드바:
  ✓ 진행 시간 별 (오늘 / 어제 / 지난주)
  ✓ Pinned 위로
  ✗ A-Z 정렬
```

### 4. 깊이 < 3 (Discoverability)

```
원칙: 모든 액션 3 클릭 이내.

예:
  설정 → 모양 → 다크 모드 (2 클릭) ✓
  설정 → ... → ... → ... (4+) ✗

깊은 설정 = command palette 단축 (Ctrl+Shift+P).
```

---

## Sitemap

```
/ (HomePage)
  ├── /chat/:id        (채팅)
  ├── /workspace       (워크스페이스 관리)
  │   └── /workspace/:id
  └── /settings
      ├── /general
      ├── /appearance
      ├── /configuration
      ├── /personalization
      ├── /mcp
      ├── /git
      ├── /environment
      ├── /worktree
      ├── /browser
      ├── /computer
      ├── /archived
      └── /usage
```

→ React Router 또는 Electron 자체 routing.

---

## 사용자 흐름 예시

### 시나리오 1: 새 사용자 첫 방문

```
1. 앱 시작 → Welcome screen
2. "Claude CLI 감지됨 ✓"
3. "Codex CLI 감지됨 ✓"
4. [시작] 클릭
5. Workspace 선택 (또는 새로)
6. 빈 채팅 + 추천 prompts
7. 첫 메시지 전송
```

### 시나리오 2: 일상 사용

```
1. 앱 시작 → 마지막 채팅 자동 복원
2. 사이드바 → 작업할 채팅 선택 (Ctrl+1)
3. 메시지 작성 → 전송
4. AI 응답 → 미리보기 확인
5. 다음 단계 / 다른 채팅
```

### 시나리오 3: 새 도구 추가

```
1. 채팅 중 "이 작업에 X 도구 필요"
2. [+ 플러그인 추천] 표시
3. 클릭 → 추천 plugin 모달
4. [설치] → 즉시 활성화
5. 채팅 자동 진행
```

---

## 관련

- [sidebar.md](./sidebar.md)
- [chat-flow.md](./chat-flow.md)
- [settings-hierarchy.md](./settings-hierarchy.md)
- [onboarding.md](./onboarding.md)
