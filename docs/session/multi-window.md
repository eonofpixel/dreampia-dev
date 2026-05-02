---
title: Session State — Multi-window Concurrency
parent: ./_index.md
related:
  - ./persistence.md
  - ./principles.md
status: draft
last_updated: 2026-05-02
---

# Multi-window Concurrency (멀티 윈도우 동시성)

> **한 줄 요약**: 같은 세션이 여러 윈도우에서 열릴 때 leader election 으로 쓰기 일관성 보장.

---

## 문제

```
Codex 패턴:
  - 메인 창 + 미니 창 + 사이드 채팅 = 같은 세션 표시 가능
  - 사용자가 세션 ✏ 메뉴에서 "미니 창에서 열기" 클릭
  
Dreampia-Dev 도 동일 패턴 지원:
  Window A: 세션 X 메인 창
  Window B: 세션 X 미니 창
  Window C: 세션 X 사이드 채팅
  
  → 동시에 같은 sessions 테이블에 write 시 race condition
```

---

## 해결책: Leader Election

### 데이터 모델

```typescript
interface SessionLock {
  session_id: SessionId;
  leader_window_id: string;            // 현재 leader
  leader_pid: number;
  acquired_at: ISO8601;
  heartbeat_at: ISO8601;               // 5초마다 갱신
  ttl_seconds: number;                 // default 30
}
```

### SQLite 테이블

```sql
CREATE TABLE session_locks (
    session_id TEXT PRIMARY KEY,
    leader_window_id TEXT NOT NULL,
    leader_pid INTEGER NOT NULL,
    acquired_at TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL,
    ttl_seconds INTEGER NOT NULL DEFAULT 30
);
```

---

## Leader 획득 흐름

```typescript
async function acquireLeadership(
  sessionId: SessionId,
  windowId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() - 30_000).toISOString();
  
  return db.transaction(() => {
    // 기존 lock 확인
    const existing = db.prepare(
      `SELECT * FROM session_locks WHERE session_id = ?`
    ).get(sessionId);
    
    if (existing) {
      // heartbeat_at 이 30초 전이면 stale → 인수 가능
      if (existing.heartbeat_at < expiry) {
        db.prepare(`
          UPDATE session_locks 
          SET leader_window_id = ?, leader_pid = ?, 
              acquired_at = ?, heartbeat_at = ?
          WHERE session_id = ?
        `).run(windowId, process.pid, now, now, sessionId);
        return true;  // 인수 성공
      }
      
      // 살아있는 leader 가 있음 → 못 얻음 (follower 가 됨)
      return false;
    }
    
    // 새로 lock
    db.prepare(`
      INSERT INTO session_locks 
        (session_id, leader_window_id, leader_pid, acquired_at, heartbeat_at, ttl_seconds)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, windowId, process.pid, now, now, 30);
    
    return true;
  });
}
```

---

## Heartbeat (5초 주기)

```typescript
// Leader 가 주기적으로 갱신
function startHeartbeat(sessionId: SessionId) {
  const interval = setInterval(() => {
    db.prepare(`
      UPDATE session_locks 
      SET heartbeat_at = ?
      WHERE session_id = ? AND leader_window_id = ?
    `).run(new Date().toISOString(), sessionId, currentWindowId);
  }, 5_000);
  
  return () => clearInterval(interval);
}
```

**주의**: heartbeat 가 5초인데 TTL 이 30초인 이유 = **6번 fail tolerance** (네트워크 / GC pause / sleep 모두 견딤).

---

## Read 는 자유, Write 는 leader 만

```
[Window A: Leader]  ────write────→  SQLite
   ↑   ↑
   |   └── IPC heartbeat (5초)
   |
   └── IPC write request

[Window B: Follower]  ──read────→  SQLite (직접 가능, WAL 덕분)
                      ──write────→  IPC to Leader
```

### Follower 의 write 위임

```typescript
// Follower 윈도우에서 write 요청
async function writeAsFollower(sessionId: SessionId, op: WriteOp) {
  const lock = await getLock(sessionId);
  
  if (lock.leader_window_id === currentWindowId) {
    // 갑자기 leader 가 되었을 수 있음 (직접 write)
    return performWrite(op);
  }
  
  // IPC 로 leader 에게 위임
  return ipcRenderer.invoke('forward-write', {
    sessionId,
    leaderWindowId: lock.leader_window_id,
    op,
  });
}
```

### Leader 의 IPC 처리

```typescript
ipcMain.handle('forward-write', async (event, payload) => {
  const { sessionId, leaderWindowId, op } = payload;
  
  // 검증: 내가 정말 leader 인가?
  if (leaderWindowId !== thisWindowId) {
    throw new Error('I am not the leader anymore');
  }
  
  // Write 수행
  return performWrite(op);
});
```

---

## Leader 사망 처리

### Case 1: 정상 종료 (close window)

```typescript
window.on('closed', async () => {
  const heldLocks = db.prepare(`
    SELECT session_id FROM session_locks 
    WHERE leader_window_id = ?
  `).all(thisWindowId);
  
  // Lock 해제
  for (const { session_id } of heldLocks) {
    db.prepare(`DELETE FROM session_locks WHERE session_id = ? AND leader_window_id = ?`)
      .run(session_id, thisWindowId);
  }
});
```

### Case 2: 비정상 종료 (crash, OOM)

```
Leader 죽음 → heartbeat 갱신 안 됨 → 30초 후 stale
   ↓
