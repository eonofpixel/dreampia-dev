---
title: Session State — Terminal 서브 스키마
parent: ./_index.md
related:
  - ./schema.md
  - ./workspace.md
status: draft
last_updated: 2026-05-02
---

# Terminal Sub-schema

> **한 줄 요약**: 멀티 pane 터미널 + AI 가 띄운 프로세스 추적 + 출력 replay.

---

## TerminalState 인터페이스

```typescript
interface TerminalState {
  panes: TerminalPane[];
  active_pane_id?: PaneId;
  panel_open: boolean;                 // 하단 패널 표시 여부
  height_px: number;                   // 패널 높이 (사용자 조정)
}
```

---

## TerminalPane

```typescript
interface TerminalPane {
  id: PaneId;
  title: string;                       // "bash 1", "npm run dev"
  
  shell: 'bash' | 'powershell' | 'wsl' | 'cmd' | 'gitbash';
  cwd: AbsolutePath;
  env: Record<string, string>;
  
  status: 'running' | 'exited' | 'killed';
  pid?: number;
  exit_code?: number;
  
  // 스크롤백 (제한적 — 큰 출력은 별도 storage)
  scrollback_lines: number;            // 현재 라인 수
  scrollback_uri?: Uri;                // SQLite blob 등
  
  // 사용자 입력 history
  input_history: string[];
  
  // AI 실행 메타
  spawned_by_ai: boolean;
  turn_id?: TurnId;                    // 어느 턴에서 띄웠는지
}
```

---

## Shell 종류

```typescript
type Shell = 'bash' | 'powershell' | 'wsl' | 'cmd' | 'gitbash';
```

| Shell | Windows 기본 | 매핑 |
|-------|-------------|------|
| `powershell` | ✓ | `powershell.exe -NoProfile` |
| `cmd` | ✓ | `cmd.exe /Q /D` |
| `gitbash` | (Git for Windows 설치 시) | `bash.exe` (mintty) |
| `wsl` | (WSL2 설치 시) | `wsl.exe -d <distro>` |
| `bash` | (macOS/Linux) | `/bin/bash` |

**자동 감지**: 사용자 환경에 설치된 shell 자동 인식 후 사용 가능 목록 제시.

---

## Pane lifecycle

```
[CREATE]     → 사용자 새 pane / AI tool 호출
                ↓
[SPAWNING]   → child_process spawn 중
                ↓
[RUNNING]    → 정상 동작 (PID 부여)
   ⇅
[BACKGROUND] → 사용자 panel 닫음, 프로세스 유지
                ↓
[EXITED]     → 정상 종료 (exit_code 기록)
[KILLED]     → 강제 종료 (사용자 또는 timeout)
                ↓
[DISPOSED]   → pane 객체 정리 (scrollback 만 보존)
```

---

## Scrollback 저장

### 메모리 vs Disk
```
인메모리:  최근 1,000 라인  (즉시 표시용)
SQLite:    전체 history     (검색·replay 용)
```

### SQLite 저장 형식
```sql
CREATE TABLE terminal_scrollback (
    pane_id TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    stream TEXT CHECK(stream IN ('stdout','stderr')),
    content TEXT NOT NULL,
    PRIMARY KEY (pane_id, line_no)
);

CREATE INDEX idx_scrollback_pane ON terminal_scrollback(pane_id, line_no);
```

### 자동 cleanup
- 세션 archive 시 → scrollback 도 archive
- 세션 delete 시 → 7일 후 scrollback delete

---

## Replay 지원

```typescript
// 터미널 출력을 메시지에 inline 표시 + 나중에 replay 가능
interface TerminalReplay {
  pane_id: PaneId;
  turn_id: TurnId;
  start_offset: number;                // 라인 번호
  end_offset: number;
  preview_lines: string[];             // 처음/끝 일부
  full_uri?: Uri;                      // 전체 출력 별도 저장
}
```

