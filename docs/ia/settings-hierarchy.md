---
title: IA — Settings Hierarchy (12 categories)
parent: ./_index.md
related:
  - ../ux/patterns/F-034-settings.md
status: draft
last_updated: 2026-05-02
---

# Settings Hierarchy

> **한 줄 요약**: 12개 카테고리. 빈도 + 의미 별 정렬. Codex 패턴.

---

## 12개 카테고리

```
1. ⚙ 일반          작업 모드, 권한 default, 기본 행동
2. 🎨 모양         테마, 폰트, 밀도, 색
3. 🔧 구성         진단, 재설치, 텔레메트리
4. 🧑 개인 맞춤    성격, 지침, 메모리
5. 📦 MCP 서버     MCP 추가/편집/제거
6. 🌿 깃           Git 통합 설정
7. 🌍 환경         환경 변수, IDE 통합
8. 🌳 작업 트리    Worktree 관리
9. 🌐 브라우저     In-app 브라우저 옵션
10. 💻 컴퓨터      CPU, 시스템 통합
11. 📂 보관함     보관된 채팅 / Workspace
12. 📊 사용량     API 사용, 한도, 청구
```

→ Codex 패턴 그대로 차용 (라운드 1 발견).

---

## 좌측 navigation

```
┌──────────────┬───────────────────────┐
│ 일반          │ [현재 페이지 내용]     │
│ 모양          │                       │
│ 구성          │                       │
│ 개인 맞춤     │                       │
│ MCP 서버      │                       │
│ 깃            │                       │
│ 환경          │                       │
│ 작업 트리     │                       │
│ 브라우저      │                       │
│ 컴퓨터        │                       │
│ 보관함        │                       │
│ 사용량        │                       │
└──────────────┴───────────────────────┘
```

`<aside>` 좌측 navigation + `<main>` 우측 컨텐츠.

---

## 카테고리별 상세

### 1. 일반

```
작업 모드:  ◉ 코딩용     ○ 일상 작업용
권한:
  ☑ 기본 권한 (workspace_write)
  ☑ 자동 검토
  ☑ 전체 접근 (조심)
일반:
  기본 열림 위치:  [VS Code ▼]
  에이전트 환경:   [Windows 네이티브 ▼]
  자동 시작:       [●] OFF
  업데이트 채널:   [Stable ▼]
```

### 2. 모양 (Theme)

```
테마:    [☼ 라이트] [☾ 다크] [🖥 시스템]
밀도:    [Compact] [Comfortable ★] [Spacious]

라이트 테마 [가져오기] [복사] [Dreampia ▼]
  액센트, 배경, 전경, UI 글꼴, 코드 글꼴, 반투명, 대비

다크 테마  [가져오기] [복사] [Dreampia ▼]
  ...

추가:
  [✓] 모서리 둥글림 강조
  [ ] 애니메이션 줄이기 (OS 따라가기)
```

상세: [../design/theme/customization.md](../design/theme/customization.md).

### 3. 구성

```
진단:
  [Codex Workspace 문제 진단] [진단 시작]
  [워크스페이스 재설정 및 설치]   [재설치]
  
텔레메트리:
  ☑ 익명 사용 데이터 공유 (성능 개선)
  ☐ 크래시 리포트 (개인정보 X)
  
업데이트:
  [업데이트 확인]
  마지막 확인: 2시간 전
  현재 버전: 0.1.0
  
백업:
  [백업 만들기] [복원]
  자동 백업: 매일
```

### 4. 개인 맞춤 (Personality + Memory)

```
응답 스타일:    ◉ 간결  ○ 균형  ○ 자세함
톤:            ◉ 전문적 ○ 캐주얼 ○ 친근
응답 길이:      ━●━━━━━ 짧음

지침 (Custom Instructions):
  [textarea: AI 가 항상 알아야 할 것]
  최대 2,000자

메모리 (AI 가 학습한 것):
  ✏ 사용자는 React 18 사용
  ✏ 사용자는 TypeScript 우선
  ✏ ...
  [모두 지우기] [내보내기]
```

상세: [../ux/patterns/F-035-personality.md](../ux/patterns/F-035-personality.md).

### 5. MCP 서버

