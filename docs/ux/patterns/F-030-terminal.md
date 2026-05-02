---
title: F-030 — 통합 터미널 패널
parent: ../_index.md
priority: P1
phase: Phase 2
---

# F-030: 통합 터미널 패널

> **한 줄 요약**: 하단 터미널 패널 + 멀티 pane + AI 가 띄운 프로세스 추적.

---

## UI

```
┌──────────────────────────────────────────────────┐
│                채팅 + 미리보기                   │
│                                                  │
├──────────────────────────────────────────────────┤
│ [bash 1] [npm run dev] [+]                  [×] │
│ ┌────────────────────────────────────────────┐ │
│ │ $ npm run dev                              │ │
│ │ > server starting on :3000                 │ │
│ │ > Ready!                                   │ │
│ │ |                                          │ │
│ └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

## 단축키

```
Ctrl+J        터미널 토글 (열기/닫기)
Ctrl+Shift+T  새 pane 추가
Ctrl+W        현재 pane 닫기
Ctrl+Tab      pane 전환
```

## Shell 자동 감지

```
Windows: PowerShell, Git Bash, WSL, cmd
macOS/Linux: bash, zsh, fish

처음 실행 시:
  사용자 환경 검사 → 사용 가능한 shell 목록
  사용자 기본 shell 선택 (자동 또는 명시)
```

## AI 가 띄운 프로세스

```
AI: shell.spawn("npm run dev")
   ↓
새 pane 자동 생성 ("npm run dev" 라벨)
   ↓
AI 응답에 link: "🖥 터미널 1 에서 띄움"
   ↓
사용자 클릭 → 터미널 패널 열고 해당 pane 으로 점프
```

## 데이터 모델

```typescript
// docs/session/terminal.md
interface TerminalPane {
  shell: 'bash' | 'powershell' | 'wsl' | 'cmd' | 'gitbash';
  cwd: AbsolutePath;
  status: 'running' | 'exited' | 'killed';
  spawned_by_ai: boolean;
  turn_id?: TurnId;
}
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
- [docs/session/terminal.md](../../session/terminal.md)
