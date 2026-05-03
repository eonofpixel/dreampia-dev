/**
 * LeaderElection — Multi-window leader election (SS-5).
 *
 * Spec: docs/session/multi-window.md
 *
 * 한 세션을 여러 윈도우 (메인 / 미니 / 사이드) 가 동시에 열 때,
 * 한 시점에 단 하나의 윈도우만 write 권한 (leader) 을 갖도록 한다.
 * Follower 는 read 는 자유, write 는 leader 에게 IPC 위임한다.
 *
 * 알고리즘 (multi-window.md §"Leader 획득 흐름")
 * ───────────────────────────────────────────
 *   1. acquireLeadership 은 트랜잭션 안에서 실행:
 *      - 기존 lock 없음 → INSERT, 즉시 leader.
 *      - 기존 lock 이 자기 windowId → heartbeat 갱신 후 true (refresh).
 *      - 기존 lock 의 heartbeat_at 이 (now - ttl) 이전 → stale, 인수.
 *      - 살아있는 다른 leader → false (follower 가 됨).
 *   2. heartbeat() 는 5초마다 자동 (startHeartbeat 가 setInterval 등록).
 *   3. 정상 종료 시 shutdown() 으로 자기 lock 해제.
 *   4. 비정상 종료 시 heartbeat 정지 → TTL 후 다른 윈도우가 인수.
 *
 * 트랜잭션 보장
 * ─────────────
 *   acquireLeadership 의 SELECT → UPDATE/INSERT 는 better-sqlite3 의
 *   동기 트랜잭션 안에서 실행된다. 같은 프로세스 내 동시 호출도 SQLite
 *   파일 락 (BEGIN IMMEDIATE 효과) 으로 직렬화된다.
 *
 * 멀티 프로세스 (실제 멀티 윈도우)
 * ─────────────────────────────
 *   실제 production 에서는 각 BrowserWindow 가 별도 process 가 아니라
 *   하나의 main process 에 속한다 (Electron). 따라서 본 구현은 기본적으로
 *   같은 process 안에서 windowId 만 다른 LeaderElection 인스턴스 여러 개를
 *   다룬다. 다른 process 가 같은 DB 를 열어도 SQLite WAL + FK 가 보장.
 */

import type Database from 'better-sqlite3';
import type { ISO8601, SessionId } from '@/types';

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

export interface SessionLock {
  session_id: SessionId;
  leader_window_id: string;
  leader_pid: number;
  acquired_at: ISO8601;
  heartbeat_at: ISO8601;
  ttl_seconds: number;
}

export interface LeaderElectionOptions {
  /** Window/instance identifier — must be unique per window. */
  window_id: string;
  /** Heartbeat interval in ms. Default 5000. */
  heartbeat_interval_ms?: number;
  /** Lock TTL in seconds. Default 30. */
  ttl_seconds?: number;
}

// ────────────────────────────────────────────────────────────
// DB row shape (internal)
// ────────────────────────────────────────────────────────────

interface SessionLockRow {
  session_id: string;
  leader_window_id: string;
  leader_pid: number;
  acquired_at: string;
  heartbeat_at: string;
  ttl_seconds: number;
}

function rowToLock(row: SessionLockRow): SessionLock {
  return {
    session_id: row.session_id as SessionId,
    leader_window_id: row.leader_window_id,
    leader_pid: row.leader_pid,
    acquired_at: row.acquired_at,
    heartbeat_at: row.heartbeat_at,
    ttl_seconds: row.ttl_seconds,
  };
}

// ────────────────────────────────────────────────────────────
// LeaderElection
// ────────────────────────────────────────────────────────────

export class LeaderElection {
  private readonly heartbeatHandles = new Map<SessionId, NodeJS.Timeout>();
  private readonly window_id: string;
  private readonly heartbeat_interval_ms: number;
  private readonly ttl_seconds: number;

  constructor(
    private readonly db: Database.Database,
    opts: LeaderElectionOptions
  ) {
    this.window_id = opts.window_id;
    this.heartbeat_interval_ms = opts.heartbeat_interval_ms ?? 5000;
    this.ttl_seconds = opts.ttl_seconds ?? 30;
  }

  // ────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────