```
MCP 서버                  [+ 서버 추가]
─────────────────────────────────
omx_code_intel    ⚙   [●]
omx_memory        ⚙   [●]
omx_state         ⚙   [●]
omx_trace         ⚙   [●]
my-custom-server  ⚙   [○]
```

[+ 서버 추가] → 5필드 폼:
- 실행 명령
- 인자
- 환경 변수
- 환경 변수 패스스루 (이름만)
- 작업 디렉토리

상세: [../tools/mcp-bridge.md](../tools/mcp-bridge.md).

### 6. 깃

```
Git 사용자:   [홍길동]
이메일:       [hong@example.com]
기본 branch:  [main]

자동 commit 메시지:
  ☑ AI 가 commit message 추천
  ☐ 자동 commit (조심)

PR 통합:
  [GitHub 연동] [GitLab 연동]
```

### 7. 환경

```
환경 변수 (전역):
  KEY            VALUE
  NODE_ENV       development
  ...
  [+ 환경 변수 추가]

IDE 통합:
  ☑ VS Code
  ☑ Visual Studio  
  ☐ Antigravity
  ...

기본 shell:
  Windows: ◉ PowerShell  ○ cmd  ○ Git Bash  ○ WSL
```

### 8. 작업 트리

```
Worktree 관리:
  Workspace          Branch        Path
  pyeongtaek-portal  main          C:\Dev\pyeongtaek-portal
  pyeongtaek-portal  fix-bug       C:\Dev\pyeongtaek-portal-fix
  
  [+ 새 Worktree]
```

상세: [../session/workspace.md](../session/workspace.md).

### 9. 브라우저

```
기본 backend:    ◉ In-app browser  ○ 시스템 기본  ○ Playwright

In-app:
  ☑ Cookie 격리 (세션 별)
  ☑ DOM Inspector 자동
  ☑ 스크린샷 자동 (페이지 변경 시)

시스템 기본:
  Default browser: Chrome ▼
```

### 10. 컴퓨터

```
시스템 통합:
  ☑ 자동 시작 (로그인 시)
  ☐ 트레이 아이콘 유지
  ☑ 글로벌 단축키 (Quick Chat)
    [Alt+Ctrl+N]   변경

성능:
  CPU 사용 한도:   ━━━━●━━━━ 70%
  메모리 한도:      ━━━━●━━━━ 4GB

알림:
  ☑ 백그라운드 작업 완료
  ☑ 자동화 실패
  ☐ 모든 메시지
```

### 11. 보관함

```
보관된 채팅 (37개)
  검색: [        ]
  필터: [기간 ▼]
  
  서버 작업 (보관됨 어제)        [복원]
  과거 작업 (보관됨 1주 전)      [복원]
  ...
  
  [모두 영구 삭제]
```

### 12. 사용량

```
세션 ID:        019de353-be46-7631-8000-827cfdb87ef8
API key:        sk-... (유효)

이번 달:
  Claude:  127 calls, 234K tokens, $12.40
  Codex:   89 calls,  178K tokens, $8.20
  ────────────────────────────
  Total:   216 calls, 412K tokens, $20.60
  
한도:
  5시간:    ━━━━━━━━━○ 90% 남음 (다음 ↻ 22:47)
  7일:      ━━━━━○━━━━ 52% 남음 (다음 ↻ 5월 5일)
  
[비용 차트] [내보내기]
```

상세: [../ux/patterns/F-020-status.md](../ux/patterns/F-020-status.md).

---

## 검색 (Settings 안)

```
설정 페이지에서 Ctrl+F:
  
  [검색: 다크 모드 _____]
  
  결과:
  - 모양 → 다크 테마
  - 컴퓨터 → 다크 모드 자동 전환 (Phase 2)
```

---

## 단축키

```
Ctrl+,         설정 열기 (어디서든)
Ctrl+Shift+P   Command palette → "설정 → ..."
Esc            설정 닫기 (modal)
```

---

## Modal vs Page

```
원칙: 빠른 변경 = modal, 복잡한 = page

Modal (overlay 방식):
  - 모양 (테마 즉시 적용)
  - 단축 설정

Page (전체):
  - MCP 서버 (복잡)
  - 사용량 (차트 등)
  - 보관함
```

---

## 관련

- [../ux/patterns/F-034-settings.md](../ux/patterns/F-034-settings.md)
- [overview.md](./overview.md)