다른 윈도우의 다음 write 시도 시 acquireLeadership 재호출
   ↓
TTL expired 감지 → 자동 인수
   ↓
새 leader 가 write 처리
```

**최악 지연**: 30초 (TTL). 사용자가 보기엔 "잠시 기다림" 정도.

### Case 3: Sleep / Hibernation

```
사용자 노트북 sleep → 모든 프로세스 정지
   ↓
Wake 시:
  - 살아있는 leader 가 있다면 heartbeat 즉시 재개 (catch-up)
  - 다른 windows 가 인수했다면 demoted to follower
```

---

## IPC 메시지 라우팅

### 메시지 형식

```typescript
type IpcMessage =
  // Leader → all windows
  | { type: 'leadership:acquired'; session_id: SessionId; leader: string }
  | { type: 'leadership:lost'; session_id: SessionId }
  
  // Window → leader
  | { type: 'write:turn'; session_id: SessionId; turn: Turn }
  | { type: 'write:annotation'; session_id: SessionId; annotation: Annotation }
  
  // Leader → all windows (broadcast)
  | { type: 'state:turn_added'; session_id: SessionId; turn: Turn }
  | { type: 'state:annotation_added'; session_id: SessionId; annotation: Annotation };
```

### 브로드캐스트

```typescript
// Leader 가 write 후 모든 윈도우에 알림
function broadcastStateChange(sessionId: SessionId, change: StateChange) {
  for (const window of allWindows) {
    window.webContents.send('state-update', { sessionId, change });
  }
}

// Follower 들은 받아서 UI refresh
ipcRenderer.on('state-update', ({ sessionId, change }) => {
  if (currentSessionId === sessionId) {
    refreshUI(change);
  }
});
```

---

## 성능 고려사항

### 캐시 무효화

```
Window A (Leader) writes turn → broadcast
Window B (Follower) receives → invalidate local cache → re-read DB
```

**문제**: 모든 write 마다 broadcast = 트래픽 폭주.

**해결**: Debounce 50ms (사용자 인지 X 수준 지연).

### Race condition 방지

```typescript
// 같은 turn.seq 충돌 방지 (UNIQUE constraint)
INSERT INTO turns (id, session_id, seq, ...) VALUES (?, ?, ?, ...);
//                                  ↑ UNIQUE INDEX (session_id, seq)
// → 동시 insert 시 한 쪽 fail
```

### Reader-writer 분리

```sql
-- WAL mode 가 자동으로 처리:
PRAGMA journal_mode = WAL;
-- Reader 는 writer 와 독립적으로 동작 (snapshot isolation)
```

---

## 대안 검토

### CRDT (Conflict-free Replicated Data Type)

```
✓ Leader 없이 모든 윈도우 평등
✗ 구현 복잡 (Yjs / Automerge 의존)
✗ 큰 데이터 효율 X
✗ Phase 1 에 과도한 복잡도
→ Phase 3+ 검토 (실시간 협업 도입 시)
```

### Distributed lock (e.g., file lock)

```
✓ 간단
✗ Process crash 시 해제 안 됨 (stale)
✗ 멀티 머신 X (현재 비목표지만)
→ SQLite 기반 lock 이 더 나음
```

---

## 검증 (Invariants)

```
INV-1: 한 시점에 한 세션의 leader 는 최대 1개
INV-2: heartbeat_at 은 acquired_at 보다 같거나 큼
INV-3: leader 가 죽으면 30초 내 재선출
INV-4: Follower 의 write 는 leader 거쳐서만
INV-5: Leadership 변경 시 모든 윈도우에 broadcast
INV-6: stale lock (TTL 초과) 은 새 leader 가 자동 cleanup
```

---

## 테스트 시나리오

```typescript
describe('Multi-window leader election', () => {
  it('first window becomes leader', () => { ... });
  it('second window becomes follower', () => { ... });
  it('follower forwards writes via IPC', () => { ... });
  it('leader heartbeat keeps lock alive', () => { ... });
  it('crashed leader released after TTL', () => { ... });
  it('next acquire attempt becomes new leader', () => { ... });
  it('broadcast notifies all followers of state change', () => { ... });
  it('cache invalidated on state-update message', () => { ... });
});
```

---

## 관련

- [persistence.md](./persistence.md) — WAL mode 설정
- [principles.md](./principles.md) — P6 (멀티 윈도우 안전)
- [cross-ai-sync.md](./cross-ai-sync.md) — Provider adapter 도 같은 leader 보호