  /**
   * Try to acquire leadership for a session.
   *
   * Returns true if this window is now the leader (newly acquired, refreshed,
   * or taken over). Returns false if another window holds a fresh lock.
   *
   * Spec: docs/session/multi-window.md §"Leader 획득 흐름"
   */
  acquireLeadership(sessionId: SessionId): boolean {
    const now = new Date().toISOString();
    const expiry = new Date(Date.now() - this.ttl_seconds * 1000).toISOString();

    const tx = this.db.transaction(() => {
      const existing = this.db
        .prepare(`SELECT * FROM session_locks WHERE session_id = ?`)
        .get(sessionId) as SessionLockRow | undefined;

      if (existing) {
        // Same window already owns? Refresh heartbeat and return true.
        if (existing.leader_window_id === this.window_id) {
          this.db
            .prepare(`UPDATE session_locks SET heartbeat_at = ? WHERE session_id = ?`)
            .run(now, sessionId);
          return 'refreshed' as const;
        }
        // Stale lock (heartbeat too old) → take over.
        if (existing.heartbeat_at < expiry) {
          this.db
            .prepare(
              `UPDATE session_locks
                 SET leader_window_id = ?,
                     leader_pid = ?,
                     acquired_at = ?,
                     heartbeat_at = ?,
                     ttl_seconds = ?
               WHERE session_id = ?`
            )
            .run(this.window_id, process.pid, now, now, this.ttl_seconds, sessionId);
          return 'takeover' as const;
        }
        // Fresh lock by another window — cannot acquire.
        return 'blocked' as const;
      }

      // No existing lock — INSERT.
      this.db
        .prepare(
          `INSERT INTO session_locks
             (session_id, leader_window_id, leader_pid, acquired_at, heartbeat_at, ttl_seconds)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(sessionId, this.window_id, process.pid, now, now, this.ttl_seconds);
      return 'created' as const;
    });

    const outcome = tx();
    if (outcome === 'blocked') return false;

    // Start auto-heartbeat for newly acquired/taken-over locks.
    // 'refreshed' means we already had it; the heartbeat loop is already running.
    if (outcome === 'created' || outcome === 'takeover') {
      this.startHeartbeat(sessionId);
    }
    return true;
  }

  /**
   * Release leadership for a session held by THIS window.
   * Idempotent: silently no-ops if we don't own the lock.
   */
  releaseLeadership(sessionId: SessionId): void {
    this.stopHeartbeat(sessionId);
    this.db
      .prepare(`DELETE FROM session_locks WHERE session_id = ? AND leader_window_id = ?`)
      .run(sessionId, this.window_id);
  }

  /** Returns the current leader info, or null if no lock exists. */
  getLeader(sessionId: SessionId): SessionLock | null {
    const row = this.db
      .prepare(`SELECT * FROM session_locks WHERE session_id = ?`)
      .get(sessionId) as SessionLockRow | undefined;
    return row ? rowToLock(row) : null;
  }

  /** True iff THIS window is the current leader for the given session. */
  isLeader(sessionId: SessionId): boolean {
    const lock = this.getLeader(sessionId);
    if (!lock) return false;
    return lock.leader_window_id === this.window_id;
  }

  /**
   * Manual heartbeat. Production code uses the auto-heartbeat interval started
   * by acquireLeadership; this method is exposed for tests and edge cases
   * (e.g., explicit IPC-driven keepalive).
   *
   * Returns true if the heartbeat was applied (we still hold the lock),
   * false if we no longer hold it (someone took over).
   */
  heartbeat(sessionId: SessionId): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE session_locks
           SET heartbeat_at = ?
         WHERE session_id = ? AND leader_window_id = ?`
      )
      .run(now, sessionId, this.window_id);
    return result.changes > 0;
  }

  /**
   * Cleanup: stop all heartbeat intervals and release every lock held by
   * THIS window. Safe to call when the underlying DB is already closed
   * (silently swallows errors).
   */
  shutdown(): void {
    for (const [sessionId, handle] of this.heartbeatHandles) {
      clearInterval(handle);
      try {
        this.db
          .prepare(`DELETE FROM session_locks WHERE session_id = ? AND leader_window_id = ?`)
          .run(sessionId, this.window_id);
      } catch {
        // DB may be closed; ignore.
      }
    }
    this.heartbeatHandles.clear();
  }

  // ────────────────────────────────────────────────────────────
  // Internal — heartbeat lifecycle
  // ────────────────────────────────────────────────────────────

  private startHeartbeat(sessionId: SessionId): void {
    if (this.heartbeatHandles.has(sessionId)) return;
    const handle = setInterval(() => {
      try {
        const stillOwn = this.heartbeat(sessionId);
        if (!stillOwn) {
          // Someone took over — stop heartbeating to avoid resurrecting a
          // stale lock entry (we are no longer the leader).
          this.stopHeartbeat(sessionId);
        }
      } catch {
        // DB closed or other transient error — stop the interval to avoid
        // a hot loop of failures.
        this.stopHeartbeat(sessionId);
      }
    }, this.heartbeat_interval_ms);
    // Don't keep the Node process alive purely for heartbeats; tests and
    // hot-reload environments must be able to exit cleanly.
    handle.unref?.();
    this.heartbeatHandles.set(sessionId, handle);
  }

  private stopHeartbeat(sessionId: SessionId): void {
    const handle = this.heartbeatHandles.get(sessionId);
    if (handle) {
      clearInterval(handle);
      this.heartbeatHandles.delete(sessionId);
    }
  }
}