**UI**:
```
[메시지 안 inline]
  ┌────────────────────────────────────┐
  │ ▶ npm test (8.2초)         [▼ 펼침] │
  │   exit code: 1                      │
  │   ✗ 5 tests failed                  │
  └────────────────────────────────────┘
       ↓ 펼침
  ┌────────────────────────────────────┐
  │ Lines 1-50 of 247:                  │
  │ > test:run                          │
  │ ...                                 │
  │ [전체 보기] [터미널에서 다시 열기]  │
  └────────────────────────────────────┘
```

---

## 환경 변수 (env)

### 자동 설정
```typescript
const AUTO_ENV: Record<string, string> = {
  // Codex 호환
  CODEX_SESSION_ID: session.id,
  CODEX_TURN_ID: turn.id,
  
  // Dreampia
  DREAMPIA_SESSION_ID: session.id,
  DREAMPIA_TURN_ID: turn.id,
  DREAMPIA_WORKSPACE: workspace.root,
  
  // 터미널 색상 등
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
};
```

### 사용자 추가 가능
```
설정 → 터미널 → 환경 변수:
  KEY        VALUE
  NODE_ENV   development
  DEBUG      *
```

### 보안
- 비밀로 보이는 키 (`*_TOKEN`, `*_SECRET`) 입력 시 경고
- 마스킹 표시 (`****`)

---

## 사용자 input_history

```typescript
interface InputHistoryItem {
  command: string;
  timestamp: ISO8601;
  exit_code?: number;
  pane_id: PaneId;
}
```

**↑↓ 화살표 키로 검색**:
- 같은 pane 의 history (기본)
- Ctrl+R: 모든 pane 의 history fuzzy search

**저장 위치**: `terminal_input_history` 테이블 (per-workspace).

---

## AI 가 띄운 프로세스 추적

```typescript
// spawned_by_ai=true 인 pane:
//   - turn_id 필수
//   - 사용자가 명시적으로 kill 안 하면 세션 종료 시 자동 cleanup
//   - 백그라운드 작업으로 분류 (UI: jobs 패널)

interface AISpawnedProcess {
  pane_id: PaneId;
  turn_id: TurnId;
  command: string;                     // 실행한 명령
  started_at: ISO8601;
  
  // 자동 cleanup 정책
  cleanup_on_session_end: boolean;     // default true
  max_runtime_seconds?: number;        // 시간 제한
}
```

---

## 검증 (Invariants)

```
INV-1: panes 의 cwd 는 모두 absolute path
INV-2: active_pane_id 가 있으면 panes 안에 존재
INV-3: status='running' 이면 pid 존재
INV-4: status='exited' 면 exit_code 존재
INV-5: spawned_by_ai=true 면 turn_id 존재
INV-6: scrollback_lines >= 0
```

---

## 예시

```json
{
  "panes": [
    {
      "id": "pane-001",
      "title": "npm run dev",
      "shell": "powershell",
      "cwd": "C:\\Dev\\pyeongtaek-munhwa-portal\\renewal\\web",
      "env": {
        "NODE_ENV": "development",
        "DREAMPIA_SESSION_ID": "01a-..."
      },
      "status": "running",
      "pid": 12345,
      "scrollback_lines": 87,
      "input_history": ["npm install", "npm run dev"],
      "spawned_by_ai": true,
      "turn_id": "01a-asst-002"
    },
    {
      "id": "pane-002",
      "title": "bash 2",
      "shell": "gitbash",
      "cwd": "C:\\Dev\\pyeongtaek-munhwa-portal",
      "env": {},
      "status": "running",
      "pid": 23456,
      "scrollback_lines": 12,
      "input_history": ["git status"],
      "spawned_by_ai": false
    }
  ],
  "active_pane_id": "pane-002",
  "panel_open": true,
  "height_px": 280
}
```

---

## 관련

- [workspace.md](./workspace.md) — pane.cwd 의 출처
- [conversation.md](./conversation.md) — turn_id 참조
- [persistence.md](./persistence.md) — terminal_panes / terminal_scrollback 테이블
- [TOOL_ORCHESTRATION.md](../../TOOL_ORCHESTRATION.md) — `shell.run`, `shell.spawn` tools
